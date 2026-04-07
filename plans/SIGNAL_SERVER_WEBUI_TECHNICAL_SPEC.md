# 信令服务器 WebUI - 技术规范

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器 (WebUI)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Dashboard (HTML/CSS/JS)                                 │  │
│  │  - 服务器状态监控                                        │  │
│  │  - 用户/群聊/连接统计                                    │  │
│  │  - 实时日志查看                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                           ↕ WebSocket                           │
│                    ws://localhost:5010/dashboard                │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                   信令服务器 (Python)                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  HTTP 服务 (aiohttp)                                     │  │
│  │  - GET /dashboard → 返回 HTML/CSS/JS                    │  │
│  │  - WebSocket /dashboard → 推送实时数据                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  WebSocket 信令服务 (websockets)                         │  │
│  │  - 用户注册/离线                                         │  │
│  │  - Offer/Answer 交换                                     │  │
│  │  - 群聊管理                                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  统计数据收集器                                          │  │
│  │  - 用户在线/离线事件                                     │  │
│  │  - 连接请求/完成事件                                     │  │
│  │  - 消息计数                                              │  │
│  │  - 性能指标计算                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  日志管理器                                              │  │
│  │  - 日志拦截                                              │  │
│  │  - 日志分类                                              │  │
│  │  - 日志推送                                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    P2P 聊天客户端                                │
│  - 用户注册                                                      │
│  - 消息发送/接收                                                │
│  - 群聊操作                                                      │
└─────────────────────────────────────────────────────────────────┘
```

## 数据流

### 1. 用户上线流程
```
客户端 → 信令服务器: register {username: "alice"}
         ↓
    更新 clients 字典
    收集统计数据 (online_users++)
    记录日志
         ↓
    推送给所有 WebUI 连接:
    {
      "type": "stats_update",
      "data": {...}
    }
    {
      "type": "log",
      "data": {
        "timestamp": "...",
        "level": "INFO",
        "category": "register",
        "message": "用户注册: alice (在线: 5)",
        "username": "alice"
      }
    }
```

### 2. 连接建立流程
```
客户端A → 信令服务器: offer {target: "bob", conn_id: "xxx"}
         ↓
    检查 pending_offers
    记录连接开始时间
    转发给 bob
         ↓
    推送给 WebUI:
    {
      "type": "pending_offer_added",
      "data": {
        "from": "alice",
        "to": "bob",
        "conn_id": "xxx",
        "timestamp": "..."
      }
    }

客户端B → 信令服务器: answer {target: "alice", conn_id: "xxx"}
         ↓
    计算连接时间
    更新统计数据
    清除 pending_offers
    转发给 alice
         ↓
    推送给 WebUI:
    {
      "type": "pending_offer_removed",
      "data": {
        "conn_id": "xxx",
        "connection_time_ms": 1200
      }
    }
```

### 3. 日志推送流程
```
日志事件 → 自定义 LogHandler
         ↓
    格式化日志
    分类（register/offer/answer/error/group）
         ↓
    推送给所有 WebUI 连接:
    {
      "type": "log",
      "data": {
        "timestamp": "2026-04-07T14:04:54.455Z",
        "level": "INFO",
        "category": "offer",
        "message": "转发 offer: alice -> bob (conn_id=xxx)",
        "username": "alice"
      }
    }
