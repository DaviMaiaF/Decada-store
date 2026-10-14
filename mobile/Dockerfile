# Imagem de DESENVOLVIMENTO do app (Metro/Expo). O código vem por volume.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
# O hash do lock vai junto: o volume nasce desta pasta e não reinstala à toa.
RUN npm ci && sha256sum package-lock.json | cut -d' ' -f1 > node_modules/.lock-hash

COPY sync-node-modules.sh /usr/local/bin/
COPY . .

EXPOSE 8081
ENTRYPOINT ["sync-node-modules.sh"]
CMD ["npx", "expo", "start", "--lan"]
