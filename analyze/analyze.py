# /// script
# requires-python = "==3.12.*"
# dependencies = ["essentia-tensorflow==2.1b6.dev1389", "numpy==2.5.5"]
# ///
"""Analyze your synced songs locally.

For each song not analyzed yet: find it on Deezer (by ISRC, else by artist + title), download the
30 second preview to a temp file, run Essentia for BPM, key and genre (Discogs styles predicted from
the audio), then delete the clip. Energy / mood / danceability come from ReccoBeats when it knows the
song. Results go into the app's SQLite database. Safe to stop and re-run: it resumes where it left off.

    npm run analyze                 # everything not analyzed yet
    npm run analyze -- --limit 20   # try a few first
    npm run analyze -- --retry      # also retry songs that had no match / no preview / errors
"""

import argparse
import json
import os
import sqlite3
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "analyze" / "models"
MODELS = {  # file -> path under https://essentia.upf.edu/models/ (CC BY-NC-SA 4.0)
    "discogs-effnet-bs64-1.pb": "feature-extractors/discogs-effnet/discogs-effnet-bs64-1.pb",
    "genre_discogs400-discogs-effnet-1.pb": "classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.pb",
    "genre_discogs400-discogs-effnet-1.json": "classification-heads/genre_discogs400/genre_discogs400-discogs-effnet-1.json",
}
UA = {"User-Agent": "spotify-sort (local music library analysis)"}

CAMELOT = {
    ("B", "major"): "1B", ("F#", "major"): "2B", ("C#", "major"): "3B", ("Ab", "major"): "4B",
    ("Eb", "major"): "5B", ("Bb", "major"): "6B", ("F", "major"): "7B", ("C", "major"): "8B",
    ("G", "major"): "9B", ("D", "major"): "10B", ("A", "major"): "11B", ("E", "major"): "12B",
    ("Ab", "minor"): "1A", ("Eb", "minor"): "2A", ("Bb", "minor"): "3A", ("F", "minor"): "4A",
    ("C", "minor"): "5A", ("G", "minor"): "6A", ("D", "minor"): "7A", ("A", "minor"): "8A",
    ("E", "minor"): "9A", ("B", "minor"): "10A", ("F#", "minor"): "11A", ("C#", "minor"): "12A",
}
# Essentia mixes sharps and flats; normalise to the spelling used in CAMELOT
ENHARMONIC = {"Db": "C#", "D#": "Eb", "Gb": "F#", "G#": "Ab", "A#": "Bb"}


def camelot(key: str, scale: str) -> str | None:
    return CAMELOT.get((ENHARMONIC.get(key, key), scale))


def top_genres(scores, labels, min_score=0.15, max_n=3):
    """Best genres as (family, genre, score); always keeps the top one. Labels look like 'Electronic---Deep House'."""
    ranked = sorted(zip(scores, labels), reverse=True)[:max_n]
    picked = [r for i, r in enumerate(ranked) if i == 0 or r[0] >= min_score]
    return [(*label.split("---", 1), float(score)) for score, label in picked]


def get_json(url: str):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500:
                time.sleep(2 ** attempt)
                continue
            raise
        if isinstance(data, dict) and isinstance(data.get("error"), dict) and data["error"].get("code") == 4:
            time.sleep(5)  # Deezer quota (50 requests / 5 s)
            continue
        return data
    raise RuntimeError(f"gave up after retries: {url}")


def download_models():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for name, path in MODELS.items():
        target = MODELS_DIR / name
        if not target.exists():
            print(f"downloading model {name}…")
            tmp = target.with_suffix(".part")
            urllib.request.urlretrieve(f"https://essentia.upf.edu/models/{path}", tmp)
            tmp.rename(target)


def reccobeats(ids: list[str]) -> dict[str, dict]:
    """Spotify-style audio features (and ISRC) keyed by Spotify track id. Unknown songs are simply missing."""
    out = {}
    for i in range(0, len(ids), 40):  # API max is 40 ids per request
        try:
            data = get_json("https://api.reccobeats.com/v1/audio-features?ids=" + ",".join(ids[i : i + 40]))
        except Exception as e:
            print(f"ReccoBeats failed, continuing without it: {e}", file=sys.stderr)
            return out
        for f in data.get("content", []):
            out[f["href"].rsplit("/", 1)[-1]] = f
    return out


def find_preview(isrc: str | None, artist: str, title: str):
    """Returns (deezer_id, preview_url) or (None, None)."""
    if isrc:
        d = get_json(f"https://api.deezer.com/track/isrc:{urllib.parse.quote(isrc)}")
        if "id" in d:
            return d["id"], d.get("preview") or None
    q = urllib.parse.quote(f"{artist} {title}")
    for d in get_json(f"https://api.deezer.com/search/track?q={q}&limit=5").get("data", []):
        # shortcut: requires the same main artist name; misses songs Deezer credits differently
        if d["artist"]["name"].casefold() == artist.casefold():
            return d["id"], d.get("preview") or None
    return None, None


