"""Self-check for the pure helpers in analyze.py (no Essentia or network needed): python3 analyze/test_analyze.py"""
from analyze import camelot, top_genres

assert camelot("C#", "major") == "3B"
assert camelot("Db", "major") == "3B"  # enharmonic spelling
assert camelot("A", "minor") == "8A"
assert camelot("G#", "minor") == "1A"
assert camelot("H", "major") is None

labels = ["Electronic---House", "Electronic---Deep House", "Rock---Indie Rock", "Hip Hop---Grime"]
assert top_genres([0.5, 0.3, 0.1, 0.05], labels) == [("Electronic", "House", 0.5), ("Electronic", "Deep House", 0.3)]
assert top_genres([0.05, 0.02, 0.01, 0.0], labels) == [("Electronic", "House", 0.05)]  # top one always kept
print("analyze helpers ok")
