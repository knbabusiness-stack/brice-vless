const net = require('net');
const http = require('http');
const { WebSocketServer } = require('ws');

const UUID = process.env.UUID || '50f92dee-fdd3-4b12-8eda-1343b54dc13e';
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', uuid: UUID }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.once('message', (msg) => {
    const data = Buffer.from(msg);
    if (data.length < 24) return ws.close();

    const uuid = data.slice(1, 17).toString('hex').replace(
      /(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'
    );
    if (uuid !== UUID) return ws.close();

    const optLen = data[17];
    const cmd = data[18 + optLen];
    if (cmd !== 1) return ws.close();

    const port = data.readUInt16BE(19 + optLen);
    const atype = data[21 + optLen];
    let host = '', hlen = 0, hstart = 22 + optLen;

    if (atype === 1) {
      host = data.slice(hstart, hstart + 4).join('.');
      hlen = 4;
    } else if (atype === 2) {
      hlen = data[hstart] + 1;
      host = data.slice(hstart + 1, hstart + hlen).toString();
    } else if (atype === 3) {
      hlen = 16;
      host = data.slice(hstart, hstart + 16).toString('hex');
    }

    const rawData = data.slice(hstart + hlen);
    const vlessRes = Buffer.from([data[0], 0]);

    const tcp = net.connect(port, host, () => {
      ws.send(vlessRes);
      if (rawData.length) tcp.write(rawData);
      tcp.on('data', (d) => ws.send(d));
      ws.on('message', (d) => tcp.write(d));
    });

    tcp.on('error', () => ws.close());
    tcp.on('close', () => ws.close());
    ws.on('close', () => tcp.destroy());
  });
});

server.listen(PORT, () => console.log(`VLESS running on port ${PORT}`));
