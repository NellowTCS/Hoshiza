// Hoshiza worker
//
// GitHub blocks browser CORS at the token exchange and requires a client secret
// there, so this worker holds the secret and everything else is delegated.
//
// Auth cookies are SameSite=None (Secure) on HTTPS because the app lives on a
// different origin than the worker and the browser must attach the token to
// cross-site fetch() calls. Over http (wrangler dev) the cookies drop to
// SameSite=Lax without Secure so browsers store them on plain localhost.

export interface Env {
	GITHUB_CLIENT_ID?: string;
	GITHUB_CLIENT_SECRET?: string;
	APP_URL?: string;
	/** Extra comma-separated origins allowed to make credentialed calls (optional). */
	APP_ORIGINS?: string;
}

const GH = 'https://github.com';
const API = 'https://api.github.com';
const DEFAULT_APP_URL = 'https://nellowtcs.me/Hoshiza';
const TOKEN_MAX_AGE = 28800; // 8h session
const STATE_MAX_AGE = 600; // 10min OAuth round trip

const SCOPE_MAX_LENGTH = 200;
const PATH_MAX_LENGTH = 512;
const CHALLENGE_PATTERN = /^[0-9a-f]{64}$/;
const VERIFIER_MAX_LENGTH = 128;

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
				'Access-Control-Allow-Headers': 'Content-Type, Authorization',
				'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
					'Access-Control-Max-Age': '86400'
				}
			});
		}

		// 1. Kick off login: carry the PKCE challenge in state, then off to GitHub.
		if (url.pathname === '/login') {
			const clientId = env.GITHUB_CLIENT_ID;
			if (!clientId)
				return json({ error: 'GITHUB_CLIENT_ID is not configured on the worker' }, 500, cors);
			const challenge = url.searchParams.get('code_challenge') ?? '';
			if (!CHALLENGE_PATTERN.test(challenge))
				return json({ error: 'invalid or missing code_challenge' }, 400, cors);
			const state = `${crypto.randomUUID()}.${challenge}`;
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
			const ghCode = url.searchParams.get('code');
			const state = url.searchParams.get('state');
			const cookies = parseCookies(req.headers.get('Cookie'));
			if (!ghCode || !state || state !== cookies.oauth_state)
				return new Response('Bad state', { status: 400, headers: cors });
			const dot = state.indexOf('.');
			const challenge = dot > 0 ? state.slice(dot + 1) : '';
			if (!CHALLENGE_PATTERN.test(challenge))
				return new Response('Bad state', { status: 400, headers: cors });
			const clientSecret = env.GITHUB_CLIENT_SECRET;
			if (!clientSecret)
				return json({ error: 'GITHUB_CLIENT_SECRET is not configured on the worker' }, 500, cors);

			const r = await fetch(GH + '/login/oauth/access_token', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify({
					client_id: env.GITHUB_CLIENT_ID,
					client_secret: clientSecret,
					code: ghCode,
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

			const baseReturn = sanitizeReturn(cookies.oauth_next ?? '', '', appUrl(env));
			const handoff = await sealToken(data.access_token, clientSecret, challenge);
			const u = new URL(baseReturn);
			u.hash = 'code=' + encodeURIComponent(handoff);
			const headers = new Headers({ Location: u.toString() });
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
			const auth = req.headers.get('Authorization') ?? '';
			const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
			const token = parseCookies(req.headers.get('Cookie')).gh_token || bearer;
			if (!token) return json({ error: 'unauthorized' }, 401, cors);

			const path = url.searchParams.get('path') ?? '/user';
		if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PUT')
			return json({ error: 'method not allowed' }, 405, cors);
			if (!path.startsWith('/') || path.startsWith('//') || path.length > PATH_MAX_LENGTH)
				return json({ error: 'bad path' }, 400, cors);
			if (!isAllowedPath(path, req.method))
				return json({ error: 'path not allowed' }, 403, cors);

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

		// 4. Exchange handoff code for token (iOS/ITP fallback). The sealed fragment
		// is useless without the verifier held in the app tab's sessionStorage.
		if (url.pathname === '/api/session' && req.method === 'POST') {
			if (!env.GITHUB_CLIENT_SECRET)
				return json({ error: 'not configured' }, 500, cors);
			let handoff = '';
			let verifier = '';
			try {
				const b = (await req.json()) as { code?: string; verifier?: string };
				handoff = b.code ?? '';
				verifier = b.verifier ?? '';
			} catch {}
			if (!verifier || verifier.length > VERIFIER_MAX_LENGTH)
				return json({ error: 'invalid or expired code' }, 401, cors);
			const token = await openToken(handoff, env.GITHUB_CLIENT_SECRET, verifier);
			return token
				? json({ token }, 200, cors)
				: json({ error: 'invalid or expired code' }, 401, cors);
		}

		// 5. Logout: clear the session cookie.
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

export function appUrl(env: Env): string {
	return (env.APP_URL ?? DEFAULT_APP_URL).replace(/\/+$/, '');
}/**
 * CORS for the app origins. The app lives on a different origin than the worker
 * (custom domain / GitHub Pages vs. *.workers.dev), and the session cookie is
 * SameSite=None, so CORS is the only thing stopping a foreign site from driving
 * the proxy with a logged-in user's cookie. Never echo an origin that is not
 * the app or a configured dev/staging origin.
 */
export function corsHeaders(req: Request, env: Env): Record<string, string> {
	const origin = req.headers.get('Origin');
	const allowed = new Set(['http://localhost:5173', 'http://localhost:4173']);
	try {
		// Origin headers carry scheme+host+port only, never a path.
		allowed.add(new URL(appUrl(env)).origin);
	} catch {
		// Unparseable APP_URL falls through to the dev origins above.
	}
	for (const o of (env.APP_ORIGINS ?? '').split(',')) {
		const t = o.trim().replace(/\/+$/, '');
		if (t) allowed.add(t);
	}
	// Disallowed or absent origins get the app URL, which never matches a
	// foreign Origin header, so the browser still blocks credentialed reads.
	if (origin && !allowed.has(origin)) {
		// CodeSandbox preview URLs (*.csb.app) are treated as dev origins.
		if (/^https:\/\/[^/]+\.csb\.app$/.test(origin)) {
			return {
				'Access-Control-Allow-Origin': origin,
				'Access-Control-Allow-Credentials': 'true',
				Vary: 'Origin'
			};
		}
	}
	const allowOrigin = origin && allowed.has(origin) ? origin : appUrl(env);
	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Credentials': 'true',
		Vary: 'Origin'
	};
}

/** Path-only redirect target, no protocol-relative URLs, capped length. */
export function sanitizeNext(next: string | null): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.length > 200) return '/';
	return next;
}

/**
 * Allow-list for proxied GitHub API paths. The app only reads identity/org/repo
 * state, fetches GraphQL, and writes the one state file in the data repo; a
 * token with `repo` scope can do far more, so keep the proxy surface to exactly
 * what the client needs.
 */
export function isAllowedPath(path: string, method: string): boolean {
	if (method === 'PUT') {
		// The single write surface: the data repo's state file.
		return /^\/repos\/[^/]+\/[^/]+\/contents\/[^/]+$/.test(path);
	}
	if (method === 'POST') {
		return path === '/graphql' || path === '/user/repos';
	}
	if (method !== 'GET') return false;
	return /^\/user(?:\/|$)/.test(path) || /^\/repos\//.test(path);
}

export function sanitizeScope(scope: string | null): string {
	if (!scope) return 'read:user public_repo read:org';
	return scope.slice(0, SCOPE_MAX_LENGTH);
}

/**
 * Combine an app base URL (origin + base path) with a path into a safe absolute
 * return URL. Only https origins and http://localhost are accepted; anything
 * else falls back to the app URL.
 */
export function sanitizeReturn(base: string, path: string, fallback: string): string {
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


const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(buf: ArrayBuffer | Uint8Array): string {
	const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
	let s = '';
	for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function unb64u(s: string): Uint8Array {
	s = s.replace(/-/g, '+').replace(/_/g, '/');
	while (s.length % 4) s += '=';
	const bin = atob(s);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}
async function sealKey(secret: string): Promise<CryptoKey> {
	const raw = await crypto.subtle.digest('SHA-256', enc.encode(secret));
	return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function sha256Hex(s: string): Promise<string> {
	const buf = await crypto.subtle.digest('SHA-256', enc.encode(s));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** Encrypt a token into a short-lived opaque code bound to a PKCE challenge hex. */
export async function sealToken(token: string, secret: string, challenge: string): Promise<string> {
	const key = await sealKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const payload = enc.encode(JSON.stringify({ t: token, exp: Date.now() + 120000, h: challenge }));
	const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, payload);
	const packed = new Uint8Array(iv.length + ct.byteLength);
	packed.set(iv, 0);
	packed.set(new Uint8Array(ct), iv.length);
	return b64u(packed);
}
/** Decrypt a handoff code only when the caller supplies the matching verifier. */
export async function openToken(code: string, secret: string, verifier: string): Promise<string | null> {
	try {
		const packed = unb64u(code);
		if (packed.length < 13) return null;
		const iv = packed.slice(0, 12);
		const ct = packed.slice(12);
		const key = await sealKey(secret);
		const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
		const data = JSON.parse(dec.decode(pt)) as { t?: string; exp?: number; h?: string };
		if (!data.t || typeof data.exp !== 'number' || Date.now() > data.exp) return null;
		// The fragment is public; only the tab that started login holds the verifier.
		if (!verifier || !data.h || data.h !== (await sha256Hex(verifier))) return null;
		return data.t;
	} catch {
		return null;
	}
}

export function parseCookies(h: string | null): Record<string, string> {
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
