"""Deterministic bookkeeping for the write-quizzes workflow.

Usage: python3 -I quiz_work.py --work WORK <command> TOPIC [options]

WORK (var/quiz-work/<subject-slug>) holds blueprint.json, outline.json,
stems.txt, replace-backlog.json and optionally src/main.txt; each topic has its own folder
(WORK/<topic-slug>/) with briefs, batches, blind rounds and review files under
fixed names. The source ledger is shared by all subjects: WORK/../sources.json.
Run `--help` on a command for its options.
"""

import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import sys
from pathlib import Path

SEP = " › "
ITEM_FIELDS = {"stem", "choices", "answer", "rationale", "pearls"}
NESTED = {
    "rationaleMeta.sources",
    "metadata.subtopic",
    "metadata.system",
    "metadata.difficulty",
    "metadata.questionType",
}
STANDARDS_SEVERITIES = {"flaw", "metadata", "correction"}
UNVERIFIED_LIMIT = 5  # a quiz with more unverified facts sends those items to judgment
STATUS_RANK = {"verified": 3, "summary-only": 2, "unconfirmed": 1, "blocked": 0}


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


def items_of(batch):
    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            for n, item in enumerate(quiz["items"], 1):
                yield (
                    SEP.join((topic["name"], quiz["name"], str(n))),
                    quiz["name"],
                    item,
                )


def content_hash(item) -> str:
    """What the blind solver sees plus the key; rationale edits don't need a new solve."""
    text = json.dumps(
        [item["stem"], item["choices"], item["answer"]], ensure_ascii=False
    )
    return hashlib.sha256(text.encode()).hexdigest()[:16]


class Work:
    def __init__(self, root: Path, topic: str):
        self.root, self.topic = root, topic
        self.dir = root / slug(topic)

    def blueprint_topic(self):
        for topic in load(self.root / "blueprint.json")["topics"]:
            if topic["name"] == self.topic:
                return topic
        sys.exit(f"{self.topic} is not in the blueprint.")

    @property
    def ledger(self) -> Path:
        return self.root.parent / "sources.json"

    @property
    def backlog_path(self) -> Path:
        return self.root / "replace-backlog.json"

    def backlog(self) -> list:
        return load(self.backlog_path) if self.backlog_path.exists() else []

    def batch(self, name: str):
        return load(self.dir / name)

    def log(self):
        path = self.dir / "blind-log.json"
        return load(path) if path.exists() else {"solved": {}, "judged": []}


def unstaged_batches(work: Work):
    """Each other topic folder's latest batch: reviewed.json, else batch.json, else batch-<n>.json."""
    for folder in sorted(p for p in work.root.iterdir() if p.is_dir()):
        if folder == work.dir:
            continue
        for name in ("reviewed.json", "batch.json"):
            if (folder / name).exists():
                yield load(folder / name)
                break
        else:
            yield from (load(p) for p in sorted(folder.glob("batch-*.json")))


def page_text(work: Work, pages: str) -> str | None:
    """Pages "10-12, 15" of WORK/src/main.txt, where page N is the Nth form-feed chunk."""
    source = work.root / "src" / "main.txt"
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