```

## WebSocket 消息类型

### 从服务器到 WebUI

#### 1. stats_update - 统计数据更新
```json
{
  "type": "stats_update",
  "data": {
    "timestamp": "2026-04-07T14:04:54.455Z",
    "online_users": 5,
    "total_users_ever": 12,
    "active_groups": 3,
    "pending_offers": 2,
    "uptime_seconds": 3600,
    "total_messages": 1250,
    "messages_per_second": 0.35,
    "successful_connections": 45,
    "total_connection_attempts": 50,
    "connection_success_rate": 0.90,
    "avg_connection_time_ms": 1200
  }
}
```

#### 2. log - 日志消息
```json
{
  "type": "log",
  "data": {
    "timestamp": "2026-04-07T14:04:54.455Z",
    "level": "INFO",
    "category": "register",
    "message": "用户注册: alice (在线: 5)",
    "username": "alice"
  }
}
```

#### 3. users_update - 用户列表更新
```json
{
  "type": "users_update",
  "data": {
    "users": [
      {
        "username": "alice",
        "connected_at": "2026-04-07T14:00:00.000Z",
        "connection_duration_seconds": 294
      },
      {
        "username": "bob",
        "connected_at": "2026-04-07T14:02:00.000Z",
        "connection_duration_seconds": 114
      }
    ]
  }
}
```

#### 4. groups_update - 群聊列表更新
```json
{
  "type": "groups_update",
  "data": {
    "groups": [
      {
        "group_id": "abc123xyz",
        "creator": "alice",
        "created_at": "2026-04-07T14:00:00.000Z",
        "total_members": 3,
        "online_members": 3,
        "members": ["alice", "bob", "charlie"]
      }
    ]
  }
}
```

#### 5. pending_offers_update - 待处理连接更新
```json
{
  "type": "pending_offers_update",
  "data": {
    "pending_offers": [
      {
        "from": "alice",
        "to": "bob",
        "conn_id": "conn_xxx",
        "started_at": "2026-04-07T14:04:50.000Z",
        "duration_seconds": 4
      }
    ]
  }
}
```

#### 6. initial_data - 初始数据（WebUI 连接时发送）
```json
{
  "type": "initial_data",
  "data": {
    "server_start_time": "2026-04-07T14:00:00.000Z",
    "stats": {...},
    "users": [...],
    "groups": [...],
    "pending_offers": [...],
    "recent_logs": [...]
  }
}
```

## 服务器端实现细节

### 1. 统计数据结构
```python
class ServerStats:
    def __init__(self):
        self.start_time = time.time()
        self.total_messages = 0
        self.successful_connections = 0
        self.total_connection_attempts = 0
        self.connection_times = []  # 用于计算平均连接时间
        self.message_timestamps = deque(maxlen=60)  # 最近60秒的消息时间戳
        self.user_connection_times = {}  # {username: connected_at_timestamp}
        self.total_users_ever = 0  # 历史总用户数
    
    def get_uptime_seconds(self):
        return int(time.time() - self.start_time)
    
    def get_messages_per_second(self):
        # 计算最近60秒的消息吞吐量
        if not self.message_timestamps:
            return 0
        now = time.time()
        recent = [t for t in self.message_timestamps if now - t < 60]
        return len(recent) / 60
    
    def get_connection_success_rate(self):
        if self.total_connection_attempts == 0:
            return 0
        return self.successful_connections / self.total_connection_attempts
    
    def get_avg_connection_time_ms(self):
        if not self.connection_times:
            return 0
        return sum(self.connection_times) / len(self.connection_times)
```

### 2. 日志处理器
```python
import logging
from datetime import datetime

class WebUILogHandler(logging.Handler):
    def __init__(self, webui_manager):
        super().__init__()
        self.webui_manager = webui_manager
        self.log_buffer = deque(maxlen=100)  # 保留最近100条日志
    
    def emit(self, record):
        try:
            # 解析日志消息，提取类别和用户名
            message = record.getMessage()
            category = self._extract_category(message)
            username = self._extract_username(message)
            
            log_data = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "level": record.levelname,
                "category": category,
                "message": message,
                "username": username
            }
            
            self.log_buffer.append(log_data)
            
            # 推送给所有 WebUI 连接
            asyncio.create_task(self.webui_manager.broadcast({
                "type": "log",
                "data": log_data
            }))
        except Exception as e:
            self.handleError(record)
    
    def _extract_category(self, message):
        if "注册" in message:
            return "register"
        elif "offer" in message.lower():
            return "offer"
        elif "answer" in message.lower():
            return "answer"
        elif "群" in message:
            return "group"
        elif "错误" in message or "异常" in message:
            return "error"
        else:
            return "other"
    
    def _extract_username(self, message):
        # 从消息中提取用户名（简单实现）
        import re
        match = re.search(r'(\w+)', message)
        return match.group(1) if match else None
    
    def get_recent_logs(self, limit=100):
        return list(self.log_buffer)[-limit:]
