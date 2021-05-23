// app.js
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var telnet = require('telnet-client');
var tconnect = new telnet();
var config = require('./config');

app.use(express.static(__dirname + '/node_modules'));
app.use(express.static(__dirname + '/assets'));

app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html');
});

var tparams = {
  host: config.FLUIDSYNTH_HOST,
  port: config.FLUIDSYNTH_PORT,
  shellPrompt: '/ # ',
  timeout: config.FLUIDSYNTH_TIMEOUT,
  // removeEcho: 4
};


function changeinst(channel,inst,fontId, bank) {
    var flcmd = 'select '+channel+' '+ fontId + ' ' + bank + ' ' + inst;
    console.log("fluidsynth: ", flcmd);
    tconnect.send(flcmd, function(err, response) {
       // console.log(response);
    });
}

function changefont(font) {
  var flcmd = 'load "'+font+'"';
  console.log("fluidsynth: ", flcmd);
  tconnect.send(flcmd, function(err, response) {
     // console.log(response);
  });
}

function currentinstruments() {
      var current;
      tconnect.send('channels', function(err, chans) {
            current=chans;
      });
      console.log(current);
      io.emit('message', { cord: current })
}
var connectRetry = null;
function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}
function telnetConnect(){
  clearTimeout(connectRetry);
  console.log("Fluidsynth Telnet: connecting to "+tparams.host+":"+tparams.port+"... ");

  tconnect.connect(tparams).then(function () {
    console.log("Fluidsynth Telnet: connection success");
    io.emit('status','connected');
  });
}

/*************************************************** */

var fontsRefresh;
function getfonts(client) {
  clearTimeout(fontsRefresh);
  tconnect.send('fonts', function (data) {
    var fonts = data.split("\n").slice(1).map(line => line.split('  ')[1].trim());
    client.emit('fonts', fonts);
    fontsRefresh = setTimeout(getfonts, config.STATUS_UPDATE_INTERVAL);
  });
}

var voices;
function getvoices(client) {
  clearTimeout(voices);
  tconnect.send('voice_count', function (data) {
    var voices = data.split(': ')[1];
    client.emit('voices', voices);
    voices = setTimeout(getvoices, config.STATUS_UPDATE_INTERVAL);
  });
}

function dumpInstruments(font,client){
  tconnect.send('inst '+font, function(err, ins) {
    client.emit('instrumentdump', { package: ins });
  });
}

/*************************************************** */

io.on('connection', function(client) {
    console.log('server connected');
    telnetConnect();

    tconnect.on('error', function () {
      console.error("Fluidsynth Telnet: connection failed, retrying in "+ (config.FLUIDSYNTH_RETRY / 1000) +" seconds...");
      connectRetry = setTimeout(telnetConnect, config.FLUIDSYNTH_RETRY);
    });

    client.on('queryFont',function(font){
      if (isNumeric(font)){
        dumpInstruments(font,client);
      }
    });

    client.on('changefont', function(data) {
      changefont(data.font)
    });

    client.on('changeinst', function(data) {      
      var channel = data.channel;
      var inst = data.instrumentId;
      var fontId = data.fontId;
      var bankId = data.bankId;

      if ( isNumeric(channel) && isNumeric(inst) ) {
        changeinst(channel,inst,fontId,bankId);
      } 
    });

    client.on('getinstruments', function(){
        tconnect.send('channels', function(err, ins) {
          var raw_list = ins.split("\n");
          var channel_list = [];
          for (i=0; i < raw_list.length - 1; i++){
            channel_list[i] = raw_list[i].split(", ")[1].trim();
          }
          io.emit('current', { channels: channel_list });
        });
    });

    getfonts(client);
    // getvoices(client);
});

io.on('error', function(error) {
  console.log(error);
});

server.listen(7000);
