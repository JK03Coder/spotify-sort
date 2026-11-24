# spotify-sort

Pull your Spotify liked songs into a local SQLite database, see when you liked what (by year, quarter or month), which genres and decades they fall into, build playlists from any slice locally, then push the ones you want to your Spotify account.

Everything runs on your machine. Your data stays in `data/` (git-ignored).

## Setup

You need Node 24+ and a Spotify **Premium** account (Spotify requires Premium for developer apps).

1. Create an app at <https://developer.spotify.com/dashboard>
   - Redirect URI: `http://127.0.0.1:5173/callback` (Spotify rejects `localhost`, use the IP)
   - APIs used: Web API
2. Copy the env file and paste your app's **Client ID** (no client secret needed, login uses PKCE):
   ```sh
   cp .env.example .env
   ```
3. Install and run:
   ```sh
   npm install
   npm run dev
   ```
4. Open <http://127.0.0.1:5173>, log in, hit **Sync liked songs**.

The first sync fetches every artist one by one for genres (Spotify removed the batch endpoint for dev apps), so it can take a few minutes on a big library. Later syncs only fetch new artists.

## How it works

- **Stats**: liked songs per year / quarter / month, top genres, top artists, release decades. Click any bar to see those songs.
- **Songs**: filter by period (`2023`, `2023-Q3`, `2023-07`), genre, artist, decade or text, then turn the selection into a new playlist or add it to an existing one.
- **Playlists**: local until you press **Push to Spotify** (created as private). Pushing again overwrites the Spotify copy with the local list.

Genres come from artists, not songs, and Spotify leaves many smaller artists without genres.

## Limits

Spotify dev-mode apps allow up to 5 users per Client ID, which is why everyone runs their own app instead of a shared hosted one.

## Development

```sh
npm test       # query tests (in-memory SQLite)
npm run check  # types
```
