"""Bank-wide audit and cleanup of the sources field of questions and cards in the draft.

Usage (from the repository root, with meducation-authority-postgres running):
  A() { python3 -I .agents/skills/audit-sources/source_audit.py "$@"; }
  A summary                    counts per class and flag
  A list CLASS_OR_FLAG [SUBJECT]   distinct citations, most used first, with their use count
  A groups [SUBJECT]           documents cited in more than one wording (same DOI, or same title and year)
  A apply MAP.json [--actor NAME] [--dry-run]
    stages the map's replacements in the draft through stage-quizzes and stage-flashcards.

summary and list read the draft and rewrite the audit file (--audit, default
var/source-audit/citations.json); apply changes only items still at the version that file records.
Classes are in CITATION_FORMS of .agents/shared/authoring.py. Flags: refsite, narrative,
summarypage, pre2010, 2010-15. Both are pattern-based: read the strings before acting on a count.
"""

import argparse
import collections
import json
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "shared"))
from authoring import LEGAL, REPO, YEAR, citation_form, dump, load, slug, split_citations  # noqa: E402

AUDIT = REPO / "var" / "source-audit" / "citations.json"
SQL = """select json_agg(x) from (
 select 'q' kind, q.id, q.version, s.name subject, q.rationale_meta->>'sources' sources from content.draft_questions q
  join content.draft_quizzes z on z.id=q.quiz_id join content.draft_topics t on t.id=z.topic_id join content.draft_subjects s on s.id=t.subject_id
 union all select 'f', f.id, f.version, s.name, f.sources from content.draft_flashcards f
  join content.draft_decks d on d.id=f.deck_id join content.draft_topics t on t.id=d.topic_id join content.draft_subjects s on s.id=t.subject_id) x"""
HISTORIC = re.compile(r"Belmont|Nuremberg|Alma-Ata|Ottawa Charter|Declaration of|Hippocrat|Constitution", re.I)
REFSITE = re.compile(r"MedlinePlus|Endotext|GeneReviews|Encyclopedia|StatPearls|UpToDate|Medscape|Merck Manual|MSD Manual|Wikipedia", re.I)
NARRATIVE = re.compile(
    r"Nat Rev Dis Primers|F1000|\b(an|a contemporary|contemporary|narrative|clinical|literature|state-of-the-art|comprehensive|brief|mini-?) ?(review|overview)\b"
    r"|current concepts|\bseminar\b|\bupdate on\b|: a review|review of the literature|revisited",
    re.I,
)
NOT_NARRATIVE = re.compile(
    r"systematic|meta-analysis|scientific statement|guideline|guidance|consensus|Centers for Disease|CDC|Clinical Overview|ACOG|AGA |American|Society"
    r"|Canadian|Food and Drug|Working Group|Committee|ELITA|IARC|classification|Collaborative Review|evidence-based",
    re.I,
)
SUMMARY_PAGE = re.compile(
    r"fact ?sheet|clinical overview|facts and stats|key facts|web edition|online edition|information for clinicians"
    r"|\bClinical (care|features|signs|presentation|guidance|considerations)\b of|\bAbout [A-Z]|Pocket (Guide|Book)|Summary for Clinicians"
    r"|summary-only|Made Simple|patient version|health topic|Questions and answers|press release|news release|worldwide\.|Yellow Book",
    re.I,
)


def flags(c: str) -> list[str]:
    out = []
    if REFSITE.search(c):
        out.append("refsite")
    if NARRATIVE.search(c) and not NOT_NARRATIVE.search(c):
        out.append("narrative")
    if SUMMARY_PAGE.search(c):
        out.append("summarypage")
    years = [int(y) for y in re.findall(r"\b" + YEAR + r"\b", re.sub(r"doi:\S+|https?://\S+|\d+[-–]\d+", "", c)) if int(y) <= 2026]
    if years and not LEGAL.search(c) and not HISTORIC.search(c) and max(years) < 2016:
        out.append("pre2010" if max(years) < 2010 else "2010-15")
    return out


