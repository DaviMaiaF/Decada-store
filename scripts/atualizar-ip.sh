#!/usr/bin/env bash
# Atualiza o HOST_IP do .env com o IP do notebook na rede atual e recria o
# container do app, para o QR code do Expo anunciar o endereço certo.
# Rode toda vez que trocar de rede (casa, faculdade, hotspot).
#
# Uso: scripts/atualizar-ip.sh [IP]   (sem argumento, descobre o IP sozinho)

set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$RAIZ/.env"

# O IP da interface que sai para a rede, e não o primeiro de `hostname -I`,
# que pode ser uma ponte do Docker.
descobrir_ip() {
  ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n1
}

IP="${1:-$(descobrir_ip)}"

if [[ ! "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Não consegui descobrir o IP. Você está conectado a uma rede?" >&2
  echo "Passe o IP à mão: scripts/atualizar-ip.sh 192.168.0.10" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Não achei $ENV_FILE. Crie com: cp .env.example .env" >&2
  exit 1
fi

if grep -q '^HOST_IP=' "$ENV_FILE"; then
  sed -i "s/^HOST_IP=.*/HOST_IP=$IP/" "$ENV_FILE"
else
  printf '\nHOST_IP=%s\n' "$IP" >> "$ENV_FILE"
fi
echo "HOST_IP=$IP"

cd "$RAIZ"
docker compose up -d
docker compose up -d --force-recreate mobile

echo
echo "Abra no Expo Go (Enter URL manually): exp://$IP:8081"
echo "Para ver o QR code: docker compose logs --no-log-prefix --tail 30 mobile"
