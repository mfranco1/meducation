#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
partials = sorted((ROOT / 'content/extracted').glob('*.json'))
if not partials: raise SystemExit('No partial extraction files found.')
subjects, candidates = {}, {}
for path in partials:
    item = json.loads(path.read_text())
    subjects.update({subject['id']: subject for subject in item['subjects']})
    grouped = {}
    for question in item['questions']: grouped.setdefault(question['quizId'], []).append(question)
    reviews = {row['file']: row for row in item['review']}
    for quiz in item['quizzes']:
        if 'flashcard' in quiz['sourcePdf'].lower():
            continue
        candidate = {'quiz': quiz, 'questions': grouped.get(quiz['id'], []), 'review': reviews.get(quiz['sourcePdf']), 'mtime': path.stat().st_mtime}
        previous = candidates.get(quiz['id'])
        rank = (quiz['status'] == 'ready', len(candidate['questions']), candidate['mtime'])
        old_rank = (-1, -1, -1) if previous is None else (previous['quiz']['status'] == 'ready', len(previous['questions']), previous['mtime'])
        if previous is None or rank > old_rank: candidates[quiz['id']] = candidate
selected = list(candidates.values())
data = {'subjects': list(subjects.values()), 'quizzes': [item['quiz'] for item in selected], 'questions': [q for item in selected for q in item['questions']]}
review = [item['review'] for item in selected if item['quiz']['status'] != 'ready' and item['review']]
(ROOT / 'src/content/questionBank.generated.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'content/review-report.json').write_text(json.dumps(review, indent=2) + '\n')
print(f"Merged {len(data['questions'])} questions across {len(data['quizzes'])} quizzes; {len(review)} PDFs require review.")
