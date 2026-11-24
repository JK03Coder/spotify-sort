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
	q.saveArtist(db, { id: 'a1', genres: ['rock', 'indie'] });
	q.saveArtist(db, { id: 'a2', genres: ['indie'] });
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

	it('counts each song once per genre, overall and within a filter', () => {
		const db = seed();
		expect(q.topGenres(db)).toEqual([
			{ label: 'indie', count: 3 },
			{ label: 'rock', count: 2 }
		]);
		expect(q.topGenres(db, { period: '2023-Q2' })).toEqual([{ label: 'indie', count: 1 }]);
	});

	it('filters songs and keeps artist order', () => {
		const db = seed();
		expect(q.songs(db, { period: '2023-Q1', genre: 'rock' }).map((s) => s.id)).toEqual(['t2', 't1']);
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
