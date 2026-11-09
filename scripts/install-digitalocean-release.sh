#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  printf 'Usage: sudo bash scripts/install-digitalocean-release.sh FULL_COMMIT_SHA\n' >&2
  exit 2
fi
if [[ $EUID -ne 0 ]]; then
  printf 'Run this script with sudo on the atlas droplet.\n' >&2
  exit 2
fi

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
revision=$1
# Trust only this explicitly selected checkout for the Git read.
git_atlas() { git -c "safe.directory=$repo" -C "$repo" "$@"; }
git_atlas cat-file -e "$revision^{commit}"
base=/var/www/redlining-access-atlas
release="$base/releases/$revision"
umask 022
install -d -m 0755 "$base/releases"
stage="$(mktemp -d "$base/releases/.incoming.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT

git_atlas archive "$revision" dist scripts/check-static.sh | tar -xf - -C "$stage"
(cd "$stage" && bash scripts/check-static.sh)
for f in atlas.html pleasant-hill.html macon-connected.html 404.html robots.txt sitemap.xml og-image.png; do
  test -s "$stage/dist/$f"
done

if [[ ! -d $release ]]; then
  mv -T -- "$stage/dist" "$release"
fi
# Update the document-root pointer atomically; keep prior releases for rollback.
ln -s "releases/$revision" "$stage/current"
mv -Tf -- "$stage/current" "$base/current"
printf 'Atlas release installed: %s\n' "$revision"