def cmd_slices(work: Work, args) -> None:
    """One brief per blueprint quiz (with source-<n>.txt from src/main.txt), and WORK/stems.txt
    from the outline plus the unstaged batches in other topic folders."""
    topic = work.blueprint_topic()
    outline = load(work.root / "outline.json")
    lines, staged = [], set()
    for t in outline["topics"]:
        for q in t.get("quizzes", []):
            lines.append(f"## {t['name']}{SEP}{q['name']}")
            lines += [f"- {stem}" for stem in q.get("stems", [])]
            staged.update(q.get("stems", []))
    for batch in unstaged_batches(work):
        for t in batch["topics"]:
            for q in t["quizzes"]:
                stems = [i["stem"] for i in q["items"] if i["stem"] not in staged]
                if stems:
                    lines.append(f"## (unstaged) {t['name']}{SEP}{q['name']}")
                    lines += [f"- {stem}" for stem in stems]
    (work.root / "stems.txt").write_text("\n".join(lines) + "\n", "utf-8")
    plan = [
        {
            "topic": t["name"],
            "quiz": q["name"],
            "description": q.get("description", ""),
            "subtopics": list(q.get("subtopics", {})),
            "excludes": q.get("excludes", []),
        }
        for t in load(work.root / "blueprint.json")["topics"]
        for q in t["quizzes"]
    ]
    for n, quiz in enumerate(topic["quizzes"], 1):
        pages = page_text(work, quiz.get("pages", ""))
        if pages:
            work.dir.mkdir(exist_ok=True)
            (work.dir / f"source-{n}.txt").write_text(pages, "utf-8")
        dump(
            work.dir / f"brief-{n}.json",
            {
                "topic": {
                    "name": topic["name"],
                    "description": topic.get("description", ""),
                },
                "quiz": quiz,
                "otherPlannedQuizzes": [p for p in plan if p["quiz"] != quiz["name"]],
                "stagedStems": str(work.root / "stems.txt"),
                "sourceLedger": str(work.ledger),
                "sourcePages": str(work.dir / f"source-{n}.txt") if pages else "",
                "outputs": {
                    "batch": str(work.dir / f"batch-{n}.json"),
                    "unverified": str(work.dir / f"unverified-{n}.json"),
                    "sources": str(work.dir / f"sources-{n}.json"),
                },
            },
        )
    print(f"{len(topic['quizzes'])} briefs in {work.dir}")


def cmd_merge(work: Work, args) -> None:
    out = {"topics": []}
    for path in sorted(
        work.dir.glob("batch-*.json"), key=lambda p: int(p.stem.split("-")[1])
    ):
        for topic in load(path)["topics"]:
            target = next(
                (t for t in out["topics"] if t["name"] == topic["name"]), None
            )
            if target is None:
                target = {**topic, "quizzes": []}
                out["topics"].append(target)
            for quiz in topic["quizzes"]:
                existing = next(
                    (q for q in target["quizzes"] if q["name"] == quiz["name"]), None
                )
                if existing:
                    existing["items"] += quiz["items"]
                else:
                    target["quizzes"].append(quiz)
    dump(work.dir / "batch.json", out)
    print(f"{sum(1 for _ in items_of(out))} items in {work.dir / 'batch.json'}")


def cmd_blind(work: Work, args) -> None:
    """Per-quiz blind files for a round; the round remembers which batch it solves."""
    batch = work.batch(args.batch)
    refs = set(load(work.dir / args.refs)) if args.refs else None
    round_dir = work.dir / "blind" / args.round
    if round_dir.exists():
        sys.exit(f"{round_dir} already exists; pick a new round name.")
    files: dict[str, list] = {}
    for ref, quiz, item in items_of(batch):
        if refs is None or ref in refs:
            files.setdefault(quiz, []).append(
                {
                    "ref": ref,
                    "stem": item["stem"],
                    "choices": dict(zip("ABCD", item["choices"])),
                }
            )
    for n, rows in enumerate(files.values(), 1):
        dump(round_dir / f"items-{n}.json", rows)
    dump(round_dir / "meta.json", {"batch": args.batch, "files": len(files)})
    print(
        f"{sum(map(len, files.values()))} items in {len(files)} files under {round_dir}"
    )


def agreement(rows, keys, offset: int) -> float:
    pairs = [
        (rows[i]["answer"], keys[i + offset])
        for i in range(len(rows))
        if 0 <= i + offset < len(keys)
    ]
    return sum(a == k for a, k in pairs) / (len(pairs) or 1)


def shifted_run(rows, keys) -> int:
    """Most wrong answers in one stretch where every answer is a neighbor item's key."""
    best = 0
    for offset in (-1, 1):
        run = 0
        for i, row in enumerate(rows):
            j = i + offset
            if 0 <= j < len(keys) and row["answer"] == keys[j]:
                run += row["answer"] != keys[i]
            else:
                run = 0
            best = max(best, run)
    return best


