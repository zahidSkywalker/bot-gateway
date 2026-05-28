FROM node:20-alpine

WORKDIR /app

# Copy backend first (faster install)
COPY package.json ./
RUN npm install --production

# Copy server
COPY server/ ./server/

# Build frontend
COPY frontend/ ./frontend/
RUN cd frontend && npm install && npm run build

# Expose port
EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "server/index.js"]
