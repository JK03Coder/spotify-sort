import { fail, redirect } from '@sveltejs/kit';
import { db } from '#lib/server/db.ts';
import { addTracks, artistName, createPlaylist, getPlaylist, listPlaylists, songs, topGenres, type Filter } from '#lib/server/queries.ts';

export function load({ url }) {
	const p = url.searchParams;
	const num = (key: string) => {
		const n = Number.parseFloat(p.get(key) ?? '');
		return Number.isNaN(n) ? undefined : n;
	};
	const filter: Filter = {
		period: p.get('period') || undefined,
		genre: p.get('genre') || undefined,
		artist: p.get('artist') || undefined,
		decade: num('decade'),
		q: p.get('q') || undefined,
		bpmMin: num('bpm_min'),
		bpmMax: num('bpm_max'),
		key: p.get('key') || undefined
	};
	return {
		filter,
		artistName: filter.artist ? artistName(db, filter.artist) : undefined,
		songs: songs(db, filter),
		genres: topGenres(db, filter, 20),
		playlists: listPlaylists(db)
	};
}

function selectedTracks(form: FormData) {
	return form.getAll('track').map(String);
}

export const actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const tracks = selectedTracks(form);
		if (!name) return fail(400, { message: 'Give the playlist a name' });
		if (!tracks.length) return fail(400, { message: 'Select at least one song' });
		redirect(303, `/playlists/${createPlaylist(db, name, tracks)}`);
	},
	add: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('playlist'));
		const tracks = selectedTracks(form);
		if (!getPlaylist(db, id)) return fail(400, { message: 'Pick a playlist' });
		if (!tracks.length) return fail(400, { message: 'Select at least one song' });
		addTracks(db, id, tracks);
		redirect(303, `/playlists/${id}`);
	}
};
