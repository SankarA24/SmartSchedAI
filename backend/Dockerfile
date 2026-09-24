# Backend: Express 5 + Mongoose 8 + Socket.io, ESM, Node 22.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so this layer caches across source edits.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# PORT is read from the environment by server.js; compose sets it.
EXPOSE 5000

CMD ["node", "server.js"]
