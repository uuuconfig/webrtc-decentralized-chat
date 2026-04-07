# P2P Chat 本地 JSON 存储方案

## 📋 概述

将客户端数据从浏览器 localStorage 迁移到本地 JSON 文件，支持多用户独立存储。

**核心目标：**
- ✅ 数据持久化到本地文件系统
- ✅ 支持多用户数据隔离
- ✅ 混合同步策略（关键操作实时保存 + 定时保存）
- ✅ 向后兼容现有 localStorage 数据

---

## 🏗️ 架构设计

### 文件夹结构

```
client/
├── data/                          # 本地数据存储根目录
│   ├── user1/                     # 用户1的数据文件夹
│   │   ├── chat_history.json      # 单聊记录
│   │   ├── group_history.json     # 群聊记录
│   │   ├── contacts.json          # 联系人列表
│   │   └── settings.json          # 用户设置
│   ├── user2/                     # 用户2的数据文件夹
│   │   └── ...
│   └── .gitkeep
├── app.py                         # 后端主程序
├── storage.py                     # StorageManager 类（新建）
└── static/
    └── app.js                     # 前端主程序
```

### 数据映射表

| 前端 localStorage Key | 后端 JSON 文件 | 数据类型 | 同步策略 |
|---|---|---|---|
| `p2pchat_history` | `chat_history.json` | 单聊记录数组 | 实时 |
| `p2pchat_group_history` | `group_history.json` | 群聊记录数组 | 实时 |
| `p2pchat_contacts` | `contacts.json` | 联系人对象 | 实时 |
| `p2pchat_settings` | `settings.json` | 设置对象 | 定时 |
| `p2pchat_groups` | `groups.json` | 群聊信息对象 | 实时 |

---

## 🔄 同步策略

### 关键操作（实时保存）
- 发送/接收消息
- 添加/删除联系人
- 创建/加入/离开群聊
- 群聊消息

### 定时保存
- 设置变更（每 10 秒）
- 其他非关键数据

### 登录/登出流程

**登录时：**
```
1. 用户输入用户名
2. 后端初始化用户文件夹 (如不存在)
3. 前端请求 GET /api/data/{username}/all
4. 后端返回所有用户数据
5. 前端加载到 localStorage
6. 前端初始化 UI
```

**登出时：**
```
1. 清空 localStorage
2. 重置前端状态
3. 返回登录界面
```

---

## 📝 API 端点设计

### 1. 获取所有数据
```
GET /api/data/{username}/all

响应:
{
  "chat_history": {...},
  "group_history": {...},
  "contacts": {...},
  "settings": {...},
  "groups": {...}
}
```

### 2. 获取单个数据类型
```
GET /api/data/{username}/{dataType}
# dataType: chat_history, group_history, contacts, settings, groups

响应:
{
  "data": {...}
}
```

### 3. 保存单个数据类型
```
POST /api/data/{username}/{dataType}

请求体:
{
  "data": {...}
}

响应:
{
  "success": true,
  "message": "Data saved successfully"
}
```

### 4. 删除用户所有数据
```
DELETE /api/data/{username}

响应:
{
  "success": true,
  "message": "User data deleted"
}
```

---

## 🛠️ 后端实现

### StorageManager 类结构

```python
class StorageManager:
    def __init__(self, base_path: str = "data"):
        self.base_path = Path(base_path)
    
    # 初始化用户文件夹
    def init_user_folder(self, username: str) -> Path
    
    # 读取数据
    def load_data(self, username: str, data_type: str) -> dict
    def load_all_data(self, username: str) -> dict
    
    # 保存数据
    def save_data(self, username: str, data_type: str, data: dict) -> bool
    
    # 删除数据
    def delete_user_data(self, username: str) -> bool
    
    # 验证数据
    def validate_data(self, data_type: str, data: dict) -> bool
    
    # 迁移 localStorage 数据（可选）
    def migrate_from_localstorage(self, username: str, data: dict) -> bool
```

### 集成到 app.py

```python
# 在 app.py 中添加
storage_manager = StorageManager()

@app.post("/api/data/{username}/{data_type}")
async def save_data(username: str, data_type: str, request: dict):
    # 验证用户名
    # 保存数据
    # 返回结果

@app.get("/api/data/{username}/{data_type}")
async def get_data(username: str, data_type: str):
    # 读取数据
    # 返回结果

@app.get("/api/data/{username}/all")
async def get_all_data(username: str):
    # 读取所有数据
    # 返回结果

@app.delete("/api/data/{username}")
async def delete_user_data(username: str):
    # 删除用户数据
    # 返回结果
```

---

## 💻 前端实现

### 新增方法

