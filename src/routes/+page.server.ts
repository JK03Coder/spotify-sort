import { db } from '#lib/server/db.ts';
import { bpmBuckets, keys, likedBy, overview, PERIODS, releaseDecades, tasteOverTime, topArtists, topGenres, type Period } from '#lib/server/queries.ts';
import { logout } from '#lib/server/spotify.ts';
import { startSync, syncStatus } from '#lib/server/sync.ts';

export function load({ url }) {
	const param = url.searchParams.get('by') as Period;
	const by = PERIODS.includes(param) ? param : 'quarter';
	return {
		by,
		sync: { ...syncStatus },
		overview: overview(db),
		liked: likedBy(db, by),
		families: topGenres(db, {}, 25, 'family'),
		genres: topGenres(db, {}, 40),
		artists: topArtists(db),
		decades: releaseDecades(db),
		bpm: bpmBuckets(db),
		keys: keys(db),
		taste: tasteOverTime(db, by)
	};
}

export const actions = {
	sync: () => startSync(),
	logout: () => logout()
};