def cmd_check_blind(work: Work, args) -> None:
    """Validate a round's answer files, refuse misaligned ones, and log clean solves."""
    round_dir = work.dir / "blind" / args.round
    meta = load(round_dir / "meta.json")
    batch = {ref: item for ref, _, item in items_of(work.batch(meta["batch"]))}
    log, errors, report = work.log(), [], []
    for n in range(1, meta["files"] + 1):
        items = load(round_dir / f"items-{n}.json")
        path = round_dir / f"answers-{n}.json"
        if not path.exists():
            errors.append(f"{path.name}: missing.")
            continue
        answers = {row.get("ref"): row for row in load(path)}
        order = [i["ref"] for i in items]
        problems = [
            f"{path.name}: no answer for {r}." for r in order if r not in answers
        ]
        problems += [
            f"{path.name}: unknown ref {r}."
            for r in answers
            if r not in batch or r not in order
        ]
        problems += [
            f"{path.name}: {r} answer {a.get('answer')!r} is not A to D."
            for r, a in answers.items()
            if a.get("answer") not in ("A", "B", "C", "D")
        ]
        if problems:
            errors += problems
            continue
        rows = [answers[r] for r in order]
        keys = [batch[r]["answer"] for r in order]
        direct = agreement(rows, keys, 0)
        shifted = max(agreement(rows, keys, -1), agreement(rows, keys, 1))
        if len(rows) >= 10 and (
            direct < 0.5 or shifted > direct or shifted_run(rows, keys) >= 5
        ):
            errors.append(
                f"{path.name}: misaligned, rerun this file (agreement {direct:.0%}, shifted {shifted:.0%})."
            )
            continue
        report.append(f"{path.name}: {len(rows)} answers, agreement {direct:.0%}")
        for r, row in zip(order, rows):
            clean = row["answer"] == batch[r]["answer"] and not row.get("defensible")
            log["solved"].setdefault(r, []).append(
                {
                    "hash": content_hash(batch[r]),
                    "round": args.round,
                    "answer": row["answer"],
                    "defensible": row.get("defensible", []),
                    "note": row.get("note", ""),
                    "clean": clean,
                }
            )
    if errors:
        sys.exit("\n".join(errors))
    dump(work.dir / "blind-log.json", log)
    print("\n".join(report))


def latest(log, ref, round_name):
    return next(
        (s for s in reversed(log["solved"].get(ref, [])) if s["round"] == round_name),
        None,
    )


def cmd_triage(work: Work, args) -> None:
    """Split items into the standards pass (one file per quiz) and the escalated set."""
    batch = work.batch(args.batch)
    log = work.log()
    unverified = {}
    for path in sorted(work.dir.glob("unverified-*.json")):
        rows, brief = load(path), path.with_name(path.name.replace("unverified", "brief"))
        if len(rows) > UNVERIFIED_LIMIT and brief.exists():
            quiz = load(brief)["quiz"]["name"]
            for row in rows:
                unverified[SEP.join((work.topic, quiz, str(row["item"])))] = row["fact"]
    standards: dict[str, list] = {}
    escalated = []
    for ref, quiz, item in items_of(batch):
        solve = latest(log, ref, args.round)
        if solve is None:
            sys.exit(
                f"{ref} has no answer in round {args.round}; run check-blind first."
            )
        why = []
        if solve["answer"] != item["answer"]:
            why.append(
                f"Blind answer {solve['answer']} differs from key {item['answer']}."
            )
        if solve["defensible"]:
            why.append(
                f"Blind solver found {', '.join(solve['defensible'])} defensible."
            )
        if solve["note"]:
            why.append(f"Blind note: {solve['note']}")
        if ref in unverified:
            why.append(f"Writer could not verify: {unverified[ref]}")
        if why:
            escalated.append({"ref": ref, "reasons": why})
        else:
            standards.setdefault(quiz, []).append({"ref": ref, **item})
    for old in work.dir.glob("standards-input-*.json"):
        old.unlink()
    for n, rows in enumerate(standards.values(), 1):
        dump(work.dir / f"standards-input-{n}.json", rows)
    dump(work.dir / "escalated.json", escalated)
    print(
        f"{sum(map(len, standards.values()))} to the standards pass in {len(standards)} files, "
        f"{len(escalated)} escalated"
    )


