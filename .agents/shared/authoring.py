"""Helpers shared by the write-quizzes (quiz_work.py) and write-flashcards (deck_work.py) scripts.

A change here changes both workflows: run both skills' tests and this folder's tests.

Usage:
  python3 -I .agents/shared/authoring.py find-sources TERM... [--ledger PATH]
    prints the source ledger entries that contain every term, newest first, with any saved copy,
    and the files in sources/manual/ whose name contains any term.
  python3 -I .agents/shared/authoring.py save-source URL [--from URL_OR_FILE] [--ledger PATH]
    saves the document's text in sources/ next to the ledger and prints the path.
"""

import argparse
import datetime
import fcntl
import hashlib
import html
import html.parser
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# One ledger of verified, summary-only, blocked and unconfirmed documents for every subject and both skills.
LEDGER = REPO / "var" / "source-ledger.json"
SEP = " › "
STATUS_RANK = {"verified": 3, "summary-only": 2, "unconfirmed": 1, "blocked": 0}
FIND_FULL, FIND_TITLES = 8, 40  # past FIND_FULL matches, list titles only
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
MIN_TEXT = 1000  # shorter text is a block, challenge or error page, not the document


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


def url_key(url: str) -> str:
    """A URL without scheme, www, trailing slash or case, so citations of one page match."""
    return re.sub(r"^(https?://)?(www\.)?", "", url.strip().lower()).rstrip("/")


# Reference sites, summaries, narrative reviews and case reports are never cited (content-standards.md, Citations), so the ledger drops them.
NON_CITABLE = re.compile(
    r"\b(MSD Manual|Merck Manual|StatPearls|UpToDate|Medscape|Wikipedia|Radiopaedia|DermNet|EyeWiki|Amboss|Cureus"
    r"|Am Fam Physician|case reports?|narrative review|state of the art)\b"
    r"|//(www\.)?(\w+\.)?(msdmanuals|merckmanuals|statpearls|uptodate|medscape|wikipedia|radiopaedia|dermnetnz|eyewiki"
    r"|amboss|cureus|aafp|emdocs|guidelinecentral|obgproject|mdcalc|drugs|medlineplus)\.",
    re.I,
)


def saved_copy(ledger: Path, url: str) -> Path:
    """Where save-source keeps the text of the document at URL."""
    return ledger.with_name("sources") / f"{hashlib.sha256(url_key(url).encode()).hexdigest()[:16]}.txt"


class _Text(html.parser.HTMLParser):
    """Visible text of an HTML or XML page."""

    SKIP = frozenset({"script", "style", "noscript", "svg", "head"})

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        self.skip += tag in self.SKIP
        self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def document_text(raw: bytes, folder: Path) -> str:
    """Text of a downloaded PDF, HTML/XML page or plain-text response."""
    if raw.lstrip().startswith(b"%PDF"):
        pdf = folder / "document.pdf"
        pdf.write_bytes(raw)
        return subprocess.run(["pdftotext", "-layout", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    text = raw.decode("utf-8", errors="replace")
    if text.lstrip().startswith("<"):
        parser = _Text()
        parser.feed(text)
        text = html.unescape("".join(parser.parts))
    return re.sub(r"\n\s*\n+", "\n\n", re.sub(r"[ \t]+", " ", text)).strip() + "\n"


def save_source(ledger: Path, url: str, source: str | None) -> None:
    """Save the text of the document cited as URL, downloaded from URL or SOURCE (a URL or a saved file)."""
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        if source and Path(source).is_file():
            raw = Path(source).read_bytes()
        else:
            out = folder / "download"
            cmd = ["curl", "-sSfL", "--compressed", "--max-time", "180", "-A", BROWSER_UA, "-o", str(out), source or url]
            if (done := subprocess.run(cmd, capture_output=True, text=True, check=False)).returncode:
                sys.exit(f"Download failed: {done.stderr.strip()}. Try a route in fetch-access.md.")
            raw = out.read_bytes()
        text = document_text(raw, folder)
    if len(text) < MIN_TEXT:
        sys.exit(f"Only {len(text)} characters of text, likely a block or challenge page; not saved:\n{text[:300]}")
    path = saved_copy(ledger, url)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(text, "utf-8")
    os.replace(tmp, path)  # a concurrent reader never sees a partial file
    print(f"{path} ({len(text)} characters)")


def find_sources(ledger: Path, terms: list[str]) -> None:
    """Print the ledger entries that contain every term, newest first."""
    terms = [t.lower() for t in terms]
    hits = [
        e
        for e in (load(ledger) if ledger.exists() else [])
        if all(t in json.dumps(e, ensure_ascii=False).lower() for t in terms)
    ]
    hits.sort(key=lambda e: str(e.get("year", "")), reverse=True)
    # Copies the user downloaded because the publisher refuses fetches; filenames are hyphenated.
    manual = ledger.with_name("sources") / "manual"
    for copy in sorted(manual.iterdir()) if manual.is_dir() else []:
        if any(t.replace(" ", "-") in copy.name.lower() for t in terms):
            print(f"manual copy: {copy.relative_to(REPO) if copy.is_relative_to(REPO) else copy}")
    full = len(hits) <= FIND_FULL
    for e in hits[:FIND_TITLES]:
        print(f"{e['status']} {e.get('year', '')} {e['title']}")
        if full:
            print(f"  {e.get('url', '')}")
            if e.get("url") and (copy := saved_copy(ledger, e["url"])).exists():
                saved = datetime.datetime.fromtimestamp(copy.stat().st_mtime, datetime.UTC).date()
                print(f"  saved {saved}: {copy.relative_to(REPO) if copy.is_relative_to(REPO) else copy}")
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
            if NON_CITABLE.search(f"{row['title']} {row.get('url', '')}"):
                return False
            url = url_key(row.get("url", ""))
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
    print(f"Removed {removed} entries" + (f"; kept {', '.join(sorted(keep))}" if keep else ""))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    find = sub.add_parser("find-sources", help=find_sources.__doc__)
    find.add_argument("terms", nargs="+", metavar="TERM")
    find.add_argument("--ledger", type=Path, default=LEDGER)
    save = sub.add_parser("save-source", help=save_source.__doc__)
    save.add_argument("url", metavar="URL", help="the document's own URL, as cited in sources files")
    save.add_argument("--from", dest="source", metavar="URL_OR_FILE", help="another route to the same document")
    save.add_argument("--ledger", type=Path, default=LEDGER)
    args = parser.parse_args()
    if args.command == "find-sources":
        find_sources(args.ledger, args.terms)
    else:
        save_source(args.ledger, args.url, args.source)


if __name__ == "__main__":
    main()
