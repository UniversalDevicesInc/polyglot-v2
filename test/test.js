const websocket = require('faye-websocket');

var username = 'admin';
var password = 'eyemle3t'
var auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');

const serverURL = "ws://10.0.0.14/rest/subscribe";

const opts = {
  headers: {
        "Origin": "com.universal-devices.websockets.isy",
        "Authorization": auth
    }
};

var client = new websocket.Client(serverURL, ["ISYSUB"], opts);

client.on('connect_error', (data) => {
  console.log('client error ' + data.data);
});

client.on('connect', (socket) => {
  console.log('Connected.')
  client.on('connected', () => {
    //io.emit('received connected');
    console.log('received connected: ');
    client.emit('this is data');
  });
});

client.on('message', (data) => {
  console.log(data.data);
});
