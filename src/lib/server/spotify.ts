import { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI } from '$app/env/private';
import { error } from '@sveltejs/kit';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.ts';
import { getPlaylist, kvDelete, kvGet, kvSet, playlistSongs, markSynced, setSpotifyId } from './queries.ts';

const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-library-read playlist-modify-private playlist-modify-public';

type Token = { access_token: string; refresh_token: string; expires_at: number };

// --- login: Authorization Code with PKCE by default (no secret needed), or the classic client-secret flow when SPOTIFY_CLIENT_SECRET is set ---

export function startLogin() {
	const verifier = randomBytes(64).toString('base64url');
	const state = randomBytes(16).toString('base64url');
	const url = new URL('https://accounts.spotify.com/authorize');
	url.search = new URLSearchParams({
		client_id: SPOTIFY_CLIENT_ID,
		response_type: 'code',
		redirect_uri: SPOTIFY_REDIRECT_URI,
		scope: SCOPES,
		state,
		...(!SPOTIFY_CLIENT_SECRET && {
			code_challenge_method: 'S256',
			code_challenge: createHash('sha256').update(verifier).digest('base64url')
		})
	}).toString();
	return { url: url.toString(), verifier, state };
}

async function tokenRequest(params: Record<string, string>): Promise<Token> {
	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			...(SPOTIFY_CLIENT_SECRET && {
				Authorization: `Basic ${Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
			})
		},
		body: new URLSearchParams({ ...(!SPOTIFY_CLIENT_SECRET && { client_id: SPOTIFY_CLIENT_ID }), ...params })
	});
	if (!res.ok) throw new Error(`Spotify token request failed: ${res.status} ${await res.text()}`);
	const json = await res.json();
	const token: Token = {
		access_token: json.access_token,
		refresh_token: json.refresh_token ?? loadToken()?.refresh_token,
		expires_at: Date.now() + json.expires_in * 1000
	};
	kvSet(db, 'token', JSON.stringify(token));
	return token;
}

export async function finishLogin(code: string, verifier: string) {
	await tokenRequest({
		grant_type: 'authorization_code',
		code,
		redirect_uri: SPOTIFY_REDIRECT_URI,
		...(!SPOTIFY_CLIENT_SECRET && { code_verifier: verifier })
	});
	const me = await api<{ id: string; display_name: string | null }>('/me');
	kvSet(db, 'user', me.display_name || me.id);
}

export function logout() {
	kvDelete(db, 'token');
	kvDelete(db, 'user');
}

const loadToken = () => {
	const raw = kvGet(db, 'token');
	return raw ? (JSON.parse(raw) as Token) : undefined;
};

let refreshing: Promise<Token> | null = null;

async function accessToken() {
	const token = loadToken();
	if (!token) error(401, 'Not logged in to Spotify');
	if (token.expires_at - 60_000 > Date.now()) return token.access_token;
	// one refresh at a time: Spotify may rotate the refresh token, so parallel refreshes would race
	refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: token.refresh_token }).finally(() => (refreshing = null));
	return (await refreshing).access_token;
}

// --- API ---

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
	const url = path.startsWith('https://') ? path : API + path;
	for (let attempt = 0; ; attempt++) {
		const res = await fetch(url, {
			...init,
			headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json', ...init.headers }
		});
		if (res.status === 429 && attempt < 5) {
			const wait = Number(res.headers.get('Retry-After')) || 1;
			if (wait > 120) {
				throw new Error(`Spotify rate limit: blocked until ${new Date(Date.now() + wait * 1000).toLocaleString()}, try again after that`);
			}
			await new Promise((r) => setTimeout(r, wait * 1000));
			continue;
		}
		const text = await res.text();
		if (!res.ok) throw new Error(`Spotify ${init.method ?? 'GET'} ${path} failed: ${res.status} ${text}`);
		return (text ? JSON.parse(text) : undefined) as T;
	}
}

/** Creates the playlist on Spotify the first time, afterwards overwrites its details and items with the local version. */
export async function pushPlaylist(id: number) {
	const p = getPlaylist(db, id);
	if (!p) error(404, 'Playlist not found');
	const uris = playlistSongs(db, id).map((s) => s.uri);
	const details = { name: p.name, ...(p.description && { description: p.description }) };

	let spotifyId = p.spotify_id;
	if (!spotifyId) {
		spotifyId = (await api<{ id: string }>('/me/playlists', { method: 'POST', body: JSON.stringify({ ...details, public: false }) })).id;
		setSpotifyId(db, id, spotifyId); // save right away so a failure below can't create a duplicate on retry
	} else {
		await api(`/playlists/${spotifyId}`, { method: 'PUT', body: JSON.stringify(details) });
	}

	// PUT replaces everything (max 100 per request), then append the rest in chunks of 100
	await api(`/playlists/${spotifyId}/items`, { method: 'PUT', body: JSON.stringify({ uris: uris.slice(0, 100) }) });
	for (let i = 100; i < uris.length; i += 100) {
		await api(`/playlists/${spotifyId}/items`, { method: 'POST', body: JSON.stringify({ uris: uris.slice(i, i + 100) }) });
	}
	markSynced(db, id);
}
