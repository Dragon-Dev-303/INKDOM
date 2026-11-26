# Inkdom game server (Node WebSocket). Build from the repo root:
#   docker build -f server/Dockerfile -t inkdom-game .
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm install --no-save tsx@4
COPY tsconfig.json ./
COPY server ./server
COPY src/game ./src/game
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["npx", "tsx", "server/index.ts"]
