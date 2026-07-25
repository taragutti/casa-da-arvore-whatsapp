# ---- Build stage: instala tudo (incluindo devDependencies) e compila TS ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production stage: imagem final, só com o necessário pra rodar ----
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/db/schema.sql ./src/db/schema.sql
COPY --from=build /app/scripts/migrate.js ./scripts/migrate.js

EXPOSE 3000
CMD ["node", "dist/server.js"]
