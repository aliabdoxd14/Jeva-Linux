#!/usr/bin/env node
/**
 * serve-dist.mjs — static server for the recovered upstream bundle.
 *
 * The upstream project builds its web UI with Vite on port 1460; this serves
 * the same tree from `upstream-dist/` so `tauri dev` can attach to it.
 */

import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { join, extname, resolve, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIST = resolve(ROOT, process.env.JEVA_DIST || 'upstream-dist')
const PORT = Number(process.env.PORT || 1460)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
}

if (!existsSync(DIST)) {
  console.error(`[serve] ${DIST} does not exist — run \`npm run sync\` first`)
  process.exit(1)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  let pathname = decodeURIComponent(url.pathname)
  if (pathname.endsWith('/')) pathname += 'index.html'

  // Keep the served path inside DIST.
  const target = join(DIST, normalize(pathname).replace(/^(\.\.[/\\])+/, ''))
  if (!target.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden')
    return
  }

  let file = target
  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, 'index.html') // SPA fallback
  }
  if (!existsSync(file)) {
    res.writeHead(404).end('Not found')
    return
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  })
  createReadStream(file).pipe(res)
})

server.listen(PORT, () => {
  console.log(`[serve] ${DIST} -> http://localhost:${PORT}`)
})
