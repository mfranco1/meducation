import { describe, expect, it } from 'vitest';
import fixtures from '../../../tests/fixtures/paired-authoring-cases.json';
import { validateAuthoringPair } from './pairedAuthoringValidation';
import { AuthoringJsonError, parseAuthoringJson } from './parseAuthoringJson';
import limits from './authoringLimits.json';

function candidate(changes: typeof fixtures.cases[number]['changes']) {
  const pair = structuredClone(fixtures.base);
  for (const change of changes) {
    let parent: unknown = pair;
    for (const key of change.path.slice(0, -1)) parent = (parent as Record<string | number, unknown>)[key];
    (parent as Record<string | number, unknown>)[change.path.at(-1)!] = change.value;
  }
  return pair;
}
describe('shared HTTP authoring policy', () => {
  for (const fixture of fixtures.cases) it(fixture.id, () => {
    const pair = candidate(fixture.changes);
    const before = JSON.stringify(pair);
    expect(validateAuthoringPair(pair).totalIssues === 0).toBe(fixture.valid);
    expect(JSON.stringify(pair)).toBe(before);
  });
  for (const fixture of fixtures.wireCases) it(fixture.id, () => {
    try { parseAuthoringJson(fixture.text); throw new Error('Unexpected acceptance'); }
    catch (error) { expect(error).toBeInstanceOf(AuthoringJsonError); expect((error as AuthoringJsonError).code).toBe(fixture.code); }
  });
  it('bounds diagnostics without hiding validation failure or echoing authored text', () => {
    const pair = structuredClone(fixtures.base);
    pair.quizzes.questions[0].stem = '<script>private sentinel</script>'.repeat(300);
    const found = validateAuthoringPair(pair);
    expect(found.totalIssues).toBeGreaterThan(limits.maxIssues);
    expect(found.issues).toHaveLength(limits.maxIssues);
    expect(found.truncated).toBe(true);
    expect(JSON.stringify(found)).not.toContain('private sentinel');
  });
  it('admits literal escaped JSON delimiters and rejects oversized text', () => {
    const literal = '{"[]}';
    expect(parseAuthoringJson(JSON.stringify({ x: literal }))).toEqual({ x: literal });
    const pair = structuredClone(fixtures.base);
    pair.quizzes.questions[0].stem = 'x'.repeat(limits.maxStringBytes + 1);
    expect(validateAuthoringPair(pair).issues[0].code).toBe('string_limit');
    expect(validateAuthoringPair(pair).issues[0].path).toBe('$.pair.quizzes.questions[0].stem');
  });
});