def draft_rows() -> list[dict]:
    """Every question and card of the draft: {kind: q or f, id, version, subject, sources}."""
    cmd = ["docker", "exec", "meducation-authority-postgres", "psql", "-U", "meducation_bootstrap", "-d", "meducation_authority", "-XAt", "-c", SQL]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)


def audit(rows: list[dict]) -> dict[str, dict]:
    """{citation: {class, flags, items: [[kind, id, version, subject]]}} over the rows that have sources."""
    cites: dict[str, dict] = {}
    for r in rows:
        for c in split_citations(r["sources"] or ""):
            entry = cites.setdefault(c, {"class": citation_form(c), "flags": flags(c), "items": []})
            entry["items"].append([r["kind"], r["id"], r["version"], r["subject"]])
    return cites


def summary(rows: list[dict], cites: dict[str, dict]) -> str:
    total = collections.Counter(r["kind"] for r in rows)
    cited = collections.Counter(r["kind"] for r in rows if (r["sources"] or "").strip())
    lines = [f"questions with sources {cited['q']} of {total['q']}; cards {cited['f']} of {total['f']}"]
    for label, keys in (("class", lambda e: [e["class"]]), ("flag", lambda e: e["flags"])):
        uses, distinct = collections.Counter(), collections.Counter()
        for e in cites.values():
            for k in keys(e):
                uses[k] += len(e["items"])
                distinct[k] += 1
        lines += [f"{label} {k}: {uses[k]} citations, {distinct[k]} distinct" for k in sorted(uses)]
    return "\n".join(lines)


def listing(cites: dict[str, dict], want: str, subject: str = "") -> list[tuple[int, str]]:
    """(uses, citation) of class or flag WANT, most used first; with SUBJECT, only uses in subjects whose name starts with it."""
    out = []
    for c, e in cites.items():
        n = sum(1 for i in e["items"] if i[3].lower().startswith(subject.lower()))
        if n and (e["class"] == want or want in e["flags"]):
            out.append((n, c))
    return sorted(out, key=lambda x: -x[0])


def document_keys(c: str) -> list[str]:
    """What identifies a citation's document: its DOI, and its title with its year."""
    found = re.search(r"doi:\s*(10\.\S+)", c, re.I)
    bare = re.sub(r"doi:\s*\S+|https?://\S+", "", c, flags=re.I)
    ital = re.search(r"\*([^*]+)\*", bare)
    lead = [s for s in re.split(r"\.\s+", bare[: ital.start()].strip(". ")) if s and not s.startswith("In:")] if ital else []
    # Authors. Title. *Journal* has its title before the italics; Organization. *Title* has it in them.
    title = lead[-1] if len(lead) > 1 else ital.group(1) if ital else bare
    years = re.findall(YEAR, bare)
    words = " ".join(re.findall(r"[a-z0-9]+", title.lower()))
    return ([found.group(1).rstrip(".").lower()] if found else []) + ([f"{words} {years[-1]}"] if words and years else [])


def groups(cites: dict[str, dict], subject: str = "") -> list[list[tuple[int, str]]]:
    """Sets of two or more wordings that share a DOI or a title and year, as (uses, citation), most used set first.

    With SUBJECT, only sets used in subjects whose name starts with it. Pattern-based: one wrong DOI joins two documents."""
    parent = {c: c for c in cites}

    def root(c: str) -> str:
        while parent[c] != c:
            c = parent[c]
        return c

    first: dict[str, str] = {}
    for c in cites:
        for key in document_keys(c):
            parent[root(c)] = root(first.setdefault(key, c))
    sets = collections.defaultdict(list)
    for c, e in cites.items():
        sets[root(c)].append((len(e["items"]), c))
    wanted = [
        sorted(g, reverse=True)
        for g in sets.values()
        # One wording cited with several articles or sections after its year is still one wording.
        if len({re.sub(r"(; " + YEAR + r"\.) .*", r"\1", c) for _, c in g}) > 1
        and any(i[3].lower().startswith(subject.lower()) for _, c in g for i in cites[c]["items"])
    ]
    return sorted(wanted, key=lambda g: -sum(n for n, _ in g))


