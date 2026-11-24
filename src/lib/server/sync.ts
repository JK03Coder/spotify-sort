import { db } from './db.ts';
import { api } from './spotify.ts';
import { saveLikes, type SavedTrack } from './queries.ts';

// shortcut: lives in server memory, so a dev-server restart forgets progress (the data already saved stays)
export const syncStatus = { running: false, phase: '', done: 0, total: 0, error: '', finishedAt: '' };

export function startSync() {
	if (syncStatus.running) return;
	Object.assign(syncStatus, { running: true, phase: 'Loading liked songs', done: 0, total: 0, error: '' });
	run()
		.catch((e) => (syncStatus.error = e?.body?.message ?? e?.message ?? String(e)))
		.finally(() => Object.assign(syncStatus, { running: false, finishedAt: new Date().toISOString() }));
}

async function run() {
	const items: SavedTrack[] = [];
	let next: string | null = '/me/tracks?limit=50';
	while (next) {
		const page: { items: SavedTrack[]; total: number; next: string | null } = await api(next);
		items.push(...page.items);
		Object.assign(syncStatus, { done: items.length, total: page.total });
		next = page.next;
	}
	saveLikes(db, items);
}
