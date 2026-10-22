#!/usr/bin/env node
/**
 * sync-upstream.mjs — pull the upstream Jeva release and refresh the local frontend.
 *
 * Upstream (github.com/tearerry/Jeva) is closed source: it publishes only a
 * Windows NSIS installer. The web UI inside it is a plain Vite bundle that
 * tauri-codegen embeds in the PE as a brotli-compressed blob table, so we can
 * recover it losslessly and rebuild the app for Linux.
 *
 *   node tools/sync-upstream.mjs [--tag v1.0.2] [--out upstream-dist] [--keep]
 *
 * Steps: resolve release -> download installer -> unpack NSIS -> recover assets.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync, createWriteStream } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const UPSTREAM_REPO = 'tearerry/Jeva'
const CACHE = join(ROOT, '.cache')

const argv = process.argv.slice(2)
const flag = (name, dflt = null) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? (argv[i + 1] ?? true) : dflt
}
const has = (name) => argv.includes(`--${name}`)

const TAG = flag('tag')
const OUT = resolve(ROOT, flag('out', 'upstream-dist'))
const KEEP = has('keep')

const log = (...a) => console.log('[sync]', ...a)

/* ------------------------------------------------------------------ */
/* 7-Zip: use the system binary when present, otherwise fetch a private */
/* ------------------------------------------------------------------ */

const SEVENZIP_CANDIDATES = ['7zz', '7z', '7za', '7zr']

function findSevenZip() {
  for (const c of SEVENZIP_CANDIDATES) {
    try {
      execFileSync(c, ['-help'], { stdio: 'ignore' })
      return c
    } catch {
      /* try next */
    }
  }
  return null
}

async function ensureSevenZip() {
  const found = findSevenZip()
  if (found) return found
  const local = join(CACHE, '7zz')
  if (existsSync(local) && (await statSync(local)).size > 0) return local
  log('no 7-Zip found, downloading a private copy…')
  mkdirSync(CACHE, { recursive: true })
  const url = 'https://github.com/ip7z/7zip/releases/download/26.05/7z2605-linux-x64.tar.xz'
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`failed to download 7-Zip: ${res.status}`)
  const tgz = join(CACHE, '7z.tar.xz')
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tgz))
  execFileSync('tar', ['xf', tgz, '-C', CACHE], { stdio: 'inherit' })
  return local
}

/* ------------------------------------------------------------------ */
/* Release resolution                                                  */
/* ------------------------------------------------------------------ */

async function resolveRelease() {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'jeva-linux-sync' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  if (TAG) {
    const r = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/releases/tags/${TAG}`, { headers })
    if (!r.ok) throw new Error(`cannot resolve tag ${TAG}: HTTP ${r.status}`)
    return r.json()
  }
  const r = await fetch(`https://api.github.com/repos/${UPSTREAM_REPO}/releases/latest`, { headers })
  if (!r.ok) throw new Error(`cannot resolve latest release: HTTP ${r.status}`)
  return r.json()
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`download failed ${url}: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  return dest
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  const release = await resolveRelease()
  log(`upstream release: ${release.tag_name} (${release.name || 'unnamed'})`)

  const asset = release.assets.find((a) => /\.exe$/i.test(a.name))
  if (!asset) throw new Error(`no Windows installer asset in ${release.tag_name}`)
  log(`installer: ${asset.name} (${(asset.size / 1024 / 1024).toFixed(2)} MB)`)

  mkdirSync(CACHE, { recursive: true })
  const installer = join(CACHE, asset.name)
  if (existsSync(installer) && statSync(installer).size === asset.size) {
    log('installer already cached, skipping download')
  } else {
    log('downloading installer…')
    await download(asset.browser_download_url, installer)
  }

  const sevenZip = await ensureSevenZip()

  const work = join(CACHE, 'unpacked')
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  log('unpacking NSIS installer…')
  execFileSync(sevenZip, ['x', '-y', `-o${work}`, installer], { stdio: 'ignore' })

  const exe = join(work, 'jeva.exe')
  if (!existsSync(exe)) throw new Error('jeva.exe not found inside the installer')
  log(`found jeva.exe (${(statSync(exe).size / 1024 / 1024).toFixed(2)} MB)`)

  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })

  const manifestPath = join(CACHE, 'upstream-manifest.json')
  log('recovering frontend assets…')
  execFileSync(
    process.execPath,
    [join(ROOT, 'tools', 'extract-assets.mjs'), exe, OUT, '--manifest', manifestPath],
    { stdio: 'inherit' },
  )

  // Record provenance so future updates can be diffed against this one.
  // It is kept *outside* the frontend directory: everything under frontendDist
  // is embedded into the binary as a web asset.
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const provenance = {
    repo: UPSTREAM_REPO,
    tag: release.tag_name,
    releaseUrl: release.html_url,
    asset: asset.name,
    assetSha256: createHash('sha256').update(readFileSync(installer)).digest('hex'),
    installerSha256: createHash('sha256').update(readFileSync(installer)).digest('hex'),
    extractedAt: new Date().toISOString(),
    assetCount: manifest.count,
    totalBytes: manifest.totalBytes,
  }
  const provenancePath = join(ROOT, 'upstream-provenance.json')
  writeFileSync(provenancePath, JSON.stringify(provenance, null, 2) + '\n')
  rmSync(manifestPath, { force: true })

  log(`done: ${manifest.count} files (${(manifest.totalBytes / 1024 / 1024).toFixed(2)} MB) -> ${OUT}`)
  log(`provenance written to ${provenancePath}`)

  if (!KEEP) rmSync(work, { recursive: true, force: true })
}

main().catch((err) => {
  console.error('[sync] ERROR:', err.message)
  process.exit(1)
})
