import { describe, it, expect } from 'vitest';
import {
	appUrl,
	corsHeaders,
	isAllowedPath,
	parseCookies,
	sanitizeNext,
	sanitizeReturn,
	sanitizeScope,
	type Env
} from '../src/worker';

const DEFAULT_SCOPES = 'read:user public_repo read:org';
const FALLBACK = 'https://nellowtcs.me/Hoshiza';

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
