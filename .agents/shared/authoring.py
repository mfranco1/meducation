"""Helpers shared by the write-quizzes (quiz_work.py) and write-flashcards (deck_work.py) scripts.

A change here changes both workflows: run both skills' tests and this folder's tests.

Usage:
  python3 -I .agents/shared/authoring.py find-sources TERM... [--ledger PATH]
    prints the source ledger entries that contain every term, newest first, with any saved copy,
    and the files in sources/manual/ whose name contains any term.
  python3 -I .agents/shared/authoring.py save-source URL [--from URL_OR_FILE] [--refresh] [--ledger PATH]
    saves the document's text in sources/ next to the ledger and prints the path. Without --from it
    tries the page, its PubMed Central copies and the archive copy in turn.
  python3 -I .agents/shared/authoring.py currency SUBJECT_SLUG
    prints the currency-notes.md rows a writer or reviewer of that subject reads.
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
import urllib.parse
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# One ledger of verified, summary-only, blocked and unconfirmed documents for every subject and both skills.
LEDGER = REPO / "var" / "source-ledger.json"
SEP = " › "
STATUS_RANK = {"verified": 3, "summary-only": 2, "unconfirmed": 1, "blocked": 0}
FIND_FULL, FIND_TITLES = 8, 40  # past FIND_FULL matches, list titles only
BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"
MIN_TEXT = 1000  # shorter text is a block, challenge or error page, not the document
# A challenge page at the top of the text, or the stub efetch returns for an article outside the open-access subset.
BLOCK_PAGE = re.compile(
    r"just a moment|enable javascript|checking your browser|verify(ing)? (that )?you are (a )?human|captcha|access denied"
    r"|does not allow downloading of the full text",
    re.I,
)
CURRENCY_NOTES = Path(__file__).with_name("currency-notes.md")
# The work dir names of both skills. A Subjects cell in currency-notes.md holds these.
SUBJECTS = frozenset(
    "anatomy-histology biochemistry internal-medicine legal-medicine microbiology-parasitology obstetrics-gynecology"
    " pathology pediatrics pharmacology physiology preventive-medicine surgery".split()
)


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


def pmcid(url: str) -> str | None:
    return m[0].upper() if (m := re.search(r"\bpmc\d+", url, re.I)) else None


def doi(url: str) -> str | None:
    m = re.search(r"\b10\.\d{4,9}/[^\s?#]+", url)
    return re.sub(r"(/(full|pdf|epdf|abstract))?(\.pdf)?/?$", "", m[0].lower()) if m else None


def doc_key(url: str) -> str:
    """One key per document: the PMCID or DOI in its URL, else the URL itself, so every address of a document matches."""
    return (pmcid(url) or "").lower() or doi(url) or url_key(url)


def currency_notes(subject: str, source: Path = CURRENCY_NOTES) -> str:
    """The tables of currency-notes.md without the Gate column, keeping rows for SUBJECT and rows for every subject.

    A subject outside SUBJECTS gets every row."""
    tables: list[list[str]] = []
    header = None
    for line in source.read_text("utf-8").splitlines():
        if not line.startswith("|"):
            header = None
            if line.startswith("## "):
                tables.append([line, ""])
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if header is None:
            header = cells
            tables.append([])
        elif not set(cells[0]) <= set("-: "):
            tags = set(cells[header.index("Subjects")].replace(",", " ").split())
            if tags - SUBJECTS:
                sys.exit(f"{source.name}: unknown subject {sorted(tags - SUBJECTS)} in row {cells[0][:40]!r}.")
            if tags and subject in SUBJECTS and subject not in tags:
                continue
        tables[-1].append("| " + " | ".join(c for name, c in zip(header, cells) if name not in ("Subjects", "Gate")) + " |")
    # A table left with only its header and separator has no row for this subject; drop it and its heading.
    kept = [t for i, t in enumerate(tables) if len(t if t[0].startswith("|") else tables[i + 1] if i + 1 < len(tables) else []) > 2]
    return "\n\n".join("\n".join(t).strip() for t in kept)


# Reference sites, summaries, narrative reviews and case reports are never cited (content-standards.md, Citations), so the ledger drops them.
NON_CITABLE = re.compile(
    r"\b(MSD Manual|Merck Manual|StatPearls|UpToDate|Medscape|Wikipedia|Radiopaedia|DermNet|EyeWiki|Amboss|Cureus"
    r"|MedlinePlus|Endotext|GeneReviews|Nat Rev Dis Primers|Am Fam Physician|case reports?|narrative review|state of the art)\b"
    r"|//(www\.)?(\w+\.)?(msdmanuals|merckmanuals|statpearls|uptodate|medscape|wikipedia|radiopaedia|dermnetnz|eyewiki"
    r"|amboss|cureus|aafp|emdocs|guidelinecentral|obgproject|mdcalc|drugs|medlineplus)\.",
    re.I,
)


YEAR = r"(?:19\d\d|20[0-2]\d)"
LEGAL = re.compile(
    r"\b(Republic Act|R\.?A\.? (No\. )?\d|Presidential Decree|Executive Order|Revised Penal Code|Civil Code|Family Code"
    r"|Rules of Court|Rule \d+|Constitution|Batas Pambansa|Act No\.|G\.R\. No|Administrative Order|Code of Ethics|Labor Code|Circular)"
)
CITATION_FORMS = {
    "P": "full AMA form",
    "M": "elements present, no italics",
    "L": "title and year only",
    "Lg": "law or case, short form",
    "I": "incomplete",
}


def split_citations(sources: str) -> list[str]:
    """The citations of a sources string. "; " separates them, but also sits inside author groups and before a publisher's year."""
    out: list[str] = []
    for part in (p.strip() for p in re.split(r";\s+|\n+", sources.strip())):
        if not part:
            continue
        # A title can open with its year ("2021 ACR guideline ..."); a publisher's year is followed by punctuation.
        starts_title = re.match(YEAR + r" [A-Za-z]", part)
        if out and not starts_title and (re.match(YEAR + r"\b", part) or (not re.search(r"\.\s|\.$", out[-1]) and not re.search(r"\)$|" + YEAR + "$", out[-1]))):
            out[-1] += "; " + part
        else:
            out.append(part)
    return out


