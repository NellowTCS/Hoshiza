import { describe, it, expect, vi } from 'vitest';
import workerHandler, {
	appUrl,
	corsHeaders,
	isAllowedPath,
	openToken,
	parseCookies,
	sanitizeNext,
	sanitizeReturn,
	sanitizeScope,
	sealToken,
	type Env
} from '../src/worker';

const DEFAULT_SCOPES = 'read:user public_repo read:org';
const FALLBACK = 'https://nellowtcs.me/Hoshiza';

// SHA-256 derived independently with node:crypto, not with the worker's helper.
const PKCE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const PKCE_CHALLENGE = '13d31e961a1ad8ec2f16b10c4c982e0876a878ad6df144566ee1894acb70f9c3';

const LOGIN_ENV: Env = {
	GITHUB_CLIENT_ID: 'test-client-id',
	APP_URL: FALLBACK
};
const SESSION_ENV: Env = { GITHUB_CLIENT_SECRET: 'worker-test-secret' };

function callWorker(req: Request, env: Env = LOGIN_ENV): Promise<Response> {
	return workerHandler.fetch(req, env);
}

function cors(origin: string | null, env: Env = {}): Record<string, string> {
	const headers = new Headers();
	if (origin) headers.set('Origin', origin);
	return corsHeaders(new Request('https://worker.example/anything', { headers }), env);
}

describe('sanitizeScope', () => {
	it('defaults to the read-only scope set when absent', () => {
		expect(sanitizeScope(null)).toBe(DEFAULT_SCOPES);
	});

	it('passes an explicit scope through', () => {
		expect(sanitizeScope('repo read:org')).toBe('repo read:org');
	});

	it('truncates an overlong scope string', () => {
		const out = sanitizeScope('a'.repeat(500));
		expect(out.length).toBe(200);
	});
});

describe('sanitizeNext', () => {
	it('passes a plain relative path through', () => {
		expect(sanitizeNext('/?sync=1')).toBe('/?sync=1');
	});

	it('rejects protocol-relative and absolute URLs', () => {
		expect(sanitizeNext('//evil.com')).toBe('/');
		expect(sanitizeNext('https://evil.com')).toBe('/');
	});

	it('rejects an overlong path', () => {
		expect(sanitizeNext('/' + 'x'.repeat(201))).toBe('/');
	});

	it('defaults null to the root', () => {
		expect(sanitizeNext(null)).toBe('/');
	});
});

describe('sanitizeReturn', () => {
	it('combines an https app base with a path', () => {
		expect(sanitizeReturn('https://nellowtcs.me/Hoshiza', '/?sync=1', FALLBACK)).toBe(
			'https://nellowtcs.me/Hoshiza/?sync=1'
		);
	});

	it('allows plain http only on localhost', () => {
		expect(sanitizeReturn('http://localhost:5173', '/', FALLBACK)).toBe('http://localhost:5173/');
		expect(sanitizeReturn('http://evil.example', '/', FALLBACK)).toBe(FALLBACK + '/');
	});

	it('rejects embedded credentials', () => {
		expect(sanitizeReturn('https://user:pass@evil.example/x', '/', FALLBACK)).toBe(FALLBACK + '/');
	});

	it('rejects non-http schemes', () => {
		expect(sanitizeReturn('javascript:alert(1)', '/', FALLBACK)).toBe(FALLBACK + '/');
	});

	it('falls back to the app URL for an empty base', () => {
		expect(sanitizeReturn('', '/', FALLBACK)).toBe(FALLBACK + '/');
	});

	it('keeps trailing slashes off the base before joining', () => {
		expect(sanitizeReturn('https://nellowtcs.me/Hoshiza/', 'x', FALLBACK)).toBe(
			'https://nellowtcs.me/Hoshiza/x'
		);
	});
});

describe('parseCookies', () => {
	it('returns an empty object for no header', () => {
		expect(parseCookies(null)).toEqual({});
	});

	it('parses space-separated cookie pairs', () => {
		expect(parseCookies('a=1; b=two; gh_token=abc')).toEqual({ a: '1', b: 'two', gh_token: 'abc' });
	});

	it('keeps equals signs inside a value', () => {
		expect(parseCookies('gh_token=a=b=c')).toEqual({ gh_token: 'a=b=c' });
	});
});

