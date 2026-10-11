#!/usr/bin/env bash
# Descarga de NewsAPI los datos que la versión estática (site/) necesita.
# Uso: NEWS_API_KEY=xxx scripts/fetch-news.sh [directorio-salida]
set -euo pipefail

: "${NEWS_API_KEY:?Falta NEWS_API_KEY}"
OUT="${1:-site/data}"
API="https://newsapi.org/v2"
mkdir -p "$OUT"

fetch() {
    local url="$1" dest="$2" tmp
    tmp="$(mktemp)"
    curl -sS --fail-with-body -H "X-Api-Key: $NEWS_API_KEY" -A "onlynews-pages" "$url" -o "$tmp" \
        || { echo "Error pidiendo $url:"; cat "$tmp"; exit 1; }
    jq -e '.status == "ok"' "$tmp" >/dev/null || { echo "Respuesta no válida de $url:"; cat "$tmp"; exit 1; }
    mv "$tmp" "$dest"
}

fetch "$API/top-headlines?country=us&pageSize=100" "$OUT/headlines.json"

for category in general business entertainment health science sports technology; do
    fetch "$API/sources?category=$category" "$OUT/sources-$category.json"
done

jq -n --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '{updatedAt: $t}' > "$OUT/meta.json"
echo "Datos guardados en $OUT"
