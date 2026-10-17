#!/usr/bin/env bash
# 公開用／アプリ同梱用の「ウェブ部分」を指定フォルダへまとめます。
# 使い方: scripts/prepare-web.sh <出力フォルダ> [site]
#   site をつけると、ダウンロードページとログイン用ページも入れます（GitHub Pages 用）
set -euo pipefail
OUT="${1:?出力フォルダを指定してください}"
MODE="${2:-app}"
cd "$(dirname "$0")/.."
rm -rf "$OUT"; mkdir -p "$OUT"
cp index.html manifest.webmanifest icon-192.png icon-512.png "$OUT"/
if [ "$MODE" = "site" ]; then
  cp sw.js download.html native-login.html "$OUT"/
fi
# 公開先のアドレスを native-config.js に書きこむ（GitHub Actions のときだけ自動）
if [ -n "${GITHUB_REPOSITORY:-}" ]; then
  OWNER="${GITHUB_REPOSITORY%%/*}"; REPO="${GITHUB_REPOSITORY#*/}"
  LOWER="$(echo "$OWNER" | tr '[:upper:]' '[:lower:]')"
  printf "window.YASUMI_HOST='https://%s.github.io/%s/';\nwindow.YASUMI_REPO='%s';\n" "$LOWER" "$REPO" "$GITHUB_REPOSITORY" > "$OUT/native-config.js"
else
  cp native-config.js "$OUT"/
fi
echo "ウェブ部分を $OUT に用意しました"
