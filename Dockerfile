FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN chown -R node:node /app
EXPOSE 3000
USER node
CMD ["node", "server.js"]
