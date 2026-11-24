import { db } from './db.ts';
import { api } from './spotify.ts';
import { artistsMissingGenres, saveArtist, saveLikes, type SavedTrack } from './queries.ts';

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

	// Get Several Artists was removed for dev-mode apps (Feb 2026), so it's one request per artist.
	// shortcut: genres are fetched once per artist and never refreshed; clear artists.fetched_at to refetch
	const ids = artistsMissingGenres(db);
	Object.assign(syncStatus, { phase: 'Fetching artist genres', done: 0, total: ids.length });
	let i = 0;
	await Promise.all(
		Array.from({ length: 4 }, async () => {
			while (i < ids.length) {
				saveArtist(db, await api(`/artists/${ids[i++]}`));
				syncStatus.done++;
			}
		})
	);
}
