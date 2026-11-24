import type { Db } from './schema.ts';

type Row = Record<string, any>;

function tx<T>(db: Db, fn: () => T): T {
	db.exec('BEGIN');
	try {
		const result = fn();
		db.exec('COMMIT');
		return result;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

// --- key/value (token, user) ---

export const kvGet = (db: Db, key: string) =>
	(db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as Row | undefined)?.value as string | undefined;
export const kvSet = (db: Db, key: string, value: string) =>
	db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
export const kvDelete = (db: Db, key: string) => db.prepare('DELETE FROM kv WHERE key = ?').run(key);

// --- sync writes ---

export type SavedTrack = {
	added_at: string;
	track: {
		id: string | null; // null for local files
		name: string;
		uri: string;
		duration_ms: number;
		external_ids?: { isrc?: string };
		album: { name: string; release_date: string; images: { url: string }[] };
		artists: { id: string | null; name: string }[];
	} | null;
};

/** Replaces the liked list with `items` (the full /me/tracks result) and upserts their tracks and artists. */
export function saveLikes(db: Db, items: SavedTrack[]) {
	tx(db, () => {
		db.exec('DELETE FROM liked');
		const track = db.prepare(`
			INSERT INTO tracks (id, name, uri, duration_ms, album_name, album_image, release_date, isrc) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET name = excluded.name, uri = excluded.uri, duration_ms = excluded.duration_ms,
				album_name = excluded.album_name, album_image = excluded.album_image, release_date = excluded.release_date,
				isrc = coalesce(excluded.isrc, tracks.isrc)`);
		const artist = db.prepare('INSERT INTO artists (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name');
		const clearLinks = db.prepare('DELETE FROM track_artists WHERE track_id = ?');
		const link = db.prepare('INSERT OR IGNORE INTO track_artists (track_id, artist_id, position) VALUES (?, ?, ?)');
		const like = db.prepare('INSERT OR REPLACE INTO liked (track_id, added_at) VALUES (?, ?)');

		for (const { added_at, track: t } of items) {
			if (!t?.id) continue;
			// images are widest first; the smallest is plenty for a list thumbnail
			track.run(t.id, t.name, t.uri, t.duration_ms, t.album.name, t.album.images.at(-1)?.url ?? null, t.album.release_date, t.external_ids?.isrc ?? null);
			clearLinks.run(t.id);
			t.artists.forEach((a, i) => {
				if (!a.id) return;
				artist.run(a.id, a.name);
				link.run(t.id, a.id, i);
			});
			like.run(t.id, added_at);
		}
	});
}

// --- stats ---

export const PERIODS = ['year', 'quarter', 'month'] as const;
export type Period = (typeof PERIODS)[number];

export const overview = (db: Db) =>
	db.prepare(`
		SELECT count(*) AS songs, min(added_at) AS first, max(added_at) AS last,
			(SELECT count(DISTINCT ta.artist_id) FROM liked l JOIN track_artists ta USING (track_id)) AS artists,
			(SELECT count(DISTINCT g.genre) FROM liked l JOIN track_genres g USING (track_id)) AS genres,
			(SELECT count(*) FROM liked l JOIN audio a USING (track_id)) AS analyzed,
			(SELECT count(*) FROM liked l JOIN audio a USING (track_id) WHERE a.status = 'ok') AS analyzedOk
		FROM liked`).get() as { songs: number; first: string | null; last: string | null; artists: number; genres: number; analyzed: number; analyzedOk: number };

/** `period` must come from PERIODS: it is interpolated as a column name. */
export const likedBy = (db: Db, period: Period) =>
	db.prepare(`SELECT ${period} AS label, count(*) AS count FROM liked_periods GROUP BY 1 ORDER BY 1`).all() as {
		label: string;
		count: number;
	}[];

export const topArtists = (db: Db, limit = 25) =>
	db.prepare(`
		SELECT a.id, a.name AS label, count(*) AS count
		FROM liked l JOIN track_artists ta USING (track_id) JOIN artists a ON a.id = ta.artist_id
		GROUP BY a.id ORDER BY count DESC, label LIMIT ?`).all(limit) as { id: string; label: string; count: number }[];

export const releaseDecades = (db: Db) =>
	db.prepare(`
		SELECT CAST(substr(t.release_date, 1, 4) AS INTEGER) / 10 * 10 AS decade, count(*) AS count
		FROM liked l JOIN tracks t ON t.id = l.track_id
		WHERE CAST(substr(t.release_date, 1, 4) AS INTEGER) > 0
		GROUP BY 1 ORDER BY 1`).all() as { decade: number; count: number }[];

export const bpmBuckets = (db: Db) =>
	db.prepare(`
		SELECT CAST(a.bpm / 10 AS INTEGER) * 10 AS low, count(*) AS count
		FROM liked l JOIN audio a USING (track_id) WHERE a.bpm > 0
		GROUP BY 1 ORDER BY 1`).all() as { low: number; count: number }[];

export const keys = (db: Db) =>
	db.prepare(`
		SELECT a.camelot, a.key || ' ' || a.scale AS name, count(*) AS count
		FROM liked l JOIN audio a USING (track_id) WHERE a.camelot IS NOT NULL
		GROUP BY 1 ORDER BY CAST(a.camelot AS INTEGER), a.camelot`).all() as { camelot: string; name: string; count: number }[];

/** Per period: song count, average BPM / energy / mood, and the top 3 genres. `period` must come from PERIODS. */
export function tasteOverTime(db: Db, period: Period) {
	const rows = db.prepare(`
		SELECT p.${period} AS label, count(*) AS songs, avg(a.bpm) AS bpm, avg(a.energy) AS energy, avg(a.valence) AS valence
		FROM liked_periods p LEFT JOIN audio a USING (track_id)
		GROUP BY 1 ORDER BY 1 DESC`).all() as { label: string; songs: number; bpm: number | null; energy: number | null; valence: number | null }[];
	const genres = db.prepare(`
		SELECT label, genre, count FROM (
			SELECT p.${period} AS label, g.genre, count(DISTINCT p.track_id) AS count,
				row_number() OVER (PARTITION BY p.${period} ORDER BY count(DISTINCT p.track_id) DESC, g.genre) AS rank
			FROM liked_periods p JOIN track_genres g USING (track_id) GROUP BY 1, 2
		) WHERE rank <= 3 ORDER BY count DESC`).all() as { label: string; genre: string; count: number }[];
	return rows.map((r) => ({ ...r, genres: genres.filter((g) => g.label === r.label) }));
}

// --- filtered song lists ---

export type Filter = {
	period?: string;
	genre?: string; // matches a genre or a whole family
	artist?: string;
	decade?: number;
	q?: string;
	bpmMin?: number;
	bpmMax?: number; // exclusive
	key?: string; // Camelot, e.g. '8A'
};

function where(f: Filter) {
	const clauses: string[] = [];
	const params: Record<string, string | number> = {};
	if (f.period) {
		clauses.push('(p.year = :period OR p.quarter = :period OR p.month = :period)');
		params.period = f.period;
	}
	if (f.genre) {
		clauses.push('EXISTS (SELECT 1 FROM track_genres g WHERE g.track_id = t.id AND (g.genre = :genre OR g.family = :genre))');
		params.genre = f.genre;
	}
	if (f.artist) {
		clauses.push('EXISTS (SELECT 1 FROM track_artists x WHERE x.track_id = t.id AND x.artist_id = :artist)');
		params.artist = f.artist;
	}
	if (f.decade !== undefined) {
		clauses.push('CAST(substr(t.release_date, 1, 4) AS INTEGER) / 10 * 10 = :decade');
		params.decade = f.decade;
	}
	if (f.q) {
		clauses.push(`(t.name LIKE :q OR t.album_name LIKE :q OR EXISTS (
			SELECT 1 FROM track_artists x JOIN artists a ON a.id = x.artist_id WHERE x.track_id = t.id AND a.name LIKE :q))`);
		params.q = `%${f.q}%`;
	}
	if (f.bpmMin !== undefined) {
		clauses.push('au.bpm >= :bpmMin');
		params.bpmMin = f.bpmMin;
	}
	if (f.bpmMax !== undefined) {
		clauses.push('au.bpm < :bpmMax');
		params.bpmMax = f.bpmMax;
	}
	if (f.key) {
		clauses.push('au.camelot = :key');
		params.key = f.key;
	}
	return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

const LIKED_FROM = 'FROM liked_periods p JOIN tracks t ON t.id = p.track_id LEFT JOIN audio au ON au.track_id = t.id';
const TOP_GENRE = '(SELECT g.genre FROM track_genres g WHERE g.track_id = t.id ORDER BY g.score DESC LIMIT 1) AS genre';
const ARTIST_NAMES = `(SELECT group_concat(a.name, ', ' ORDER BY x.position)
	FROM track_artists x JOIN artists a ON a.id = x.artist_id WHERE x.track_id = t.id) AS artists`;

export type Song = {
	id: string;
	name: string;
	album_name: string;
	album_image: string | null;
	release_date: string;
	added_at: string;
	artists: string;
	bpm: number | null;
	key: string | null;
	scale: string | null;
	camelot: string | null;
	genre: string | null;
};

export function songs(db: Db, f: Filter) {
	const w = where(f);
	return db.prepare(`
		SELECT t.id, t.name, t.album_name, t.album_image, t.release_date, p.added_at, ${ARTIST_NAMES},
			au.bpm, au.key, au.scale, au.camelot, ${TOP_GENRE}
		${LIKED_FROM} ${w.sql} ORDER BY p.added_at DESC`).all(w.params) as Song[];
}

/** Songs per genre (or per family) among the liked songs matching `f`. A song can have up to 3 genres. */
export function topGenres(db: Db, f: Filter = {}, limit = 25, level: 'genre' | 'family' = 'genre') {
	const w = where(f);
	const col = level === 'family' ? 'g.family' : 'g.genre';
	return db.prepare(`
		SELECT ${col} AS label, count(DISTINCT t.id) AS count
		${LIKED_FROM} JOIN track_genres g ON g.track_id = t.id
		${w.sql} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT ${Number(limit)}`).all(w.params) as { label: string; count: number }[];
}

export const artistName = (db: Db, id: string) =>
	(db.prepare('SELECT name FROM artists WHERE id = ?').get(id) as Row | undefined)?.name as string | undefined;

// --- local playlists ---

export type Playlist = {
	id: number;
	name: string;
	description: string;
	spotify_id: string | null;
	synced_at: string | null;
	updated_at: string;
	count: number;
};

const PLAYLIST_COLS = `p.*, (SELECT count(*) FROM playlist_tracks pt WHERE pt.playlist_id = p.id) AS count`;
const touch = (db: Db, id: number) =>
	db.prepare("UPDATE playlists SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = ?").run(id);

export const listPlaylists = (db: Db) =>
	db.prepare(`SELECT ${PLAYLIST_COLS} FROM playlists p ORDER BY p.updated_at DESC`).all() as Playlist[];

export const getPlaylist = (db: Db, id: number) =>
	db.prepare(`SELECT ${PLAYLIST_COLS} FROM playlists p WHERE p.id = ?`).get(id) as Playlist | undefined;

export function addTracks(db: Db, playlistId: number, trackIds: string[]) {
	tx(db, () => {
		const max = (db.prepare('SELECT coalesce(max(position), -1) AS m FROM playlist_tracks WHERE playlist_id = ?').get(playlistId) as Row).m as number;
		const add = db.prepare('INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position) VALUES (?, ?, ?)');
		trackIds.forEach((t, i) => add.run(playlistId, t, max + 1 + i));
		touch(db, playlistId);
	});
}

export function createPlaylist(db: Db, name: string, trackIds: string[]) {
	const id = Number(db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name).lastInsertRowid);
	addTracks(db, id, trackIds);
	return id;
}

export function removeTracks(db: Db, playlistId: number, trackIds: string[]) {
	tx(db, () => {
		const del = db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?');
		for (const t of trackIds) del.run(playlistId, t);
		touch(db, playlistId);
	});
}

export function updatePlaylist(db: Db, id: number, name: string, description: string) {
	db.prepare('UPDATE playlists SET name = ?, description = ? WHERE id = ?').run(name, description, id);
	touch(db, id);
}

export const deletePlaylist = (db: Db, id: number) => db.prepare('DELETE FROM playlists WHERE id = ?').run(id);

export function playlistSongs(db: Db, id: number) {
	return db.prepare(`
		SELECT t.id, t.name, t.uri, t.album_name, t.album_image, t.release_date, l.added_at, ${ARTIST_NAMES},
			au.bpm, au.key, au.scale, au.camelot, ${TOP_GENRE}
		FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id LEFT JOIN liked l ON l.track_id = t.id
		LEFT JOIN audio au ON au.track_id = t.id
		WHERE pt.playlist_id = ? ORDER BY pt.position`).all(id) as (Song & { uri: string })[];
}

export const setSpotifyId = (db: Db, id: number, spotifyId: string) =>
	db.prepare('UPDATE playlists SET spotify_id = ? WHERE id = ?').run(spotifyId, id);

// synced_at = updated_at so "changed since push" is just updated_at > synced_at
export const markSynced = (db: Db, id: number) => db.prepare('UPDATE playlists SET synced_at = updated_at WHERE id = ?').run(id);
