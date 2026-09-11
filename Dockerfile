FROM node:22-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production
EXPOSE 3000
# ponytail: db push + seed at boot, switch to `prisma migrate deploy` once migrations exist
CMD ["sh", "-c", "npx prisma db push && npx prisma db seed && npm run start"]
