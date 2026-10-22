

<p align="center">
  <img src="icon.svg" width="120" alt="Jeva Logo">
</p>

<h1 align="center">Jeva</h1>

<p align="center">
  A Perfect Linux client for Jellyfin.
</p>

<p align="center">
  <a href="https://github.com/aliabdoxd14/Jeva-Linux/releases">Download</a>
  ·
  <a href="https://github.com/aliabdoxd14/Jeva-Linux/issues">Report an Issue</a>
</p>


# Jeva

A customizable Linux client for Jellyfin, featuring a modern streaming-style interface.

## About

Jeva is an independent Jellyfin client for Linux, designed to make browsing and enjoying your personal media library feel like a modern streaming service.

## Features

- Modern, streaming-inspired interface
- Customizable themes and layouts
- Personalized home screen
- Movie and TV show library browsing
- Media filtering and sorting
- Multiple interface languages

## Platform

Linux
Windows

## Downloads

| Format | File | Best for |
| ------ | ---- | -------- |
| Debian / Ubuntu | `jeva_1.0.2_amd64.deb` | `apt install ./jeva_*.deb` |
| RPM | `jeva-1.0.2-1.x86_64.rpm` | Fedora, openSUSE, RHEL |
| AppImage | `jeva_1.0.2_amd64.AppImage` | Any distro, no install needed |
| Arch | `jeva-1.0.2-1-x86_64.pkg.tar.zst` | `pacman -U ./jeva-*.pkg.tar.zst` |

## Building from source

Requirements: Rust (stable), Node.js 20+, `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg`.

```bash
# 1. Fetch the web UI from the upstream release (see "Syncing with upstream")
npm run sync

# 2. Install the Tauri CLI
npm install

# 3. Build
npm run build:all          # .deb, .rpm and .AppImage
npm run build:arch         # .pkg.tar.zst
```

Artifacts land in `src-tauri/target/release/bundle/` and `artifacts/`.

## Syncing with upstream

Upstream ([tearerry/Jeva](https://github.com/tearerry/Jeva)) publishes closed-source
Windows builds only. The web interface is a pre-built Vite bundle that Tauri
embeds inside the executable, so `npm run sync` recovers it losslessly from the
official release and drops it into `upstream-dist/`, which is embedded into this
port at compile time.

```bash
npm run sync            # latest upstream release
npm run sync:tag v1.0.3 # a specific tag
```

To pick up a new upstream release, run `npm run sync`, rebuild, and commit the
refreshed `upstream-dist/`. The sync is deterministic: the recovered bundle is
byte-for-byte identical to what the Windows build serves.

| Script | Purpose |
| ------ | ------- |
| `tools/sync-upstream.mjs` | Download the upstream release and unpack it |
| `tools/extract-assets.mjs` | Recover the brotli-compressed asset table from the Windows binary |

## Disclaimer

Jeva is an independent project and is not affiliated with or endorsed by the Jellyfin project.

FORK FROM: https://github.com/tearerry/Jeva | The original project was made specifically for windows and this is a fan fork for linux

## Developer Mode

Jeva includes a hidden Developer Mode for advanced media library management, including refreshing metadata and editing media information.

To enable Developer Mode, go to **Settings → About** and click the **Jeva icon** several times.
