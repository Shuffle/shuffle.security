import { expect, test } from 'vitest';
import { extractCleanDisplayPrompt, composeDocPromptInput } from '@/lib/docsPromptContext';
test('short form hidden', () => {
  expect(extractCleanDisplayPrompt('Answer the users question about Shuffle Shuffle documentation:\n\nHow do I log in?')).toBe('How do I log in?');
  const c = composeDocPromptInput('How do I log in?', '/docs', 'Docs', null);
  expect(c).not.toMatch(/Shuffle Shuffle/);
  expect(extractCleanDisplayPrompt(c)).toBe('How do I log in?');
  expect(composeDocPromptInput(c)).toBe(c);
});