def plan(rows: list[dict], cites: dict[str, dict], mapping: dict[str, str | None]) -> tuple[dict[str, dict[str, list]], list[str], list[str]]:
    """Stage batches per subject ({subject: {q: edits, f: edits}}), refused item IDs and map keys the audit doesn't hold.

    A value of None drops the citation and "KEEP: reason" leaves it. An item is refused when its
    version is no longer the audited one."""
    changes = {old: new for old, new in mapping.items() if not (new or "").startswith("KEEP:")}
    current = {(r["kind"], r["id"]): r for r in rows}
    audited = {(kind, ident): version for old in changes if old in cites for kind, ident, version, _ in cites[old]["items"]}
    batches: dict[str, dict[str, list]] = {}
    refused = []
    for key, version in audited.items():
        row = current.get(key)
        if row is None or row["version"] != version:
            refused.append(key[1])
            continue
        kept = dict.fromkeys(changes.get(c, c) for c in split_citations(row["sources"]))
        sources = "; ".join(c for c in kept if c)
        edit = {"id": row["id"], "version": version} | ({"rationaleMeta": {"sources": sources}} if key[0] == "q" else {"sources": sources})
        batches.setdefault(row["subject"], {"q": [], "f": []})[key[0]].append(edit)
    return batches, refused, [old for old in changes if old not in cites]


def apply(args) -> None:
    mapping = load(args.map)
    if not args.audit.exists():
        sys.exit(f"{args.audit} is missing. Run summary first.")
    batches, refused, unknown = plan(draft_rows(), load(args.audit), mapping)
    failed = False
    for subject, kinds in sorted(batches.items()):
        for kind, action in (("q", "stage-quizzes"), ("f", "stage-flashcards")):
            if not kinds[kind]:
                continue
            file = args.map.with_name(f"{args.map.stem}.stage-{slug(subject)}-{kind}.json")
            dump(file, {"edits": kinds[kind]})
            print(f"{subject}: {len(kinds[kind])} {'questions' if kind == 'q' else 'cards'} in {file}")
            if args.dry_run:
                continue
            cmd = [str(REPO / ".venv/bin/python"), str(REPO / "scripts/local-authoring/job.py"), action, "--subject", subject, "--file", str(file), "--actor", args.actor]
            done = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, check=False)
            if done.returncode:
                failed = True
                print(f"  not staged: {(done.stderr or done.stdout).strip()}")
    for old in unknown:
        print(f"not in the audit: {old}")
    if refused:
        print(f"refused {len(refused)} items changed since the audit: {' '.join(sorted(refused))}")
    if failed or refused or unknown:
        sys.exit("Rerun summary, check the lines above and apply again.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--audit", type=Path, default=AUDIT, help="the audit file summary and list write and apply reads")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("summary")
    lst = sub.add_parser("list")
    lst.add_argument("want", metavar="CLASS_OR_FLAG")
    lst.add_argument("subject", nargs="*")
    sub.add_parser("groups").add_argument("subject", nargs="*")
    app = sub.add_parser("apply")
    app.add_argument("map", type=Path)
    app.add_argument("--actor", default="agent:audit-sources")
    app.add_argument("--dry-run", action="store_true", help="write the stage files without staging them")
    args = parser.parse_args()
    if args.command == "apply":
        return apply(args)
    rows = draft_rows()
    cites = audit(rows)
    dump(args.audit, cites)
    if args.command == "summary":
        print(summary(rows, cites))
    elif args.command == "groups":
        for group in groups(cites, " ".join(args.subject)):
            print("\n".join(f"{n:4d}  {c}" for n, c in group) + "\n")
    else:
        for n, c in listing(cites, args.want, " ".join(args.subject)):
            print(f"{n:4d}  {c}")


if __name__ == "__main__":
    main()
