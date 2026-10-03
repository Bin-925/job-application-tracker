const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('development PostgreSQL is persistent, loopback-only, and distinct from load tests', () => {
  const config = YAML.parse(read('docker/postgres/compose.yaml'));
  const db = config.services.postgres;
  assert.equal(config.name, 'jobtracker-dev');
  assert.equal(db.container_name, 'jobtracker-postgres');
  assert.deepEqual(db.ports, ['127.0.0.1:5433:5432']);
  assert.ok(db.volumes.includes('data:/var/lib/postgresql/data'));
  assert.equal(config.volumes.data.name, 'jobtracker-postgres-data');
  assert.equal(db.tmpfs, undefined);
  assert.equal(db.environment.POSTGRES_PASSWORD, undefined);
  assert.equal(db.environment.POSTGRES_HOST_AUTH_METHOD, undefined);
  assert.equal(db.environment.POSTGRES_PASSWORD_FILE, '/run/secrets/admin_password');
  assert.deepEqual(db.secrets, ['admin_password', 'app_password']);
});

test('initial application role has no cluster administration privileges', () => {
  const init = read('docker/postgres/init-app.sh');
  assert.ok(init.includes('NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'));
  assert.ok(init.includes("PASSWORD :'app_password'"));
  assert.ok(init.includes('ALTER DATABASE jobtracker OWNER TO jobtracker'));
  assert.ok(read('.gitattributes').includes('docker/postgres/*.sh text eol=lf'));
});