def fetch(track, tmpdir):
    """Network part, run in threads: returns (track, deezer_id, clip_path, status)."""
    try:
        deezer_id, url = find_preview(track["isrc"], track["artist"] or "", track["name"])
        if not deezer_id:
            return track, None, None, "no_match"
        if not url:
            return track, deezer_id, None, "no_preview"
        path = os.path.join(tmpdir, f"{track['id']}.mp3")
        urllib.request.urlretrieve(url, path)
        return track, deezer_id, path, "ok"
    except Exception as e:
        return track, None, None, f"error: {e}"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--db", default=os.environ.get("DB_PATH") or str(ROOT / "data" / "spotify-sort.db"))
    ap.add_argument("--limit", type=int, help="only analyze this many songs")
    ap.add_argument("--retry", action="store_true", help="retry songs that previously failed or had no preview")
    args = ap.parse_args()

    if not Path(args.db).exists():
        sys.exit(f"No database at {args.db}. Start the app, log in and sync first.")
    db = sqlite3.connect(args.db, timeout=30)
    db.row_factory = sqlite3.Row
    if not db.execute("SELECT 1 FROM sqlite_master WHERE name = 'audio'").fetchone():
        sys.exit("Database is missing the audio table. Start the app once (npm run dev) so it can upgrade the database.")

    redo = "" if not args.retry else " OR a.status != 'ok'"
    tracks = db.execute(f"""
        SELECT t.id, t.name, t.isrc,
            (SELECT ar.name FROM track_artists x JOIN artists ar ON ar.id = x.artist_id WHERE x.track_id = t.id ORDER BY x.position LIMIT 1) AS artist
        FROM tracks t LEFT JOIN audio a ON a.track_id = t.id
        WHERE a.track_id IS NULL{redo}
        ORDER BY (SELECT added_at FROM liked l WHERE l.track_id = t.id) DESC
        {f'LIMIT {int(args.limit)}' if args.limit else ''}""").fetchall()
    if not tracks:
        print("Everything is analyzed already. Use --retry to retry failed songs.")
        return
    tracks = [dict(t) for t in tracks]

    print(f"{len(tracks)} songs to analyze")
    download_models()

    print("fetching ReccoBeats features…")
    rb = reccobeats([t["id"] for t in tracks])
    print(f"ReccoBeats knows {len(rb)} of {len(tracks)}")
    for t in tracks:
        if not t["isrc"] and t["id"] in rb and rb[t["id"]].get("isrc"):
            t["isrc"] = rb[t["id"]]["isrc"]
            db.execute("UPDATE tracks SET isrc = ? WHERE id = ?", (t["isrc"], t["id"]))
    db.commit()

    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
    import essentia
    import essentia.standard as es

    essentia.log.infoActive = False
    essentia.log.warningActive = False
    labels = json.loads((MODELS_DIR / "genre_discogs400-discogs-effnet-1.json").read_text())["classes"]
    embedder = es.TensorflowPredictEffnetDiscogs(graphFilename=str(MODELS_DIR / "discogs-effnet-bs64-1.pb"), output="PartitionedCall:1")
    classifier = es.TensorflowPredict2D(
        graphFilename=str(MODELS_DIR / "genre_discogs400-discogs-effnet-1.pb"),
        input="serving_default_model_Placeholder",
        output="PartitionedCall:0",
    )
    rhythm = es.RhythmExtractor2013(method="multifeature")
    key_extractor = es.KeyExtractor(profileType="edma")  # profile tuned for electronic music, agreed with others in tests

    counts: dict[str, int] = {}
    started = time.time()
    def fetched(pool, tmpdir):
        # keep 8 downloads in flight: analysis never waits on one slow download, and clips can't pile up
        todo = iter(tracks)
        in_flight = deque(pool.submit(fetch, t, tmpdir) for t in [t for _, t in zip(range(8), todo)])
        while in_flight:
            result = in_flight.popleft().result()
            if (t := next(todo, None)) is not None:
                in_flight.append(pool.submit(fetch, t, tmpdir))
            yield result

    with tempfile.TemporaryDirectory(prefix="spotify-sort-") as tmpdir, ThreadPoolExecutor(4) as pool:
        for i, (t, deezer_id, path, status) in enumerate(fetched(pool, tmpdir), 1):
            bpm = key = scale = None
            genres = []
            if path:
                try:
                    audio = es.MonoLoader(filename=path, sampleRate=44100)()
                    bpm = float(rhythm(audio)[0])
                    key, scale, _ = key_extractor(audio)
                    audio16 = es.MonoLoader(filename=path, sampleRate=16000, resampleQuality=4)()
                    genres = top_genres(classifier(embedder(audio16)).mean(0), labels)
                except Exception as e:
                    status = f"error: {e}"
                finally:
                    os.remove(path)

            f = rb.get(t["id"], {})
            db.execute("DELETE FROM track_genres WHERE track_id = ?", (t["id"],))
            db.executemany(
                "INSERT INTO track_genres (track_id, family, genre, score) VALUES (?, ?, ?, ?)",
                [(t["id"], fam, gen, sc) for fam, gen, sc in genres],
            )
            db.execute(
                """INSERT OR REPLACE INTO audio (track_id, status, analyzed_at, deezer_id, bpm, key, scale, camelot,
                    energy, valence, danceability, acousticness, instrumentalness)
                VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (t["id"], status, deezer_id, bpm, key, scale, key and camelot(key, scale),
                 f.get("energy"), f.get("valence"), f.get("danceability"), f.get("acousticness"), f.get("instrumentalness")),
            )
            db.commit()  # per song, so stopping midway loses nothing

            kind = status.split(":")[0]
            counts[kind] = counts.get(kind, 0) + 1
            if i % 25 == 0 or i == len(tracks):
                rate = i / (time.time() - started)
                eta = (len(tracks) - i) / rate / 60
                print(f"{i}/{len(tracks)}  {counts}  ~{eta:.0f} min left", flush=True)
            if kind == "error":
                print(f"  {t['name']}: {status}", file=sys.stderr)


if __name__ == "__main__":
    main()
