# spotify-sort

Pull your Spotify liked songs into a local SQLite database, see when you liked what (by year, quarter or month), which genres and decades they fall into, build playlists from any slice locally, then push the ones you want to your Spotify account.

Everything runs on your machine. Your data stays in `data/` (git-ignored).

## Setup

You need Node 24+, a Spotify **Premium** account (Spotify requires Premium for developer apps), and [uv](https://docs.astral.sh/uv/) plus ffmpeg for the optional audio analysis.

1. Create an app at <https://developer.spotify.com/dashboard>
   - Redirect URI: `http://127.0.0.1:5173/callback` (Spotify rejects `localhost`, use the IP)
   - APIs used: Web API
2. Copy the env file and paste your app's **Client ID** (no client secret needed, login uses PKCE):
   ```sh
   cp .env.example .env
   ```
   Optionally also set `SPOTIFY_CLIENT_SECRET` to use Spotify's client-secret login instead. It is only read on the server and `.env` is git-ignored, but never commit it.
3. Install and run:
   ```sh
   npm install
   npm run dev
   ```
4. Open <http://127.0.0.1:5173>, log in, hit **Sync liked songs**.

5. Analyze the audio for genre, BPM and key (optional, runs locally, about 1 to 2 s per song, resumable):
   ```sh
   npm run analyze
   ```

## Where the data comes from

Spotify no longer gives dev apps genres, popularity or audio features, so:

| Data | Source |
|---|---|
| Liked songs, liked date, release date, artists | Spotify Web API |
| BPM, key (+ Camelot), genre per song | [Essentia](https://essentia.upf.edu) running locally on the song's 30 s Deezer preview, matched by ISRC. Genres are the [Discogs 400 styles](https://essentia.upf.edu/models.html#discogs-effnet) predicted from the audio |
| Energy, mood (valence), danceability | [ReccoBeats](https://reccobeats.com), when it knows the song |

Analysis sends song IDs / ISRCs / titles to Deezer and ReccoBeats, nothing about your account. Clips are deleted right after analysis. Genre guesses come from 30 seconds of audio, so expect some misses. BPM can be off by double or half.

## How it works

- **Stats**: liked songs per year / quarter / month, top genres, top artists, release decades. Click any bar to see those songs.
- **Songs**: filter by period (`2023`, `2023-Q3`, `2023-07`), genre, artist, decade or text, then turn the selection into a new playlist or add it to an existing one.
- **Playlists**: local until you press **Push to Spotify** (created as private). Pushing again overwrites the Spotify copy with the local list.

Genres come from artists, not songs, and Spotify leaves many smaller artists without genres.

## Licenses

Essentia is AGPL-3.0 and its models are CC BY-NC-SA 4.0 (non-commercial). They are downloaded at run time by `analyze/analyze.py`, not bundled.

## Limits

Spotify dev-mode apps allow up to 5 users per Client ID, which is why everyone runs their own app instead of a shared hosted one.

## Development

```sh
npm test       # query tests (in-memory SQLite) + analyze helper self-check
npm run check  # types
```
