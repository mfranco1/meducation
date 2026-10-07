import type { StoredQuestionBank } from '../../content/schema/schema';
import { sha256Text } from '../../domain/contentDigest';

/** Canonical JSON formatting used for snapshots, downloads, and revision input. */
export function serializeBank(bank: StoredQuestionBank): string {
  return `${JSON.stringify(bank, null, 2)}\n`;
}

export async function revisionForBank(bank: StoredQuestionBank): Promise<string> {
  return sha256Text(serializeBank(bank));
}

export function cloneBank(bank: StoredQuestionBank): StoredQuestionBank {
  return JSON.parse(JSON.stringify(bank)) as StoredQuestionBank;
}
