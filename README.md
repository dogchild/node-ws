<div align="center">

# nodejs-x：平台友好型 Node.js 服务

</div>

`nodejs-x` 是一个轻量级的 Node.js 应用程序，旨在创建 VLESS-WebSocket 服务。它针对在各种托管平台上的部署进行了优化，包括那些支持 Node.js 应用程序的共享 PHP 托管平台。通过避免使用重型依赖和采用代码混淆，本项目旨在实现低资源消耗和高平台兼容性。

该项目不再使用 Cloudflare Argo 隧道，而是依赖于标准的 Cloudflare CDN 代理（“小黄云”）来处理 TLS 加密和保护源服务器。

---

## 工作原理

本应用的架构简洁高效：

1.  **Cloudflare 代理：** 您通过 Cloudflare DNS 将一个域名或子域名（例如 `sub.yourdomain.com`）指向您的服务器 IP 地址，并确保代理状态设置为“已代理”（橙色云朵图标）。
2.  **Node.js 服务器：** 应用程序启动一个 Koa.js 服务器，在单个端口（`PORT`）上同时监听标准的 HTTP 和 WebSocket 流量。
3.  **内部服务：** 它会下载并运行一个 `front` (`xray`) 进程，该进程监听一个仅供内部使用的端口（`A_PORT`）。
4.  **流量处理：** 当 WebSocket 连接请求到达您的域名时，Cloudflare 会将其转发到 Node.js 服务器。然后，服务器将此流量通过管道传输到内部的 `front` 进程，由该进程处理 VLESS 协议。
5.  **订阅链接：** 服务器还提供一个订阅地址（`/{S_PATH}`），为客户端提供一个 Base64 编码的订阅链接，其中包含所有连接详细信息。

这种方法不再需要 `cloudflared` 守护进程，从而显著降低了内存和 CPU 的使用率。

## 部署指南

### 前提条件

*   一个域名。
*   一个 Cloudflare 账户。
*   一个支持 Node.js 的托管平台。

### 步骤

1.  **配置 Cloudflare：**
    *   在您的 Cloudflare 账户中，为您的域名添加一个 `A` 记录，指向您服务器的 IP 地址。
    *   确保该记录的“代理状态 (Proxy status)”设置为“已代理 (Proxied)”（橙色云朵图标）。

2.  **上传文件：**
    *   将 `index.js` 和 `package.json` 这两个文件上传到您网站的根目录（例如 `public_html`, `wwwroot` 等）。

3.  **部署应用：**
    *   在您主机的控制面板中，找到“Setup Node.js App”或类似的选项。
    *   创建一个新的 Node.js 应用，并确保应用根目录指向您上传文件的位置。
    *   平台会自动运行 `npm install` 来安装依赖。
    *   在应用设置中，配置下文提到的**环境变量**。
    *   启动应用。

## 📋 环境变量

| 变量名 | 是否必须 | 默认值 | 说明 |
|---|---|---|---|
| `PORT` | 否 | `3005` | 平台分配给应用的公开端口。通常由平台自动设置。 |
| `MY_DOMAIN` | **是** | - | **必须设置。** 您在 Cloudflare 上配置并指向服务器的域名。 |
| `UID` | 否 | (预设值) | VLESS 服务的用户 ID。 |
| `WS_PATH` | 否 | `/<UID前8位>` | WebSocket 使用的路径。 |
| `S_PATH` | 否 | (UID的值) | 订阅链接的访问路径。 |
| `A_PORT` | 否 | `8001` | 内部 `front` (`xray`) 服务监听的端口，无需公开。 |
| `CIP` | 否 | `cf.877774.xyz` | (可选) 用于生成订阅链接的优选IP/域名。 |
| `CPORT` | 否 | `443` | 对应 `CIP` 的端口。 |
| `NAME` | 否 | `Vls` | 订阅链接中节点的名称前缀。 |
| `FILE_PATH` | 否 | `./tmp` | 存放 `front` 程序和配置文件的临时目录。 |

## 🌐 订阅地址

*   `https://<MY_DOMAIN>/{S_PATH}`

*注意: `S_PATH` 默认为 `UID` 的值。*

---

## 📚 更多信息

- [GitHub仓库](https://github.com/dogchild/nodejs-x)
- [问题反馈](https://github.com/dogchild/nodejs-x/issues)

---
  
# 免责声明
* 本程序仅供学习了解, 非盈利目的，请于下载后 24 小时内删除, 不得用作任何商业用途, 文字、数据及图片均有所属版权, 如转载须注明来源。
* 使用本程序必循遵守部署免责声明，使用本程序必循遵守部署服务器所在地、所在国家和用户所在国家的法律法规, 程序作者不对使用者任何不当行为负责。