def cmd_route_standards(work: Work, args) -> None:
    """Merge the per-quiz standards reviews. Keep only flaw, metadata and correction edits;
    send the rest to judgment, and drops and near-duplicates to review-drops.json."""
    review, flagged = [], []
    for source in sorted(work.dir.glob("standards-input-*.json")):
        n = source.stem.rsplit("-", 1)[1]
        inputs = {item["ref"] for item in load(source)}
        for name, rows in (("review-standards", review), ("standards-escalate", flagged)):
            path = work.dir / f"{name}-{n}.json"
            if not path.exists():
                sys.exit(f"{path.name} is missing; run the standards pass on {source.name}.")
            entries = load(path)
            if stray := [e["ref"] for e in entries if e["ref"] not in inputs]:
                sys.exit(
                    f"{path.name} has refs not in {source.name} (keyed by position instead of ref?): "
                    + ", ".join(stray)
                )
            rows += entries
    escalated = load(work.dir / "escalated.json")
    replace = []
    known = {e["ref"] for e in escalated}

    def escalate(ref, reason, edits=None):
        if ref not in known:
            escalated.append({"ref": ref, "reasons": []})
            known.add(ref)
        entry = next(e for e in escalated if e["ref"] == ref)
        entry["reasons"].append(reason)
        if edits:
            entry["proposed"] = edits

    kept = []
    for entry in review:
        if entry.get("drop") or "near-duplicate" in entry.get("reason", "").lower():
            replace.append({"ref": entry["ref"], "reason": entry.get("reason", "")})
        elif entry.get("severity") in STANDARDS_SEVERITIES:
            kept.append(entry)
        else:
            escalate(
                entry["ref"],
                f"Standards reviewer suspected {entry.get('severity')}: {entry.get('reason', '')}",
                entry.get("edits"),
            )
    for row in flagged:
        if "near-duplicate" in row["reason"].lower():
            replace.append({"ref": row["ref"], "reason": row["reason"]})
        else:
            escalate(row["ref"], f"Standards reviewer: {row['reason']}")
    replacing = {r["ref"] for r in replace}
    escalated = [e for e in escalated if e["ref"] not in replacing]
    kept = [e for e in kept if e["ref"] not in replacing]
    # One reviewer per item: the judge gets standards edits on escalated items as proposals.
    for entry in [e for e in kept if e["ref"] in known]:
        target = next(e for e in escalated if e["ref"] == entry["ref"])
        target["reasons"].append(
            f"Standards reviewer also proposed ({entry['severity']}): {entry.get('reason', '')}"
        )
        target["proposed"] = {**entry.get("edits", {}), **target.get("proposed", {})}
        kept.remove(entry)
    dump(work.dir / "review-standards.json", kept)
    dump(work.dir / "escalated.json", escalated)
    dump(work.dir / "review-drops.json", [{**r, "drop": True} for r in replace])
    print(
        f"{len(kept)} standards edits kept, {len(escalated)} escalated, {len(replace)} to drop and replace"
    )


def cmd_judge_input(work: Work, args) -> None:
    batch = {ref: item for ref, _, item in items_of(work.batch(args.batch))}
    log = work.log()
    rows = []
    for entry in load(work.dir / "escalated.json"):
        item = batch[entry["ref"]]
        rows.append(
            {
                "ref": entry["ref"],
                **item,
                "blind": latest(log, entry["ref"], args.round),
                "escalation": entry["reasons"],
                **({"proposed": entry["proposed"]} if "proposed" in entry else {}),
            }
        )
        log["judged"].append(content_hash(item))
    dump(work.dir / "judgment-input.json", rows)
    dump(work.dir / "blind-log.json", log)
    print(f"{len(rows)} items for judgment")


