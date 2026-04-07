# P2P Chat 本地 JSON 存储方案 - 完整总结

## 📌 方案概览

将 P2P Chat 客户端的数据存储从浏览器 localStorage 迁移到本地 JSON 文件系统，支持多用户独立存储和数据持久化。

---

## 🎯 核心目标

| 目标 | 说明 |
|------|------|
| **数据持久化** | 数据存储在本地文件系统，不依赖浏览器 localStorage |
| **多用户支持** | 每个用户有独立的数据文件夹，数据完全隔离 |
| **混合同步** | 关键操作实时保存，其他数据定时保存 |
| **向后兼容** | 现有 localStorage 数据可平滑迁移 |
| **高可用性** | 网络错误时自动重试，保证数据不丢失 |

---

## 📁 文件夹结构

```
client/
├── data/                          # 本地数据存储根目录
│   ├── user1/                     # 用户1的数据文件夹
│   │   ├── chat_history.json      # 单聊记录
│   │   ├── group_history.json     # 群聊记录
│   │   ├── contacts.json          # 联系人列表
│   │   ├── settings.json          # 用户设置
│   │   └── groups.json            # 群聊信息
│   ├── user2/                     # 用户2的数据文件夹
│   │   └── ...
│   └── .gitkeep
├── app.py                         # 后端主程序（修改）
├── storage.py                     # StorageManager 类（新建）
└── static/
    └── app.js                     # 前端主程序（修改）
```

---

## 🔄 数据流向

### 登录流程
```
用户输入用户名
    ↓
后端初始化用户文件夹
    ↓
前端请求 GET /api/data/{username}/all
    ↓
后端返回所有用户数据
    ↓
前端加载到 localStorage
    ↓
前端初始化 UI 并启动自动同步
```

### 消息发送流程
```
用户发送消息
    ↓
前端更新 chatHistory，保存到 localStorage
    ↓
前端立即调用 syncToBackend('chat_history')
    ↓
后端写入 chat_history.json
    ↓
返回成功
```

### 设置修改流程
```
用户修改设置
    ↓
前端更新 settings，保存到 localStorage
    ↓
前端标记 'settings' 为脏
    ↓
定时器触发（10秒）
    ↓
前端调用 syncToBackend('settings')
    ↓
后端写入 settings.json
```

---

## 🛠️ 实现组件

### 后端组件

#### 1. StorageManager 类 (`client/storage.py`)
- **职责**：管理所有文件 I/O 操作
- **主要方法**：
  - `init_user_folder(username)` - 初始化用户文件夹
  - `load_data(username, data_type)` - 加载单个数据类型
  - `load_all_data(username)` - 加载所有数据
  - `save_data(username, data_type, data)` - 保存数据
  - `delete_user_data(username)` - 删除用户数据
  - `validate_data(data_type, data)` - 验证数据格式

#### 2. API 端点 (在 `client/app.py` 中添加)
- `POST /api/data/{username}/{data_type}` - 保存数据
- `GET /api/data/{username}/{data_type}` - 获取单个数据类型
- `GET /api/data/{username}/all` - 获取所有数据
- `DELETE /api/data/{username}` - 删除用户数据

### 前端组件

#### 1. 后端同步方法 (在 `client/static/app.js` 中添加)
- `loadFromBackend(username)` - 登录时加载所有数据
- `syncToBackend(dataType, data)` - 同步数据到后端
- `markDirty(dataType)` - 标记数据为脏
- `startAutoSync()` - 启动定时同步
- `stopAutoSync()` - 停止定时同步
- `flushDirtyData()` - 刷新脏数据
- `clearLocalStorage()` - 清空 localStorage
- `logout()` - 登出

#### 2. 修改现有方法
- `saveHistory()` - 实时同步到后端
- `saveSettings()` - 标记为脏，定时同步
- `saveContacts()` - 实时同步到后端
- `saveGroups()` - 实时同步到后端
- `saveGroupHistory()` - 实时同步到后端
- `onRegistered(username)` - 登录时从后端加载数据

---

## 📊 数据映射表

| 前端 localStorage Key | 后端 JSON 文件 | 同步策略 | 说明 |
|---|---|---|---|
| `p2pchat_history` | `chat_history.json` | 实时 | 单聊记录 |
| `p2pchat_group_history` | `group_history.json` | 实时 | 群聊记录 |
| `p2pchat_contacts` | `contacts.json` | 实时 | 联系人列表 |
| `p2pchat_settings` | `settings.json` | 定时 | 用户设置 |
| `p2pchat_groups` | `groups.json` | 实时 | 群聊信息 |

---

## ⚡ 同步策略

