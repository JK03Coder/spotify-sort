import { db } from '#lib/server/db.ts';
import { kvGet } from '#lib/server/queries.ts';

export function load() {
	return { user: kvGet(db, 'user') ?? null };
}
