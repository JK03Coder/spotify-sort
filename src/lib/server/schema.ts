import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDb(path: string) {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA foreign_keys = ON;

		CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);

		CREATE TABLE IF NOT EXISTS tracks (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			uri TEXT NOT NULL,
			duration_ms INTEGER,
			album_name TEXT,
			album_image TEXT,
			release_date TEXT -- 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' depending on what Spotify knows
		);

		-- current liked songs; rebuilt on every sync, tracks stay so playlists keep working after an unlike
		CREATE TABLE IF NOT EXISTS liked (
			track_id TEXT PRIMARY KEY REFERENCES tracks(id),
			added_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS artists (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			image TEXT,
			fetched_at TEXT -- null until genres were fetched
		);

		CREATE TABLE IF NOT EXISTS track_artists (
			track_id TEXT NOT NULL REFERENCES tracks(id),
			artist_id TEXT NOT NULL REFERENCES artists(id),
			position INTEGER NOT NULL,
			PRIMARY KEY (track_id, artist_id)
		);

		CREATE TABLE IF NOT EXISTS artist_genres (
			artist_id TEXT NOT NULL REFERENCES artists(id),
			genre TEXT NOT NULL,
			PRIMARY KEY (artist_id, genre)
		);

		CREATE TABLE IF NOT EXISTS playlists (
			id INTEGER PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			spotify_id TEXT,
			synced_at TEXT,
			updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
			created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
		);

		CREATE TABLE IF NOT EXISTS playlist_tracks (
			playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
			track_id TEXT NOT NULL REFERENCES tracks(id),
			position INTEGER NOT NULL,
			PRIMARY KEY (playlist_id, track_id)
		);

		-- shortcut: periods use the UTC added_at, so a like near midnight on a month edge can land in the neighbour month
		CREATE VIEW IF NOT EXISTS liked_periods AS
		SELECT track_id, added_at,
			substr(added_at, 1, 4) AS year,
			substr(added_at, 1, 4) || '-Q' || ((CAST(substr(added_at, 6, 2) AS INTEGER) + 2) / 3) AS quarter,
			substr(added_at, 1, 7) AS month
		FROM liked;
	`);
	return db;
}

export type Db = DatabaseSync;
