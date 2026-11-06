# Microbiology & Parasitology quizzes

Run with `/write-quizzes` (skill in `.agents/skills/write-quizzes/`). The user approved the blueprint on 2026-11-06.

- Work dir: `var/quiz-work/microbiology-parasitology/` (`blueprint.json` is the approved plan: 9 topics, 32 quizzes, 1,380 questions)
- Sources: `~/Downloads/tn-pdfs/micropara/handouts/*.pdf`, extracted to `src/`. Blueprint `pages` refer to `src/main.txt` (main handout, form-feed pages). The supplementary sources `src/supertable.txt`, `src/buzzwords.txt` and `src/flashcards.txt` are part of the minimum coverage map.
- Topics: the subject's existing topics are used. The empty duplicates t237 (Spirochetes) and t238 (Mycobacteria and Intracellular Bacteria) were deleted (changes 71945, 71946). Spirochetes, mycobacteria and intracellular bacteria go into t231.
- Session split (the user asked for 3 sessions): session 1 covers Foundations, Gram-Positive and Gram-Negative. Session 2 covers Spirochetes/Mycobacteria/Intracellular, Virology and Parasitology and Medical Entomology. Session 3 covers Helminths, Medical Mycology and Clinical Microbiology Integration, then cleanup.

## Decisions

- Drugs: the Foundations antimicrobials quiz owns mechanisms, spectrum gaps and resistance. Each organism's quiz owns that organism's drug of choice. Integration › Empiric Therapy and Special Hosts owns empiric regimens by syndrome, antibiotics in pregnancy and OI prophylaxis by CD4 count.
- Toxins: Foundations owns exotoxin/endotoxin principles and comparisons. Each organism's quiz owns its own toxin and disease.
- Vectors: Medical Entomology owns arthropod identification and "which vector transmits X". Disease quizzes test the disease and may name the vector only as context.
- Integration runs last. Its items must require discrimination across organisms. Before writing it, grep `stems.txt` and list the staged points under "already staged, don't retest".
- Each topic's writer prompts get a "Topic boundary" block appended to SUBJECT_NOTES: which quiz in the topic owns which organisms or shared points, and what earlier topics already staged. Session 1's blocks are good models: Foundations (structure / growth-toxins-media / antimicrobials) and Gram-Negative (BCYE, TCBS, XLD, Thayer-Martin, ESBL and antipseudomonal drugs are already staged).
- Already staged and not to be retested by later topics: TB NAAT vs smear vs culture (Foundations), the cefotetan disulfiram-like reaction, vancomycin infusion reaction, mecA, vanA, VISA, daptomycin CK monitoring, Listeria actin motility, reactive arthritis after enteric infection, bacterial vaginosis partner treatment (ACOG 2025) and chancroid.
- Session 2 should start with Spirochetes, Mycobacteria and Intracellular Bacteria (3 × 40). Mycobacteria must use the current Philippine NTP Manual of Procedures and WHO TB guidance. Then do Virology (8 × 30) and Parasitology and Medical Entomology (4 × 40).

## Subject notes (for SUBJECT_NOTES)

- Audience: Philippine Physician Licensure Exam (PLE) and new physicians in the Philippines. Where a Philippine DOH program sets national practice (TB NTP Manual of Procedures, rabies post-exposure prophylaxis, dengue, malaria, leptospirosis, HIV), use its current edition and name it in the stem or sources. Otherwise use WHO, CDC or IDSA.
- Current nomenclature only: *Clostridioides difficile*, Enterobacterales (Proteus in Morganellaceae, Yersinia in Yersiniaceae), *Chlamydia pneumoniae/psittaci* (not Chlamydophila), *Elizabethkingia meningoseptica*, *Cutibacterium acnes*, papillomaviruses and polyomaviruses (not papovaviruses), mpox, *Talaromyces marneffei*, *Pneumocystis jirovecii*, *Giardia duodenalis* (lamblia accepted as synonym).
- Besides the brief's `source-<n>.txt`, grep `src/supertable.txt`, `src/buzzwords.txt` and `src/flashcards.txt` for your quiz's organisms and cover their tested points.

## Status

| Topic | Status |
| --- | --- |
| Microbiology Foundations | staged 2026-11-06 (q581 to q583, 120) |
| Gram-Positive Bacteria | staged 2026-11-06 (q584 to q587, 160) |
| Gram-Negative Bacteria | staged 2026-11-06 (q588 to q591, 160) |
| Spirochetes, Mycobacteria and Intracellular Bacteria | |
| Virology | |
| Parasitology and Medical Entomology | |
| Helminths | |
| Medical Mycology | |
| Clinical Microbiology Integration | |
