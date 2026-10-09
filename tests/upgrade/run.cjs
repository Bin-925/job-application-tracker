const { request } = require('../../frontend/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createServer } = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const { redact } = require('../registration/safety.cjs');

const jars = process.argv.slice(2);
if (jars.length !== 2 || jars.some(p => !path.isAbsolute(p) || !p.endsWith('.jar') || !fs.statSync(p).isFile())) {
  throw new Error('Provide absolute baseline and candidate JAR paths');
}
const root = path.resolve(__dirname, '../..');
const runId = Date.now().toString(36) + '-' + randomBytes(3).toString('hex');
const project = 'jobtracker-upgrade-' + runId;
const output = path.join(root, '.local/upgrade-results', runId);
const docker = process.env.REGISTRATION_DOCKER || 'docker';
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') : 'java';
const password = randomBytes(18).toString('hex');
const env = { ...process.env, UPGRADE_DB_PASSWORD: password };
const compose = ['compose', '-p', project, '-f', path.join(__dirname, 'compose.yaml')];
const origin = 'http://127.0.0.1:18591';
const credentials = { username: 'upgrade' + randomBytes(4).toString('hex'), password: 'Upgrade' + randomBytes(8).toString('hex') };
const resetTokens = { used: randomBytes(32).toString('base64url'), expired: randomBytes(32).toString('base64url') };
const resetPassword = 'Reset' + randomBytes(8).toString('hex');
const secrets = [password, credentials.password, resetPassword, ...Object.values(resetTokens)];
const results = { checks: [], stage: 'setup', passed: false, containersRemoved: false };
const contexts = [];
let server, started = false;

function command(args) {
  return execFileSync(docker, args, { cwd: root, env, timeout: 120000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function sql(statement) {
  return command([...compose, 'exec', '-T', 'postgres', 'psql', '-U', 'upgrade_check', '-d', 'upgrade_check', '-At', '-v', 'ON_ERROR_STOP=1', '-c', statement]).trim();
}
async function portFree(port) {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Stop timeout')), 15000);
    server.once('exit', () => { clearTimeout(timeout); resolve(); });
    server.kill();
  });
}
async function start(jar, name) {
  await portFree(18591);
  server = spawn(java, ['-Xms128m', '-Xmx512m', '-jar', jar, '--spring.config.import=',
    '--spring.profiles.active=postgres', '--server.address=127.0.0.1', '--server.port=18591',
    '--spring.datasource.url=jdbc:postgresql://127.0.0.1:15591/upgrade_check',
    '--spring.datasource.username=upgrade_check', '--spring.datasource.password=' + password,
    '--spring.jpa.hibernate.ddl-auto=validate', '--spring.jpa.show-sql=false', '--spring.session.jdbc.initialize-schema=never',
    '--app.google.enabled=false', '--app.recovery-email.enabled=false', '--app.registration-email.required=false',
    '--logging.level.root=WARN', '--app.rate-limit.enabled=true', '--app.rate-limit.requests-per-ip-per-minute=300'],
  { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let spawnError = false;
  server.on('error', () => { spawnError = true; });
  for (const stream of [server.stdout, server.stderr]) {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => {
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        fs.appendFileSync(path.join(output, name + '.log'), redact(buffer.slice(0, end + 1), secrets));
        buffer = buffer.slice(end + 1);
      }
    });
  }
  for (let i = 0; i < 180; i++) {
    if (spawnError || server.exitCode !== null || server.signalCode !== null) throw new Error('Server exited');
    try { if ((await fetch(origin + '/api/v1/members/csrf', { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Wait for the owned server. */ }
    await sleep(500);
  }
  throw new Error('Readiness timeout');
}
async function client() {
  const context = await request.newContext({ baseURL: origin + '/api/v1/' });
  contexts.push(context);
  return context;
}
async function call(context, method, endpoint, data, status = 200) {
  let headers;
  if (method !== 'GET') {
    const csrf = await context.get('members/csrf'); assert.equal(csrf.status(), 200);
    const token = await csrf.json(); headers = { [token.headerName]: token.token };
  }
  const res = await context.fetch(endpoint, { method, data, headers });
  results.lastRequest = { method, endpoint, status: res.status() };
  assert.equal(res.status(), status, endpoint + ' status');
  const body = await res.text();
  if (!body) return null;
  return (res.headers()['content-type'] || '').includes('application/json') ? JSON.parse(body) : body;
}

function insertResetToken(token, expired) {
  const hash = createHash('sha256').update(token).digest('hex');
  // Only generated hexadecimal usernames/hashes enter SQL against the owned fixture DB.
  sql(`INSERT INTO password_reset_token (member_id, email, token_hash, auth_version, issued_at, expires_at)
    SELECT id, recovery_email, '${hash}', auth_version, NOW() - INTERVAL '2 hours',
    NOW() ${expired ? '-' : '+'} INTERVAL '1 hour' FROM member WHERE username = '${credentials.username}'`);
}

async function rejectOldResetTokens(context) {
  for (const token of Object.values(resetTokens)) {
    await call(context, 'POST', 'members/password-reset/confirm', { token, newPassword: 'Unused' + randomBytes(8).toString('hex') }, 400);
  }
}

(async () => {
  for (const port of [15591, 18591]) await portFree(port);
  fs.mkdirSync(output, { recursive: true });
  results.jarHashes = jars.map(p => createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
  try {
    started = true; command([...compose, 'up', '-d', '--wait']);
    results.stage = 'baseline';
    await start(jars[0], 'baseline');
    const oldClient = await client();
    await call(oldClient, 'POST', 'members/join', { ...credentials, nickname: '전환검증' }, 201);
    await call(oldClient, 'POST', 'members/login', { ...credentials, rememberMe: true });
    sql(`UPDATE member SET recovery_email = 'upgrade@example.test' WHERE username = '${credentials.username}'`);
    insertResetToken(resetTokens.used, false);
    await call(oldClient, 'POST', 'members/password-reset/confirm', { token: resetTokens.used, newPassword: resetPassword }, 204);
    credentials.password = resetPassword;
    await call(oldClient, 'POST', 'members/login', { ...credentials, rememberMe: true });
    insertResetToken(resetTokens.expired, true);
    await rejectOldResetTokens(oldClient);
    const accountSecrets = sql('SELECT password || chr(58) || auth_version FROM member');
    const member = await call(oldClient, 'GET', 'members/me');
    const fixture = { company: '전환 검증 회사', position: 'Backend', status: 'APPLIED', appliedDate: '2026-01-02',
      deadline: null, interviewDate: null, interviewTime: null, link: 'https://example.test/job', memo: '기존 데이터 유지' };
    const application = await call(oldClient, 'POST', 'applications', fixture, 201);
    await call(oldClient, 'POST', `applications/${application.id}/schedules`, {
      type: 'INTERVIEW', title: '면접 일정', date: '2027-02-28', time: '09:30', state: 'SCHEDULED',
    }, 201);
    const before = await call(oldClient, 'GET', 'applications');
    const schema = sql('SELECT version || chr(58) || checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank');
    assert.equal(schema.split('\n').length, 7);
    results.checks.push('Baseline account, application, schedule and V1-V7 created');
    await stop();
    assert.ok(Number(sql('SELECT count(*) FROM spring_session')) > 0);
    sql('BEGIN; DELETE FROM spring_session; COMMIT;');
    results.stage = 'upgrade';
    await start(jars[1], 'candidate');
    await call(oldClient, 'GET', 'members/me', undefined, 401);
    const nextClient = await client();
    await call(nextClient, 'POST', 'members/login', credentials);
    await rejectOldResetTokens(nextClient);
    assert.equal(sql('SELECT password || chr(58) || auth_version FROM member'), accountSecrets);
    assert.deepEqual(await call(nextClient, 'GET', 'members/me'), member);
    assert.deepEqual(await call(nextClient, 'GET', 'applications'), before);
    assert.equal(sql('SELECT version || chr(58) || checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank'), schema);
    const saved = await call(nextClient, 'PUT', `applications/${application.id}`, {
      ...fixture, memo: '새 버전에서 저장', version: before[0].version,
    });
    assert.ok(saved.version > before[0].version);
    await call(nextClient, 'PUT', `applications/${application.id}`, { ...fixture, version: before[0].version }, 409);
    const after = await call(nextClient, 'GET', 'applications');
    results.checks.push('Candidate preserves exact JSON, ownership IDs and Flyway checksums; stale session and stale write rejected');
    await stop();
    sql('BEGIN; DELETE FROM spring_session; COMMIT;');
    results.stage = 'rollback';
    await start(jars[0], 'rollback');
    await call(nextClient, 'GET', 'members/me', undefined, 401);
    const restoredClient = await client();
    await call(restoredClient, 'POST', 'members/login', credentials);
    await rejectOldResetTokens(restoredClient);
    assert.equal(sql('SELECT password || chr(58) || auth_version FROM member'), accountSecrets);
    assert.deepEqual(await call(restoredClient, 'GET', 'members/me'), member);
    assert.deepEqual(await call(restoredClient, 'GET', 'applications'), after);
    assert.equal(sql('SELECT version || chr(58) || checksum FROM flyway_schema_history WHERE success ORDER BY installed_rank'), schema);
    await call(restoredClient, 'DELETE', 'members/me', { currentPassword: credentials.password }, 204);
    assert.equal(sql('SELECT count(*) FROM member'), '0');
    assert.equal(sql('SELECT count(*) FROM application'), '0');
    assert.equal(sql('SELECT count(*) FROM schedule_event'), '0');
    results.checks.push('Rollback preserves candidate writes, invalidates candidate session, and deletes only the synthetic account');
    results.checks.push('Consumed and expired password-reset tokens stay invalid across both transitions; password hash and authVersion remain unchanged');
    results.passed = true; results.stage = 'completed';
  } catch (error) {
    results.errorType = error.name;
    if (typeof error.actual === 'number' && typeof error.expected === 'number') {
      results.actualStatus = error.actual; results.expectedStatus = error.expected;
    }
    process.exitCode = 1;
  } finally {
    const cleanupErrors = [];
    for (const context of contexts) {
      try { await context.dispose(); } catch { cleanupErrors.push('request-context'); }
    }
    try { await stop(); } catch { cleanupErrors.push('owned-server'); }
    if (started) {
      try { command([...compose, 'down', '--timeout', '10']); results.containersRemoved = true; }
      catch { cleanupErrors.push('owned-compose-project'); }
    }
    if (cleanupErrors.length) { results.cleanupErrors = cleanupErrors; results.passed = false; process.exitCode = 1; }
    fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(results, null, 2));
  }
  console.log(JSON.stringify(results));
  console.log('Results: ' + output);
})().catch(() => { console.error('Upgrade harness failed; inspect isolated results and owned containers.'); process.exitCode = 1; });
