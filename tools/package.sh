#!/usr/bin/env bash
# Build dist/duskwall.zip with system.json at its root, leaving out sources and tooling.
# Usage: bash tools/package.sh
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist
rm -f packs/*/LOCK packs/*/LOG.old
zip -qr dist/duskwall.zip \
  system.json README.md LICENSE.md CHANGELOG.md \
  module templates styles lang assets packs \
  -x "packs/_source/*" -x "*/.DS_Store"
cp system.json dist/system.json
# Release notes: the newest section of the changelog.
VERSION=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' system.json | head -1)
awk -v v="$VERSION" '$0 ~ "^## "v {p=1; next} /^## / && p {exit} p' CHANGELOG.md > dist/release-notes.md
echo "Built dist/duskwall.zip (version $VERSION)"
