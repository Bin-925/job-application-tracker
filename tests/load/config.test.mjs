import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profiles, settings, scenario } from './config.mjs';

test('refuse unacknowledged, remote and ambiguous URLs', () => {
  assert.throws(() => settings({}));
  for (const BASE_URL of ['https://example.com', 'http://localhost:8080', 'http://127.0.0.1:8080',
    'http://127.0.0.1:18134@evil.test', 'http://127.0.0.1:18134/api', 'http://127.0.0.1:18134?x']) {
    assert.throws(() => settings({ BASE_URL, K6_LOCAL_ISOLATED: 'ephemeral-postgres' }));
  }
});
test('profile whitelist and bounded fixture/VU budgets', () => {
  assert.throws(() => settings({ PROFILE: '__proto__', K6_LOCAL_ISOLATED: 'ephemeral-postgres' }));
  for (const PROFILE of Object.keys(profiles)) {
    const config = settings({ PROFILE, K6_LOCAL_ISOLATED: 'ephemeral-postgres' });
    assert.ok(config.vus <= 30 && config.vus * config.records <= 2500);
    assert.ok(scenario(config).executor);
  }
  assert.equal(scenario(settings({ K6_LOCAL_ISOLATED: 'ephemeral-postgres' })).iterations, 2);
});