### 关键操作（实时保存）
- 发送/接收消息 → 立即调用 `syncToBackend('chat_history')`
- 添加/删除联系人 → 立即调用 `syncToBackend('contacts')`
- 创建/加入/离开群聊 → 立即调用 `syncToBackend('groups')`
- 群聊消息 → 立即调用 `syncToBackend('group_history')`
- 清空聊天记录 → 立即调用 `syncToBackend('chat_history')`

### 定时保存（10秒一次）
- 修改主题 → 标记 `markDirty('settings')`
- 修改通知设置 → 标记 `markDirty('settings')`
- 修改无痕模式设置 → 标记 `markDirty('settings')`
- 修改连接超时 → 标记 `markDirty('settings')`

---

## 🔒 安全性考虑

### 用户名验证
- 不允许空字符串或超过 100 字符
- 不允许包含路径分隔符 (`/`, `\`)
- 不允许包含特殊字符 (`..`, `\x00`, `\n`, `\r`)
- 防止路径遍历攻击

### 数据验证
- 验证数据类型（必须是 dict）
- 验证必需字段存在
- 验证数据格式正确

### 错误处理
- 文件不存在时创建新文件
- JSON 解析失败时返回默认值
- 权限错误时返回 500 错误
- 网络错误时自动重试（最多 3 次）

---

## 📈 性能优化

### 缓冲机制
- 使用 localStorage 作为内存缓冲
- 减少频繁的文件 I/O
- 定时批量同步

### 并发处理
- 使用队列机制序列化写入操作
- 防止并发写入冲突

### 大数据处理
- 对于大量消息，考虑分页加载
- 只在内存中保留最近的消息
- 旧消息存档到单独的文件

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

### 第一阶段：后端基础
1. 创建 `StorageManager` 类
2. 实现文件 I/O 操作
3. 实现数据验证

### 第二阶段：后端 API
1. 添加 4 个 API 端点
2. 集成到 `app.py`
3. 在用户注册时初始化文件夹

### 第三阶段：前端加载
1. 实现 `loadFromBackend()` 方法
2. 修改 `onRegistered()` 方法
3. 测试登录流程

### 第四阶段：前端保存
1. 实现 `syncToBackend()` 方法
2. 修改 `saveHistory()` 等方法
3. 测试消息保存

### 第五阶段：前端定时
1. 实现 `startAutoSync()` 方法
2. 实现 `flushDirtyData()` 方法
3. 测试定时同步

### 第六阶段：测试验证
1. 单用户测试
2. 多用户测试
3. 数据完整性测试
4. 边界情况测试

### 第七阶段：文档更新
1. 更新 README
2. 更新用户指南
3. 添加开发文档

---

## 📝 关键文件清单

### 新建文件
- `client/storage.py` - StorageManager 类
- `client/data/.gitkeep` - 数据文件夹占位符

### 修改文件
- `client/app.py` - 添加 API 端点和 StorageManager 集成
- `client/static/app.js` - 添加后端同步逻辑

### 文档文件
- `plans/LOCAL_STORAGE_PLAN.md` - 完整方案设计
- `plans/IMPLEMENTATION_WORKFLOW.md` - 工作流程和时序图
- `plans/TECHNICAL_SPECIFICATION.md` - 技术规范和代码示例

---

## 🔍 验证清单

### 代码审查
- [ ] StorageManager 类实现完整
- [ ] API 端点实现正确
- [ ] 前端同步逻辑正确
- [ ] 错误处理完善
- [ ] 代码注释清晰

### 功能测试
- [ ] 登录/登出流程正常
- [ ] 数据保存/加载正常
- [ ] 多用户数据隔离
- [ ] 网络错误处理
- [ ] 性能满足要求

### 集成测试
- [ ] 与现有功能兼容
- [ ] 与信令服务器兼容
- [ ] 与 P2P 连接兼容
- [ ] 与群聊功能兼容

---

## 📚 相关文档

1. **LOCAL_STORAGE_PLAN.md** - 详细的方案设计文档
2. **IMPLEMENTATION_WORKFLOW.md** - 工作流程和时序图
3. **TECHNICAL_SPECIFICATION.md** - 技术规范和代码示例

---

## 💡 后续优化方向

### 短期优化
- 添加数据备份功能
- 添加数据导入/导出功能
- 添加数据加密功能

### 中期优化
- 实现数据版本控制
- 实现数据同步冲突解决
- 实现数据压缩存储

### 长期优化
- 实现云端备份
- 实现跨设备同步
- 实现数据分析和统计

---

## 📞 支持和反馈

如有任何问题或建议，请参考相关文档或联系开发团队。

