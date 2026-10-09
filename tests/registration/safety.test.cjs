const { test } = require('node:test');
const assert = require('node:assert/strict');
const { configuration, safePath, redact, modes } = require('./safety.cjs');

test('only bounded local scenario names and counts are accepted', () => {
  for (const mode of modes) assert.deepEqual(configuration([mode, '10']), { mode, count: 10 });
  for (const args of [[], ['remote'], ['warm', '0'], ['warm', '11'], ['warm', '1.5'], ['warm', '1', 'https://example.com']]) {
    assert.throws(() => configuration(args));
  }
});
test('diagnostic paths exclude query strings, fragments and credentials', () => {
  assert.equal(safePath('https://user:password@example.test/api/test?token=secret#private'), '/api/test');
  assert.equal(safePath('bad'), '[invalid-url]');
  assert.equal(safePath('https://example.test/' + 't'.repeat(43)), '/[redacted]');
});
test('logs mask generated secrets, token shaped values and email addresses', () => {
  const result = redact('password=short-secret user=test@example.test token=' + 't'.repeat(43), ['short-secret']);
  assert.equal(result, 'password=[redacted] user=[email] token=[redacted]');
});
