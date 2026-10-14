#!/bin/sh
# O node_modules do container mora num volume, que o Docker só preenche a partir
# da imagem na primeira vez. Depois disso, um `--build` com dependência nova não
# chega ao volume — foi assim que o axios sumiu. Aqui o volume é comparado com o
# package-lock.json a cada subida, e só reinstala quando o lock mudou.
set -e

hash_do_lock=$(sha256sum package-lock.json | cut -d' ' -f1)

if [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$hash_do_lock" ]; then
  echo "package-lock.json mudou: reinstalando as dependências no volume…"
  # Esvazia o volume em vez de apagá-lo: é um ponto de montagem, não sai.
  find node_modules -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  npm ci
  echo "$hash_do_lock" > node_modules/.lock-hash
fi

exec "$@"
