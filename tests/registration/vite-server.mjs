import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js'
import config from '../../frontend/vite.config.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../../frontend/', import.meta.url))
const cache = process.env.REGISTRATION_CACHE_ID
if (!/^[a-z0-9-]+$/.test(cache || '')) throw new Error('An isolated cache ID is required')
const server = await createServer({
  ...config,
  configFile: false,
  root,
  cacheDir: path.resolve(root, '../.local/registration-cache', cache),
  clearScreen: false,
  server: { host: '127.0.0.1', port: 18588, strictPort: true, proxy: { '/api': 'http://127.0.0.1:18587' } },
})
await server.listen()