def cmd_apply(work: Work, args) -> None:
    """Apply review edits as written and refuse unknown refs and fields. Dropped items go to
    the subject's replacement backlog, so their quizzes stay short until it is written."""
    out_path = work.dir / args.output
    if out_path.exists():
        sys.exit(f"{out_path} already exists.")
    batch = work.batch(args.batch)
    items = {ref: item for ref, _, item in items_of(batch)}
    entries = [entry for name in args.reviews for entry in load(work.dir / name)]
    errors, drop, rewritten = [], {}, []
    for entry in entries:
        ref, edits = entry.get("ref"), entry.get("edits", {})
        if ref not in items:
            errors.append(f"{ref}: no such item.")
            continue
        if entry.get("drop"):
            drop.setdefault(ref, entry.get("reason", ""))
            continue
        item = items[ref]
        for field, value in edits.items():
            if field in ITEM_FIELDS:
                item[field] = value
            elif field in NESTED:
                parent, key = field.split(".")
                item.setdefault(parent, {})[key] = value
            else:
                errors.append(f"{ref}: {field} is not an editable field.")
        if "choices" in edits and "answer" not in edits:
            errors.append(f"{ref}: a choices edit must also send answer.")
        if len(item["choices"]) != 4 or item["answer"] not in ("A", "B", "C", "D"):
            errors.append(f"{ref}: choices and answer don't match.")
        if {"stem", "choices", "answer"} & edits.keys() and ref not in rewritten:
            rewritten.append(ref)
    if errors:
        sys.exit("\n".join(errors))
    backlog = work.backlog()
    renumber = {}
    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            for n, item in enumerate(quiz["items"], 1):
                ref = SEP.join((topic["name"], quiz["name"], str(n)))
                if ref not in drop:
                    continue
                backlog = [
                    b for b in backlog if (b["ref"], b["stem"]) != (ref, item["stem"])
                ]
                backlog.append(
                    {
                        "ref": ref,
                        "topic": topic["name"],
                        "quiz": quiz["name"],
                        "reason": drop[ref],
                        "answer": item["answer"],
                        "metadata": item.get("metadata", {}),
                        "stem": item["stem"],
                    }
                )
            kept = []
            for n, item in enumerate(quiz["items"], 1):
                ref = SEP.join((topic["name"], quiz["name"], str(n)))
                if ref not in drop:
                    kept.append(item)
                    renumber[ref] = SEP.join((topic["name"], quiz["name"], str(len(kept))))
            quiz["items"] = kept
    # Drops renumber the items after them; rewritten refs name items in the output batch.
    rewritten = [renumber[r] for r in rewritten if r in renumber]
    dump(out_path, batch)
    if drop:
        dump(work.backlog_path, backlog)
    dump(work.dir / f"rewritten-{Path(args.output).stem}.json", rewritten)
    print(
        json.dumps(
            {
                "applied": len(entries) - len(drop),
                "dropped": sorted(drop),
                "replacementBacklog": len(backlog),
                "rewritten": len(rewritten),
                "rewrittenFile": f"rewritten-{Path(args.output).stem}.json",
            },
            ensure_ascii=False,
        )
    )


def cmd_accept(work: Work, args) -> None:
    """Record items as judged unchanged, e.g. a recheck disagreement where the key is clearly right."""
    batch = {ref: item for ref, _, item in items_of(work.batch(args.batch))}
    unknown = [r for r in args.refs if r not in batch]
    if unknown:
        sys.exit("No such item: " + ", ".join(unknown))
    log = work.log()
    log["judged"] += [content_hash(batch[r]) for r in args.refs]
    dump(work.dir / "blind-log.json", log)
    print(f"{len(args.refs)} items accepted as judged")


def cmd_ready(work: Work, args) -> None:
    """Every item must have a clean blind solve of its current content, or have been judged as is."""
    log = work.log()
    # Match by content, not ref: drops renumber items between rounds.
    cleared = set(log["judged"]) | {
        s["hash"] for solves in log["solved"].values() for s in solves if s["clean"]
    }
    missing = [
        ref for ref, _, item in items_of(work.batch(args.batch)) if content_hash(item) not in cleared
    ]
    if missing:
        sys.exit(
            "Not ready; these need a blind solve of their current content (or a fix):\n"
            + "\n".join(missing)
        )
    print("Ready to stage.")


