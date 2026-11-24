import { describe, expect, it } from 'vitest';
import { openDb } from './schema.ts';
import * as q from './queries.ts';

const track = (id: string, added_at: string, release_date: string, artists: [string, string][]) => ({
	added_at,
	track: {
		id,
		name: `Song ${id}`,
		uri: `spotify:track:${id}`,
		duration_ms: 1000,
		album: { name: 'Album', release_date, images: [{ url: 'big' }, { url: 'small' }] },
		artists: artists.map(([id, name]) => ({ id, name }))
	}
});

function seed() {
	const db = openDb(':memory:');
	q.saveLikes(db, [
		track('t1', '2023-01-15T10:00:00Z', '1995-06-01', [['a1', 'Alpha']]),
		track('t2', '2023-03-31T10:00:00Z', '2001', [['a1', 'Alpha'], ['a2', 'Beta']]),
		track('t3', '2023-04-01T10:00:00Z', '1999-12', [['a2', 'Beta']]),
		{ added_at: '2023-05-01T00:00:00Z', track: { ...track('local', '', '', []).track, id: null } }
	]);
	// what analyze/analyze.py writes
	const audio = db.prepare("INSERT INTO audio (track_id, status, analyzed_at, bpm, camelot, energy) VALUES (?, 'ok', 'now', ?, ?, ?)");
	audio.run('t1', 124.6, '8A', 0.8);
	audio.run('t2', 95, '3B', null);
	const genre = db.prepare('INSERT INTO track_genres (track_id, family, genre, score) VALUES (?, ?, ?, ?)');
	genre.run('t1', 'Rock', 'Indie Rock', 0.6);
	genre.run('t1', 'Electronic', 'House', 0.2);
	genre.run('t2', 'Rock', 'Indie Rock', 0.5);
	genre.run('t3', 'Electronic', 'Deep House', 0.7);
	return db;
}

