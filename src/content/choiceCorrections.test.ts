import { describe, expect, it } from 'vitest';
import raw from './questionBank.generated.json';
import corrections from './choiceCorrections.json';
import { questions } from './questionBank';

describe('PDF extraction choice corrections', () => {
  it('removes only confirmed page furniture or the following case vignette', () => {
    for (const [id, choices] of Object.entries(corrections)) {
      const source = raw.questions.find(question => question.id === id);
      const displayed = questions.find(question => question.id === id);
      expect(source).toBeDefined();
      expect(displayed).toBeDefined();
      for (const [choiceId, text] of Object.entries(choices)) {
        const original = source?.choices.find(choice => choice.id === choiceId)?.text;
        expect(original?.startsWith(text)).toBe(true);
        expect(original?.length).toBeGreaterThan(text.length);
        expect(displayed?.choices.find(choice => choice.id === choiceId)?.text).toBe(text);
      }
    }
  });
});
