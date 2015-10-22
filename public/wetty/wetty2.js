var term1;
var term2;
var ws;

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
    ws.send(JSON.stringify({
        data: str
    }));
};

Wetty.prototype.onTerminalResize = function(col, row) {
    if (ws)
        ws.send(JSON.stringify({
            rowcol: true,
            col: col,
            row: row
        }));
};

ws = new WebSocket(((window.location.protocol === 'https:') ? 'wss://' : 'ws://') + window.location.host + window.location.pathname, 'wetty');
ws.onopen = function() {
    lib.init(function() {
        term1 = new hterm.Terminal();
        term2 = new hterm.Terminal();
        window.term1 = term1;
        window.term2 = term2;
        term1.decorate(document.getElementById('terminal1'));
        term2.decorate(document.getElementById('terminal2'));
        term1.setCursorPosition(0, 0);
        term1.setCursorVisible(true);
        term1.prefs_.set('ctrl-c-copy', true);
        term1.prefs_.set('ctrl-v-paste', true);
        term1.prefs_.set('use-default-window-copy', true);
        term1.setFontSize(8);

        term1.runCommandClass(Wetty, document.location.hash.substr(1));
        term2.setCursorPosition(0, 0);
        term2.setCursorVisible(true);
        term2.prefs_.set('ctrl-c-copy', true);
        term2.prefs_.set('ctrl-v-paste', true);
        term2.prefs_.set('use-default-window-copy', true);
        term2.setFontSize(8);

        term2.runCommandClass(Wetty, document.location.hash.substr(1));

        ws.send(JSON.stringify({
            rowcol: true,
            col: term1.screenSize.width,
            row: term1.screenSize.height
        }));
    });
}
ws.onmessage = function(msg) {
    if (!msg || !msg.data)
        return;
    var data = JSON.parse(msg.data);
    if (term1)
        term1.io.writeUTF16(data.data);
    if (term2)
        term2.io.writeUTF16(data.data);
    if (data.alt_data) {
      console.log(data.alt_data);
      var sidebar = document.getElementById("sidebar");
      sidebar.innerHTML+="<p>"+data.alt_data.content+"</p>";
    }

}
ws.onerror = function(e) {
    console.log("WebSocket connection error");
}
ws.onclose = function() {
    console.log("WebSocket connection closed");
}
