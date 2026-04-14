FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p uploads/products uploads/reviews

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "server.js"]
