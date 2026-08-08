// Hoshiza worker
//
// GitHub blocks browser CORS at the token exchange and requires a client secret
// there, so this worker holds the secret and everything else is delegated.
//
// Auth cookies are SameSite=None (Secure) on HTTPS because the app lives on a
// different origin than the worker and the browser must attach the token to
// cross-site fetch() calls. Over http (wrangler dev) the cookies drop to
// SameSite=Lax without Secure so browsers store them on plain localhost.

interface Env {
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	APP_URL?: string;
}

const GH = 'https://github.com';
const API = 'https://api.github.com';
const DEFAULT_APP_URL = 'https://nellowtcs.me/Hoshiza';
const TOKEN_MAX_AGE = 28800; // 8h session
const STATE_MAX_AGE = 600; // 10min OAuth round trip

const SCOPE_MAX_LENGTH = 200;
const PATH_MAX_LENGTH = 512;

export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		const url = new URL(req.url);
		const secure = url.protocol === 'https:';
		const cors = corsHeaders(req, env);

		if (req.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					...cors,
				'Access-Control-Allow-Headers': 'Content-Type',
				'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
					'Access-Control-Max-Age': '86400'
				}
			});
		}

		// 1. Kick off login: random state cookie, then off to GitHub.
		if (url.pathname === '/login') {
			const clientId = env.GITHUB_CLIENT_ID;
			if (!clientId)
				return json({ error: 'GITHUB_CLIENT_ID is not configured on the worker' }, 500, cors);
			const state = crypto.randomUUID();
			const next = sanitizeNext(url.searchParams.get('next'));
			const scope = sanitizeScope(url.searchParams.get('scope'));
			// origin is the app base URL (origin + base path) so the callback can
			// land back on the exact page that started the flow, dev or prod.
			const returnUrl = sanitizeReturn(url.searchParams.get('origin') ?? '', next, appUrl(env));

			const auth = new URL(GH + '/login/oauth/authorize');
			auth.searchParams.set('client_id', clientId);
			auth.searchParams.set('redirect_uri', url.origin + '/callback');
			auth.searchParams.set('scope', scope);
			auth.searchParams.set('state', state);

			const headers = new Headers({ Location: auth.toString() });
			headers.append('Set-Cookie', cookie('oauth_state', state, STATE_MAX_AGE, secure));
			headers.append('Set-Cookie', cookie('oauth_next', returnUrl, STATE_MAX_AGE, secure));
			return new Response(null, {
				status: 302,
				headers
			});
		}

		// 2. Callback: exchange the code (with the secret) for a token, set the
		//    httpOnly cookie, and return to the app.
		if (url.pathname === '/callback') {
			const code = url.searchParams.get('code');
			const state = url.searchParams.get('state');
			const cookies = parseCookies(req.headers.get('Cookie'));
			if (!code || !state || state !== cookies.oauth_state)
				return new Response('Bad state', { status: 400, headers: cors });
			if (!env.GITHUB_CLIENT_SECRET)
				return json({ error: 'GITHUB_CLIENT_SECRET is not configured on the worker' }, 500, cors);

			const r = await fetch(GH + '/login/oauth/access_token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					client_id: env.GITHUB_CLIENT_ID,
					client_secret: env.GITHUB_CLIENT_SECRET,
					code,
					redirect_uri: url.origin + '/callback'
				})
			});
			const data = (await r.json()) as {
				access_token?: string;
				error?: string;
				error_description?: string;
			};
			if (!data.access_token) {
				return new Response(`Token exchange failed: ${data.error_description ?? data.error ?? 'no token'}`, {
					status: 401,
					headers: cors
				});
			}

			const returnUrl = sanitizeReturn(cookies.oauth_next ?? '', '', appUrl(env));
			const headers = new Headers({ Location: returnUrl });
			headers.append('Set-Cookie', cookie('gh_token', data.access_token, TOKEN_MAX_AGE, secure));
			headers.append('Set-Cookie', cookie('oauth_state', '', 0, secure));
			headers.append('Set-Cookie', cookie('oauth_next', '', 0, secure));
			return new Response(null, {
				status: 302,
				headers
			});
		}

		// 3. Authenticated proxy: /api/github?path=/user/repos
		if (url.pathname === '/api/github') {
			const token = parseCookies(req.headers.get('Cookie')).gh_token;
			if (!token) return json({ error: 'unauthorized' }, 401, cors);

			const path = url.searchParams.get('path') ?? '/user';
		if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT')
			return json({ error: 'method not allowed' }, 405, cors);
			if (!path.startsWith('/') || path.startsWith('//') || path.length > PATH_MAX_LENGTH)
				return json({ error: 'bad path' }, 400, cors);

			const target = path.startsWith('/graphql') ? API + '/graphql' : API + path;
			const headers: Record<string, string> = {
				Authorization: `Bearer ${token}`,
				Accept: 'application/vnd.github+json',
				'User-Agent': 'Hoshiza'
			};
		let body: string | undefined;
		if (req.method === 'POST' || req.method === 'PUT') {
			headers['Content-Type'] = 'application/json';
			body = await req.text();
		}

			const gh = await fetch(target, { method: req.method, headers, body });
			const ghBody = await gh.text();
			const out = new Response(ghBody, {
				status: gh.status,
				headers: {
					...cors,
					'Content-Type': gh.headers.get('Content-Type') ?? 'application/json',
					'Access-Control-Expose-Headers': 'x-oauth-scopes'
				}
			});
			// Pass through pagination + rate-limit + scope signals the client may want.
			for (const name of ['Link', 'X-GitHub-RateLimit-Remaining', 'X-OAuth-Scopes'] as const) {
				const v = gh.headers.get(name);
				if (v) out.headers.set(name, v);
			}
			return out;
		}

		// 4. Logout: clear the session cookie.
		if (url.pathname === '/logout') {
			const next = sanitizeNext(url.searchParams.get('next'));
			const returnUrl = sanitizeReturn(url.searchParams.get('origin') ?? '', next, appUrl(env));
			return new Response(null, {
				status: 302,
				headers: {
					Location: returnUrl,
					'Set-Cookie': cookie('gh_token', '', 0, secure)
				}
			});
		}

		return new Response('Not found', { status: 404, headers: cors });
	}
} satisfies ExportedHandler<Env>;