def cmd_ledger(work: Work, args) -> None:
    """Merge every topic's sources-<n>.json into the shared ledger, WORK/../sources.json."""
    path = work.ledger
    path.parent.mkdir(parents=True, exist_ok=True)
    # Sessions for other subjects share this ledger; hold the lock across read, merge and write.
    with open(path.with_name(path.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        ledger = load(path) if path.exists() else []
        index = {(e["title"].strip().lower(), str(e.get("year", ""))): e for e in ledger}
        added = 0
        for source in sorted(work.root.glob("*/sources-*.json")):
            for row in load(source):
                k = (row["title"].strip().lower(), str(row.get("year", "")))
                if row.get("status") not in STATUS_RANK:
                    sys.exit(f"{source}: {row['title']} has status {row.get('status')!r}.")
                if k not in index:
                    index[k] = {**row, "facts": list(row.get("facts", []))}
                    added += 1
                    continue
                entry = index[k]
                if STATUS_RANK[row["status"]] > STATUS_RANK[entry["status"]]:
                    entry["status"] = row["status"]
                    entry["url"] = row.get("url", entry.get("url", ""))
                entry["facts"] += [
                    f for f in row.get("facts", []) if f not in entry["facts"]
                ]
        dump(path, sorted(index.values(), key=lambda e: e["title"].lower()))
    print(f"{len(index)} sources ({added} new) in {path}")


def cmd_backlog(work: Work, args) -> None:
    """Count the dropped items awaiting replacement, per quiz; --clear once they are staged."""
    if args.clear:
        work.backlog_path.unlink(missing_ok=True)
        print("Backlog cleared.")
        return
    counts: dict[str, int] = {}
    for entry in work.backlog():
        where = SEP.join((entry["topic"], entry["quiz"]))
        counts[where] = counts.get(where, 0) + 1
    print("\n".join(f"{n} {where}" for where, n in counts.items()) or "Backlog is empty.")


KEEP = {"blueprint.json"}


def cmd_clean(work: Work, args) -> None:
    """Merge the ledger, then delete everything but blueprint.json."""
    if work.backlog():
        sys.exit(
            f"{len(work.backlog())} dropped items still await replacement; "
            "write and stage them, then run backlog --clear."
        )
    cmd_ledger(work, args)
    removed = []
    for path in sorted(work.root.iterdir()):
        if path.name in KEEP:
            continue
        shutil.rmtree(path) if path.is_dir() else path.unlink()
        removed.append(path.name)
    print(f"Removed {len(removed)} entries; kept {', '.join(sorted(KEEP))}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--work", type=Path, required=True)
    sub = parser.add_subparsers(dest="command", required=True)
    for name, fn, opts in [
        ("slices", cmd_slices, []),
        ("merge", cmd_merge, []),
        ("blind", cmd_blind, ["batch", "round", "refs?"]),
        ("check-blind", cmd_check_blind, ["round"]),
        ("triage", cmd_triage, ["batch", "round"]),
        ("route-standards", cmd_route_standards, []),
        ("judge-input", cmd_judge_input, ["batch", "round"]),
        ("apply", cmd_apply, ["batch", "output"]),
        ("accept", cmd_accept, ["batch"]),
        ("ready", cmd_ready, ["batch"]),
        ("ledger", cmd_ledger, []),
        ("backlog", cmd_backlog, []),
        ("clean", cmd_clean, []),
    ]:
        p = sub.add_parser(name, help=fn.__doc__)
        p.add_argument(
            "topic",
            nargs="?" if name in ("ledger", "backlog", "clean") else None,
            default="",
        )
        for opt in opts:
            if opt.endswith("?"):
                p.add_argument(f"--{opt[:-1]}")
            else:
                p.add_argument(f"--{opt}", required=True)
        if name == "apply":
            p.add_argument("reviews", nargs="+")
        if name == "accept":
            p.add_argument("refs", nargs="+")
        if name == "backlog":
            p.add_argument("--clear", action="store_true")
        p.set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(Work(args.work, args.topic), args)


if __name__ == "__main__":
    main()
