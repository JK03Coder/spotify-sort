import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db.ts';
import { deletePlaylist, getPlaylist, playlistSongs, removeTracks, updatePlaylist } from '#lib/server/queries.ts';
import { pushPlaylist } from '#lib/server/spotify.ts';

export function load({ params }) {
	const playlist = getPlaylist(db, Number(params.id));
	if (!playlist) error(404, 'Playlist not found');
	return { playlist, songs: playlistSongs(db, playlist.id) };
}

export const actions = {
	save: async ({ params, request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { message: 'Name cannot be empty' });
		updatePlaylist(db, Number(params.id), name, String(form.get('description') ?? '').trim());
	},
	remove: async ({ params, request }) => {
		removeTracks(db, Number(params.id), (await request.formData()).getAll('track').map(String));
	},
	push: async ({ params }) => {
		try {
			await pushPlaylist(Number(params.id));
		} catch (e: any) {
			return fail(502, { message: e?.body?.message ?? e?.message ?? String(e) });
		}
	},
	delete: ({ params }) => {
		// only removes the local copy; a playlist already pushed stays on Spotify
		deletePlaylist(db, Number(params.id));
		redirect(303, '/playlists');
	}
};
