# Docker Stream Manager

Stream your camera with auto switch offline if camera off or down but keep live it on youtube etc

[![Merapi](http://img.youtube.com/vi/1AEMjBSIZVI/0.jpg)](http://www.youtube.com/watch?v=1AEMjBSIZVI "Stream Merapi")

## How to Use!

Use docker to run it (VolcanoYT repo requires a password, please ask me first, we are also trying to move our image to hub.docker so that it can be accessed publicly soon)

```bash
docker run --rm -it  repo.volcanoyt.com/docker-stream-manager:last --cam "https://xxx.xxx.net/xxx/xxx.stream/playlist.m3u8" --stream "rtmp://a.rtmp.youtube.com/live2/xxx-xxx-xxx"
```

## How does that work?
In my opinion, this works to replace frame from original stream to "offline file" frame if for one second there is no change from previous frame or if camera receives data for too long, this is actually an idea from https://github.com/ThePooN/rtmp-fallback but with some modifications to work on our camera, in fact to make it work you have to make file "offline" must have same identity as fps,screen size, and fromat video (here I try to encode it back to mjpg format to make it more accurate)

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

```bash
git clone https://github.com/volcanoyt/Docker-Stream-Manager.git
docker build -t "repo.volcanoyt.com/docker-stream-manager:last" -f Dockerfile .
docker push repo.volcanoyt.com/docker-stream-manager:last
```

## License
[MIT](https://choosealicense.com/licenses/mit/)