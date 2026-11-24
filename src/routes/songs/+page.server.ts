import { fail } from '@sveltejs/kit';
import { db } from '#lib/server/db.ts';
import {
	addTracks,
	artistName,
	clearGenre,
	createPlaylist,
	genreChoices,
	getPlaylist,
	keys,
	likedBy,
	listPlaylists,
	NO_GENRE,
	noGenreCount,
	playlistMemberships,
	rejectGenre,
	releaseDecades,
	setGenre,
	songs,
	topGenres,
	type Filter
} from '#lib/server/queries.ts';

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
		playlists: listPlaylists(db),
		memberships: playlistMemberships(db),
		// options for the filter dropdowns
		options: {
			families: topGenres(db, {}, 100, 'family'),
			genres: topGenres(db, {}, 1000),
			noGenre: noGenreCount(db),
			genreChoices: genreChoices(db),
			decades: releaseDecades(db),
			keys: keys(db),
			periods: (['year', 'quarter', 'month'] as const).map((by) => ({
				heading: `${by[0].toUpperCase()}${by.slice(1)}s`,
				options: likedBy(db, by).map((r) => ({ value: r.label, count: r.count })).reverse()
			}))
		}
	};
}

export const actions = {
	// one action for both "new playlist" and "existing playlist" so the page can stay put afterwards
	add: async ({ request }) => {
		const form = await request.formData();
		const tracks = form.getAll('track').map(String);
		if (!tracks.length) return fail(400, { message: 'Select at least one song' });

		const target = String(form.get('target') ?? 'new');
		if (target === 'new') {
			const name = String(form.get('name') ?? '').trim();
			if (!name) return fail(400, { message: 'Give the new playlist a name' });
			const id = createPlaylist(db, name, tracks);
			return { added: tracks.length, skipped: 0, playlist: { id, name, created: true } };
		}

		const playlist = getPlaylist(db, Number(target));
		if (!playlist) return fail(400, { message: 'That playlist no longer exists' });
		const added = addTracks(db, playlist.id, tracks);
		return { added, skipped: tracks.length - added, playlist: { id: playlist.id, name: playlist.name, created: false } };
	},
	setGenre: async ({ request }) => {
		const form = await request.formData();
		const tracks = form.getAll('track').map(String);
		const input = String(form.get('genre') ?? '').trim();
		if (!tracks.length) return fail(400, { message: 'Select the songs to change' });
		try {
			return { genreSet: { count: tracks.length, ...setGenre(db, tracks, input) } };
		} catch (e) {
			return fail(400, { message: (e as Error).message });
		}
	},
	// "not this genre": the genre filtered on (the action URL keeps the filters), else each song's current genre
	rejectGenre: async ({ request, url }) => {
		const tracks = (await request.formData()).getAll('track').map(String);
		if (!tracks.length) return fail(400, { message: 'Select the songs to change' });
		const filtered = url.searchParams.get('genre');
		const genre = filtered && filtered !== NO_GENRE ? filtered : undefined;
		return { genreRejected: { genre, ...rejectGenre(db, tracks, genre) } };
	},
	resetGenre: async ({ request }) => {
		const tracks = (await request.formData()).getAll('track').map(String);
		return { genreReset: clearGenre(db, tracks) };
	}
};
