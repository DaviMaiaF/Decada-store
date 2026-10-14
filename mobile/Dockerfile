# Imagem de DESENVOLVIMENTO do app (Metro/Expo). O código vem por volume.
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8081
CMD ["npx", "expo", "start", "--lan"]