function appUrl(env: Env): string {
	return (env.APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, '');
}

/**
 * CORS for the app origins. The app lives on a different origin than the worker
 * (custom domain / GitHub Pages vs. *.workers.dev), so any https origin is
 * echoed. SameSite=Lax/None cookies are still only attached to the worker, so a
 * foreign site cannot read the session.
 */
function corsHeaders(req: Request, env: Env): Record<string, string> {
	const origin = req.headers.get('Origin');
	const appUrl_ = appUrl(env);
	const allowed = new Set([
		appUrl_,
		'http://localhost:5173',
		'http://localhost:4173'
	]);
	let allowOrigin = appUrl_;
	if (origin && (allowed.has(origin) || origin.startsWith('https://'))) allowOrigin = origin;
	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Credentials': 'true',
		Vary: 'Origin'
	};
}

/** Path-only redirect target, no protocol-relative URLs, capped length. */
function sanitizeNext(next: string | null): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.length > 200) return '/';
	return next;
}

function sanitizeScope(scope: string | null): string {
	if (!scope) return 'read:user public_repo read:org';
	return scope.slice(0, SCOPE_MAX_LENGTH);
}

/**
 * Combine an app base URL (origin + base path) with a path into a safe absolute
 * return URL. Only https origins and http://localhost are accepted; anything
 * else falls back to the app URL.
 */
function sanitizeReturn(base: string, path: string, fallback: string): string {
	const b = base.replace(/\/+$/, '');
	if (!b) return fallback + '/';
	const raw = b + (path ? (path.startsWith('/') ? path : '/' + path) : '');
	try {
		const u = new URL(raw);
		const isLocalHttp =
			u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
		if (u.username || u.password) return fallback + '/';
		if (u.protocol !== 'https:' && !isLocalHttp) return fallback + '/';
		return u.origin + u.pathname + u.search;
	} catch {
		return fallback + '/';
	}
}

function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
	const parts = [
		`${name}=${value}`,
		'HttpOnly',
		`SameSite=${secure ? 'None' : 'Lax'}`,
		'Path=/'
	];
	if (secure) parts.push('Secure');
	parts.push(`Max-Age=${maxAge}`);
	return parts.join('; ');
}

function parseCookies(h: string | null): Record<string, string> {
	const out: Record<string, string> = {};
	for (const c of (h ?? '').split(';')) {
		const [k, ...v] = c.trim().split('=');
		if (k) out[k] = v.join('=');
	}
	return out;
}

function json(obj: unknown, status: number, cors: Record<string, string>): Response {
	return new Response(JSON.stringify(obj), {
		status,
		headers: { ...cors, 'Content-Type': 'application/json' }
	});
}
