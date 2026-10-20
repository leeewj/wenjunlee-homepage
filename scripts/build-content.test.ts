import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContent } from './build-content';

test('compiler: derives documents from the content tree', async () => {
  const m = await buildContent();
  const slugs = m.documents.map((d) => d.slug).sort();
  assert.deepEqual(slugs, ['bio', 'help', 'index', 'research']);
});

test('compiler: title from first h1, slug from path, default kind page', async () => {
  const m = await buildContent();
  const index = m.documents.find((d) => d.slug === 'index')!;
  assert.ok(index.title.includes('李文俊'), `title was: ${index.title}`);
  assert.equal(index.kind, 'page');
  const papers = m.documents.find((d) => d.slug === 'research')!;
  assert.equal(papers.title, 'Research');
});

test('compiler: bodies are non-empty', async () => {
  const m = await buildContent();
  for (const d of m.documents) {
    assert.ok(d.body.length > 0, `${d.slug} should have a body`);
  }
});
