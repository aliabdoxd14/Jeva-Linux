# Release assets

These are the Linux packages built from this repository, matching the
`v1.0.0` tag.

| File | Format | Install |
| ---- | ------ | ------- |
| `Jeva_1.0.0_amd64.deb` | Debian / Ubuntu | `sudo apt install ./Jeva_1.0.0_amd64.deb` |
| `Jeva-1.0.0-1.x86_64.rpm` | Fedora / openSUSE | `sudo dnf install ./Jeva-1.0.0-1.x86_64.rpm` |
| `Jeva_1.0.0_amd64.AppImage` | Any x86-64 Linux | `chmod +x Jeva_1.0.0_amd64.AppImage && ./Jeva_1.0.0_amd64.AppImage` |

Requirements: `webkit2gtk-4.1`, `gtk3` and `libayatana-appindicator3`.

## Verifying the packages

```bash
bash tools/verify-artifacts.sh
```

## Building them again

```bash
npm run sync        # recover the web UI from the upstream release
npm run build:all   # .deb, .rpm and .AppImage
```

## Publishing to GitHub

The release is tagged locally. To push the tag and attach the assets:

```bash
git push origin main --tags

gh release create v1.0.0 \
  artifacts/Jeva_1.0.0_amd64.deb \
  artifacts/Jeva-1.0.0-1.x86_64.rpm \
  artifacts/Jeva_1.0.0_amd64.AppImage \
  --title "Jeva v1.0.0 for Linux" \
  --notes-file release-notes.md
```

Alternatively, push the `v1.0.0` tag and let
`.github/workflows/release.yml` build and attach the packages on the runner.
