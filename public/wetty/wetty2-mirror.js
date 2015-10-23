var term;
var ws;
var enabled = false;

function Wetty(argv) {
    this.argv_ = argv;
    this.io = null;
    this.pid_ = -1;
}

Wetty.prototype.run = function() {
    this.io = this.argv_.io.push();

    this.io.onVTKeystroke = this.sendString_.bind(this);
    this.io.sendString = this.sendString_.bind(this);
    this.io.onTerminalResize = this.onTerminalResize.bind(this);
}

Wetty.prototype.sendString_ = function(str) {
  if(enabled) {
    ws.send(JSON.stringify({
        data: str
    }));
  }
};

Wetty.prototype.onTerminalResize = function(col, row) {
    if (ws)
        ws.send(JSON.stringify({
            rowcol: false,
            col: col,
            row: row
        }));
};

ws = new WebSocket(((window.location.protocol === 'https:') ? 'wss://' : 'ws://') + window.location.host + window.location.pathname, 'wetty');
var col = 50;
var row = 80;
var lossage = [];
var reset;

ws.onopen = function() {
    lib.init(function() {

      hterm.Terminal.prototype.onTerminalReady = function() {
        console.log("Terminal Ready!");
        terminal.style.width = ((col+1)*term.scrollPort_.measureCharacterSize().width) + "px"
        terminal.style.height = row*term.scrollPort_.measureCharacterSize().height + "px"
        lossage.forEach(function(com,index) {
          term.io.writeUTF16(com);
        });
        if (reset)
          term.reset();
      }
        term = new hterm.Terminal();
        window.term = term;
        term.decorate(document.getElementById('terminal'));
        term.setCursorPosition(0, 0);
        term.setCursorVisible(true);
        term.prefs_.set('ctrl-c-copy', true);
        term.prefs_.set('scrollbar-visible', false);
        term.prefs_.set('ctrl-v-paste', true);
        term.prefs_.set('use-default-window-copy', true);
        term.setFontSize(8);

        term.runCommandClass(Wetty, document.location.hash.substr(1));

      /*        ws.send(JSON.stringify({
                rowcol: true,
                col: term.screenSize.width,
                row: term.screenSize.height
                }));*/
    });
}
ws.onmessage = function(msg) {
  console.log("Getting message: ");
  console.log(msg);
    if (!msg)
        return;
    var data = JSON.parse(msg.data);
    if(data.stopWaiting) {
      var element = document.getElementById('waiting');
      element.style.display = "none";
      enabled=true;
    } else if (data.waiting) {
      var element = document.getElementById('waiting');
      element.style.display = "";
      enabled=false;
      if(term)
        term.reset();
      else
        reset=true;
    } else if(data.rowcol) {
      console.log("Setting row col:");
      console.log(data.row + ", " + data.col);
      var terminal = document.getElementById('terminal');
      if(term) {
        terminal.style.width = ((data.col+1)*term.scrollPort_.measureCharacterSize().width) + "px"
        terminal.style.height = data.row*term.scrollPort_.measureCharacterSize().height + "px"
      } else {
        row = data.row;
        col = data.col;
      }
    } else if (data.lossagePresent) {
      console.log("Getting lossage");
      console.log(data.lossage);
      reset=false;
      if(term)
        data.lossage.forEach(function(com,index) {
          term.io.writeUTF16(com);
        });
      else
        lossage=data.lossage;
    } else if (data.data && term)
        term.io.writeUTF16(data.data);
}

function terminalReady() {
console.log("Terminal Ready");
}

ws.onerror = function(e) {
    console.log("WebSocket connection error");
}
ws.onclose = function() {
    console.log("WebSocket connection closed");
}