describe('corsHeaders', () => {
	it('echoes the configured app origin', () => {
		expect(cors('https://nellowtcs.me', { APP_URL: 'https://nellowtcs.me/Hoshiza' })).toMatchObject({
			'Access-Control-Allow-Origin': 'https://nellowtcs.me',
			'Access-Control-Allow-Credentials': 'true'
		});
	});

	it('echoes the local dev origins', () => {
		expect(cors('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
		expect(cors('http://localhost:4173')['Access-Control-Allow-Origin']).toBe('http://localhost:4173');
	});

	it('echoes an origin from APP_ORIGINS', () => {
		const env = { APP_ORIGINS: 'https://staging.example, https://other.example/' } as Env;
		expect(cors('https://staging.example', env)['Access-Control-Allow-Origin']).toBe(
			'https://staging.example'
		);
		expect(cors('https://other.example', env)['Access-Control-Allow-Origin']).toBe(
			'https://other.example'
		);
	});

	it('echoes a CodeSandbox preview origin', () => {
		expect(cors('https://6pxkdn-5173.csb.app')['Access-Control-Allow-Origin']).toBe(
			'https://6pxkdn-5173.csb.app'
		);
	});

	it('rejects a foreign https origin that is not a CodeSandbox preview', () => {
		expect(cors('https://evil.example')['Access-Control-Allow-Origin']).toBe(FALLBACK);
	});

	it('never echoes a non-localhost http origin', () => {
		expect(cors('http://evil.example')['Access-Control-Allow-Origin']).toBe(FALLBACK);
	});

	it('defaults to the app URL when no Origin is sent', () => {
		expect(cors(null)['Access-Control-Allow-Origin']).toBe(FALLBACK);
	});

	it('normalizes APP_URL by comparing against its origin, not the full URL', () => {
		expect(cors('https://nellowtcs.me', { APP_URL: 'https://nellowtcs.me/Hoshiza' })['Access-Control-Allow-Origin']).toBe(
			'https://nellowtcs.me'
		);
	});
});

describe('appUrl', () => {
	it('uses the production default when APP_URL is unset', () => {
		expect(appUrl({})).toBe(FALLBACK);
	});

	it('uses APP_URL and strips a trailing slash', () => {
		expect(appUrl({ APP_URL: 'https://x.example/app/' } as Env)).toBe('https://x.example/app');
	});
});

describe('isAllowedPath', () => {
	it('allows the identity and repo reads the app makes', () => {
		expect(isAllowedPath('/user', 'GET')).toBe(true);
		expect(isAllowedPath('/user/repos', 'GET')).toBe(true);
		expect(isAllowedPath('/repos/NellowTCS/hoshiza-data', 'GET')).toBe(true);
		expect(isAllowedPath('/repos/NellowTCS/hoshiza-data/contents/state.json', 'GET')).toBe(true);
	});

	it('allows the data-repo creation calls', () => {
		expect(isAllowedPath('/user/repos', 'POST')).toBe(true);
	});

	it('allows GraphQL only as a POST', () => {
		expect(isAllowedPath('/graphql', 'POST')).toBe(true);
		expect(isAllowedPath('/graphql', 'GET')).toBe(false);
	});

	it('allows PUT only for the data-repo state file', () => {
		expect(isAllowedPath('/repos/NellowTCS/hoshiza-data/contents/state.json', 'PUT')).toBe(true);
		expect(isAllowedPath('/repos/NellowTCS/hoshiza-data', 'PUT')).toBe(false);
		expect(isAllowedPath('/repos/NellowTCS/hoshiza-data/contents/', 'PUT')).toBe(false);
	});

	it('rejects writes through read-only methods', () => {
		expect(isAllowedPath('/user', 'POST')).toBe(false);
		expect(isAllowedPath('/repos/NellowTCS/x', 'POST')).toBe(false);
		expect(isAllowedPath('/repos/NellowTCS/x', 'PUT')).toBe(false);
	});

	it('rejects out-of-scope paths entirely', () => {
		expect(isAllowedPath('/admin', 'GET')).toBe(false);
		expect(isAllowedPath('/organizations', 'GET')).toBe(false);
		expect(isAllowedPath('/user/emails', 'POST')).toBe(false);
		expect(isAllowedPath('/repos/NellowTCS/hoshiza-data/contents/state.json', 'DELETE')).toBe(false);
	});

	it('requires a full file name for contents writes', () => {
		expect(isAllowedPath('/repos/a/b/contents/../state.json', 'PUT')).toBe(false);
	});
});

describe('PKCE handoff seal', () => {
	const secret = 'worker-test-secret';

	it('opens a sealed code with the matching verifier', async () => {
		const code = await sealToken('gh-test-token', secret, PKCE_CHALLENGE);
		expect(await openToken(code, secret, PKCE_VERIFIER)).toBe('gh-test-token');
	});

	it('refuses a sealed code with a different verifier', async () => {
		const code = await sealToken('gh-test-token', secret, PKCE_CHALLENGE);
		expect(await openToken(code, secret, 'a-different-verifier')).toBeNull();
	});

	it('refuses a sealed code without a verifier', async () => {
		const code = await sealToken('gh-test-token', secret, PKCE_CHALLENGE);
		expect(await openToken(code, secret, '')).toBeNull();
	});

	it('refuses the challenge itself as a verifier', async () => {
		const code = await sealToken('gh-test-token', secret, PKCE_CHALLENGE);
		expect(await openToken(code, secret, PKCE_CHALLENGE)).toBeNull();
	});

	it('refuses a tampered code', async () => {
		const code = await sealToken('gh-test-token', secret, PKCE_CHALLENGE);
		expect(await openToken(code.slice(0, -2) + 'xx', secret, PKCE_VERIFIER)).toBeNull();
	});
});

describe('/login PKCE challenge', () => {
	it('rejects a login that omits the code_challenge', async () => {
		const res = await callWorker(new Request('https://worker.example/login'));
		expect(res.status).toBe(400);
	});

	it('embeds the challenge in state and sets no handoff_secret cookie', async () => {
		const res = await callWorker(
			new Request(`https://worker.example/login?code_challenge=${PKCE_CHALLENGE}`)
		);
		expect(res.status).toBe(302);
		const cookies = res.headers.getSetCookie();
		expect(cookies.some(c => c.startsWith('handoff_secret='))).toBe(false);
		const state = cookies
			.find(c => c.startsWith('oauth_state='))
			?.slice('oauth_state='.length)
			.split(';')[0];
		expect(state?.endsWith(`.${PKCE_CHALLENGE}`)).toBe(true);
		const location = new URL(res.headers.get('Location') ?? '');
		expect(location.searchParams.get('state')).toBe(state);
	});
});

describe('/callback PKCE sealing', () => {
	it('seals the fragment against the challenge carried in state', async () => {
		vi.stubGlobal(
			'fetch',
			async () =>
				new Response(JSON.stringify({ access_token: 'gh-test-token' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		try {
			const state = `nonce.${PKCE_CHALLENGE}`;
			const res = await callWorker(
				new Request(
					`https://worker.example/callback?code=gh-oauth-code&state=${encodeURIComponent(state)}`,
					{
						headers: {
							Cookie: `oauth_state=${state}; oauth_next=${encodeURIComponent(FALLBACK)}`
						}
					}
				),
				SESSION_ENV
			);
			expect(res.status).toBe(302);
			const location = new URL(res.headers.get('Location') ?? '');
			const code = new URLSearchParams(location.hash.slice(1)).get('code');
			expect(code).toBeTruthy();
			expect(await openToken(code ?? '', 'worker-test-secret', PKCE_VERIFIER)).toBe('gh-test-token');
			expect(res.headers.getSetCookie().some(c => c.startsWith('handoff_secret='))).toBe(false);
		} finally {
			vi.unstubAllGlobals();
		}
	});
});

describe('/api/session PKCE redemption', () => {
	it('returns the token for a matching verifier without any cookies', async () => {
		const code = await sealToken('gh-test-token', 'worker-test-secret', PKCE_CHALLENGE);
		const res = await callWorker(
			new Request('https://worker.example/api/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, verifier: PKCE_VERIFIER })
			}),
			SESSION_ENV
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ token: 'gh-test-token' });
		expect(res.headers.getSetCookie()).toEqual([]);
	});

	it('rejects a mismatched verifier', async () => {
		const code = await sealToken('gh-test-token', 'worker-test-secret', PKCE_CHALLENGE);
		const res = await callWorker(
			new Request('https://worker.example/api/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, verifier: 'a-different-verifier' })
			}),
			SESSION_ENV
		);
		expect(res.status).toBe(401);
	});

	it('rejects a missing verifier', async () => {
		const code = await sealToken('gh-test-token', 'worker-test-secret', PKCE_CHALLENGE);
		const res = await callWorker(
			new Request('https://worker.example/api/session', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code })
			}),
			SESSION_ENV
		);
		expect(res.status).toBe(401);
	});
});
