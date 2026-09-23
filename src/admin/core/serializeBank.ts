import type { StoredQuestionBank } from '../../content/schema';

/** Canonical JSON formatting used for snapshots, downloads, and revision input. */
export function serializeBank(bank: StoredQuestionBank): string {
  return `${JSON.stringify(bank, null, 2)}\n`;
}

export async function revisionForBank(bank: StoredQuestionBank): Promise<string> {
  const bytes = new TextEncoder().encode(serializeBank(bank));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `sha256-${Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

export function cloneBank(bank: StoredQuestionBank): StoredQuestionBank {
  return JSON.parse(JSON.stringify(bank)) as StoredQuestionBank;
}
