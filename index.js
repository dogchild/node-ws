#!/usr/bin/env node

require('dotenv').config({ override: true });
const Koa = require('koa');
const websockify = require('koa-websocket');
const net = require('net');
const Router = require('@koa/router');
const app = websockify(new Koa());
const router = new Router();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const FILE_PATH = process.env.FILE_PATH || './tmp';   // 运行目录,sub节点文件保存目录
const UID = process.env.UID || '75de94bb-b5cb-4ad4-b72b-251476b36f3a'; // 用户ID
const S_PATH = process.env.S_PATH || UID;       // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3005;        // http服务订阅端口
const A_PORT = process.env.A_PORT || 8001;            // front 监听的内部端口
const MY_DOMAIN = process.env.MY_DOMAIN || '';        // 部署应用的域名, 必须设置
const WS_PATH = process.env.WS_PATH || `/${UID.slice(0, 8)}`; // websocket路径
const CIP = process.env.CIP || 'cf.877774.xyz';         // 节点优选域名或优选ip  
const CPORT = process.env.CPORT || 443;                   // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || 'Vls';                     // 节点名称

//创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

let subPath = path.join(FILE_PATH, 'sub.txt');
let configPath = path.join(FILE_PATH, 'config.json');

//清理历史文件
function cleanupOldFiles() {
  const pathsToDelete = ['sub.txt'];
  pathsToDelete.forEach(file => {
    const filePath = path.join(FILE_PATH, file);
    fs.unlink(filePath, () => {});
  });
}

let subContent = '';

// 根路由
router.get("/", ctx => {
  ctx.body = "Hello world!";
});

router.get(`/${S_PATH}`, ctx => {
  ctx.type = 'text/plain; charset=utf-8';
  ctx.body = subContent;
});

app.use(router.routes()).use(router.allowedMethods());

// WebSocket 代理逻辑
app.ws.use((ctx) => {
  if (ctx.path === WS_PATH) {
    const frontSocket = net.connect({ host: '127.0.0.1', port: A_PORT });
    const clientSocket = ctx.websocket;
    clientSocket.pipe(frontSocket).pipe(clientSocket);
    clientSocket.on('error', () => frontSocket.destroy());
    frontSocket.on('error', () => clientSocket.close());
    clientSocket.on('close', () => frontSocket.destroy());
    frontSocket.on('close', () => clientSocket.close());
  } else {
    ctx.websocket.close();
  }
});

// 生成front配置文件
const config = {
  log: { loglevel: 'none' },
  inbounds: [{
    port: A_PORT,
    protocol: Buffer.from('dmxlc3M=', 'base64').toString(),
    settings: {
        clients: [{ id: UID }],
        decryption: 'none'
    },
    streamSettings: {
        network: 'ws',
        wsSettings: {
            path: WS_PATH
        }
    }
  }],
  outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
};
fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = path.join(FILE_PATH, fileName);
  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        
        // 获取下载文件的实际大小
        fs.stat(filePath, (err, stats) => {
          if (err) {
            const errorMessage = `Failed to check file size: ${err.message}`;
            console.error(errorMessage);
            fs.unlink(filePath, () => {});
            callback(errorMessage);
            return;
          }
          
          // 从响应头获取预期的文件大小
          const expectedSize = response.headers['content-length'];
          
          // 如果服务器提供了Content-Length，则进行校验
          if (expectedSize) {
            const expectedBytes = parseInt(expectedSize);
            const actualBytes = stats.size;
            
            if (expectedBytes !== actualBytes) {
              const errorMessage = `File ${fileName} integrity check failed: expected ${expectedBytes} bytes, got ${actualBytes} bytes`;
              console.error(errorMessage);
              fs.unlink(filePath, () => {});
              callback(errorMessage);
              return;
            }
          }
          
          console.log(`Download ${fileName} successfully`);
          callback(null, fileName);
        });
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => { });
        const errorMessage = `Download ${fileName} failed: ${err.message}`;
        console.error(errorMessage); // 下载失败时输出错误消息
        callback(errorMessage);
      });
    })
    .catch(err => {
      fs.unlink(filePath, () => { });
      const errorMessage = `Download ${fileName} failed: ${err.message}`;
      console.error(errorMessage); // 下载失败时输出错误消息
      callback(errorMessage);
    });
}

// 下载并运行依赖文件
async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const allFiles = getFilesForArchitecture(architecture);

  if (allFiles.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  // 过滤掉已存在的文件，只下载不存在的文件
  const filesToDownload = allFiles.filter(fileInfo => {
    const filePath = path.join(FILE_PATH, fileInfo.fileName);
    const exists = fs.existsSync(filePath);
    if (exists) {
      console.log(`${fileInfo.fileName} already exists, skipping download`);
    }
    return !exists;
  });

  if (filesToDownload.length === 0) {
    console.log('All required files already exist, skipping download');
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, fileName) => {
        if (err) {
          reject(err);
        } else {
          resolve(fileName);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }
  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(relativeFilePath => {
      const absoluteFilePath = path.join(FILE_PATH, relativeFilePath);
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  
  const filesToAuthorize = ['./front'];
  authorizeFiles(filesToAuthorize);

  //运行front
  const command1 = `nohup ${FILE_PATH}/front -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log('front is running');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`front running error: ${error}`);
  }

  await new Promise((resolve) => setTimeout(resolve, 2000)); // 等待front启动

}

//根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: "front", fileUrl: "https://arm.dogchild.eu.org/front" }
    ];
  } else {
    baseFiles = [
      { fileName: "front", fileUrl: "https://amd.dogchild.eu.org/front" }
    ];
  }

  return baseFiles;
}

// 生成订阅链接
async function generateSubLink() {
  if (!MY_DOMAIN) {
    console.error('错误: MY_DOMAIN 环境变量未设置, 无法生成订阅链接。');
    return;
  }

  let ISP = '';
  try {
    const url = Buffer.from('aHR0cHM6Ly9zcGVlZC5jbG91ZGZsYXJlLmNvbS9tZXRh', 'base64').toString();
    const response = await axios.get(url);
    const data = response.data;
    ISP = `${data.country}-${data.asOrganization}`.replace(/\s/g, '_');
  } catch (error) {
    ISP = 'Unknown-ISP';
  }

  const subTxt = `${Buffer.from('dmxlc3M=', 'base64').toString()}://${UID}@${MY_DOMAIN}:${CPORT}?encryption=none&security=tls&sni=${MY_DOMAIN}&fp=chrome&type=ws&host=${MY_DOMAIN}&path=${encodeURIComponent(WS_PATH)}#${NAME}-${ISP}`;
  
  subContent = Buffer.from(subTxt).toString('base64');
  fs.writeFileSync(subPath, subContent);
  console.log('订阅链接已生成并保存。');
}

// 主程序启动
async function startserver() {
  cleanupOldFiles();
  await downloadFilesAndRun();
  await generateSubLink();
}
startserver();

app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