```

### 3. WebUI 管理器
```python
class WebUIManager:
    def __init__(self):
        self.webui_connections = set()
        self.stats = ServerStats()
        self.log_handler = WebUILogHandler(self)
    
    async def register_webui_connection(self, websocket):
        """注册新的 WebUI 连接"""
        self.webui_connections.add(websocket)
        
        # 发送初始数据
        initial_data = {
            "type": "initial_data",
            "data": {
                "server_start_time": datetime.fromtimestamp(
                    self.stats.start_time
                ).isoformat() + "Z",
                "stats": self._get_stats_dict(),
                "users": self._get_users_list(),
                "groups": self._get_groups_list(),
                "pending_offers": self._get_pending_offers_list(),
                "recent_logs": self.log_handler.get_recent_logs()
            }
        }
        
        try:
            await websocket.send(json.dumps(initial_data))
        except Exception as e:
            logger.error(f"发送初始数据失败: {e}")
            self.webui_connections.discard(websocket)
    
    async def unregister_webui_connection(self, websocket):
        """注销 WebUI 连接"""
        self.webui_connections.discard(websocket)
    
    async def broadcast(self, message):
        """广播消息给所有 WebUI 连接"""
        disconnected = set()
        for ws in self.webui_connections:
            try:
                await ws.send(json.dumps(message))
            except Exception:
                disconnected.add(ws)
        
        # 清理断开的连接
        self.webui_connections -= disconnected
    
    def _get_stats_dict(self):
        """获取统计数据字典"""
        return {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "online_users": len(clients),
            "total_users_ever": self.stats.total_users_ever,
            "active_groups": len(group_links),
            "pending_offers": len(pending_offers),
            "uptime_seconds": self.stats.get_uptime_seconds(),
            "total_messages": self.stats.total_messages,
            "messages_per_second": self.stats.get_messages_per_second(),
            "successful_connections": self.stats.successful_connections,
            "total_connection_attempts": self.stats.total_connection_attempts,
            "connection_success_rate": self.stats.get_connection_success_rate(),
            "avg_connection_time_ms": self.stats.get_avg_connection_time_ms()
        }
    
    def _get_users_list(self):
        """获取在线用户列表"""
        users = []
        for username, connected_at in self.stats.user_connection_times.items():
            if username in clients:  # 只返回在线用户
                users.append({
                    "username": username,
                    "connected_at": datetime.fromtimestamp(
                        connected_at
                    ).isoformat() + "Z",
                    "connection_duration_seconds": int(
                        time.time() - connected_at
                    )
                })
        return users
    
    def _get_groups_list(self):
        """获取群聊列表"""
        groups = []
        for group_id, group_data in group_links.items():
            groups.append({
                "group_id": group_id,
                "creator": group_data.get("creator"),
                "created_at": group_data.get("created_at", 
                    datetime.utcnow().isoformat() + "Z"),
                "total_members": len(group_data.get("members", [])),
                "online_members": len(group_data.get("online_members", set())),
                "members": group_data.get("members", [])
            })
        return groups
    
    def _get_pending_offers_list(self):
        """获取待处理连接列表"""
        offers = []
        for (from_user, to_user), conn_id in pending_offers.items():
            offers.append({
                "from": from_user,
                "to": to_user,
                "conn_id": conn_id,
                "started_at": datetime.utcnow().isoformat() + "Z",
                "duration_seconds": 0  # 可以记录实际时间
            })
        return offers
```

### 4. HTTP 服务集成
```python
from aiohttp import web

async def serve_dashboard(request):
    """提供 WebUI 静态文件"""
    return web.FileResponse('signal_server/dashboard/index.html')

