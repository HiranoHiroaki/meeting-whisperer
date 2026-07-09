# Build stage: compile the API + server TypeScript to ESM JS
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.server.json ./
COPY api ./api
COPY server ./server
RUN npx tsc -p tsconfig.server.json

# Runtime stage
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist-server ./dist-server
COPY web ./web
COPY assets/dictionary ./assets/dictionary
COPY api/dict ./api/dict
EXPOSE 8080
CMD ["node", "dist-server/server/index.js"]
