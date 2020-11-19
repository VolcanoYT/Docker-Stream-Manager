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

- Problem -
there is a new problem, if we stream continuously it will produce a delayed time which increases for example more 3 hours will result in a delayed time of about 30 minutes which i think is bad enough, so anyone help me fix this.
https://stackoverflow.com/a/54979040
https://stackoverflow.com/questions/59940687/ffmpeg-youtube-live-bad-video-settings-please-use-a-keyframe-frequency-o

Maybe Instead of using setInterval, why no just using setTimeout with re-calculated delay everytime, otherwise the delay will increase over time because of the time it takes to write to the console and pass data to ffmpeg?

*/

var argv = require('minimist')(process.argv.slice(2));
var spawn = require("child_process").spawn;

var url_live = (!isEmpty(argv.stream)) ? argv.stream : process.env.stream;
var url_cam = (!isEmpty(argv.cam)) ? argv.cam : process.env.cam;
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
var timeout = 10;
// if camera is offline, try waiting again for 30 seconds to connect.
var next_scan = 15;
// if camera has too many errors, end stream
var wait_dc = 999;
// if main program is broken close it.
var auto_exit = true;
// pipe a single jpeg file 8 times per second
var keyframe = 2;
var fps = 15;
var g_set = fps * keyframe; //8x2 = 16
// it's easier to combine frames with mjpeg format than mpegts but that's no audio.
var tops = "mjpeg";

// screen size, our camera frame and offline frame will adjust so that data is not damaged.
var resot = (!isEmpty(argv.screen)) ? argv.screen : process.env.screen;
if (isEmpty(resot)) {
  console.log("Use standard values 480p");
  resot = "854x480";
}

// This is our camera format and will be re-encoded to varb "tops"
var camera_type = parseInt((!isEmpty(argv.format)) ? argv.format : process.env.format);
if (camera_type < 1 || isNaN(camera_type)) {
  console.log("Need Format!");
  process.exit(1);
}

var last_offline = null;
var last_offline_ok = false;

var last_frame = null;

var last_time = Math.floor(Date.now() / 1000);
var last_magic = Math.floor(Date.now() / 1000);

//Normally this should always be true at startup, so there's no need to edit anything.
var is_run_magic_box = true;

var patch = " -s " + resot + " -f " + tops + " -";

// To make the auto switches work well, we have to re-encode format according to camera so that data is not corrupted.
var offline_fm = spawn("ffmpeg", ("-f image2 -loop 1 -t 1 -i " + url_off + patch).split(" "));
/*
offline_fm.stderr.on("data", (msg) => {
  var check_msg = msg.toString();
  if (check_msg.includes("deprecated pixel")) {
    //skip
  } else {
    console.log("offline_fm", msg.toString());
  }
});
*/
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
  last_offline_ok = true;
});

//This is main stream, linking two frames, if this is down it will finish everything so make sure it lives
var magic_box = spawn("ffmpeg", ("-re -r " + fps + " -f " + tops + " -i - -f lavfi -i anullsrc -c:v libx264 -g " + g_set + " -c:a aac -ar 44100 -ac 2 -f flv " + url_live).split(" "));
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

// This is formula for this auto switch to work.
setInterval(() => {
  //do not process if magic box is not yet online.
  if (is_run_magic_box) {
    //If there are no offline files, don't send them yet (TODO: auto exit if 3x faild?)
    if (last_offline_ok) {
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
}, 1000 / g_set);

// This is our camera, it doesn't have to be live
var our_cam;
var temp_wait_dc = 0;

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
    var tmp_type = "";
    var tmp_bns = "";
    if (camera_type == 1) {
      //flv
      tmp_type = "-re -r "+fps+" -f flv ";
      tmp_bns = "";
    }else if (camera_type == 2) {
      //m3u8
      tmp_type = "";
      tmp_bns = "-c:v " + tops + "";
    }else if (camera_type == 3) {
      //tcp rtsp
      tmp_type = "-rtsp_transport tcp -re ";
      tmp_bns = "-c:v " + tops + "";
    }
    var tp = tmp_type + "-i " + url_cam + patch;
    console.log("CMD: ", tp);
    our_cam = spawn("ffmpeg", (tp).split(" "));
    our_cam.on("exit", (code) => {
      console.log("Our Camera: error with " + code);
      return MainCam(true);
    });
    our_cam.stderr.on("data", (msg) => {
      var check_msg = msg.toString();
      if (check_msg.includes("Error writing trailer")) {

        console.log("Unstable network");
        if (auto_exit) {
          console.log("Ending stream...");
          process.exit(1);
        }

      } else if (check_msg.includes("could not find codec") || check_msg.includes("Unable to find a suitable") || check_msg.includes("does not contain any stream")) {

        console.log("(" + temp_wait_dc + ") Your camera might not support or maybe your camera have bad internet");
        console.log("Debug: ", check_msg);        

        if (temp_wait_dc > wait_dc) {
          temp_wait_dc = 0;

          console.log("Too many errors..");
          if (auto_exit) {
            console.log("Ending stream...");
            process.exit(1);
          }
        } else {
          temp_wait_dc++;
        }
        
      } else if (check_msg.includes("deprecated pixel")) {
        // skip
      } else if (check_msg.match(/time=(.*?) bitrate/)) {
        // stream jalan normal
        last_time = Math.floor(Date.now() / 1000);
        temp_wait_dc = 0;        
      } else {
        console.log("Our Camera", check_msg);
        last_time = Math.floor(Date.now() / 1000);
      }
    });
    our_cam.stdout.on("data", (c) => {
      last_frame = c;
    });
    our_cam.on("error", function (err) {
      console.log("Server error:", err);
    });
  }
}

// check if camera offline and wait it.
var tmp_scan_next = 0;
setInterval(() => {
  //console.log(delayed+" | "+tmp_set);
  var now = Math.floor(Date.now() / 1000) - last_time;
  if (now >= timeout) {
    console.log('Slow...' + now);
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