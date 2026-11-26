# Single image: builds the client, then runs the multiplayer server, which also serves the client.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && chown -R node:node /app
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:2567/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
