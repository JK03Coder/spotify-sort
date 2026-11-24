import { db } from '#lib/server/db.ts';
import { listPlaylists } from '#lib/server/queries.ts';

export function load() {
	return { playlists: listPlaylists(db) };
}