async def dashboard_websocket(request):
    """WebUI WebSocket 连接处理"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    await webui_manager.register_webui_connection(ws)
    
    try:
        async for msg in ws:
            if msg.type == web.WSMsgType.ERROR:
                logger.error(f'WebUI WebSocket 错误: {ws.exception()}')
    finally:
        await webui_manager.unregister_webui_connection(ws)
    
    return ws

# 创建 HTTP 应用
app = web.Application()
app.router.add_get('/dashboard', serve_dashboard)
app.router.add_get('/dashboard/ws', dashboard_websocket)
app.router.add_static('/dashboard/static', 'signal_server/dashboard')

# 在主函数中启动 HTTP 服务
async def main():
    # 启动 WebSocket 信令服务
    async with serve(handler, "0.0.0.0", 5010):
        # 启动 HTTP 服务
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "0.0.0.0", 5011)  # 不同端口
        await site.start()
        
        logger.info("信令服务器启动在 ws://0.0.0.0:5010")
        logger.info("WebUI 访问地址: http://localhost:5011/dashboard")
        
        await asyncio.Future()
```

## 前端实现细节

### 1. WebSocket 连接管理
```javascript
class DashboardClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
    }
    
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/dashboard/ws`;
        
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('已连接到信令服务器');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
        };
        
        this.ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            this.handleMessage(msg);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket 错误:', error);
            this.updateConnectionStatus(false);
        };
        
        this.ws.onclose = () => {
            console.log('连接已断开');
            this.updateConnectionStatus(false);
            this.attemptReconnect();
        };
    }
    
    handleMessage(msg) {
        switch (msg.type) {
            case 'initial_data':
                this.handleInitialData(msg.data);
                break;
            case 'stats_update':
                this.updateStats(msg.data);
                break;
            case 'log':
                this.addLog(msg.data);
                break;
            case 'users_update':
                this.updateUsers(msg.data);
                break;
            case 'groups_update':
                this.updateGroups(msg.data);
                break;
            case 'pending_offers_update':
                this.updatePendingOffers(msg.data);
                break;
        }
    }
    
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        }
    }
}
```

### 2. 数据更新和渲染
```javascript
class Dashboard {
    constructor() {
        this.client = new DashboardClient();
        this.logs = [];
        this.filteredLogs = [];
        this.currentFilter = 'all';
        this.init();
    }
    
    init() {
        this.client.connect();
        this.setupEventListeners();
    }
    
    updateStats(stats) {
        document.getElementById('online-users').textContent = stats.online_users;
        document.getElementById('active-groups').textContent = stats.active_groups;
        document.getElementById('pending-offers').textContent = stats.pending_offers;
        document.getElementById('uptime').textContent = this.formatUptime(stats.uptime_seconds);
        document.getElementById('total-messages').textContent = stats.total_messages;
        document.getElementById('messages-per-second').textContent = 
            stats.messages_per_second.toFixed(2);
        document.getElementById('connection-success-rate').textContent = 
            (stats.connection_success_rate * 100).toFixed(1) + '%';
        document.getElementById('avg-connection-time').textContent = 
            stats.avg_connection_time_ms.toFixed(0) + 'ms';
    }
    
    addLog(logData) {
        this.logs.unshift(logData);
        if (this.logs.length > 100) {
            this.logs.pop();
        }
        this.renderLogs();
    }
    
    filterLogs(category) {
        this.currentFilter = category;
        if (category === 'all') {
            this.filteredLogs = this.logs;
        } else {
            this.filteredLogs = this.logs.filter(log => log.category === category);
        }
        this.renderLogs();
    }
    
    renderLogs() {
        const logContainer = document.getElementById('logs-container');
        logContainer.innerHTML = this.filteredLogs.map(log => `
            <div class="log-entry log-${log.level.toLowerCase()}">
                <span class="log-time">${log.timestamp.substring(11, 19)}</span>
                <span class="log-level">[${log.level}]</span>
                <span class="log-category">${log.category}</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');
        
        // 自动滚动到底部
        logContainer.scrollTop = logContainer.scrollHeight;
    }
    
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) {
            return `${days}天 ${hours}小时 ${minutes}分钟`;
        } else if (hours > 0) {
            return `${hours}小时 ${minutes}分钟`;
        } else {
            return `${minutes}分钟 ${secs}秒`;
        }
    }
}
```

## 部署和启动

### 依赖安装
```bash
pip install aiohttp
```

### 启动命令
```bash
python signal_server/server.py
```

### 访问地址
- WebUI: http://localhost:5011/dashboard
- 信令服务: ws://localhost:5010
