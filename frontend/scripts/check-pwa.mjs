import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'))
assert.equal(manifest.display, 'standalone')
assert.equal(manifest.start_url, '/')
assert.equal(manifest.scope, '/')
assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'))
for (const icon of manifest.icons) {
  const png = await readFile('dist' + icon.src)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  const [width, height] = icon.sizes.split('x').map(Number)
  assert.equal(png.readUInt32BE(16), width)
  assert.equal(png.readUInt32BE(20), height)
}
const worker = await readFile('dist/sw.js', 'utf8')
assert.ok(worker.includes('NetworkOnly'), 'API network-only rule must be present')
assert.ok(worker.includes('denylist:'), 'Navigation fallback exclusion must be generated')
console.log('PWA manifest, PNG dimensions, and generated cache-policy smoke checks passed.')
