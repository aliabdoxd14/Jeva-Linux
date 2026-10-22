#!/usr/bin/env bash
# Build an Arch Linux package (.pkg.tar.zst) from this repository.
#
#   bash packaging/arch/build-arch.sh
#
# Requires: makepkg, cargo, rustc, webkit2gtk-4.1, gtk3
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PKGVER="${PKGVER:-1.0.2}"
PKGNAME="jeva"
BUILDDIR="$ROOT/build/arch"
ARTIFACTS="$ROOT/artifacts"

if [ ! -d "$ROOT/upstream-dist" ]; then
    echo "error: upstream-dist/ is missing — run 'npm run sync' first" >&2
    exit 1
fi

mkdir -p "$BUILDDIR" "$ARTIFACTS"

# Stage the sources into a tarball that the PKGBUILD can unpack.
STAGE="$BUILDDIR/stage"
SRC="$STAGE/${PKGNAME}-${PKGVER}"
rm -rf "$STAGE"
mkdir -p "$SRC"

for item in src-tauri packaging tools package.json upstream-dist LICENSE icon.svg; do
    [ -e "$item" ] || continue
    cp -r "$item" "$SRC/"
done
rm -rf "$SRC/src-tauri/target"

tar czf "$BUILDDIR/${PKGNAME}-${PKGVER}.tar.gz" -C "$STAGE" "${PKGNAME}-${PKGVER}"

# Build in a dedicated directory that only holds the PKGBUILD.
WORK="$BUILDDIR/pkg"
rm -rf "$WORK"
mkdir -p "$WORK"
cp "$ROOT/packaging/arch/PKGBUILD" "$WORK/PKGBUILD"

cd "$WORK"

export PKGDEST="$ARTIFACTS"
export SRCDEST="$BUILDDIR"
export MAKEFLAGS="-j$(nproc)"

# Reuse the dependency tree that `tauri build` already compiled, if present.
if [ -d "$ROOT/src-tauri/target" ]; then
    export CARGO_TARGET_DIR="$ROOT/src-tauri/target"
    export CARGO_HOME="$ROOT/src-tauri/.cargo-home"
fi

makepkg --force --noconfirm --cleanbuild --noprogressbar

echo
echo "Artifacts:"
ls -la "$ARTIFACTS"/*.pkg.tar.zst
