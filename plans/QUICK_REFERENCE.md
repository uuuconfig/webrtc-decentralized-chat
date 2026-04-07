# P2P Chat 本地 JSON 存储方案 - 快速参考

## 🎯 方案一句话总结

**将客户端数据从浏览器 localStorage 迁移到本地 JSON 文件，每个用户独立存储，关键操作实时保存，其他数据定时保存。**

---

## 📊 核心架构

```
浏览器 (localStorage 缓冲)
    ↕ (同步)
后端 (StorageManager + API)
    ↕ (文件 I/O)
本地文件系统 (data/{username}/*.json)
```

---

## 🗂️ 文件结构一览

```
client/data/
├── user1/
│   ├── chat_history.json      ← 单聊记录
│   ├── group_history.json     ← 群聊记录
│   ├── contacts.json          ← 联系人
│   ├── settings.json          ← 设置
│   └── groups.json            ← 群聊信息
├── user2/
│   └── ...
└── .gitkeep
```

---

## 🔄 三个关键流程

### 1️⃣ 登录流程
```
用户输入用户名
  ↓
后端: storage_manager.init_user_folder(username)
  ↓
前端: GET /api/data/{username}/all
  ↓
后端: 返回所有 JSON 数据
  ↓
前端: 加载到 localStorage + 启动自动同步
```

### 2️⃣ 消息发送流程（实时保存）
```
用户发送消息
  ↓
前端: 更新 chatHistory + 保存 localStorage
  ↓
前端: syncToBackend('chat_history', data)
  ↓
后端: POST /api/data/{username}/chat_history
  ↓
后端: 写入 chat_history.json
```

### 3️⃣ 设置修改流程（定时保存）
```
用户修改设置
  ↓
前端: 更新 settings + 保存 localStorage
  ↓
前端: markDirty('settings')
  ↓
定时器 (10秒)
  ↓
前端: syncToBackend('settings', data)
  ↓
后端: 写入 settings.json
```

---

## 🛠️ 实现要点

### 后端 (Python)

**新建文件：`client/storage.py`**
```python
class StorageManager:
    def init_user_folder(username)      # 初始化用户文件夹
    def load_data(username, data_type)  # 加载数据
    def load_all_data(username)         # 加载所有数据
    def save_data(username, data_type, data)  # 保存数据
    def delete_user_data(username)      # 删除数据
    def validate_data(data_type, data)  # 验证数据
```

**修改文件：`client/app.py`**
```python
# 添加 4 个 API 端点
POST   /api/data/{username}/{data_type}      # 保存
GET    /api/data/{username}/{data_type}      # 获取单个
GET    /api/data/{username}/all              # 获取全部
DELETE /api/data/{username}                  # 删除

# 在 handle_browser_message 中添加
if msg_type == "register":
    storage_manager.init_user_folder(username)
```

### 前端 (JavaScript)

**修改文件：`client/static/app.js`**

新增方法：
```javascript
loadFromBackend(username)           // 登录时加载
syncToBackend(dataType, data)       // 实时同步
markDirty(dataType)                 // 标记脏数据
startAutoSync()                     // 启动定时同步
stopAutoSync()                      // 停止定时同步
flushDirtyData()                    // 刷新脏数据
clearLocalStorage()                 // 清空缓存
logout()                            // 登出
```

修改方法：
```javascript
saveHistory()       → 实时同步
saveSettings()      → 标记脏，定时同步
saveContacts()      → 实时同步
saveGroups()        → 实时同步
saveGroupHistory()  → 实时同步
onRegistered()      → 从后端加载数据
```

---

## ⚡ 同步策略速查表

| 操作 | 数据类型 | 同步方式 | 触发条件 |
|------|---------|---------|---------|
| 发送消息 | chat_history | 实时 | 立即 |
| 接收消息 | chat_history | 实时 | 立即 |
| 添加联系人 | contacts | 实时 | 立即 |
| 删除联系人 | contacts | 实时 | 立即 |
| 创建群聊 | groups | 实时 | 立即 |
| 加入群聊 | groups | 实时 | 立即 |
| 群聊消息 | group_history | 实时 | 立即 |
| 修改主题 | settings | 定时 | 10秒 |
| 修改通知 | settings | 定时 | 10秒 |
| 修改无痕 | settings | 定时 | 10秒 |

---

## 📋 API 端点速查表

### 保存数据
```
POST /api/data/{username}/{data_type}

请求体:
{
  "data": { ... }
}

响应:
{
  "success": true,
  "message": "Data saved successfully"
}
```

### 获取单个数据
```
GET /api/data/{username}/{data_type}

响应:
{
  "data": { ... }
}
```

### 获取所有数据
```
GET /api/data/{username}/all

响应:
{
  "chat_history": { ... },
  "group_history": { ... },
  "contacts": { ... },
  "settings": { ... },
  "groups": { ... }
}
```

### 删除用户数据
```
DELETE /api/data/{username}

响应:
{
  "success": true,
  "message": "User data deleted"
}
```

---

## 🔒 安全检查清单

