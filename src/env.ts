import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	SPOTIFY_CLIENT_ID: {
		description: 'Client ID of your Spotify app (developer.spotify.com/dashboard)',
		schema: (value) => {
			if (!value) throw new Error('SPOTIFY_CLIENT_ID is not set: copy .env.example to .env and fill it in (see README)');
			return value;
		}
	},
	SPOTIFY_REDIRECT_URI: {
		description: 'Must exactly match a Redirect URI in your Spotify app settings',
		schema: (value) => value || 'http://127.0.0.1:5173/callback'
	},
	DB_PATH: {
		description: 'Path to the local SQLite database',
		schema: (value) => value || 'data/spotify-sort.db'
	}
});
