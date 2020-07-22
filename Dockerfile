FROM node:alpine

# https://github.com/ThePooN/rtmp-fallback
# https://github.com/Hakkin/streamRIP

RUN apk --no-cache add ffmpeg

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

WORKDIR /home/node/app

COPY package.json .

USER node

RUN npm install

COPY --chown=node:node data .

ENTRYPOINT ["node","index.js"]
CMD ["--cam","","--stream",""]