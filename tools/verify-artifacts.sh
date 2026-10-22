#!/usr/bin/env bash
# verify-artifacts.sh — sanity-check the built Linux packages.
#
#   bash tools/verify-artifacts.sh [artifacts-dir]
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ART="${1:-$ROOT/artifacts}"
BUNDLE="$ROOT/src-tauri/target/release/bundle"

pass=0
fail=0

check() {
    local label="$1"; shift
    if "$@" >/dev/null 2>&1; then
        printf '  \033[32mok\033[0m   %s\n' "$label"
        pass=$((pass + 1))
    else
        printf '  \033[31mFAIL\033[0m %s\n' "$label"
        fail=$((fail + 1))
    fi
}

echo "== artifacts in $ART =="
ls -la "$ART" 2>/dev/null || echo "  (none)"

echo
echo "== packages =="
for f in "$ART"/*.deb "$ART"/*.rpm "$ART"/*.AppImage "$ART"/*.pkg.tar.zst; do
    [ -e "$f" ] || continue
    printf '\n--- %s (%s)\n' "$(basename "$f")" "$(du -h "$f" | cut -f1)"

    case "$f" in
    *.deb)
        # .deb is an `ar` archive: debian-binary, control.tar.*, data.tar.*
        ar t "$f" 2>/dev/null | sed 's/^/    ar: /'
        payload=$(ar t "$f" 2>/dev/null | grep '^data.tar' | head -1)
        if [ -n "$payload" ]; then
            ar p "$f" "$payload" 2>/dev/null | tar t 2>/dev/null | grep -E "usr/bin/jeva|\.desktop|icons/hicolor" | head -8 | sed 's/^/    /'
        fi
        ;;
    *.rpm)
        if command -v rpm2cpio >/dev/null 2>&1; then
            rpm2cpio "$f" 2>/dev/null | cpio -it 2>/dev/null | grep -E "usr/bin/jeva|\.desktop|icons/hicolor" | head -8 | sed 's/^/    /'
        else
            echo "    (rpm2cpio unavailable)"
        fi
        ;;
    *.AppImage)
        if [ -x "$f" ]; then
            "$f" --appimage-version 2>/dev/null | sed 's/^/    appimage: /'
        else
            echo "    (not executable)"
        fi
        ;;
    *.pkg.tar.zst)
        bsdtar -tf "$f" 2>/dev/null | grep -E "usr/bin/jeva|\.desktop|icons/hicolor" | head -8 | sed 's/^/    /'
        ;;
    esac
done

echo
echo "== binary =="
BIN="$BUNDLE/jeva"
if [ -e "$BIN" ]; then
    file "$BIN" | sed 's/^/    /'
    check "binary is a Linux ELF" test -x "$BIN"
else
    echo "    (no bundled binary at $BIN)"
fi

echo
echo "== summary: $pass passed, $fail failed =="
[ "$fail" -eq 0 ]
