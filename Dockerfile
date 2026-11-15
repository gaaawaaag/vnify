# Cloud bookshelf and player (single owner). Production stays on the owner's computer; see the README.
FROM node:22-alpine
WORKDIR /app
COPY package.json index.html ./
COPY src ./src
COPY styles ./styles
COPY assets ./assets
COPY examples ./examples
RUN mkdir /data && chown node:node /data
ENV VN_LISTEN=0.0.0.0 PORT=4173 VN_DATA_DIR=/data
VOLUME /data
USER node
EXPOSE 4173
CMD ["node", "src/server/server.mjs"]
