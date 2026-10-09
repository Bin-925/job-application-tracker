const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const root = path.resolve(__dirname, '../..');

test('registration CI has bounded execution, no deployment secrets, and JSON-only artifacts', () => {
  const ci = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  const job = ci.jobs.registration;
  assert.equal(job['timeout-minutes'], 15);
  assert.equal(job.permissions, undefined);
  assert.doesNotMatch(JSON.stringify(job), /secrets\.|pull_request_target/);
  const upload = job.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  assert.deepEqual(upload.with.path.trim().split('\n'), [
    '.local/registration-results/**/environment.json',
    '.local/registration-results/**/results.json',
    '.local/registration-results/**/cleanup.json',
  ]);
  assert.equal(upload.with['retention-days'], 7);
});

test('registration services are disposable and only expose dedicated loopback ports', () => {
  const compose = YAML.parse(fs.readFileSync(path.join(root, 'tests/registration/compose.yaml'), 'utf8'));
  assert.equal(compose.volumes, undefined);
  assert.deepEqual(compose.services.postgres.tmpfs, ['/var/lib/postgresql/data:size=536870912']);
  for (const service of Object.values(compose.services)) {
    assert.equal(service.volumes, undefined);
    assert.equal(service.container_name, undefined);
    assert.equal(service.labels['com.jobtracker.purpose'], 'registration-check');
    for (const port of service.ports) assert.match(port, /^127\.0\.0\.1:1558[789]:\d+$/);
  }
});
