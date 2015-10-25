// Testing!
var redis = require("redis"); // node_redis module 
var client = redis.createClient('6379','redis');
var express = require('express');
var http = require('http');
var https = require('https');
var path = require('path');
var ws = require('websocket').server;
var pty = require('pty.js');
var fs = require('fs');

var os = require('os');
var url = require ('url');
var opts = require('optimist')
    .options({
        sslkey: {
            demand: false,
            description: 'path to SSL key'
        },
        sslcert: {
            demand: false,
            description: 'path to SSL certificate'
        },
        sshhost: {
            demand: false,
            description: 'ssh server host'
        },
        sshport: {
            demand: false,
            description: 'ssh server port'
        },
        sshuser: {
            demand: false,
            description: 'ssh user'
        },
        sshauth: {
            demand: false,
            description: 'defaults to "password", you can use "publickey,password" instead'
        },
        port: {
            demand: true,
            alias: 'p',
            description: 'wetty listen port'
        },
    }).boolean('allow_discovery').argv;

var runhttps = false;
var sshport = 22;
var sshhost = 'localhost';
var sshauth = 'password';
var globalsshuser = '';

client.on('connect', function() {
    console.log('connected');
});

if (opts.sshport) {
    sshport = opts.sshport;
}

if (opts.sshhost) {
    sshhost = opts.sshhost;
}

if (opts.sshauth) {
	sshauth = opts.sshauth
}

if (opts.sshuser) {
    globalsshuser = opts.sshuser;
}

if (opts.sslkey && opts.sslcert) {
    runhttps = true;
    opts['ssl'] = {};
    opts.ssl['key'] = fs.readFileSync(path.resolve(opts.sslkey));
    opts.ssl['cert'] = fs.readFileSync(path.resolve(opts.sslcert));
}

process.on('uncaughtException', function(e) {
    console.error('Error: ' + e);
});

var httpserv;

var app = express();
app.get('/wetty/ssh/:user', function(req, res) {
    res.sendfile(__dirname + '/public/wetty/index.html');
});
app.use('/', express.static(path.join(__dirname, 'public')));

if (runhttps) {
    httpserv = https.createServer(opts.ssl, app).listen(opts.port, function() {
        console.log('https on port ' + opts.port);
    });
} else {
    httpserv = http.createServer(app).listen(opts.port, function() {
        console.log('http on port ' + opts.port);
    });
}

var msgserv;

msgserv = http.createServer(onRequest_a).listen(9012);
var clients = [];
var mirrors = [];

function onRequest_a (req, res) {
  var query = url.parse(req.url,true).query;
  res.write('Sending response to browser' + '\n');
  clients.forEach(function(client, index) {
    client.conn.send(JSON.stringify({
      data: "",
      alt_data: query
    }));
  })
  mirrors.forEach(function(mirror, index) {
    mirror.conn.send(JSON.stringify({
      data: "",
      alt_data: query
    }));
  })
  res.end();
  console.log("sent " + JSON.stringify(query));
}

var wss = new ws({
    httpServer: httpserv
});