describe('stats queries', () => {
	it('groups likes by year, quarter and month and skips local files', () => {
		const db = seed();
		expect(q.likedBy(db, 'year')).toEqual([{ label: '2023', count: 3 }]);
		expect(q.likedBy(db, 'quarter')).toEqual([
			{ label: '2023-Q1', count: 2 },
			{ label: '2023-Q2', count: 1 }
		]);
		expect(q.likedBy(db, 'month').map((r) => r.label)).toEqual(['2023-01', '2023-03', '2023-04']);
	});

	it('counts songs per genre and family, overall and within a filter', () => {
		const db = seed();
		expect(q.topGenres(db)).toEqual([
			{ label: 'Indie Rock', count: 2 },
			{ label: 'Deep House', count: 1 },
			{ label: 'House', count: 1 }
		]);
		expect(q.topGenres(db, {}, 25, 'family')).toEqual([
			{ label: 'Electronic', count: 2 },
			{ label: 'Rock', count: 2 }
		]);
		expect(q.topGenres(db, { period: '2023-Q2' })).toEqual([{ label: 'Deep House', count: 1 }]);
	});

	it('summarises BPM, keys and taste per period', () => {
		const db = seed();
		expect(q.bpmBuckets(db)).toEqual([
			{ low: 90, count: 1 },
			{ low: 120, count: 1 }
		]);
		expect(q.tasteOverTime(db, 'quarter')).toEqual([
			{ label: '2023-Q2', songs: 1, bpm: null, energy: null, valence: null, genres: [{ label: '2023-Q2', genre: 'Deep House', count: 1 }] },
			{
				label: '2023-Q1',
				songs: 2,
				bpm: (124.6 + 95) / 2,
				energy: 0.8,
				valence: null,
				genres: [
					{ label: '2023-Q1', genre: 'Indie Rock', count: 2 },
					{ label: '2023-Q1', genre: 'House', count: 1 }
				]
			}
		]);
	});

	it('filters songs and keeps artist order', () => {
		const db = seed();
		expect(q.songs(db, { period: '2023-Q1', genre: 'Rock' }).map((s) => s.id)).toEqual(['t2', 't1']); // family
		expect(q.songs(db, { genre: 'House' }).map((s) => s.id)).toEqual(['t1']); // exact genre, not Deep House
		expect(q.songs(db, { bpmMin: 120, bpmMax: 130 }).map((s) => s.id)).toEqual(['t1']);
		expect(q.songs(db, { key: '3B' })[0]).toMatchObject({ id: 't2', genre: 'Indie Rock', bpm: 95 });
		expect(q.songs(db, { decade: 1990 }).map((s) => s.id)).toEqual(['t3', 't1']);
		expect(q.songs(db, { q: 'beta' }).map((s) => s.id)).toEqual(['t3', 't2']);
		expect(q.songs(db, { artist: 'a2' })[1]).toMatchObject({ id: 't2', artists: 'Alpha, Beta', album_image: 'small' });
	});

	it('lets a manual genre override the analyzed ones, and reverts', () => {
		const db = seed();
		expect(q.setGenre(db, ['t1'], 'Deep House')).toEqual({ family: 'Electronic', genre: 'Deep House' }); // family looked up
		expect(q.setGenre(db, ['t1'], 'deep house')).toEqual({ family: 'Electronic', genre: 'Deep House' }); // case-insensitive, keeps spelling
		expect(q.setGenre(db, ['t2'], 'Funk / Soul > Neo Soul')).toEqual({ family: 'Funk / Soul', genre: 'Neo Soul' });
		expect(q.setGenre(db, ['t3'], 'Footwork')).toEqual({ family: 'Other', genre: 'Footwork' }); // unknown genre
		expect(q.songs(db, { genre: 'Indie Rock' })).toEqual([]); // analyzed genres are hidden while overridden
		expect(q.songs(db, { genre: 'Electronic' }).map((s) => s.id)).toEqual(['t1']);
		expect(q.songs(db, { genre: 'Deep House' })[0]).toMatchObject({ id: 't1', genre: 'Deep House', manual: 1 });
		expect(q.clearGenre(db, ['t1', 't2', 't3', 't1'])).toBe(3);
		expect(q.songs(db, { genre: 'Indie Rock' }).map((s) => s.id)).toEqual(['t2', 't1']);
		expect(() => q.setGenre(db, ['t1'], 'Rock > ')).toThrow('Type a genre');
	});

	it('rules out a genre so the next-best one shows, and lists songs left with none', () => {
		const db = seed();
		expect(q.rejectGenre(db, ['t1', 't3'], 'Indie Rock')).toEqual({ count: 2, noGenre: 0 });
		expect(q.songs(db, { genre: 'Indie Rock' }).map((s) => s.id)).toEqual(['t2']);
		expect(q.songs(db, { genre: 'House' })[0]).toMatchObject({ id: 't1', genre: 'House', manual: 1 });
		expect(q.rejectGenre(db, ['t3'])).toEqual({ count: 1, noGenre: 1 }); // its current genre, Deep House
		expect(q.songs(db, { genre: q.NO_GENRE }).map((s) => s.id)).toEqual(['t3']);
		expect(q.noGenreCount(db)).toBe(1);
		q.setGenre(db, ['t2'], 'Rock > Punk');
		q.rejectGenre(db, ['t2'], 'Rock'); // a family also drops the manual genre in it
		expect(q.songs(db, { genre: 'Rock' })).toEqual([]);
		expect(q.clearGenre(db, ['t1', 't2', 't3'])).toBe(3);
		expect(q.noGenreCount(db)).toBe(0);
	});

	it('keeps regional genres only for artists from that region, once countries are known', () => {
		const db = seed();
		db.prepare("INSERT INTO track_genres VALUES ('t2', 'Pop', 'K-pop', 0.9), ('t3', 'Pop', 'K-pop', 0.9)").run();
		expect(q.songs(db, { genre: 'K-pop' })).toHaveLength(2); // countries unknown: keep
		db.exec("UPDATE artists SET country = 'US' WHERE id = 'a2'");
		expect(q.songs(db, { genre: 'K-pop' })).toEqual([]);
		expect(q.songs(db, { genre: 'Indie Rock' }).find((s) => s.id === 't2')?.genre).toBe('Indie Rock'); // falls back
		db.exec("UPDATE artists SET country = 'KR' WHERE id = 'a1'"); // t2 is a collab with a Korean artist
		expect(q.songs(db, { genre: 'K-pop' }).map((s) => s.id)).toEqual(['t2']);
	});

	it('appends playlist tracks without duplicates and tracks push state', () => {
		const db = seed();
		const id = q.createPlaylist(db, 'Mix', ['t1', 't2']);
		expect(q.addTracks(db, id, ['t2', 't3'])).toBe(1); // t2 was already there
		expect(q.playlistMemberships(db)).toHaveLength(3);
		expect(q.playlistSongs(db, id).map((s) => s.id)).toEqual(['t1', 't2', 't3']);
		q.markSynced(db, id);
		expect(q.getPlaylist(db, id)!.synced_at).toBe(q.getPlaylist(db, id)!.updated_at);
		db.exec("UPDATE playlists SET synced_at = '2000-01-01', updated_at = '2000-01-01'"); // avoid same-millisecond timestamps
		q.removeTracks(db, id, ['t1']);
		const p = q.getPlaylist(db, id)!;
		expect(p.count).toBe(2);
		expect(p.updated_at > p.synced_at!).toBe(true);
	});
});
