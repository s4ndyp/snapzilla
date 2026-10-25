FROM node:20-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev

COPY index.js ./

ENV POCKETBASE_URL=http://pocketbase:8090
ENV POLL_INTERVAL_MS=5000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]
