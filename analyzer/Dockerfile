FROM node:20-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY index.js ./

ENV POCKETBASE_URL=http://pocketbase:8090
ENV POLL_INTERVAL_MS=5000
ENV OPENROUTER_MODEL=google/gemini-2.0-flash-001
ENV VISION_MAX_WIDTH=1600

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]
