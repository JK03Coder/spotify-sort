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

	it('appends playlist tracks without duplicates and tracks push state', () => {
		const db = seed();
		const id = q.createPlaylist(db, 'Mix', ['t1', 't2']);
		q.addTracks(db, id, ['t2', 't3']);
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
