import { redirect } from '@sveltejs/kit';
import { startLogin } from '#lib/server/spotify.ts';

export function GET({ cookies, url }) {
	const { url: authorizeUrl, verifier, state } = startLogin();
	const opts = { path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:', maxAge: 600 } as const;
	cookies.set('pkce_verifier', verifier, opts);
	cookies.set('oauth_state', state, opts);
	redirect(302, authorizeUrl, { external: true });
}
