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
			release_date TEXT, -- 'YYYY', 'YYYY-MM' or 'YYYY-MM-DD' depending on what Spotify knows
			isrc TEXT -- used to find the song's preview on Deezer
		);

		-- current liked songs; rebuilt on every sync, tracks stay so playlists keep working after an unlike
		CREATE TABLE IF NOT EXISTS liked (
			track_id TEXT PRIMARY KEY REFERENCES tracks(id),
			added_at TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS artists (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS track_artists (
			track_id TEXT NOT NULL REFERENCES tracks(id),
			artist_id TEXT NOT NULL REFERENCES artists(id),
			position INTEGER NOT NULL,
			PRIMARY KEY (track_id, artist_id)
		);

		-- Spotify no longer returns artist genres for dev-mode apps; genres now come per track from audio analysis
		DROP TABLE IF EXISTS artist_genres;

		-- written by analyze/analyze.py (Essentia on the Deezer preview + ReccoBeats features)
		CREATE TABLE IF NOT EXISTS audio (
			track_id TEXT PRIMARY KEY REFERENCES tracks(id),
			status TEXT NOT NULL, -- ok | no_match | no_preview | error: ...
			analyzed_at TEXT NOT NULL,
			deezer_id INTEGER,
			bpm REAL,
			key TEXT, -- e.g. 'C#'
			scale TEXT, -- major | minor
			camelot TEXT, -- e.g. '3B', for harmonic mixing
			energy REAL, -- 0..1, this and below from ReccoBeats when it knows the song
			valence REAL, -- 0..1, sad -> happy
			danceability REAL,
			acousticness REAL,
			instrumentalness REAL
		);

		-- top Discogs styles predicted from the audio, e.g. family 'Electronic', genre 'Deep House'
		CREATE TABLE IF NOT EXISTS track_genres (
			track_id TEXT NOT NULL REFERENCES tracks(id),
			family TEXT NOT NULL,
			genre TEXT NOT NULL,
			score REAL NOT NULL,
			PRIMARY KEY (track_id, family, genre)
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

		-- genres you set by hand; they win over the analyzed ones and survive re-running the analyzer
		CREATE TABLE IF NOT EXISTS genre_overrides (
			track_id TEXT PRIMARY KEY REFERENCES tracks(id),
			family TEXT NOT NULL,
			genre TEXT NOT NULL
		);

		-- "this song is not <genre>": hides an analyzed genre (or a whole family) so the next-best one shows
		CREATE TABLE IF NOT EXISTS genre_rejections (
			track_id TEXT NOT NULL REFERENCES tracks(id),
			genre TEXT NOT NULL, -- a genre or a family name
			PRIMARY KEY (track_id, genre)
		);

		-- genres that are about where the artist is from rather than the sound; the audio model can't hear that,
		-- so they only stick when one of the song's artists is from there (artists.country, see analyze/artists.py)
		CREATE TABLE IF NOT EXISTS genre_regions (genre TEXT NOT NULL, country TEXT NOT NULL, PRIMARY KEY (genre, country));
		INSERT OR IGNORE INTO genre_regions (genre, country) VALUES
			('K-pop', 'KR'), ('J-pop', 'JP'), ('City Pop', 'JP'), ('Kayōkyoku', 'JP'), ('Enka', 'JP'),
			('Mandopop', 'CN'), ('Mandopop', 'TW'), ('Cantopop', 'HK'), ('Bollywood', 'IN'),
			('Laïkó', 'GR'), ('Éntekhno', 'GR'), ('Disco Polo', 'PL'), ('Fado', 'PT'), ('Canzone Napoletana', 'IT'),
			('Chanson', 'FR'), ('Yé-Yé', 'FR'), ('Schlager', 'DE'), ('Schlager', 'AT'), ('Schlager', 'CH'),
			('Volksmusik', 'DE'), ('Volksmusik', 'AT'), ('Volksmusik', 'CH');

		-- shortcut: periods use the UTC added_at, so a like near midnight on a month edge can land in the neighbour month
		CREATE VIEW IF NOT EXISTS liked_periods AS
		SELECT track_id, added_at,
			substr(added_at, 1, 4) AS year,
			substr(added_at, 1, 4) || '-Q' || ((CAST(substr(added_at, 6, 2) AS INTEGER) + 2) / 3) AS quarter,
			substr(added_at, 1, 7) AS month
		FROM liked;
	`);
	// databases created before the isrc column existed
	if (!db.prepare("SELECT 1 FROM pragma_table_info('tracks') WHERE name = 'isrc'").get()) {
		db.exec('ALTER TABLE tracks ADD COLUMN isrc TEXT');
	}
	// artist country from MusicBrainz (ISO code), written by analyze/artists.py
	if (!db.prepare("SELECT 1 FROM pragma_table_info('artists') WHERE name = 'country'").get()) {
		db.exec('ALTER TABLE artists ADD COLUMN country TEXT; ALTER TABLE artists ADD COLUMN country_checked_at TEXT');
	}
	db.exec(`
		-- what the app reads: the manual genre when there is one, else the analyzed ones minus ruled-out ones
		DROP VIEW IF EXISTS song_genres;
		CREATE VIEW song_genres AS
		SELECT track_id, family, genre, 1.0 AS score, 1 AS manual FROM genre_overrides
		UNION ALL
		SELECT g.track_id, g.family, g.genre, g.score, 0 AS manual FROM track_genres g
		WHERE g.track_id NOT IN (SELECT track_id FROM genre_overrides)
			AND NOT EXISTS (SELECT 1 FROM genre_rejections r WHERE r.track_id = g.track_id AND r.genre IN (g.genre, g.family))
			-- regional genre, artist countries known, and none of them from that region
			AND NOT (
				g.genre IN (SELECT genre FROM genre_regions)
				AND EXISTS (SELECT 1 FROM track_artists x JOIN artists a ON a.id = x.artist_id WHERE x.track_id = g.track_id AND a.country IS NOT NULL)
				AND NOT EXISTS (
					SELECT 1 FROM track_artists x JOIN artists a ON a.id = x.artist_id
					JOIN genre_regions gr ON gr.genre = g.genre AND gr.country = a.country
					WHERE x.track_id = g.track_id
				)
			);
	`);
	return db;
}

export type Db = DatabaseSync;
