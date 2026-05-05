#!/usr/bin/env bash
# Testa /api/* pelo mesmo HTTPS que o site usa (Caddy na porta publicada → backend).
# Uso: `cd stack && ./scripts/check_api_https.sh`
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="9443"
if [[ -f "$ROOT/.env" ]]; then
  # Não fazer `source` no .env inteiro (linhas como CADDY_SITE_ADDRESSES=..., ... rebentam no bash).
  line="$(grep -E '^[[:space:]]*STACK_HTTPS_HOST_PORT=' "$ROOT/.env" | tail -1 || true)"
  if [[ -n "$line" ]]; then
    PORT="${line#*=}"
    PORT="${PORT// /}"
    PORT="${PORT//\"/}"
  fi
fi
# Mesmo sitio que no browser: TLS terminado no Caddy; /api/* vai para o backend (handle_path tira o prefixo /api).
BASE="https://127.0.0.1:${PORT}"

echo "Endpoint público (HTTPS): $BASE"
echo ""

for path in /api/health /api/auth/adm/me; do
  # -k = aceitar certificado interno do Caddy (tls internal), como o browser após confiar na CA.
  curl -skS -o /dev/null -w "GET ${path} → HTTP %{http_code} — %{time_total}s\n" \
    "$BASE$path"
done

echo ""
echo "Dentro do container Caddy (HTTPS na :443 do serviço; mesmo path /api/... que o browser):"
if docker compose -f "$ROOT/docker-compose.yml" ps caddy --status running &>/dev/null; then
  docker compose -f "$ROOT/docker-compose.yml" exec -T caddy sh -c '
    for p in /api/health /api/auth/adm/me; do
      if command -v curl >/dev/null 2>&1; then
        curl -skS -o /dev/null -w "GET ${p} → HTTP %{http_code} — %{time_total}s\n" "https://127.0.0.1${p}"
      else
        wget -q -O /dev/null --no-check-certificate "https://127.0.0.1${p}" && echo "GET ${p} → OK (wget)" || echo "GET ${p} → falhou"
      fi
    done
  ' || echo "(docker compose exec falhou — corre isto na pasta stack com os containers up)"
else
  echo "(container caddy não está running)"
fi
