import test from 'node:test';
import assert from 'node:assert/strict';
import { profiles, additionalSettings } from './additional-config.mjs';
test('additional load runs are bounded and cannot target an ordinary or remote server', () => {
  const env = { PROFILE: 'auth', BASE_URL: 'http://127.0.0.1:18134', K6_LOCAL_ISOLATED: 'ephemeral-postgres' };
  for (const BASE_URL of ['http://127.0.0.1:8080', 'https://example.com', 'http://127.0.0.1:18134@evil.test', 'http://127.0.0.1:18134/path']) {
    assert.throws(() => additionalSettings({ ...env, BASE_URL }));
  }
  assert.throws(() => additionalSettings({ ...env, PROFILE: '__proto__' }));
  assert.throws(() => additionalSettings({ ...env, K6_LOCAL_ISOLATED: '' }));
  for (const PROFILE of Object.keys(profiles)) {
    const { scenario } = additionalSettings({ ...env, PROFILE });
    assert.ok((scenario.maxVUs || scenario.vus) <= 30);
    assert.equal(scenario.gracefulStop, '15s');
  }
});
