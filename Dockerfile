FROM node:alpine

RUN apk --no-cache add ffmpeg

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY package.json .

RUN npm install

USER node

COPY --chown=node:node data .

ENTRYPOINT ["node","index.js"]
CMD ["--cam","","--stream","","--format","","--screen",""]