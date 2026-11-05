"""Deterministic bookkeeping for the write-quizzes workflow.

Usage: python3 -I quiz_work.py --work WORK <command> TOPIC [options]

WORK holds blueprint.json, outline.json, stems.txt and sources.json; each topic
has its own folder (WORK/<topic-slug>/) with briefs, batches, blind rounds and
review files under fixed names. Run `--help` on a command for its options.
"""

import argparse
import hashlib
import json
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
STATUS_RANK = {"verified": 3, "summary-only": 2, "unconfirmed": 1, "blocked": 0}


def load(path: Path):
    return json.loads(path.read_text("utf-8"))


def dump(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", "utf-8")


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

    def batch(self, name: str):
        return load(self.dir / name)

    def log(self):
        path = self.dir / "blind-log.json"
        return load(path) if path.exists() else {"solved": {}, "judged": []}


def cmd_slices(work: Work, args) -> None:
    """One brief per blueprint quiz, plus WORK/stems.txt from the current outline."""
    topic = work.blueprint_topic()
    outline = load(work.root / "outline.json")
    lines = []
    for t in outline["topics"]:
        for q in t.get("quizzes", []):
            lines.append(f"## {t['name']}{SEP}{q['name']}")
            lines += [f"- {stem}" for stem in q.get("stems", [])]
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
                "sourceLedger": str(work.root / "sources.json"),
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
    refs = set(load(Path(args.refs))) if args.refs else None
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
        if len(rows) >= 10 and (direct < 0.5 or shifted > direct):
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
    """Split items into the standards pass and the escalated set after the first blind round."""
    batch = work.batch(args.batch)
    log = work.log()
    standards, escalated = [], []
    for ref, _, item in items_of(batch):
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
        if why:
            escalated.append({"ref": ref, "reasons": why})
        else:
            standards.append({"ref": ref, **item})
    dump(work.dir / "standards-input.json", standards)
    dump(work.dir / "escalated.json", escalated)
    print(f"{len(standards)} to the standards pass, {len(escalated)} escalated")


def cmd_route_standards(work: Work, args) -> None:
    """Keep only flaw, metadata and correction edits; send the rest to judgment or replacement."""
    batch = {ref: item for ref, _, item in items_of(work.batch(args.batch))}
    review = load(work.dir / "review-standards.json")
    flagged = load(work.dir / "standards-escalate.json")
    escalated = load(work.dir / "escalated.json")
    replace = []
    known = {e["ref"] for e in escalated}

    def escalate(ref, reason):
        if ref in known:
            next(e for e in escalated if e["ref"] == ref)["reasons"].append(reason)
        else:
            escalated.append({"ref": ref, "reasons": [reason]})
            known.add(ref)

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
            )
    for row in flagged:
        if "near-duplicate" in row["reason"].lower():
            replace.append({"ref": row["ref"], "reason": row["reason"]})
        else:
            escalate(row["ref"], f"Standards reviewer: {row['reason']}")
    replacing = {r["ref"] for r in replace}
    escalated = [e for e in escalated if e["ref"] not in replacing]
    kept = [e for e in kept if e["ref"] not in replacing]
    dump(work.dir / "review-standards.json", kept)
    dump(work.dir / "escalated.json", escalated)
    dump(
        work.dir / "replace.json",
        [
            {
                **r,
                "item": {k: batch[r["ref"]][k] for k in ("answer", "metadata", "stem")},
            }
            for r in replace
        ],
    )
    print(
        f"{len(kept)} standards edits kept, {len(escalated)} escalated, {len(replace)} to replace"
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
            }
        )
        log["judged"].append(content_hash(item))
    dump(work.dir / "judgment-input.json", rows)
    dump(work.dir / "blind-log.json", log)
    print(f"{len(rows)} items for judgment")


def cmd_apply(work: Work, args) -> None:
    """Apply review edits as written; refuse unknown refs and fields and undersized quizzes."""
    out_path = work.dir / args.output
    if out_path.exists():
        sys.exit(f"{out_path} already exists.")
    batch = work.batch(args.batch)
    items = {ref: item for ref, _, item in items_of(batch)}
    entries = [entry for name in args.reviews for entry in load(work.dir / name)]
    errors, drop, rewritten = [], set(), []
    for entry in entries:
        ref, edits = entry.get("ref"), entry.get("edits", {})
        if ref not in items:
            errors.append(f"{ref}: no such item.")
            continue
        if entry.get("drop"):
            drop.add(ref)
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
        if len(item["choices"]) != 4 or item["answer"] not in ("A", "B", "C", "D"):
            errors.append(f"{ref}: choices and answer don't match.")
        if {"stem", "choices", "answer"} & edits.keys() and ref not in rewritten:
            rewritten.append(ref)
    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            gone = sum(
                SEP.join((topic["name"], quiz["name"], str(n))) in drop
                for n in range(1, len(quiz["items"]) + 1)
            )
            if gone and len(quiz["items"]) - gone < args.min:
                errors.append(
                    f"{quiz['name']}: dropping {gone} leaves fewer than {args.min}; replace instead."
                )
    if errors:
        sys.exit("\n".join(errors))
    for topic in batch["topics"]:
        for quiz in topic["quizzes"]:
            quiz["items"] = [
                item
                for n, item in enumerate(quiz["items"], 1)
                if SEP.join((topic["name"], quiz["name"], str(n))) not in drop
            ]
    dump(out_path, batch)
    dump(work.dir / f"rewritten-{Path(args.output).stem}.json", rewritten)
    print(
        json.dumps(
            {
                "applied": len(entries) - len(drop),
                "dropped": sorted(drop),
                "rewritten": len(rewritten),
                "rewrittenFile": f"rewritten-{Path(args.output).stem}.json",
            },
            ensure_ascii=False,
        )
    )


def cmd_ready(work: Work, args) -> None:
    """Every item must have a clean blind solve of its current content, or have been judged as is."""
    log = work.log()
    judged = set(log["judged"])
    missing = []
    for ref, _, item in items_of(work.batch(args.batch)):
        digest = content_hash(item)
        if digest in judged:
            continue
        if not any(
            s["hash"] == digest and s["clean"] for s in log["solved"].get(ref, [])
        ):
            missing.append(ref)
    if missing:
        sys.exit(
            "Not ready; these need a blind solve of their current content (or a fix):\n"
            + "\n".join(missing)
        )
    print("Ready to stage.")


def cmd_ledger(work: Work, args) -> None:
    """Merge every topic's sources-<n>.json into WORK/sources.json."""
    path = work.root / "sources.json"
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


KEEP = {"blueprint.json", "sources.json"}


def cmd_clean(work: Work, args) -> None:
    """Merge the ledger, then delete everything but blueprint.json and sources.json."""
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
        ("route-standards", cmd_route_standards, ["batch"]),
        ("judge-input", cmd_judge_input, ["batch", "round"]),
        ("apply", cmd_apply, ["batch", "output", "min"]),
        ("ready", cmd_ready, ["batch"]),
        ("ledger", cmd_ledger, []),
        ("clean", cmd_clean, []),
    ]:
        p = sub.add_parser(name, help=fn.__doc__)
        p.add_argument(
            "topic", nargs="?" if name in ("ledger", "clean") else None, default=""
        )
        for opt in opts:
            if opt == "min":
                p.add_argument("--min", type=int, default=50)
            elif opt.endswith("?"):
                p.add_argument(f"--{opt[:-1]}")
            else:
                p.add_argument(f"--{opt}", required=True)
        if name == "apply":
            p.add_argument("reviews", nargs="+")
        p.set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(Work(args.work, args.topic), args)


if __name__ == "__main__":
    main()
