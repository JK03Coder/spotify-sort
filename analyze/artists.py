"""Look up where artists are from on MusicBrainz.

The audio model can't hear where a song is from, so it calls plenty of Western pop "K-pop". Genres like
K-pop and J-pop (the genre_regions table) only stick to a song once one of its artists is from that country.
This checks the artists of songs that got such a genre and haven't been checked yet. MusicBrainz allows
about one request per second, so the first run takes a few minutes. Runs at the end of npm run analyze too.

    npm run artists              # check new artists
    npm run artists -- --recheck # check every artist again
"""

import argparse
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse

from analyze import ROOT, get_json

MB = "https://musicbrainz.org/ws/2"
_last_request = 0.0


def mb(path: str):
    """GET from MusicBrainz at most once a second (their rate limit). None when not found."""
    global _last_request
    time.sleep(max(0.0, _last_request + 1.1 - time.time()))
    _last_request = time.time()
    try:
        return get_json(f"{MB}/{path}{'&' if '?' in path else '?'}fmt=json")
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise


def country_of(artist: dict) -> str | None:
    """ISO country code of a MusicBrainz artist: its country, else its area when that is a country."""
    codes = (artist.get("area") or {}).get("iso-3166-1-codes") or []
    return artist.get("country") or (codes[0] if codes else None)


def pick_by_name(hits: list[dict], name: str) -> str | None:
    """Country from name-search hits, only when every exact-name match agrees (two bands can share a name)."""
    countries = {country_of(h) for h in hits if h["name"].casefold() == name.casefold() and h.get("score", 0) >= 90}
    return countries.pop() if len(countries) == 1 else None


def lookup(spotify_id: str, name: str) -> str | None:
    # most popular artists have their Spotify link on MusicBrainz, which makes the match exact
    url = urllib.parse.quote(f"https://open.spotify.com/artist/{spotify_id}", safe="")
    linked = [r["artist"] for r in (mb(f"url?resource={url}&inc=artist-rels") or {}).get("relations", []) if r.get("artist")]
    if linked:
        return country_of(linked[0]) or country_of(mb(f"artist/{linked[0]['id']}") or {})
    query = urllib.parse.quote(f'artist:"{name}"')
    return pick_by_name((mb(f"artist?query={query}&limit=5") or {}).get("artists", []), name)


def update_countries(db: sqlite3.Connection, recheck=False):
    artists = db.execute(f"""
        SELECT DISTINCT a.id, a.name FROM artists a
        JOIN track_artists x ON x.artist_id = a.id
        JOIN track_genres g ON g.track_id = x.track_id
        WHERE g.genre IN (SELECT genre FROM genre_regions){'' if recheck else ' AND a.country_checked_at IS NULL'}
        ORDER BY a.name""").fetchall()
    if not artists:
        print("Artist countries are up to date.")
        return
    print(f"looking up {len(artists)} artists on MusicBrainz (~{len(artists) * 1.5 / 60:.0f} min)…")
    found = 0
    for i, (artist_id, name) in enumerate(artists, 1):
        try:
            country = lookup(artist_id, name)
        except Exception as e:  # network trouble: leave unchecked so the next run retries
            print(f"  {name}: {e}", file=sys.stderr)
            continue
        found += country is not None
        db.execute(
            "UPDATE artists SET country = ?, country_checked_at = strftime('%Y-%m-%dT%H:%M:%fZ') WHERE id = ?",
            (country, artist_id),
        )
        db.commit()
        if i % 25 == 0 or i == len(artists):
            print(f"{i}/{len(artists)}  {found} with a country", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.environ.get("DB_PATH") or str(ROOT / "data" / "spotify-sort.db"))
    ap.add_argument("--recheck", action="store_true", help="look up artists that were checked before too")
    args = ap.parse_args()
    db = sqlite3.connect(args.db, timeout=30)
    if not db.execute("SELECT 1 FROM pragma_table_info('artists') WHERE name = 'country'").fetchone():
        sys.exit("Database is missing artists.country. Start the app once (npm run dev) so it can upgrade the database.")
    update_countries(db, args.recheck)


if __name__ == "__main__":
    main()
