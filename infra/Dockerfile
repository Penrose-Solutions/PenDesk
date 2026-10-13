FROM node:22-alpine

WORKDIR /app

# Copy server code
COPY server/package.json ./
COPY server/src ./src

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "src/index.js"]
