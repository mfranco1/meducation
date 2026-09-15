#!/usr/bin/env python3
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
partials = sorted((ROOT / 'content/extracted').glob('*.json'))
if not partials: raise SystemExit('No partial extraction files found.')
data = {'subjects': [], 'quizzes': [], 'questions': []}; review = []
for path in partials:
    item = json.loads(path.read_text())
    for key in data: data[key].extend(item[key])
    review.extend(item['review'])
data['subjects'] = list({item['id']: item for item in data['subjects']}.values())
data['quizzes'] = list({item['id']: item for item in data['quizzes']}.values())
data['questions'] = list({item['id']: item for item in data['questions']}.values())
(ROOT / 'src/content/questionBank.generated.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'content/review-report.json').write_text(json.dumps(review, indent=2) + '\n')
print(f"Merged {len(data['questions'])} questions from {len(partials)} subjects; {len(review)} PDFs require review.")
