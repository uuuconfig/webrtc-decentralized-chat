# Decentralized Chat Network - 去中心化聊天网络

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.9+](https://img.shields.io/badge/Python-3.9+-blue.svg)](https://www.python.org/downloads/)

一个基于 WebRTC 的去中心化聊天系统，支持不同网络的设备之间直接通信。无需中心化服务器转发消息，信令服务器仅负责交换连接信息。

## 🎯 项目特点

- ✅ **直连通信** - 消息通过 WebRTC DataChannel 直接传输，低延迟高隐私
- ✅ **自动中继回退** - 直连失败时自动通过信令服务器中继消息
- ✅ **群聊支持** - 支持多人群聊，群内成员之间建立直连
- ✅ **跨平台** - 基于 Web 界面，支持 Windows、macOS、Linux
- ✅ **实时通知** - 用户上线/下线、消息到达实时通知
- ✅ **本地存储** - 聊天记录、联系人、群组信息本地保存
- ✅ **WebUI 仪表板** - 信令服务器提供实时监控仪表板
- ✅ **开源免费** - MIT 许可证，完全开源

## 📁 项目结构

```
p2pchat/
├── README.md                          # 项目说明文档
├── server_config.yaml                 # 信令服务器配置文件
├── client_config.yaml                 # 客户端配置文件
│
├── signal_server/                     # 信令服务器
│   ├── server.py                      # 信令服务器主程序
│   ├── requirements.txt                # 服务端依赖
│   ├── WEBUI_QUICKSTART.md            # WebUI 快速开始指南
│   └── dashboard/                     # WebUI 仪表板
│       ├── index.html                 # 仪表板前端
│       ├── app.js                     # 仪表板逻辑
│       └── style.css                  # 仪表板样式
│
├── client/                            # 客户端
│   ├── app.py                         # 客户端主程序（FastAPI）
│   ├── p2p.py                         # 直连管理模块
│   ├── storage.py                     # 本地存储管理模块
│   ├── timeout_manager.py             # 超时管理模块
│   ├── requirements.txt                # 客户端依赖
│   ├── static/                        # 前端资源
│   │   ├── index.html                 # 聊天界面
│   │   ├── app.js                     # 前端逻辑
│   │   └── style.css                  # 前端样式
│   └── data/                          # 用户数据存储目录
│       └── [username]/                # 按用户名分目录
│           ├── chat_history.json      # 单聊记录
│           ├── group_history.json     # 群聊记录
│           ├── contacts.json          # 联系人列表
│           ├── groups.json            # 群组信息
│           └── settings.json          # 用户设置
│
└── test/                              # 测试文件
    ├── test_storage.py                # 存储模块测试
    └── test_group.py                  # 群聊功能测试
```

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        浏览器 A                              │
│                    (http://localhost:8000)                  │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              客户端 A (FastAPI + WebRTC)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 直连管理器 (aiortc WebRTC)                           │  │
│  │ - 管理与其他客户端的直连                             │  │
│  │ - DataChannel 消息收发                               │  │
│  │ - 自动中继回退                                       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket (信令)
                         ▼
        ┌────────────────────────────────────┐
        │    信令服务器 (WebSocket)           │
        │  - 用户注册和在线列表               │
        │  - 转发 SDP Offer/Answer            │
        │  - 群聊链接管理                     │
        │  - 消息中继（直连失败时）          │
        └────────────────────────────────────┘
                         ▲
                         │ WebSocket (信令)
                         │
┌────────────────────────┴────────────────────────────────────┐
│              客户端 B (FastAPI + WebRTC)                     │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 直连管理器 (aiortc WebRTC)                           │  │
│  │ - 管理与其他客户端的直连                             │  │
│  │ - DataChannel 消息收发                               │  │
│  │ - 自动中继回退                                       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                        浏览器 B                              │
│                    (http://localhost:8001)                  │
└─────────────────────────────────────────────────────────────┘

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

直连路径 (优先):
  客户端 A ◄──── WebRTC DataChannel ────► 客户端 B
  (通过 STUN 穿透 NAT)

中继回退路径 (直连失败时):
  客户端 A ◄──── WebSocket ────► 信令服务器 ◄──── WebSocket ────► 客户端 B
```

## 🚀 快速开始

### 前置要求

- Python 3.9 或更高版本
- pip 包管理工具
- 网络连接（用于 STUN 服务器通信）

### 1. 克隆项目

```bash
git clone https://github.com/yourusername/decentralized-chat.git
cd decentralized-chat
```

### 2. 安装依赖

```bash
# 安装信令服务器依赖
pip install -r signal_server/requirements.txt

# 安装客户端依赖
pip install -r client/requirements.txt
```

### 3. 启动信令服务器

在一台公网可访问的机器上（或本地测试）：

```bash
python signal_server/server.py
```

输出示例：
```
2026-04-07 15:00:00 [INFO] 信令服务器启动在 ws://0.0.0.0:5010
2026-04-07 15:00:00 [INFO] WebUI 访问地址: http://localhost:5011/dashboard
```

### 4. 启动客户端

在每台需要聊天的电脑上：

```bash
cd client
python app.py --signal ws://[服务器IP]:5010 --port 8000
```

参数说明：
- `--signal`：信令服务器地址（默认 `ws://localhost:5010`）
- `--port`：本地 Web 服务端口（默认 `8000`）

输出示例：
```
2026-04-07 15:00:05 [INFO] 启动本地服务: http://localhost:8000
2026-04-07 15:00:05 [INFO] 信令服务器: ws://192.168.1.100:5010
```

### 5. 打开浏览器

访问 `http://localhost:8000`，输入昵称即可开始聊天。

## 🧪 本地测试（单机模拟两个用户）

在同一台电脑上模拟两个用户聊天：

```bash
# 终端 1：启动信令服务器
python signal_server/server.py

# 终端 2：启动用户 A（端口 8000）
cd client && python app.py --port 8000

# 终端 3：启动用户 B（端口 8001）
cd client && python app.py --port 8001
```

然后分别打开：
- 用户 A：`http://localhost:8000`
- 用户 B：`http://localhost:8001`

## ⚙️ 配置说明

### 配置文件概述

项目提供两个配置文件，分别用于服务端和客户端：

- **`server_config.yaml`** - 信令服务器配置
- **`client_config.yaml`** - 客户端配置

### 配置文件使用流程

#### 第一步：查看默认配置

项目已包含默认配置文件，可直接使用。如需自定义，按以下步骤操作：

#### 第二步：编辑配置文件

根据你的部署环境修改配置文件中的参数。

#### 第三步：启动服务

启动时，系统会读取配置文件中的参数。目前配置文件为参考用途，核心参数也可通过命令行参数覆盖。

### 服务端配置 (`server_config.yaml`)

关键配置参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `signal_host` | `0.0.0.0` | WebSocket 信令服务监听地址 |
| `signal_port` | `5010` | WebSocket 信令服务端口 |
| `http_host` | `0.0.0.0` | HTTP WebUI 监听地址 |
| `http_port` | `5011` | HTTP WebUI 端口 |
| `log_level` | `INFO` | 日志级别 (DEBUG/INFO/WARNING/ERROR) |
| `connection_times_maxlen` | `100` | 连接时间样本缓冲区大小 |
| `message_timestamps_maxlen` | `60` | 消息时间戳缓冲区大小 |
| `log_buffer_maxlen` | `100` | 日志缓冲区大小 |

**常见修改场景：**

```yaml
# 场景1：修改服务端口（避免冲突）
signal_server:
  signal_port: 5020  # 改为 5020
  http_port: 5021    # 改为 5021

# 场景2：启用调试日志
signal_server:
  log_level: "DEBUG"  # 改为 DEBUG

# 场景3：增加统计数据缓冲区（保留更多历史）
signal_server:
  stats:
    connection_times_maxlen: 500
    log_buffer_maxlen: 500
```

### 客户端配置 (`client_config.yaml`)

关键配置参数：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `host` | `0.0.0.0` | 本地 Web 服务监听地址 |
| `port` | `8000` | 本地 Web 服务端口 |
| `signal_server` | `ws://localhost:5010` | 信令服务器地址 |
| `base_path` | `data` | 本地数据存储目录 |
| `ice_gathering_timeout` | `5.0` | ICE 候选收集超时（秒） |
| `check_user_timeout` | `5.0` | 用户在线检查超时（秒） |
| `stun_servers` | Google STUN | STUN 服务器列表 |

**常见修改场景：**

```yaml
# 场景1：连接到远程信令服务器
client:
  signal_server: "ws://192.168.1.100:5010"

# 场景2：修改本地端口（运行多个客户端实例）
client:
  port: 8001  # 改为 8001

# 场景3：添加更多 STUN 服务器（提高 NAT 穿透成功率）
client:
  p2p:
    stun_servers:
      - "stun:stun.l.google.com:19302"
      - "stun:stun1.l.google.com:19302"
      - "stun:stun2.l.google.com:19302"
      - "stun:stun3.l.google.com:19302"

# 场景4：调整超时时间（网络较差时增加）
client:
  p2p:
    ice_gathering_timeout: 10.0
    check_user_timeout: 10.0

# 场景5：启用调试日志
client:
  log_level: "DEBUG"
```

### 配置文件加载方式

目前系统使用硬编码的默认值。如需完全使用配置文件，可参考以下方式集成：

```python
import yaml

def load_config(config_file):
    with open(config_file, 'r', encoding='utf-8') as f:
        return yaml.safe_load(f)

# 加载服务端配置
server_config = load_config('server_config.yaml')
signal_port = server_config['signal_server']['signal_port']

# 加载客户端配置
client_config = load_config('client_config.yaml')
signal_server = client_config['client']['signal_server']
```

需要安装 PyYAML：
```bash
pip install pyyaml
```

## ✨ 功能特性

### 单聊功能
- ✅ 用户注册和在线列表
- ✅ 直连聊天（WebRTC DataChannel）
- ✅ 服务器中继回退（直连失败时自动切换）
- ✅ 连接状态实时显示
- ✅ 消息时间戳
- ✅ 聊天记录本地保存
- ✅ 未读消息提醒
- ✅ 用户上线/下线通知

### 群聊功能
- ✅ 创建群聊链接
- ✅ 加入群聊
- ✅ 群内直连
- ✅ 群聊消息广播
- ✅ 群成员管理
- ✅ 群聊记录保存

### 用户界面
- ✅ 暗色主题 UI
- ✅ 响应式设计
- ✅ 实时消息显示
- ✅ 用户状态指示
- ✅ 群聊管理界面

### 服务器功能
- ✅ WebUI 仪表板
- ✅ 实时统计数据
- ✅ 在线用户列表
- ✅ 连接监控
- ✅ 日志查看

## 🛠️ 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 信令服务器 | Python + websockets | 3.9+ |
| 本地后端 | FastAPI + uvicorn | 0.110.0+ |
| 直连通信 | aiortc (WebRTC) | 1.9.0+ |
| 前端 | 原生 HTML/CSS/JS | - |
| STUN | Google STUN 服务 | - |

## 📖 开发指南

### 项目结构说明

**信令服务器 (`signal_server/server.py`)**
- 用户注册和在线列表管理
- SDP Offer/Answer 转发
- 群聊链接管理
- 消息中继（直连失败时）
- WebUI 仪表板支持

**客户端主程序 (`client/app.py`)**
- FastAPI Web 服务
- WebSocket 连接信令服务器
- 直连管理
- 浏览器通信

**直连管理 (`client/p2p.py`)**
- aiortc WebRTC 连接
- DataChannel 消息收发
- 连接状态管理
- 自动中继回退

**存储管理 (`client/storage.py`)**
- 用户数据文件 I/O
- JSON 格式存储
- 数据验证和安全

### 本地开发

1. 克隆项目并安装依赖
2. 修改代码后，重启相应的服务
3. 查看日志输出进行调试
4. 使用浏览器开发者工具调试前端

### 运行测试

```bash
# 测试存储模块
python test_storage.py

# 测试群聊功能
python test_group.py
```

## ❓ 常见问题

### Q: 如何在公网上部署？

A: 
1. 在公网服务器上启动信令服务器
2. 修改客户端的 `--signal` 参数指向服务器公网 IP
3. 确保防火墙允许 5010 和 5011 端口的入站连接

### Q: 直连失败怎么办？

A:
- 检查网络连接和防火墙设置
- 尝试添加更多 STUN 服务器
- 查看浏览器控制台和服务器日志
- 系统会自动回退到中继模式

### Q: 如何修改默认端口？

A:
- 客户端：使用 `--port` 参数
- 信令服务器：编辑 `server_config.yaml` 中的 `signal_port` 和 `http_port`

### Q: 支持哪些操作系统？

A: 支持任何能运行 Python 3.9+ 的操作系统，包括 Windows、macOS、Linux。

### Q: 如何查看服务器监控数据？

A: 访问 `http://[服务器IP]:5011/dashboard` 查看 WebUI 仪表板。

### Q: 聊天记录存储在哪里？

A: 存储在 `client/data/[username]/` 目录下的 JSON 文件中。

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📝 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

## 📧 联系方式

- 提交 Issue：[GitHub Issues](https://github.com/yourusername/decentralized-chat/issues)
- 讨论：[GitHub Discussions](https://github.com/yourusername/decentralized-chat/discussions)

## 🙏 致谢

感谢以下开源项目的支持：
- [FastAPI](https://fastapi.tiangolo.com/)
- [aiortc](https://github.com/aiortc/aiortc)
- [websockets](https://github.com/aaugustin/websockets)
- [aiohttp](https://github.com/aio-libs/aiohttp)

---

**最后更新**: 2026-04-07
