#!/usr/bin/env node
/**
 * extract-assets.mjs — Recover the frontend bundle from a Windows Tauri binary.
 *
 * Jeva (upstream, github.com/tearerry/Jeva) ships only closed-source Windows
 * builds. The web UI is embedded in the PE binary by tauri-codegen as a
 * brotli-compressed blob table, so we can recover a byte-for-byte copy of the
 * built frontend and re-use it from our own Linux build.
 *
 * Layout that this tool decodes (PE32+, little endian):
 *
 *   .rdata
 *     ├── [ asset bytes ]            brotli-compressed, one blob per file
 *     └── [ path table ]             N × 32-byte records:
 *                                      u64 path_ptr, u64 path_len,
 *                                      u64 data_ptr, u64 data_len
 *
 * Usage:
 *   node tools/extract-assets.mjs <jeva.exe> <out-dir> [--manifest <file>]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'

/** @param {Buffer} d */
function parsePe(d) {
  if (d.readUInt16LE(0) !== 0x5a4d) throw new Error('not an MZ executable')
  const pe = d.readUInt32LE(0x3c)
  if (d.readUInt32LE(pe) !== 0x00004550) throw new Error('bad PE signature')
  const nsec = d.readUInt16LE(pe + 6)
  const optsz = d.readUInt16LE(pe + 20)
  const opt = pe + 24
  if (d.readUInt16LE(opt) !== 0x20b) throw new Error('expected a 64-bit PE (PE32+)')
  const imageBase = d.readBigUInt64LE(opt + 24)
  const sections = []
  const table = opt + optsz
  for (let i = 0; i < nsec; i++) {
    const o = table + i * 40
    const name = d.toString('ascii', o, o + 8).replace(/\0+$/, '')
    const [vsize, vaddr, rsize, rptr] = [
      d.readUInt32LE(o + 8),
      d.readUInt32LE(o + 12),
      d.readUInt32LE(o + 16),
      d.readUInt32LE(o + 20),
    ]
    sections.push({ name, vaddr, vsize, rptr, rsize })
  }
  return { imageBase, sections }
}

function rvaToOffset(rva, sections) {
  for (const s of sections) {
    if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rsize)) {
      return s.rptr + (rva - s.vaddr)
    }
  }
  return null
}

const PATH_RE = /^\/[A-Za-z0-9._\-/:+@]{1,200}$/

function looksLikePath(buf) {
  if (!buf.length || buf[0] !== 0x2f /* '/' */) return false
  const s = buf.toString('ascii')
  return PATH_RE.test(s)
}

/**
 * Find the contiguous run of 32-byte path/data records.
 * @param {Buffer} d
 * @param {ReturnType<typeof parsePe>} pe
 */
function findAssetTable(d, pe) {
  const { imageBase, sections } = pe
  const rdata = sections.find((s) => s.name === '.rdata')
  if (!rdata) throw new Error('no .rdata section')
  const lo = rdata.vaddr
  const hi = rdata.vaddr + rdata.vsize

  const hits = []
  for (let off = rdata.rptr; off + 32 <= rdata.rptr + rdata.rsize; off += 8) {
    const p1 = d.readBigUInt64LE(off)
    const l1 = d.readBigUInt64LE(off + 8)
    const p2 = d.readBigUInt64LE(off + 16)
    const l2 = d.readBigUInt64LE(off + 24)
    if (l1 === 0n || l1 > 300n || l2 === 0n || l2 > 40_000_000n) continue
    const r1 = p1 - imageBase
    const r2 = p2 - imageBase
    if (r1 < BigInt(lo) || r1 >= BigInt(hi) || r2 < BigInt(lo) || r2 >= BigInt(hi)) continue
    const o1 = rvaToOffset(Number(r1), sections)
    const o2 = rvaToOffset(Number(r2), sections)
    if (o1 === null || o2 === null) continue
    if (!looksLikePath(d.subarray(o1, o1 + Number(l1)))) continue
    if (o2 + Number(l2) > d.length) continue
    hits.push({ off, path: d.toString('ascii', o1, o1 + Number(l1)), dataOff: o2, len: Number(l2) })
  }

  if (!hits.length) throw new Error('no embedded asset table found')
  hits.sort((a, b) => a.off - b.off)

  // Keep the longest run of records spaced exactly 32 bytes apart.
  let best = [hits[0]]
  let cur = [hits[0]]
  for (const h of hits.slice(1)) {
    if (h.off === cur[cur.length - 1].off + 32) cur.push(h)
    else {
      if (cur.length > best.length) best = cur
      cur = [h]
    }
  }
  if (cur.length > best.length) best = cur
  return best
}

function main() {
  const [exePath, outDir, ...rest] = process.argv.slice(2)
  if (!exePath || !outDir) {
    console.error('usage: extract-assets.mjs <jeva.exe> <out-dir> [--manifest <file>]')
    process.exit(2)
  }
  const manifestFlag = rest.indexOf('--manifest')
  const manifestPath = manifestFlag >= 0 ? rest[manifestFlag + 1] : null

  const d = readFileSync(exePath)
  const pe = parsePe(d)
  const table = findAssetTable(d, pe)
  console.log(`found ${table.length} embedded assets`)

  const manifest = []
  let total = 0
  for (const rec of table) {
    const raw = d.subarray(rec.dataOff, rec.dataOff + rec.len)
    let bytes
    try {
      bytes = brotliDecompressSync(raw)
    } catch {
      // Not every blob is brotli-compressed (e.g. small files stored raw).
      bytes = raw
    }
    const rel = rec.path.replace(/^\/+/, '')
    const dest = join(outDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, bytes)
    total += bytes.length
    manifest.push({
      path: rec.path,
      file: rel,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  }

  if (manifestPath) {
    mkdirSync(dirname(resolve(manifestPath)), { recursive: true })
    writeFileSync(
      resolve(manifestPath),
      JSON.stringify({ source: resolve(exePath), count: manifest.length, totalBytes: total, assets: manifest }, null, 2) + '\n',
    )
    console.log(`wrote manifest -> ${manifestPath}`)
  }
  console.log(`extracted ${manifest.length} files (${(total / 1024 / 1024).toFixed(2)} MB) -> ${outDir}`)
}

main()
