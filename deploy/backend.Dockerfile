FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend/src ./src
COPY backend/.env.example ./.env.example

EXPOSE 4000
CMD ["npm", "start"]
