FROM node:20-bookworm-slim

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY index.js ./

ENV POCKETBASE_URL=http://pocketbase:8090
ENV POLL_INTERVAL_MS=5000
ENV OCR_SERVICE_URL=http://ocr:5000
ENV OCR_ENGINE=tesseract
ENV OCR_LANG=nld+eng

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "index.js"]
