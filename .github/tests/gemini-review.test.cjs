const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const workflow = YAML.parse(fs.readFileSync(path.join(__dirname, '../workflows/gemini-review.yml'), 'utf8'));
const run = new (Object.getPrototypeOf(async function () {}).constructor)(
  'github', 'context', 'core', 'fetch', 'process', workflow.jobs.review.steps[0].with.script,
);
const source = { filename: 'frontend/src/example.js', status: 'modified',
  patch: '@@ -2,2 +2,3 @@\n context\n-old\n+new\n+added' };
const finding = { path: source.filename, line: 3, severity: 'HIGH', title: 'Bug', body: 'Trigger and impact.' };

async function execute(options = {}) {
  const posted = [], requests = [], notices = [], failures = [];
  const pr = { state: 'open', draft: false, head: { sha: 'abc', repo: { full_name: 'owner/repo' } }, base: { ref: 'dev' }, ...options.pr };
  let reads = 0;
  const github = {
    rest: { pulls: {
      get: async () => ({ data: ++reads === 1 ? pr : { ...pr, ...options.latest } }),
      listReviews: 'reviews', listFiles: 'files',
      createReview: async review => posted.push(review),
    } },
    paginate: async endpoint => endpoint === 'reviews' ? options.reviews || [] : options.files || [source],
  };
  const core = {
    notice: message => notices.push(message), setFailed: message => failures.push(message),
    summary: { addRaw() { return this; }, async write() {} },
  };
  const fetch = async (url, init) => {
    requests.push({ url, ...init, body: JSON.parse(init.body) });
    return { ok: options.httpStatus === undefined, status: options.httpStatus,
      json: async () => options.response || { status: 'completed', steps: [
        { type: 'thought', signature: 'not-output' },
        { type: 'model_output', content: [{ type: 'text', text: JSON.stringify(options.result || { summary: 'Review', findings: [finding] }) }] },
      ] },
    };
  };
  await run(github, { repo: { owner: 'owner', repo: 'repo' } }, core, fetch, {
    env: { REVIEW_PR_NUMBER: options.number || '1', GEMINI_API_KEY: options.missingKey ? '' : 'test-only', GEMINI_REVIEW_MODEL: 'gemini-3.8-flash' },
  });
  return { posted, requests, notices, failures };
}

test('workflow has least privilege and does not check out PR code', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read', 'pull-requests': 'write' });
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.deepEqual(workflow.on.pull_request.branches, ['main', 'dev']);
  assert.equal(workflow.jobs.review.steps.length, 1);
  assert.match(workflow.jobs.review.steps[0].uses, /^actions\/github-script@[a-f0-9]{40}$/);
  const ci = YAML.parse(fs.readFileSync(path.join(__dirname, '../workflows/ci.yml'), 'utf8'));
  assert.deepEqual(Object.keys(ci.jobs).sort(), ['automation', 'backend', 'frontend', 'postgres']);
  assert.deepEqual(ci.permissions, { contents: 'read' });
});

test('publishes COMMENT review anchored to added lines, using stateless API without tools', async () => {
  const { posted, requests } = await execute();
  assert.equal(posted[0].event, 'COMMENT');
  assert.equal(posted[0].commit_id, 'abc');
  assert.equal(posted[0].comments[0].line, 3);
  assert.equal(posted[0].comments[0].side, 'RIGHT');
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.tools, undefined);
  assert.equal(requests[0].body.response_format.mime_type, 'application/json');
  assert.equal(requests[0].headers['x-goog-api-key'], 'test-only');
});

test('missing secret explicitly fails without an API call or a fake review', async () => {
  const result = await execute({ missingKey: true });
  assert.equal(result.failures.length, 1);
  assert.equal(result.requests.length + result.posted.length, 0);
});

test('main release PRs are also reviewed', async () => {
  assert.equal((await execute({ pr: { base: { ref: 'main' } } })).posted.length, 1);
});

test('fork, draft, closed and unrelated-base PRs cannot consume the API key', async () => {
  for (const pr of [{ head: { repo: { full_name: 'fork/repo' } } }, { draft: true }, { state: 'closed' }, { base: { ref: 'other' } }]) {
    const result = await execute({ pr });
    assert.equal(result.requests.length + result.posted.length, 0);
  }
});

test('duplicate bot review prevents another charge; user marker cannot suppress review', async () => {
  const body = '<!-- gemini-review:abc -->';
  assert.equal((await execute({ reviews: [{ body, user: { login: 'github-actions[bot]' } }] })).requests.length, 0);
  assert.equal((await execute({ reviews: [{ body, user: { login: 'owner' } }] })).requests.length, 1);
});

test('secret-like paths, locks, binaries and removed files are excluded', async () => {
  const names = ['frontend/.env.production', 'backend/application-secret.yml', 'frontend/pnpm-lock.yaml', 'private.key', 'image.png'];
  const result = await execute({ files: [source, ...names.map(filename => ({ ...source, filename })), { ...source, status: 'removed' }] });
  assert.deepEqual(JSON.parse(result.requests[0].body.input).files.map(file => file.path), [source.filename]);
});

test('empty and oversized diffs make no API request', async () => {
  for (const files of [[], [{ ...source, patch: '+' + 'x'.repeat(120001) }]]) {
    assert.equal((await execute({ files })).requests.length, 0);
  }
});

test('invalid, context-line and duplicate findings are not published inline', async () => {
  const result = await execute({ result: { summary: 'Test', findings: [null, {}, finding, finding,
    { ...finding, line: 2 }, { ...finding, path: 'unknown.java' }, { ...finding, severity: 'LOW' }] } });
  assert.equal(result.posted[0].comments.length, 1);
  assert.match(result.posted[0].body, /6 unpublishable/);
});

test('changed head cannot receive a stale review', async () => {
  assert.equal((await execute({ latest: { head: { sha: 'new' } } })).posted.length, 0);
});

test('model HTML, links and mentions are neutralized', async () => {
  const result = await execute({ result: { summary: '<img src="https://evil.invalid/"> @owner', findings: [] } });
  assert.doesNotMatch(result.posted[0].body, /<img|https:\/\/evil|@owner/);
});

test('API failures and malformed model output do not publish a review', async () => {
  await assert.rejects(execute({ httpStatus: 429 }), /HTTP 429/);
  await assert.rejects(execute({ response: { status: 'failed' } }), /did not complete/);
  await assert.rejects(execute({ response: { status: 'completed', steps: [] } }), /invalid review JSON/);
  await assert.rejects(execute({ result: { summary: 1, findings: [] } }), /invalid review schema/);
});

test('PR number input cannot become shell or script instructions', async () => {
  await assert.rejects(execute({ number: '1; echo unsafe' }), /positive pull request/);
});
