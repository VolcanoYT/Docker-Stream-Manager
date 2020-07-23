process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', reason.stack || reason)
});

/*
ac = Set the number of audio channels. For output streams it is set by default to the number of input audio channels. For input streams this option only makes sense for audio grabbing devices and raw demuxers and is mapped to the corresponding demuxer options.
re = Read input at native frame rate. Mainly used to simulate a grab device, or live input stream (e.g. when reading from a file). Should not be used with actual grab devices or live input streams (where it can cause packet loss). By default ffmpeg attempts to read the input(s) as fast as possible. This option will slow down the reading of the input(s) to the native frame rate of the input(s). It is useful for real-time output (e.g. live streaming).
g = Use a 2 second GOP (Group of Pictures), so simply multiply your output frame rate * 2. For example, if your input is -framerate 30, then use -g 60.
r = As an input option, ignore any timestamps stored in the file and instead generate timestamps assuming constant frame rate fps. This is not the same as the -framerate option used for some input formats like image2 or v4l2 (it used to be the same in older versions of FFmpeg). If in doubt use -framerate instead of the input option -r.
anullsrc - The anullsrc audio source filter can create silent audio. For example, to add a silent audio stream to a video:
-pix_fmt yuvj422p - more info https://stackoverflow.com/a/23216860 or https://stackoverflow.com/a/43038480

- deprecated pixel -
You can safely ignore it when using ffmpeg from the command-line, and you don't have to fix anything.
The warning occurs when converting from a yuv420p source to JPEG, which makes ffmpeg choose yuvj420p as output format. That format is required for writing files with the mjpeg encoder. 

- This idea comes from a few from here -
https://github.com/ThePooN/rtmp-fallback
https://github.com/Hakkin/streamRIP
https://github.com/phaux/node-ffmpeg-stream

*/

var argv = require('minimist')(process.argv.slice(2));
var spawn = require("child_process").spawn;

var url_live = argv.stream;
var url_cam = argv.cam;
var url_off = "/home/node/app/disconnected.png";

if (isEmpty(url_live)) {
  console.log("There is no live stream output");
  process.exit(1);
}

if (isEmpty(url_cam)) {
  console.log("There is no webcam stream input");
  process.exit(1);
}

console.log("Stream " + url_cam + " to " + url_live);

// if timeout is reached camera will swicth to offline if long time it will use last frame and it should freeze
var timeout = 2;
// if camera is offline, try waiting again for 30 seconds to connect.
var next_scan = 30;
// don't edit anything
var tmp_scan_next = 0;
// if main program is broken close it.
var auto_exit = true;
// pipe a single jpeg file 30 times per second
var gfps = 30;
// lock fps
var fps = 10;
// it's easier to combine frames with mjpeg format than mpegts but that's no audio.
var tops = "mjpeg";
// screen size, our camera frame and offline frame will adjust so that data is not damaged.
var resot = "854x480";
// This is our camera format and will be re-encoded to varb "tops"
var camera_type = (argv.format) ? argv.format : 1;

var last_offline = null;
var last_frame = null;
var last_time = Math.floor(Date.now() / 1000);
var last_magic = Math.floor(Date.now() / 1000);

//Normally this should always be true at startup, so there's no need to edit anything.
var is_run_magic_box = true;
var is_run_ourcamera = false;

var recode = "-f lavfi -i anullsrc -c:v libx264 -c:a aac -ar 44100 -ac 2";
var patch = "-r " + fps + " -g " + gfps + " -s " + resot + " -f " + tops + " -"; //-c:v "+tops+" 

// To make the auto switches work well, we have to re-encode format according to camera so that data is not corrupted.
var offline_fm = spawn("ffmpeg", ("-re -f image2 -loop 1 -t 1 -i " + url_off + " " + patch).split(" "));
offline_fm.stderr.on("data", (msg) => {
  var check_msg = msg.toString();
  if (check_msg.includes("deprecated pixel")) {
    //skip
  } else {
    console.log("offline_fm", msg.toString());
  }
});
offline_fm.on("exit", (code) => {
  if (code == 0) {
    console.log('successfully created a file');
  } else {
    console.log("offline_fm: big problem with code " + code);
    if (auto_exit) {
      process.exit(code);
    }
  }
});
offline_fm.stdout.on("data", (c) => {
  last_offline = c;
});