def citation_form(c: str) -> str:
    """The CITATION_FORMS class of one citation. Pattern-based: only P is the form content-standards.md asks for."""
    ital = re.search(r"\*[^*]+\*", c)
    legal = bool(LEGAL.search(c)) and not re.search(r"\*[^*]+\*\. " + YEAR + "[;:.]", c)
    lead = ital and not c.startswith("*") and c[: ital.start()].strip()
    if ital and lead and re.search(r"\*[^*]+\*\.\s*(Published (online )?)?[A-Za-z ]*" + YEAR, c):
        return "P"
    if ital and (
        re.search(r"\*\.?\s.*[;,] ?(?:Updated |Revised |Published )?[A-Za-z ]*" + YEAR, c[ital.end() - 1 :])
        or re.search(r"\*[^*]+\*\.\s*(\d+\w* ed\.|Vol)", c)
    ):
        return "P"
    if not re.search(YEAR, c):
        return "I"
    if ital:
        return "P" if (lead or legal or c.startswith("*")) else "I"
    if legal:
        return "Lg"
    if re.search(r"\(" + YEAR + r"[^)]*\)\.?$", c):
        return "L"
    segs = [s for s in re.split(r"\.\s+", c) if s.strip()]
    return "M" if len(segs) >= 3 or (len(segs) >= 2 and re.search(r";\s*" + YEAR, c)) else "L"


def warn_citation_forms(batch) -> None:
    """Print one warning per distinct citation in a batch's `sources` strings that is not in full AMA form."""
    found: dict[str, None] = {}

    def walk(value) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key == "sources" and isinstance(child, str):
                    found.update(dict.fromkeys(split_citations(child)))
                else:
                    walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(batch)
    for c in found:
        if (form := citation_form(c)) != "P":
            print(f"warning: citation is not in AMA form ({CITATION_FORMS[form]}): {c}", flush=True)


def saved_copy(ledger: Path, url: str) -> Path:
    """Where save-source keeps the text of the document at URL."""
    return ledger.with_name("sources") / f"{hashlib.sha256(doc_key(url).encode()).hexdigest()[:16]}.txt"


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


def download(url: str, out: Path, seconds: int) -> str | None:
    """Download URL to OUT with a browser User-Agent; the error, or None when it worked."""
    cmd = ["curl", "-sSfL", "--compressed", "--connect-timeout", "20", "--max-time", str(seconds), "-A", BROWSER_UA, "-o", str(out), url]
    done = subprocess.run(cmd, capture_output=True, text=True, check=False)
    return done.stderr.strip() or f"curl exit {done.returncode}" if done.returncode else None


def candidates(url: str, folder: Path) -> list[str]:
    """Where to look for the document cited as URL: the page, its PubMed Central copies, then the archive copy."""
    routes = [url]
    pmc = pmcid(url)
    if not pmc and (d := doi(url)):
        # Europe PMC knows the PMCID of an article by DOI; a failed lookup only skips these routes.
        found = folder / "lookup.json"
        query = urllib.parse.quote(f'DOI:"{d}"')
        if not download(f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?query={query}&resultType=lite&format=json", found, 30):
            try:
                pmc = next((r["pmcid"] for r in load(found)["resultList"]["result"] if r.get("pmcid")), None)
            except (ValueError, KeyError):
                pass
    if pmc:
        routes += [
            f"https://pmc.ncbi.nlm.nih.gov/articles/{pmc}/",
            f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmc}/fullTextXML",
            f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id={pmc[3:]}",
        ]
    routes.append(f"https://web.archive.org/web/{datetime.datetime.now(datetime.UTC).year}id_/{url}")
    return list(dict.fromkeys(r for r in routes if url_key(r) != url_key(url) or r == url))


def unusable(text: str) -> str | None:
    """Why TEXT is not the document, or None."""
    if len(text) < MIN_TEXT:
        return f"only {len(text)} characters"
    if m := BLOCK_PAGE.search(text[:3000]):
        return f"block page ({m[0]!r})"
    return None


