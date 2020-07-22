process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', reason.stack || reason)
});

// ac = Set the number of audio channels. For output streams it is set by default to the number of input audio channels. For input streams this option only makes sense for audio grabbing devices and raw demuxers and is mapped to the corresponding demuxer options.
// re = Read input at native frame rate. Mainly used to simulate a grab device, or live input stream (e.g. when reading from a file). Should not be used with actual grab devices or live input streams (where it can cause packet loss). By default ffmpeg attempts to read the input(s) as fast as possible. This option will slow down the reading of the input(s) to the native frame rate of the input(s). It is useful for real-time output (e.g. live streaming).
// g = Use a 2 second GOP (Group of Pictures), so simply multiply your output frame rate * 2. For example, if your input is -framerate 30, then use -g 60.
// r = As an input option, ignore any timestamps stored in the file and instead generate timestamps assuming constant frame rate fps. This is not the same as the -framerate option used for some input formats like image2 or v4l2 (it used to be the same in older versions of FFmpeg). If in doubt use -framerate instead of the input option -r.
// anullsrc - The anullsrc audio source filter can create silent audio. For example, to add a silent audio stream to a video:

var argv = require('minimist')(process.argv.slice(2));
var spawn = require("child_process").spawn;

var url_live = argv.stream;
var url_cam  = argv.cam;
var url_off  = "/home/node/app/disconnected.png";

if(isEmpty(url_live)){
  console.log("There is no live stream output");	
	process.exit(1);
}

if(isEmpty(url_cam)){
  console.log("There is no webcam stream input");	
	process.exit(1);
}

console.log("Stream "+url_cam+" to "+url_live);

var next_scan = 30;
var tmp_scan_next = 0;
var auto_exit = true;

var gfps = 30;
var fps = 10;
var tops = "mjpeg"; //mpegts or mjpeg
var resot = "854x480";

var offline_framer;
var last_frame = null;
var last_time = Math.floor(Date.now() / 1000);

var recode = "-f lavfi -i anullsrc -c:v libx264 -c:a aac -ar 44100 -ac 2";
var patch = "-r "+fps+" -g "+gfps+" -s "+resot+" -f " + tops + " -";

var spawn = require("child_process").spawn;

var offline_fm = spawn("ffmpeg", ("-re -f image2 -loop 1 -t 1 -i " + url_off + " "+patch).split(" "));
offline_fm.stderr.on("data", (msg) => {
  //console.log("offline_fm", msg.toString());
});
offline_fm.on("exit", (code) => {
  if(code == 0){
    console.log('successfully created a file');
  }else{
    console.log("offline_fm: big problem with code " + code);
    if (auto_exit) {
      process.exit(code);
    }
  }  
});
offline_fm.stdout.on("data", (c) => {
  offline_framer = c;
});

var magic_box = spawn("ffmpeg", ("-re -f " + tops + " -i - "+recode+" -f flv " + url_live).split(" "));
magic_box.on("exit", (code) => {
  console.log("magic_box: big problem with code " + code);
  if (auto_exit) {
    process.exit(code);
  }
});
magic_box.stderr.on("data", (msg) => {
  //console.log("magic_box", msg.toString());
});

//real time camera offline switch
setInterval(() => {
  if (!isEmpty(offline_framer)) {
    //copy offline to tmp
    var tmp_frame = offline_framer;
    // if have last_farme try use it?
    if (!isEmpty(last_frame)) {
      tmp_frame = last_frame;
    }
    //send to magic box
    magic_box.stdin.write(tmp_frame);
    //remove tmp and last frame
    tmp_frame = null;    
  } else {
    //console.log('wait data...');
  }
}, 1000 / gfps);

// Camera Main
var our_cam;
function MainCam(kill = false, restart = false) {
  if (kill) {
    try {
      if (our_cam) {
        our_cam.kill('SIGINT');
        our_cam = null;
      } else {
        console.log('camera no start yet...');
      }
      if (restart) {
        return MainCam();
      }
    } catch (error) {
      console.log('error kill main cam');
    }
  } else {
    our_cam = spawn("ffmpeg", ("-re -f flv -i " + url_cam + " " + patch).split(" "));
    our_cam.on("exit", (code) => {
      console.log("Our Camera: error with " + code);
      return MainCam(true);
    });
    our_cam.stderr.on("data", (msg) => {
     console.log("Our Camera", msg.toString());
    });
    our_cam.stdout.on("data", (c) => {
      last_frame = c;
      last_time = Math.floor(Date.now() / 1000);
    });
    our_cam.on("error", function (err) {
      console.log("Server error:", err);
    });
  }
}

console.log('start server camera....');
setInterval(() => {
  var now = Math.floor(Date.now() / 1000) - last_time;
  if (now >= 1) {
    console.log('slow...' + now);
    last_frame = null;
    if (tmp_scan_next > next_scan) {
      tmp_scan_next = 0;
      MainCam(true, true);
    } else {
      tmp_scan_next++;
    }
  }
}, 1000 * 1);

MainCam();

function isEmpty(value) {
  return (value == null || value.length === 0);
}