```javascript
// 后端同步相关
async syncToBackend(dataType, data)      // 保存单个数据类型到后端
async loadFromBackend(username)          // 登录时加载所有数据
async loadDataTypeFromBackend(dataType)  // 加载单个数据类型
clearLocalStorage()                      // 清空 localStorage

// 自动保存机制
startAutoSync()                          // 启动定时同步
stopAutoSync()                           // 停止定时同步
markDirty(dataType)                      // 标记数据为脏（需要保存）
```

### 修改现有方法

```javascript
// 修改保存方法，添加后端同步
saveHistory() {
    // 保存到 localStorage
    // 实时同步到后端
    this.syncToBackend('chat_history', this.chatHistory);
}

saveSettings() {
    // 保存到 localStorage
    // 标记为脏，定时同步
    this.markDirty('settings');
}

saveContacts() {
    // 保存到 localStorage
    // 实时同步到后端
    this.syncToBackend('contacts', this.contacts);
}

// 登录时加载数据
async onRegistered(username) {
    this.username = username;
    // 从后端加载所有数据
    await this.loadFromBackend(username);
    // 初始化 UI
}
```

### 自动同步实现

```javascript
// 启动时
init() {
    // ... 现有代码 ...
    this.startAutoSync();
}

startAutoSync() {
    // 定时同步脏数据（每 10 秒）
    this.autoSyncInterval = setInterval(() => {
        this.flushDirtyData();
    }, 10000);
}

flushDirtyData() {
    // 遍历脏数据列表
    // 逐个同步到后端
}
```

---

## 📊 数据格式示例

### chat_history.json
```json
{
  "user1": [
    {
      "id": "msg_123",
      "from": "me",
      "content": "Hello",
      "timestamp": "2026-04-07T07:12:00Z",
      "isIncognito": false,
      "msg_type": "text"
    },
    {
      "id": "msg_124",
      "from": "user1",
      "content": "Hi there",
      "timestamp": "2026-04-07T07:12:05Z",
      "isIncognito": false,
      "msg_type": "text"
    }
  ],
  "user2": [...]
}
```

### contacts.json
```json
{
  "user1": {
    "name": "user1",
    "addedAt": "2026-04-07T07:00:00Z"
  },
  "user2": {
    "name": "user2",
    "addedAt": "2026-04-07T07:05:00Z"
  }
}
```

### settings.json
```json
{
  "theme": "auto",
  "notifications": true,
  "notificationSound": true,
  "defaultIncognito": false,
  "incognitoTimeout": 10,
  "connectTimeout": 30
}
```

### groups.json
```json
{
  "group_id_1": {
    "id": "group_id_1",
    "members": ["me", "user1", "user2"],
    "creator": "me"
  },
  "group_id_2": {
    "id": "group_id_2",
    "members": ["me", "user3"],
    "creator": "user3"
  }
}
```

### group_history.json
```json
{
  "group_id_1": [
    {
      "id": "msg_g1",
      "from": "me",
      "content": "Hello group",
      "timestamp": "2026-04-07T07:12:00Z",
      "isIncognito": false
    }
  ]
}
```

---

## 🔒 错误处理

### 后端
- 文件不存在时创建新文件
- JSON 解析失败时返回空对象
- 权限错误时返回 500 错误
- 用户名验证（防止路径遍历）

### 前端
- 网络错误时重试（最多 3 次）
- 后端返回错误时保留 localStorage 数据
- 同步失败时记录日志但不中断用户操作

---

## ✅ 测试计划

### 单用户测试
- [ ] 登录后数据正确加载
- [ ] 发送消息后自动保存
- [ ] 添加联系人后自动保存
- [ ] 修改设置后定时保存
- [ ] 登出后 localStorage 清空
- [ ] 重新登录后数据恢复

### 多用户测试
- [ ] 用户 A 和用户 B 数据隔离
- [ ] 切换用户时数据正确切换
- [ ] 不同用户的文件夹独立存在

### 数据完整性测试
- [ ] 聊天记录完整
- [ ] 群聊记录完整
- [ ] 联系人列表完整
- [ ] 设置保存完整

### 边界情况
- [ ] 网络断开时的处理
- [ ] 同时修改多个数据类型
- [ ] 大量消息的性能测试
- [ ] 文件损坏时的恢复

---

## 🚀 实现顺序

1. **后端基础** - 创建 StorageManager 类
2. **后端 API** - 添加数据同步端点
3. **前端加载** - 实现登录时从后端加载
4. **前端保存** - 实现关键操作实时保存
5. **前端定时** - 实现定时同步机制
6. **测试验证** - 完整的功能测试
7. **文档更新** - 更新 README 和用户指南

---

## 📌 注意事项

1. **向后兼容**：现有 localStorage 数据应该能迁移到新系统
2. **性能**：避免频繁的文件 I/O，使用缓冲机制
3. **并发**：处理多个客户端同时访问同一用户数据的情况
4. **安全**：验证用户名，防止路径遍历攻击
5. **备份**：考虑定期备份用户数据