def routes_file(ledger: Path) -> Path:
    """The route that reached each saved document: {doc key: {"url": cited URL, "from": route URL}}."""
    return ledger.with_name("sources") / "routes.json"


def host(url: str) -> str:
    return url_key(url).split("/")[0]


def save_source(ledger: Path, url: str, source: str | None, refresh: bool = False) -> None:
    """Save the text of the document cited as URL. With SOURCE (a URL or a saved file) read it from there; without, reuse the saved copy or try each known route in turn."""
    path = saved_copy(ledger, url)
    label = host(url) == "api.fda.gov"  # a drug label changes without a new URL, so always fetch it again
    if path.exists() and not source and not refresh and not label:
        saved = datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.UTC).date()
        print(f"{path} ({len(path.read_text('utf-8'))} characters, saved {saved}; --refresh fetches it again)")
        return
    failures, text, route = [], "", None
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        if source and Path(source).is_file():
            text = document_text(Path(source).read_bytes(), folder)
            why = unusable(text)
            failures += [f"{source}: {why}"] if why else []
        else:
            out = folder / "download"
            for route in [source] if source else candidates(url, folder):
                why = download(route, out, 180 if source else 120)
                if not why:
                    text = document_text(out.read_bytes(), folder)
                    why = unusable(text)
                if not why:
                    break
                failures.append(f"{route}: {why}")
    if why:
        routes = load(routes_file(ledger)).values() if routes_file(ledger).exists() else []
        sys.exit(
            "Not saved. Tried:\n"
            + "".join(f"  {f}\n" for f in failures)
            + "".join(f"  worked before for {host(url)}: {r['url']} --from {r['from']}\n" for r in [r for r in routes if host(r["url"]) == host(url)][-3:])
            + f"Next: grep -i '{host(url)}' .agents/shared/fetch-access.md, then grep its issuing body; if no listed route loads, record the document as blocked."
        )
    old = path.read_text("utf-8") if path.exists() else ""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp_path.write_text(text, "utf-8")
    os.replace(tmp_path, path)  # a concurrent reader never sees a partial file
    if route and url_key(route) != url_key(url):
        with open(routes_file(ledger).with_name("routes.json.lock"), "w") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            routes = load(routes_file(ledger)) if routes_file(ledger).exists() else {}
            routes[doc_key(url)] = {"url": url, "from": route}
            dump(routes_file(ledger), routes)
    note = f", via {route}" if route and route != url else ""
    if label and old:
        was, now = (m[1] if (m := re.search(r'"effective_time": "(\d+)"', t)) else "unknown" for t in (old, text))
        note += f", label effective_time {now}" + (" (unchanged)" if was == now else f" (was {was}: recheck facts taken from the older label)")
    print(f"{path} ({len(text)} characters{note})")


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
    routes = load(routes_file(ledger)) if routes_file(ledger).exists() else {}
    for e in hits[:FIND_TITLES]:
        print(f"{e['status']} {e.get('year', '')} {e['title']}")
        if full:
            print(f"  {e.get('url', '')}")
            if e.get("url") and (copy := saved_copy(ledger, e["url"])).exists():
                saved = datetime.datetime.fromtimestamp(copy.stat().st_mtime, datetime.UTC).date()
                print(f"  saved {saved}: {copy.relative_to(REPO) if copy.is_relative_to(REPO) else copy}")
            if e.get("url") and (route := routes.get(doc_key(e["url"]))):
                print(f"  fetched from {route['from']}")
            print("".join(f"  - {f}\n" for f in e.get("facts", [])), end="")
    if not hits:
        print("No matching sources.")
    elif not full:
        print(f"{len(hits)} matches. Add a term from the title you need to see its URL and facts.")


def merge_ledger(ledger: Path, work: Path) -> None:
    """Fold every WORK/<topic>/sources-<n>.json into LEDGER, one entry per document (its PMCID, DOI, URL or title) and year."""
    ledger.parent.mkdir(parents=True, exist_ok=True)
    # Sessions for other subjects and the other skill share this ledger; hold the lock across read, merge and write.
    with open(ledger.with_name(ledger.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        index: dict[tuple[str, str], dict] = {}

        def fold(row: dict) -> bool:
            """Merge a row into the index; True when it is a new entry."""
            if NON_CITABLE.search(f"{row['title']} {row.get('url', '')}"):
                return False
            k = (doc_key(row.get("url", "")) or row["title"].strip().lower(), str(row.get("year", "")))
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
    save.add_argument("--refresh", action="store_true", help="fetch again even when a copy is saved")
    save.add_argument("--ledger", type=Path, default=LEDGER)
    sub.add_parser("currency", help=currency_notes.__doc__).add_argument("subject", metavar="SUBJECT_SLUG")
    args = parser.parse_args()
    if args.command == "find-sources":
        find_sources(args.ledger, args.terms)
    elif args.command == "save-source":
        save_source(args.ledger, args.url, args.source, args.refresh)
    else:
        print(currency_notes(args.subject))


if __name__ == "__main__":
    main()
