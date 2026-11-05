# Biochemistry quizzes

Writing all Biochemistry quizzes with the `write-quizzes` workflow. The blueprint is approved and lives at `var/quiz-work/biochemistry/blueprint.json` (21 topics, 47 quizzes, 2,200 questions). Text extracted from the sources is in `var/quiz-work/biochemistry/src/` (`main.txt`, `buzz.txt`, `cards.txt`). The original PDFs are in `~/Downloads/tn-pdfs/biochem/handouts/`. Blueprint page ranges refer to the main handout.

## Decisions

- Sizing follows the skill's default (2 quizzes: 50, 3 to 4: 40). Chemistry Review, Nucleic Acid Structure and Cell Biology and Biochemical Techniques keep 2 quizzes of 50 each.
- Inherited enzyme deficiencies belong to Inborn Errors, except the ones assigned to pathway quizzes. Each quiz's `excludes` lists them.
- Work in blueprint order, one quarter of the topics per session.

## Subject notes (for `SUBJECT_NOTES`)

- `src/buzz.txt` (buzzwords) and `src/cards.txt` (flashcards) are supplementary; grep them for your subtopics.
- Technique items (blotting, cloning) and disease items tend to land in the wrong quiz. Check each item against the brief's `excludes`.

## Remaining

Topics are in blueprint order. Mark each one when it is staged.

1. Chemistry Review (staged)
2. Amino Acids and Proteins (staged)
3. Hemoglobin and Hemoglobinopathies (staged)
4. Carbohydrate and Lipid Structure (staged)
5. Nucleic Acid Structure (staged)
6. Enzymes and Bioenergetics (staged)
7. Cell Biology and Biochemical Techniques (staged)
8. Nutrition (staged)
9. Vitamin Basics and Fat-Soluble Vitamins (staged)
10. Water-Soluble Vitamins (staged)
11. Minerals and Trace Elements (staged)
12. Carbohydrate Metabolism
13. Lipid Metabolism
14. Amino Acid and Protein Metabolism
15. Nucleotide Metabolism
16. Heme, Alcohol and Other Metabolism
17. Metabolic Integration and Hormones
18. Inborn Errors of Metabolism and Storage Diseases
19. DNA, RNA and Molecular Biology
20. Genetics and Inheritance
21. Immunology

After topic 21 is staged, run `clean` and delete this tracker.
