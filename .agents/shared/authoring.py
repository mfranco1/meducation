"""Helpers shared by the write-quizzes (quiz_work.py) and write-flashcards (deck_work.py) scripts.

A change here changes both workflows: run both skills' tests and this folder's tests.

Usage: python3 -I .agents/shared/authoring.py find-sources TERM... [--ledger PATH]
prints the source ledger entries that contain every term, newest first.
"""

import argparse
import fcntl
import json
import os
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# One ledger of verified, summary-only, blocked and unconfirmed documents for every subject and both skills.
LEDGER = REPO / "var" / "source-ledger.json"
SEP = " › "
STATUS_RANK = {"verified": 3, "summary-only": 2, "unconfirmed": 1, "blocked": 0}
FIND_FULL, FIND_TITLES = 8, 40  # past FIND_FULL matches, list titles only


def load(path: Path):
    return json.loads(path.read_text("utf-8"))


def dump(path: Path, data) -> None:
    """Write via a temp file so a concurrent reader never sees a partial file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")
    os.replace(tmp, path)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def numbered(folder: Path, pattern: str) -> list[Path]:
    """Files like brief-<n>.json, sorted by n."""
    return sorted(folder.glob(pattern), key=lambda p: int(p.stem.rsplit("-", 1)[1]))


def page_text(root: Path, pages: str) -> str | None:
    """Pages "10-12, 15" of ROOT/src/main.txt, where page N is the Nth form-feed chunk."""
    source = root / "src" / "main.txt"
    if not pages or not source.exists():
        return None
    chunks = source.read_text("utf-8").split("\f")
    out = []
    for part in str(pages).split(","):
        first, _, last = part.strip().partition("-")
        for n in range(int(first), int(last or first) + 1):
            if 1 <= n <= len(chunks):
                out.append(f"=== page {n} ===\n{chunks[n - 1].strip()}")
    return "\n\n".join(out) + "\n"


def notes(*paths: Path) -> str:
    """The notes.md files that exist, joined, or "None."."""
    return "\n\n".join(p.read_text("utf-8").strip() for p in paths if p.exists()) or "None."


def render_prompt(template: Path, subs: dict[str, str], out: Path) -> None:
    """Replace each whole-word placeholder in TEMPLATE with its value, write OUT and print its path."""
    text = template.read_text("utf-8")
    # One pass over whole tokens, so substituted text is never scanned again.
    text = re.sub(r"\b(" + "|".join(subs) + r")\b", lambda m: subs[m[1]], text)
    out.write_text(text, "utf-8")
    print(out)


def find_sources(ledger: Path, terms: list[str]) -> None:
    """Print the ledger entries that contain every term, newest first."""
    terms = [t.lower() for t in terms]
    hits = [
        e
        for e in (load(ledger) if ledger.exists() else [])
        if all(t in json.dumps(e, ensure_ascii=False).lower() for t in terms)
    ]
    hits.sort(key=lambda e: str(e.get("year", "")), reverse=True)
    full = len(hits) <= FIND_FULL
    for e in hits[:FIND_TITLES]:
        print(f"{e['status']} {e.get('year', '')} {e['title']}")
        if full:
            print(f"  {e.get('url', '')}")
            print("".join(f"  - {f}\n" for f in e.get("facts", [])), end="")
    if not hits:
        print("No matching sources.")
    elif not full:
        print(f"{len(hits)} matches. Add a term from the title you need to see its URL and facts.")


def merge_ledger(ledger: Path, work: Path) -> None:
    """Fold every WORK/<topic>/sources-<n>.json into LEDGER, one entry per document URL (or title) and year."""
    ledger.parent.mkdir(parents=True, exist_ok=True)
    # Sessions for other subjects and the other skill share this ledger; hold the lock across read, merge and write.
    with open(ledger.with_name(ledger.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        index: dict[tuple[str, str], dict] = {}

        def fold(row: dict) -> bool:
            """Merge a row into the index; True when it is a new entry."""
            url = re.sub(r"^(https?://)?(www\.)?", "", row.get("url", "").strip().lower()).rstrip("/")
            k = (url or row["title"].strip().lower(), str(row.get("year", "")))
            entry = index.get(k)
            if entry is None:
                index[k] = {**row, "facts": list(row.get("facts", []))}
                return True
            if STATUS_RANK[row["status"]] > STATUS_RANK[entry["status"]]:
                entry["status"] = row["status"]
                entry["url"] = row.get("url", entry.get("url", ""))
            entry["facts"] += [f for f in row.get("facts", []) if f not in entry["facts"]]
            return False

        for row in load(ledger) if ledger.exists() else []:
            fold(row)
        added = 0
        for source in sorted(work.glob("*/sources-*.json")):
            for row in load(source):
                if row.get("status") not in STATUS_RANK:
                    sys.exit(f"{source}: {row['title']} has status {row.get('status')!r}.")
                added += fold(row)
        dump(ledger, sorted(index.values(), key=lambda e: e["title"].lower()))
    print(f"{len(index)} sources ({added} new) in {ledger}")


def clean_work(ledger: Path, work: Path, keep: set[str]) -> None:
    """Merge the ledger first so no source record is lost, then delete everything in WORK but KEEP."""
    merge_ledger(ledger, work)
    removed = 0
    for path in sorted(work.iterdir()):
        if path.name in keep:
            continue
        shutil.rmtree(path) if path.is_dir() else path.unlink()
        removed += 1
    print(f"Removed {removed} entries; kept {', '.join(sorted(keep))}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    find = sub.add_parser("find-sources", help=find_sources.__doc__)
    find.add_argument("terms", nargs="+", metavar="TERM")
    find.add_argument("--ledger", type=Path, default=LEDGER)
    args = parser.parse_args()
    find_sources(args.ledger, args.terms)


if __name__ == "__main__":
    main()
