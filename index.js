#!/usr/bin/env node

require('dotenv').config({ override: true });
const http = require('http');
const { WebSocketServer, createWebSocketStream } = require('ws');
const net = require('net');
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");

// --- Environment Variables ---
const FILE_PATH = process.env.FILE_PATH || './tmp';
const UID = process.env.UID || 'fc425456-5e97-46d8-ba4b-10481183ba24';
const S_PATH = process.env.S_PATH || UID;
const PORT = process.env.SERVER_PORT || process.env.PORT || 3005;
const MY_DOMAIN = process.env.MY_DOMAIN || 'whm-jp.dogchild.eu.org';
const WS_PATH = process.env.WS_PATH || '/ws';
const CIP = process.env.CIP || 'cf.877774.xyz';
const CPORT = process.env.CPORT || 443;
const NAME = process.env.NAME || 'webhostmost';

// --- Setup ---
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

const subPath = path.join(FILE_PATH, 'sub.txt');
let subContent = '';

function cleanupOldFiles() {
  fs.unlink(subPath, () => {});
}

// --- HTTP Server --- 
const httpServer = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello world!');
  } else if (req.url === `/${S_PATH}`) {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(subContent);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

// --- WebSocket Server ---
const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url === WS_PATH) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  const userId = UID.replace(/-/g, "");

  ws.once('message', (msg) => {
    try {
      const [VERSION] = msg;
      const id = msg.slice(1, 17);

      if (!id.every((v, i) => v === parseInt(userId.substr(i * 2, 2), 16))) {
        console.error(`Invalid user: ${id.toString('hex')}`);
        return ws.close();
      }

      let i = msg.slice(17, 18).readUInt8() + 19;
      const port = msg.slice(i, i += 2).readUInt16BE(0);
      const ATYP = msg.slice(i, i += 1).readUInt8();
      
      let host;
      switch (ATYP) {
        case 1: // IPv4
          host = msg.slice(i, i += 4).join('.');
          break;
        case 2: // Domain
          const domainLength = msg.slice(i, i + 1).readUInt8();
          host = new TextDecoder().decode(msg.slice(i + 1, i += 1 + domainLength));
          break;
        case 3: // IPv6
          host = msg.slice(i, i += 16).reduce((s, b, i, a) => (i % 2 ? s.concat(a.slice(i - 1, i + 1)) : s), []).map(b => b.readUInt16BE(0).toString(16)).join(':');
          break;
        default:
          host = '';
      }

      if (!host || !port) {
        console.error(`Invalid remote address: ${host}:${port}`);
        return ws.close();
      }

      ws.send(new Uint8Array([VERSION, 0]));

      const duplex = createWebSocketStream(ws);
      const socket = net.connect({ host, port }, function() {
        socket.write(msg.slice(i));
        duplex.on('error', () => socket.destroy()).pipe(socket).on('error', () => duplex.close()).pipe(duplex);
      });

      socket.on('error', (err) => {
        console.error(`Failed to connect to ${host}:${port}:`, err);
        duplex.close();
      });

    } catch (err) {
      console.error('Error processing protocol message:', err);
      ws.close();
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// --- Subscription Link Generation ---
async function generateSubLink() {
  if (!MY_DOMAIN) {
    console.error('错误: MY_DOMAIN 环境变量未设置, 无法生成订阅链接。');
    return;
  }

  let publicIp = 'Unknown-IP';
  try {
    const response = await axios.get('https://api.ipify.org?format=json');
    publicIp = response.data.ip;
    console.log(`Public IP: ${publicIp}`);
  } catch (error) {
    console.error('Failed to fetch public IP.');
  }

  let ISP = 'Unknown-ISP';
  try {
    const url = Buffer.from('aHR0cHM6Ly9zcGVlZC5jbG91ZGZsYXJlLmNvbS9tZXRh', 'base64').toString();
    const response = await axios.get(url);
    const data = response.data;
    ISP = `${data.country}-${data.asOrganization}`.replace(/\s/g, '_');
  } catch (error) {
    // Ignore ISP fetch errors
  }

  const subTxt = `${Buffer.from('dmxlc3M=', 'base64').toString()}://${UID}@${CIP}:${CPORT}?encryption=none&security=tls&sni=${MY_DOMAIN}&fp=chrome&type=ws&host=${MY_DOMAIN}&path=${encodeURIComponent(WS_PATH)}#${NAME}-${ISP}`;
  
  console.log('Subscription Link:', subTxt);

  subContent = Buffer.from(subTxt).toString('base64');
  fs.writeFileSync(subPath, subContent);
  console.log('订阅链接已生成并保存。');
}

// --- Main Application Start ---
async function startServer() {
  cleanupOldFiles();
  await generateSubLink();
  httpServer.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
}

startServer();