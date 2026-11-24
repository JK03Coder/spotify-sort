import { db } from '#lib/server/db.ts';
import { likedBy, overview, PERIODS, releaseDecades, topArtists, topGenres, type Period } from '#lib/server/queries.ts';
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
		genres: topGenres(db),
		artists: topArtists(db),
		decades: releaseDecades(db)
	};
}

export const actions = {
	sync: () => startSync(),
	logout: () => logout()
};