- [ ] 用户名验证（防止路径遍历）
- [ ] 数据类型验证
- [ ] 数据格式验证
- [ ] 文件权限检查
- [ ] 错误处理完善
- [ ] 日志记录充分

---

## ✅ 测试检查清单

### 基础功能
- [ ] 用户登录后数据正确加载
- [ ] 发送消息后自动保存
- [ ] 添加联系人后自动保存
- [ ] 修改设置后定时保存
- [ ] 用户登出后 localStorage 清空

### 多用户
- [ ] 用户 A 和用户 B 数据完全隔离
- [ ] 切换用户时数据正确切换
- [ ] 不同用户的文件夹独立存在

### 数据完整性
- [ ] 聊天记录完整无丢失
- [ ] 群聊记录完整无丢失
- [ ] 联系人列表完整无丢失
- [ ] 设置保存完整无丢失

### 错误处理
- [ ] 网络断开时自动重试
- [ ] 文件不存在时自动创建
- [ ] JSON 解析失败时返回默认值
- [ ] 权限错误时正确处理

---

## 🚀 实现步骤速查

### 第 1 步：后端基础
```
创建 client/storage.py
  ├─ StorageManager 类
  ├─ 文件 I/O 方法
  └─ 数据验证方法
```

### 第 2 步：后端 API
```
修改 client/app.py
  ├─ 导入 StorageManager
  ├─ 添加 4 个 API 端点
  └─ 在 register 时初始化文件夹
```

### 第 3 步：前端加载
```
修改 client/static/app.js
  ├─ 添加 loadFromBackend()
  ├─ 修改 onRegistered()
  └─ 测试登录流程
```

### 第 4 步：前端保存
```
修改 client/static/app.js
  ├─ 添加 syncToBackend()
  ├─ 修改 saveHistory() 等
  └─ 测试消息保存
```

### 第 5 步：前端定时
```
修改 client/static/app.js
  ├─ 添加 startAutoSync()
  ├─ 添加 flushDirtyData()
  └─ 测试定时同步
```

### 第 6 步：测试验证
```
完整测试
  ├─ 单用户测试
  ├─ 多用户测试
  ├─ 数据完整性测试
  └─ 边界情况测试
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
    }
  ]
}
```

### contacts.json
```json
{
  "user1": {
    "name": "user1",
    "addedAt": "2026-04-07T07:00:00Z"
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

---

## 🔍 常见问题速查

### Q: 如果网络断开怎么办？
A: 前端会自动重试（最多 3 次），失败后保留 localStorage 数据，等待网络恢复。

### Q: 如果文件损坏怎么办？
A: 后端会捕获 JSON 解析错误，返回默认值，前端继续使用 localStorage。

### Q: 如何支持多个客户端同时访问？
A: 使用文件锁或队列机制序列化写入操作，防止并发冲突。

### Q: 如何迁移现有 localStorage 数据？
A: 在登录时检查 localStorage，如果有数据则同步到后端。

### Q: 如何备份用户数据？
A: 提供导出功能，将所有 JSON 文件打包下载。

---

## 📚 详细文档索引

| 文档 | 内容 |
|------|------|
| `LOCAL_STORAGE_PLAN.md` | 完整方案设计、API 设计、数据格式 |
| `IMPLEMENTATION_WORKFLOW.md` | 工作流程图、时序图、文件系统变化 |
| `TECHNICAL_SPECIFICATION.md` | 代码示例、实现细节、错误处理 |
| `SOLUTION_SUMMARY.md` | 方案总结、实现顺序、测试计划 |

---

## 💡 关键设计决策

| 决策 | 原因 |
|------|------|
| 混合同步策略 | 平衡数据安全性和网络开销 |
| localStorage 作为缓冲 | 提高前端响应速度 |
| 每个用户独立文件夹 | 支持多用户，数据隔离 |
| 自动重试机制 | 提高可靠性，防止数据丢失 |
| 数据验证 | 确保数据完整性和安全性 |

---

## 🎓 学习路径

1. 先读 `SOLUTION_SUMMARY.md` - 了解整体方案
2. 再读 `LOCAL_STORAGE_PLAN.md` - 理解详细设计
3. 然后读 `IMPLEMENTATION_WORKFLOW.md` - 掌握工作流程
4. 最后读 `TECHNICAL_SPECIFICATION.md` - 学习代码实现

---

## 📞 快速参考

**后端文件：**
- 新建：`client/storage.py`
- 修改：`client/app.py`

**前端文件：**
- 修改：`client/static/app.js`

**数据文件夹：**
- 新建：`client/data/`

**关键类：**
- `StorageManager` - 文件管理

**关键方法：**
- 后端：`init_user_folder()`, `load_data()`, `save_data()`
- 前端：`loadFromBackend()`, `syncToBackend()`, `startAutoSync()`

**关键 API：**
- `GET /api/data/{username}/all`
- `POST /api/data/{username}/{data_type}`
- `GET /api/data/{username}/{data_type}`
- `DELETE /api/data/{username}`

---

**准备好开始实现了吗？** 👉 切换到 Code 模式开始编码！

