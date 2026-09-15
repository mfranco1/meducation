#!/usr/bin/env python3
"""Build source-derived runtime JSON from every PDF in tn-pdfs/*/tests.

This is a mechanical extraction only: wording/choice order are retained from the
PDF text layer, source answers are retained separately, and any ambiguous parse
is rejected into content/review-report.json rather than shipped as ready.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tn-pdfs'
OUT = ROOT / 'src/content/questionBank.generated.json'
REPORT = ROOT / 'content/review-report.json'
PARTIALS = ROOT / 'content/extracted'

SUBJECT_NAMES = {'anat_histo':'Anatomy & Histology','biochem':'Biochemistry','leg_med':'Legal Medicine','medicine':'Internal Medicine','micropara':'Microbiology & Parasitology','ob':'Obstetrics & Gynecology','patho':'Pathology','pedia':'Pediatrics','pharm':'Pharmacology','physio':'Physiology','prev_med':'Preventive Medicine','surg':'Surgery'}

def slug(value: str) -> str:
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', value.lower())).strip('-')

def clean(value: str) -> str:
    # PDF text layers encode spacing as tabs. Preserve line structure, normalizing only layout spacing.
    value = value.replace('\u00a0', ' ').replace('\t', ' ')
    return '\n'.join(re.sub(r' {2,}', ' ', line).strip() for line in value.splitlines()).strip()

QUESTION = re.compile(r'(?m)^\s*(\d{1,3})\.\s*$')
CHOICE = re.compile(r'(?m)^\s*([A-D])\.\s*')
ANSWER = re.compile(r'(?i)\banswer\s*:\s*([A-D])\s*\.')

def parse_question_block(block: str):
    options = list(CHOICE.finditer(block))
    if len(options) != 4 or [x.group(1) for x in options] != list('ABCD'):
        return None
    stem = clean(block[:options[0].start()])
    choices = []
    for index, match in enumerate(options):
        end = options[index + 1].start() if index + 1 < len(options) else len(block)
        text = clean(block[match.end():end])
        if not text: return None
        choices.append({'id': match.group(1), 'text': text})
    return stem, choices

def extract(path: Path, subject_id: str):
    reader = PdfReader(str(path))
    page_text = [page.extract_text() or '' for page in reader.pages]
    full = '\n'.join(page_text)
    # Questions always precede the first discussion page in this test series.
    source_questions = full.split('DISCUSSION', 1)[0]
    matches = list(QUESTION.finditer(source_questions))
    parsed = []
    for i, match in enumerate(matches):
        end = matches[i+1].start() if i+1 < len(matches) else len(source_questions)
        result = parse_question_block(source_questions[match.end():end])
        if result:
            number = int(match.group(1)); stem, choices = result
            parsed.append((number, stem, choices))
    answers = ANSWER.findall(full)
    return parsed, answers, len(reader.pages)

def main():
    requested = sys.argv[1:]
    pdf_only = requested and requested[0] == '--pdf'
    if pdf_only:
        if len(requested) != 2: raise SystemExit('Usage: build_question_bank.py --pdf tn-pdfs/<subject>/tests/<file>.pdf')
        pdf = ROOT / requested[1]
        subject_id = pdf.parts[-3]
        if subject_id not in SUBJECT_NAMES or not pdf.exists(): raise SystemExit(f'Invalid source PDF: {requested[1]}')
        subject_ids = [subject_id]
    else:
        subject_ids = requested or list(SUBJECT_NAMES)
    unknown = set(subject_ids) - set(SUBJECT_NAMES)
    if unknown: raise SystemExit(f'Unknown subjects: {", ".join(sorted(unknown))}')
    subjects = [{'id': id, 'name': name, 'description': 'Practice tests from the source collection', 'accent': ['#b9511b','#c67428','#9b4a2d'][n % 3]} for n, (id, name) in enumerate(SUBJECT_NAMES.items())]
    quizzes, questions, review = [], [], []
    for subject_id in subject_ids:
        pdfs = [pdf] if pdf_only else sorted((SOURCE / subject_id / 'tests').glob('*.pdf'))
        for pdf in pdfs:
            relative = pdf.relative_to(ROOT).as_posix(); quiz_id = f'{subject_id}-{slug(pdf.stem)}'
            try: parsed, answers, pages = extract(pdf, subject_id)
            except Exception as exc:
                review.append({'file': relative, 'reason': f'Extraction error: {exc}'}); continue
            answer_map = {i + 1: value for i, value in enumerate(answers)}
            ready = bool(parsed) and len(parsed) == len(answers) and [n for n,_,_ in parsed] == list(range(1, len(parsed) + 1))
            quizzes.append({'id':quiz_id,'subjectId':subject_id,'name':re.sub(r'^\w+\s*-\s*', '', pdf.stem).title(),'sourcePdf':relative,'questionCount':len(parsed),'status':'ready' if ready else 'needs_review'})
            if not ready:
                review.append({'file':relative,'reason':'Parser count/order mismatch','parsedQuestions':len(parsed),'sourceAnswers':len(answers),'pages':pages})
                continue
            for number, stem, choices in parsed:
                questions.append({'id':f'{quiz_id}-q-{number}','subjectId':subject_id,'quizId':quiz_id,'questionNumber':number,'stem':stem,'choices':choices,'sourceAnswer':answer_map[number],'answerSource':'provided_key','metadata':{'discipline':SUBJECT_NAMES[subject_id],'difficulty':'unknown'},'source':{'pdfFile':relative}})
            print(f'OK {relative}: {len(parsed)} questions')
    if requested:
        PARTIALS.mkdir(parents=True, exist_ok=True)
        name = slug(pdf.stem) if pdf_only else subject_ids[0]
        (PARTIALS / f'{subject_ids[0]}--{name}.json').write_text(json.dumps({'subjects':[x for x in subjects if x['id'] == subject_ids[0]],'quizzes':quizzes,'questions':questions,'review':review}, ensure_ascii=False, indent=2) + '\n')
        print(f'Wrote partial {name}: {len(questions)} questions; {len(review)} PDF(s) need review.')
        return
    OUT.write_text(json.dumps({'subjects':subjects,'quizzes':quizzes,'questions':questions}, ensure_ascii=False, indent=2) + '\n')
    REPORT.parent.mkdir(exist_ok=True); REPORT.write_text(json.dumps(review, indent=2) + '\n')
    print(f'Wrote {len(questions)} questions; {len(review)} PDF(s) need review.')
    if review: print(json.dumps(review, indent=2))

if __name__ == '__main__': main()
