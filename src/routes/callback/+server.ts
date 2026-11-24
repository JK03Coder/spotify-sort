import { error, redirect } from '@sveltejs/kit';
import { finishLogin } from '#lib/server/spotify.ts';

export async function GET({ cookies, url }) {
	const denied = url.searchParams.get('error');
	if (denied) error(400, `Spotify login failed: ${denied}`);

	const code = url.searchParams.get('code');
	const verifier = cookies.get('pkce_verifier');
	if (!code || !verifier || url.searchParams.get('state') !== cookies.get('oauth_state')) {
		error(400, 'Login state mismatch, please try logging in again');
	}
	cookies.delete('pkce_verifier', { path: '/' });
	cookies.delete('oauth_state', { path: '/' });

	await finishLogin(code, verifier);
	redirect(303, '/');
}
