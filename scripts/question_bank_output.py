"""Output helpers for the source-derived question bank builder."""
from __future__ import annotations

import json
from pathlib import Path


def write_partial(partials: Path, subject_id: str, name: str, subjects: list, quizzes: list, questions: list, review: list) -> None:
    partials.mkdir(parents=True, exist_ok=True)
    payload = {
        'subjects': [subject for subject in subjects if subject['id'] == subject_id],
        'quizzes': quizzes,
        'questions': questions,
        'review': review,
    }
    (partials / f'{subject_id}--{name}.json').write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n')
    print(f'Wrote partial {name}: {len(questions)} questions; {len(review)} PDF(s) need review.')


def write_question_bank(output: Path, report: Path, subjects: list, quizzes: list, questions: list, review: list) -> None:
    output.write_text(json.dumps({'subjects': subjects, 'quizzes': quizzes, 'questions': questions}, ensure_ascii=False, indent=2) + '\n')
    report.parent.mkdir(exist_ok=True)
    report.write_text(json.dumps(review, indent=2) + '\n')
    print(f'Wrote {len(questions)} questions; {len(review)} PDF(s) need review.')
    if review:
        print(json.dumps(review, indent=2))
