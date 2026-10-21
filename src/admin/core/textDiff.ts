export interface DiffPart {
  text: string;
  change?: 'added' | 'removed';
}

const MAX_CELLS = 4_000_000;

const words = (text: string) => text.match(/\S+\s*|\s+/g) ?? [];

/** Word-level diff (each word keeps its trailing whitespace) from the longest common subsequence. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = words(before);
  const b = words(after);
  if (a.length * b.length > MAX_CELLS)
    return (
      [
        { text: before, change: 'removed' },
        { text: after, change: 'added' },
      ] satisfies DiffPart[]
    ).filter((part) => part.text);
  // lengths[i][j]: LCS length of a[i:] and b[j:].
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const parts: DiffPart[] = [];
  const push = (text: string, change?: DiffPart['change']) => {
    const last = parts.at(-1);
    if (last && last.change === change) last.text += text;
    else parts.push({ text, change });
  };
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push(a[i]);
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lengths[i + 1][j] >= lengths[i][j + 1])) push(a[i++], 'removed');
    else push(b[j++], 'added');
  }
  return parts;
}