wss.on('request', function(request) {
    var clientObj = {}
    var sshuser = '';
  function getSidFromCookies(cookies) {
    console.log(cookies);
    var filtered = cookies.filter(function(obj) {
                     return obj.name == 'sessionid';
                   });
    return filtered.length > 0 ? filtered[0].value : null;
  }
  var sessionId =   getSidFromCookies(request.cookies);
  console.log("sessionId:" + sessionId);
  client.select(1, function() {
    client.get(":1:django.contrib.sessions.cache" + sessionId, function(err, reply) {
      if(reply) {
        console.log("Session recognized");
        request.djangoSession = JSON.parse(reply);
        console.log("USER ID: " + request.djangoSession._auth_user_id);

        var pg = require('pg');
        var connectionString = 'postgres://postgres@postgres:5432/postgres';
        var client = new pg.Client(connectionString);
        client.connect();
        var query = client.query('SELECT * from wetty_wettyuserprofile WHERE user_id='+request.djangoSession._auth_user_id);
        query.on('row', function(row) {
          console.log("SUCCESS!");
          console.log(row);
          console.log("Hello " + row.terminal_login);
          clientObj.loggedIn = false;
          clientObj.username = row.terminal_login;
          clientObj.password = row.terminal_password;
          client.end();
          clientObj.conn = request.accept('wetty', request.origin);

          if(request.resource == "/wetty/") {
            clientObj.mirror = false;
            console.log("Original Connection");
          } else if(request.resource == "/wetty/index2.html") {
            clientObj.mirror = false;
            console.log("Mobile connection");
          } else if(request.resource == "/wetty/mirror.html") {
            console.log("Mirror connection");
            clientObj.mirror = true;
            if(clients.length>0) {
              // If this is a mirror
              var alreadyAdded = false;
              mirrors.forEach(function(mirror,index) {
                if(mirror.conn == clientObj.conn)
                  alreadyAdded = true;
              });
              clientObj.conn.send(JSON.stringify({
                stopWaiting:true
              }));
              
              clientObj.conn.send(JSON.stringify({
                rowcol:clients[0].rowcol,
                row:clients[0].row,
                col:clients[0].col
              }));
              clientObj.conn.send(JSON.stringify({
                lossagePresent: true,
                lossage: clients[0].lossage
              }));
              mirrors.push(clientObj);
            } else {
              clientObj.conn.send(JSON.stringify({
                waiting:true
              }));
              // Add this connection to those being notified.
              mirrors.push(clientObj);
            }
          }
          
          console.log((new Date()) + ' Connection accepted.');
          clientObj.conn.on('message', function(msg) {
            var data = JSON.parse(msg.utf8Data);
            // If this is the first message
            if (!clientObj.term && (!clientObj.mirror)) {
              if (clients.length == 0) {
                clients[0] = clientObj;
                // Original connection
                clientObj.original = clientObj.conn;
                if (process.getuid() == 0) {
                  clientObj.term = pty.spawn('/bin/login', [], {
                    name: 'xterm-256color',
                    cols: 80,
                    rows: 30
                  });
                }
                console.log((new Date()) + " PID=" + clientObj.term.pid + " STARTED on behalf of user=" + sshuser)
                clientObj.term.on('data', function(data) {
                  if(!clientObj.loggedIn) {
                    if(data.match(/login:/g))
                    {
                      clientObj.term.write(clientObj.username+"\n");
                    }
                    else if (data.match(/Password:/g)) {
                      clientObj.term.write(clientObj.password+"\n");
                      clientObj.loggedIn=true;
                    }
                  }
                  clientObj.conn.send(JSON.stringify({
                    data: data
                  }));
                  clientObj.lossage.push(data);
                  mirrors.forEach(function(mirror,index){
                    console.log("Sending to each mirror the data..." + data);
                    mirror.conn.send(JSON.stringify({
                      data: data
                    }));
                  });
                });
                clientObj.term.on('exit', function(code) {
                  console.log((new Date()) + " PID=" + clientObj.term.pid + " ENDED")
                  console.log("Sending to each mirror a reset...");
                  mirrors.forEach(function(mirror,index){
                    mirror.conn.send(JSON.stringify({
                      data: "reset\n"
                    }));
                    mirror.conn.send(JSON.stringify({
                      waiting: true
                    }));
                  });
                  clients.splice(clients.indexOf(clientObj.conn), 1);
                });
                if(mirrors.length != 0)
                {
                  console.log("Mirrors revealing");
                  mirrors.forEach(function(mirror,index) {
                    console.log("Sending rowcol info " + clientObj.row + ", " + clientObj.col);
                    mirror.conn.send(JSON.stringify({
                      rowcol:clients[0].rowcol,
                      row:clientObj.row,
                      col:clientObj.col
                    }));
                    mirror.conn.send(JSON.stringify({
                      stopWaiting:true
                    }));
                    
                  });
                } 
                clientObj.lossage = [];
                clientObj.inputLossage = [];
              }
            }
            if (!data)
              return; 
            else if (clientObj == clients[0]
                   && data.rowcol
                   && (data.row != clientObj.row
                     || data.col != clientObj.col)) {
              console.log("Getting rowcol info(" + data.row + "," + data.col + ")");
              clientObj.term.resize(data.col, data.row);
              clientObj.rowcol = data.rowcol;
              clientObj.row = data.row;
              clientObj.col = data.col;
              mirrors.forEach(function(mirror,index) {
                console.log("Sending rowcol info " + clientObj.row + ", " + clientObj.col);
                mirror.conn.send(JSON.stringify({
                  rowcol:clientObj.rowcol,
                  row:clientObj.row,
                  col:clientObj.col
                }));
              });

            } else if (data.data) {
              console.log("Getting data: " + data.data);
              clients[0].inputLossage.push(data.data);
              clients[0].term.write(data.data);
            }
          });
          clientObj.conn.on('error', function() {
            if(clientObj.original == clientObj.conn) {
              mirrors = [];
              clientObj.term.end();
              mirrors.forEach(function(mirror,index) {
                mirror.conn.send(JSON.stringify({
                  waiting: true
                }));
              });
              clients.splice(clients.indexOf(clientObj.conn), 1);
            } else {
              clientObj.mirrors.splice(mirrors.indexOf(clientObj.conn), 1);
            }
          });
          clientObj.conn.on('close', function() {
            if(clientObj.original == clientObj.conn) {
              clientObj.term.end();
              clients.splice(clients.indexOf(clientObj.conn), 1);
            } else {
              clientObj.mirrors.splice(mirrors.indexOf(clientObj.conn), 1);
            }
          })
        });
      }
    });
  });
})
