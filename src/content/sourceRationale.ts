const bullet = /^(?<indent>\s*)(?:[•●▪*-]|o)\s+(?<text>.+)$/;
const ordered = /^(?<indent>\s*)\d+[.)]\s+(?<text>.+)$/;
const choiceLabel = /^[A-D]$/;
const choiceStart = /^([A-D])(?:\s+(.+))?$/;

export function splitRationaleSources(source: string): { body: string; sources?: string } {
  const markers = [...source.matchAll(/\b(?:Sources?|References)\s*:/gi)];
  const marker = markers.at(-1);
  if (!marker || marker.index === undefined || marker.index < source.length * .4 || source[marker.index - 1] === '(') {
    return { body: source };
  }

  const body = source.slice(0, marker.index).trimEnd();
  const sources = source.slice(marker.index).trim();
  const linesAfterMarker = sources.split('\n').slice(1);
  const looksLikeTeachingContent = sources.length > 1200 || linesAfterMarker.some(line =>
    /^\s*(?:[•●▪]|o)\s+/.test(line) || /^\s*[A-Z][A-Z /()\-]{5,}\s*$/.test(line),
  );
  if (looksLikeTeachingContent) return { body: source };
  return body && sources ? { body, sources } : { body: source };
}

function formatSourceRationaleCandidate(source: string, allowChoices = true): string {
  const lines = source.replace(/\r/g, '').split('\n').filter(line => line.trim());
  const labels = lines.map(line => choiceStart.exec(line.trim())?.[1]).filter((label): label is string => Boolean(label));
  if (allowChoices && labels.slice(0, 4).join('') === 'ABCD') return formatChoiceDiscussion(lines);

  const result: string[] = [];
  let prose: string[] = [];
  let previousWasList = false;
  const append = (line: string, isList = false) => {
    if (result.length && !(isList && previousWasList)) result.push('');
    result.push(line);
    previousWasList = isList;
  };
  const flush = () => {
    if (prose.length) append(prose.join(' '));
    prose = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^[•●▪]$/.test(line)) continue;
    const list = bullet.exec(line) ?? ordered.exec(line);
    if (list?.groups?.text) {
      flush();
      const marker = ordered.test(line) ? '1.' : '-';
      const indent = /^\s*o\s+/.test(line) ? '  ' : '';
      append(`${indent}${marker} ${list.groups.text}`, true);
      continue;
    }
    if (choiceLabel.test(line)) {
      flush();
      append(`**${line}**`);
      continue;
    }
    prose.push(line);
  }

  flush();
  return result.join('\n');
}

function formatChoiceDiscussion(lines: string[]): string {
  const sections: string[] = [];
  const opening: string[] = [];
  const trailing: string[] = [];
  let label = '';
  let content: string[] = [];
  let inTrailing = false;
  const flushChoice = () => {
    if (label) sections.push(`- **${label}** ${content.join(' ').trim()}`.trim());
    content = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (label === 'D' && /^(?:[•●▪]|\d+[.)])\s+/.test(line)) {
      flushChoice();
      label = '';
      inTrailing = true;
    }
    if (inTrailing) {
      trailing.push(rawLine);
      continue;
    }

    const match = choiceStart.exec(line);
    const isNextChoice = match && (label ? match[1].charCodeAt(0) === label.charCodeAt(0) + 1 : match[1] === 'A');
    if (isNextChoice && match) {
      flushChoice();
      label = match[1];
      if (match[2]) content.push(match[2]);
    } else if (label) {
      content.push(line);
    } else {
      opening.push(line);
    }
  }
  flushChoice();

  return [
    opening.length ? formatSourceRationaleCandidate(opening.join('\n'), false) : '',
    sections.join('\n'),
    trailing.length ? formatSourceRationaleCandidate(trailing.join('\n'), false) : '',
  ].filter(Boolean).join('\n\n');
}

export function formatSourceRationale(source: string): string {
  const candidate = formatSourceRationaleCandidate(source);
  return normalizedExplanationText(source) === normalizedExplanationText(candidate)
    ? candidate
    : formatSourceRationaleCandidate(source, false);
}

/** Normalizes only documented layout syntax for source-preservation checks. */
export function normalizedExplanationText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => !/^[•●▪]$/.test(line))
    .map(line => line.replace(/^(?:[•●▪*-]|o|\d+[.)])\s+/, '').replace(/\*\*/g, '').replace(/\*/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function preservesSourceRationale(source: string): boolean {
  const { body, sources } = splitRationaleSources(source);
  const formatted = [formatSourceRationale(body), sources ?? ''].filter(Boolean).join('\n');
  return normalizedExplanationText(source) === normalizedExplanationText(formatted);
}