//This is main stream, linking two frames, if this is down it will finish everything so make sure it lives
var magic_box = spawn("ffmpeg", ("-re -f " + tops + " -i - " + recode + " -f flv " + url_live).split(" "));
magic_box.on("exit", (code) => {
  console.log("magic_box: big problem with code " + code);
  is_run_magic_box = false;
  if (auto_exit) {
    process.exit(code);
  }
});
magic_box.stderr.on("data", (msg) => {
  var check_msg = msg.toString();
  if (check_msg.includes("Error writing trailer")) {
    is_run_magic_box = false;
    if (auto_exit) {
      process.exit(code);
    }
  } else if (check_msg.includes("deprecated pixel")) {
    //skip
  } else if (check_msg.match(/time=(.*?) bitrate/)) {
    last_magic = Math.floor(Date.now() / 1000);
  } else {
    console.log("magic_box", check_msg);
  }
});
magic_box.stdout.on('error', function (err) {
  console.log("error magic_box", err);
  is_run_magic_box = false;
  if (err.code == "EPIPE") {
    if (auto_exit) {
      process.exit(0);
    }
  }
});

//This is formula for this auto switch to work.
setInterval(() => {

  //do not process if magic box is not yet online.
  if (is_run_magic_box) {

    //If there are no offline files, don't send them yet (TODO: auto exit if 3x faild?)
    if (!isEmpty(last_offline)) {

      //copy offline to tmp
      var tmp_frame = last_offline;

      // If a new frame is found send it.
      if (!isEmpty(last_frame)) {
        tmp_frame = last_frame;
      };

      //Start trying to send it to magic box
      try {
        magic_box.stdin.write(tmp_frame);
      } catch (error) {
        //If when sending tmp frames and errors let's make last frame null so that offline frames can be used
        console.log('Error Send: ', error);
        console.log(tmp_frame);
        last_frame = null;
      }

      //remove tmp
      tmp_frame = null;
    }

  }

}, 1000 / gfps);

// This is our camera, it doesn't have to be live
var our_cam;

function MainCam(kill = false, restart = false) {
  if (kill) {
    try {
      if (our_cam) {
        our_cam.kill('SIGINT');
        our_cam = null;
      } else {
        console.log('Camera no start yet...');
      }
      if (restart) {
        console.log('But keep restart it!');
        return MainCam();
      }
    } catch (error) {
      console.log('error kill main cam');
    }
  } else {
    //flv
    var tmp_type = "-re -f flv";
    var tmp_bns  = "";    
    if(camera_type == 2){
      //m3u8
      tmp_type = "-re";
      tmp_bns  = "-c:v mjpeg";
    }
    var tp = tmp_type + " -i " + url_cam + " "+tmp_bns+" " + patch;
    //console.log(tp);
    our_cam = spawn("ffmpeg", (tp).split(" "));
    our_cam.on("exit", (code) => {
      console.log("Our Camera: error with " + code);
      return MainCam(true);
    });
    our_cam.stderr.on("data", (msg) => {
      var check_msg = msg.toString();
      if (check_msg.includes("Error writing trailer")) {
        is_run_ourcamera = false;
      } else if (check_msg.includes("does not contain any stream")) {
        is_run_ourcamera = false;
      } else if (check_msg.includes("deprecated pixel")) {
        //skip
      } else if (check_msg.match(/time=(.*?) bitrate/)) {
        last_time = Math.floor(Date.now() / 1000);
      } else {
        console.log("Our Camera", check_msg);
      }
    });
    our_cam.stdout.on("data", (c) => {
      last_frame = c;
      is_run_ourcamera = true;
    });
    our_cam.on("error", function (err) {
      console.log("Server error:", err);
    });
  }
}

// check if camera offline and wait it.
setInterval(() => {
  var now = Math.floor(Date.now() / 1000) - last_time;
  if (now >= timeout) {
    //console.log('Slow...' + now);
    last_frame = null;
    if (tmp_scan_next > next_scan) {
      tmp_scan_next = 0;
      MainCam(true, true);
    } else {
      tmp_scan_next++;
    }
  }
}, 1000 * 1);

console.log('Start server camera....');

MainCam();

function isEmpty(value) {
  return (value == null || value.length === 0);
}