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
    '.local/upgrade-results/**/result.json',
    '.local/release-results/**/result.json',
    '.local/release-results/**/k6.json',
  ]);
  assert.equal(upload.with['retention-days'], 7);
});

test('release build retains lock policy, runtime isolation and mandatory k6', () => {
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  assert.match(dockerfile, /COPY frontend\/package.json frontend\/pnpm-lock.yaml frontend\/pnpm-workspace.yaml/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /USER 10001:10001/);
  const ignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');
  for (const pattern of ['**/.env*', '**/application-secret.*', '**/.git', '**/node_modules']) assert.ok(ignore.includes(pattern));
  const compose = YAML.parse(fs.readFileSync(path.join(root, 'tests/release/compose.yaml'), 'utf8'));
  assert.equal(compose.volumes, undefined);
  assert.equal(compose.services.postgres.volumes, undefined);
  assert.equal(compose.services.postgres.container_name, undefined);
  assert.deepEqual(compose.services.postgres.ports, ['127.0.0.1:15593:5432']);
  assert.deepEqual(compose.services.postgres.tmpfs, ['/var/lib/postgresql/data:size=536870912']);
  const ci = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  assert.ok(ci.jobs.registration.steps.some(step => step.run === 'node tests/release/run.cjs'));
  const load = fs.readFileSync(path.join(root, 'tests/release/load.js'), 'utf8');
  assert.match(load, /__ENV.BASE_URL !== 'http:\/\/127.0.0.1:18593'/);
  assert.match(load, /rate==1/);
});

test('upgrade CI pins its old baseline and uses a disposable loopback database', () => {
  const ci = YAML.parse(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
  const baseline = ci.jobs.registration.steps.find(step => step.with?.path === '.local/upgrade-baseline');
  assert.equal(baseline.with.ref, 'cab180b0aba3fc7c58a25f530eb5722b8e70304b');
  assert.equal(baseline.with['persist-credentials'], false);
  const compose = YAML.parse(fs.readFileSync(path.join(root, 'tests/upgrade/compose.yaml'), 'utf8'));
  assert.equal(compose.volumes, undefined);
  assert.deepEqual(Object.keys(compose.services), ['postgres']);
  const db = compose.services.postgres;
  assert.equal(db.volumes, undefined);
  assert.equal(db.container_name, undefined);
  assert.deepEqual(db.ports, ['127.0.0.1:15591:5432']);
  assert.deepEqual(db.tmpfs, ['/var/lib/postgresql/data:size=536870912']);
  assert.equal(db.labels['com.jobtracker.purpose'], 'upgrade-check');
  assert.ok(ci.jobs.backend.steps.some(step => step.run === '../scripts/Audit-Dependencies.ps1 -BackendOnly'));
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
