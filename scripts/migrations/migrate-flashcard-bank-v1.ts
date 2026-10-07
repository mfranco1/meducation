import { readFile, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { migrateFlashcardBankV1 } from './flashcardMigration.ts';
import { subjects } from '../../src/content/local/questionBank.ts';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: npm run migrate:flashcard-bank:v1 -- <legacy-bank.json>');
  process.exitCode = 2;
} else {
  try {
    const sourcePath = resolve(inputPath);
    const source = JSON.parse(await readFile(sourcePath, 'utf8')) as unknown;
    const { bank, ...report } = migrateFlashcardBankV1(source, subjects);
    const candidatePath = `${sourcePath}.v2-candidate.json`;
    const reportPath = `${sourcePath}.v2-migration-report.json`;
    await writeFile(candidatePath, `${JSON.stringify(bank, null, 2)}\n`, { flag: 'wx' });
    try {
      await writeFile(reportPath, `${JSON.stringify({ source: basename(sourcePath), ...report }, null, 2)}\n`, {
        flag: 'wx',
      });
    } catch (error) {
      console.error(`Candidate created at ${candidatePath}; report could not be written: ${String(error)}`);
      process.exitCode = 1;
    }
    if (!process.exitCode) console.log(`Candidate: ${candidatePath}\nReview report: ${reportPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Flashcard bank migration failed.');
    process.exitCode = 1;
  }
}
