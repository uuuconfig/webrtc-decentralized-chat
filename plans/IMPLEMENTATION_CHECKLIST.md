# P2P Chat 本地 JSON 存储方案 - 实现检查清单

## 📋 实现前准备

### 环境检查
- [ ] Python 3.8+ 已安装
- [ ] FastAPI 已安装
- [ ] 项目结构清晰
- [ ] 现有代码已备份

### 文档准备
- [ ] 已阅读 `SOLUTION_SUMMARY.md`
- [ ] 已阅读 `LOCAL_STORAGE_PLAN.md`
- [ ] 已阅读 `TECHNICAL_SPECIFICATION.md`
- [ ] 已理解整体架构

---

## 🔧 第一阶段：后端基础实现

### 创建 StorageManager 类

**文件：`client/storage.py`**

- [ ] 创建文件
- [ ] 实现 `__init__()` 方法
- [ ] 实现 `_get_user_dir()` 方法
- [ ] 实现 `_validate_username()` 方法
- [ ] 实现 `init_user_folder()` 方法
- [ ] 实现 `load_data()` 方法
- [ ] 实现 `load_all_data()` 方法
- [ ] 实现 `save_data()` 方法
- [ ] 实现 `delete_user_data()` 方法
- [ ] 实现 `validate_data()` 方法
- [ ] 实现 `_read_json_file()` 方法
- [ ] 实现 `_write_json_file()` 方法
- [ ] 添加日志记录
- [ ] 添加错误处理
- [ ] 代码审查和测试

### 验证 StorageManager

```bash
# 测试代码
python -c "
from client.storage import StorageManager
sm = StorageManager()
sm.init_user_folder('test_user')
print('✓ StorageManager 创建成功')
"
```

- [ ] 导入成功
- [ ] 初始化成功
- [ ] 文件夹创建成功
- [ ] 默认文件创建成功

---

## 🔌 第二阶段：后端 API 实现

### 修改 app.py

**文件：`client/app.py`**

#### 导入和初始化
- [ ] 导入 `StorageManager`
- [ ] 创建 `storage_manager` 实例
- [ ] 添加日志配置

#### 添加 API 端点

**端点 1：保存数据**
```python
@app.post("/api/data/{username}/{data_type}")
async def save_data(username: str, data_type: str, request: dict):
```
- [ ] 验证用户名
- [ ] 验证数据类型
- [ ] 调用 `storage_manager.save_data()`
- [ ] 返回成功/失败响应
- [ ] 错误处理

**端点 2：获取单个数据**
```python
@app.get("/api/data/{username}/{data_type}")
async def get_data(username: str, data_type: str):
```
- [ ] 验证用户名
- [ ] 验证数据类型
- [ ] 调用 `storage_manager.load_data()`
- [ ] 返回数据
- [ ] 错误处理

**端点 3：获取所有数据**
```python
@app.get("/api/data/{username}/all")
async def get_all_data(username: str):
```
- [ ] 验证用户名
- [ ] 初始化用户文件夹
- [ ] 调用 `storage_manager.load_all_data()`
- [ ] 返回所有数据
- [ ] 错误处理

**端点 4：删除用户数据**
```python
@app.delete("/api/data/{username}")
async def delete_user_data(username: str):
```
- [ ] 验证用户名
- [ ] 调用 `storage_manager.delete_user_data()`
- [ ] 返回成功/失败响应
- [ ] 错误处理

#### 修改现有代码

**在 `handle_browser_message()` 中**
- [ ] 找到 `msg_type == "register"` 分支
- [ ] 添加 `storage_manager.init_user_folder(username)`
- [ ] 测试用户注册流程

### 验证 API 端点

```bash
# 测试 API
curl -X GET http://localhost:8000/api/data/test_user/all
curl -X POST http://localhost:8000/api/data/test_user/settings \
  -H "Content-Type: application/json" \
  -d '{"data": {"theme": "dark"}}'
```

- [ ] 所有端点可访问
- [ ] 返回正确的数据格式
- [ ] 错误处理正确
- [ ] 日志记录完整

---

## 💻 第三阶段：前端加载实现

### 修改 app.js

**文件：`client/static/app.js`**

#### 添加新属性
- [ ] `autoSyncInterval`
- [ ] `dirtyData`
- [ ] `syncRetryCount`
- [ ] `MAX_RETRY`
- [ ] `SYNC_INTERVAL`

#### 添加后端加载方法

**方法：`loadFromBackend(username)`**
- [ ] 发送 `GET /api/data/{username}/all`
- [ ] 处理响应数据
- [ ] 加载到 localStorage
- [ ] 错误处理和回退

**方法：`loadDataTypeFromBackend(dataType)`**
- [ ] 发送 `GET /api/data/{username}/{dataType}`
- [ ] 返回数据
- [ ] 错误处理

#### 修改 onRegistered 方法
- [ ] 调用 `loadFromBackend(username)`
- [ ] 初始化 UI
- [ ] 启动自动同步
- [ ] 显示主界面

### 验证前端加载

- [ ] 登录后数据正确加载
- [ ] localStorage 正确填充
- [ ] UI 正确初始化
- [ ] 没有控制台错误

---

## 💾 第四阶段：前端保存实现

### 修改 app.js

**文件：`client/static/app.js`**

#### 添加同步方法

**方法：`syncToBackend(dataType, data)`**
- [ ] 验证用户名
- [ ] 发送 `POST /api/data/{username}/{dataType}`
- [ ] 处理响应
- [ ] 重试机制
- [ ] 错误处理

**方法：`markDirty(dataType)`**
- [ ] 添加到 `dirtyData` 集合

**方法：`clearLocalStorage()`**
- [ ] 清空所有 localStorage 键

#### 修改保存方法

**修改：`saveHistory()`**
- [ ] 保存到 localStorage
- [ ] 调用 `syncToBackend('chat_history', ...)`

**修改：`saveSettings()`**
- [ ] 保存到 localStorage
- [ ] 调用 `markDirty('settings')`

**修改：`saveContacts()`**
- [ ] 保存到 localStorage
- [ ] 调用 `syncToBackend('contacts', ...)`

**修改：`saveGroups()`**
- [ ] 保存到 localStorage
- [ ] 调用 `syncToBackend('groups', ...)`

**修改：`saveGroupHistory()`**
- [ ] 保存到 localStorage
- [ ] 调用 `syncToBackend('group_history', ...)`

### 验证前端保存

- [ ] 发送消息后自动保存
- [ ] 添加联系人后自动保存
- [ ] 后端文件正确更新
- [ ] 没有控制台错误

---

## ⏱️ 第五阶段：前端定时同步实现

### 修改 app.js

**文件：`client/static/app.js`**

#### 添加定时同步方法

**方法：`startAutoSync()`**
- [ ] 创建定时器
- [ ] 每 10 秒调用 `flushDirtyData()`
- [ ] 记录日志

**方法：`stopAutoSync()`**
- [ ] 清除定时器
- [ ] 记录日志

**方法：`flushDirtyData()`**
- [ ] 遍历 `dirtyData`
- [ ] 逐个同步到后端
- [ ] 清除脏标记

#### 修改 init 方法
- [ ] 移除本地加载代码
- [ ] 等待登录后加载

#### 添加 logout 方法
- [ ] 停止自动同步
- [ ] 清空 localStorage
- [ ] 重置前端状态
- [ ] 返回登录界面

### 验证前端定时同步

- [ ] 定时器正确启动
- [ ] 脏数据正确同步
- [ ] 设置修改后定时保存
- [ ] 没有控制台错误

---

## 🧪 第六阶段：测试验证

### 单用户测试

#### 登录流程
- [ ] 用户输入用户名
- [ ] 后端创建用户文件夹
- [ ] 前端加载所有数据
- [ ] UI 正确显示
- [ ] localStorage 正确填充

#### 消息保存
- [ ] 发送消息后立即保存
- [ ] 后端文件正确更新
- [ ] 刷新页面后消息仍存在
- [ ] 消息顺序正确

#### 联系人管理
- [ ] 添加联系人后立即保存
- [ ] 后端文件正确更新
- [ ] 删除联系人后立即保存
- [ ] 刷新页面后联系人仍存在

#### 设置修改
- [ ] 修改主题后标记脏
- [ ] 10 秒后自动保存
- [ ] 后端文件正确更新
- [ ] 刷新页面后设置仍存在

#### 登出流程
- [ ] 点击登出
- [ ] localStorage 完全清空
- [ ] 前端状态完全重置
- [ ] 返回登录界面

### 多用户测试

#### 用户隔离
- [ ] 用户 A 登录并发送消息
- [ ] 用户 B 登录
- [ ] 用户 B 的消息列表为空
- [ ] 用户 A 和用户 B 的文件夹独立

#### 用户切换
- [ ] 用户 A 登录
- [ ] 用户 A 发送消息
- [ ] 用户 A 登出
- [ ] 用户 B 登录
- [ ] 用户 B 的消息列表为空
- [ ] 用户 A 重新登录
- [ ] 用户 A 的消息仍存在

### 数据完整性测试

#### 聊天记录
- [ ] 发送 10 条消息
- [ ] 所有消息都保存
- [ ] 消息内容正确
- [ ] 消息时间戳正确
- [ ] 消息顺序正确

#### 群聊记录
- [ ] 创建群聊
- [ ] 发送群消息
- [ ] 所有消息都保存
- [ ] 群聊信息正确

#### 联系人列表
- [ ] 添加 5 个联系人
- [ ] 所有联系人都保存
- [ ] 联系人信息正确

#### 设置
- [ ] 修改所有设置项
- [ ] 所有设置都保存
- [ ] 设置值正确

### 边界情况测试

#### 网络错误
- [ ] 断开网络
- [ ] 发送消息
- [ ] 消息保存到 localStorage
- [ ] 恢复网络
- [ ] 消息自动同步到后端

#### 文件损坏
- [ ] 手动修改 JSON 文件（破坏格式）
- [ ] 重新登录
- [ ] 系统返回默认值
- [ ] 不崩溃

#### 大量数据
- [ ] 发送 100 条消息
- [ ] 系统性能正常
- [ ] 所有消息都保存
- [ ] 没有内存泄漏

#### 并发操作
- [ ] 同时修改多个数据类型
- [ ] 所有数据都正确保存
- [ ] 没有数据冲突

---

## 📊 第七阶段：文档更新

### 更新现有文档

**README.md**
- [ ] 添加本地存储说明
- [ ] 添加数据文件夹说明
- [ ] 更新快速开始指南

**USER_GUIDE.md**
- [ ] 添加数据持久化说明
- [ ] 添加多用户支持说明
- [ ] 添加故障排除指南

### 创建新文档

- [ ] 开发者指南
- [ ] API 文档
- [ ] 故障排除指南

---

## ✅ 最终验收清单

### 功能完整性
- [ ] 所有 API 端点实现
- [ ] 所有前端方法实现
- [ ] 所有同步机制实现
- [ ] 所有错误处理实现

### 代码质量
- [ ] 代码注释完整
- [ ] 代码风格一致
- [ ] 没有 TODO 或 FIXME
- [ ] 没有控制台警告

### 测试覆盖
- [ ] 单用户测试通过
- [ ] 多用户测试通过
- [ ] 数据完整性测试通过
- [ ] 边界情况测试通过

### 性能指标
- [ ] 登录时间 < 2 秒
- [ ] 消息保存时间 < 100ms
- [ ] 定时同步不影响 UI
- [ ] 内存占用正常

### 安全性
- [ ] 用户名验证完整
- [ ] 数据验证完整
- [ ] 错误处理安全
- [ ] 没有路径遍历漏洞

### 文档完整
- [ ] README 已更新
- [ ] API 文档已完成
- [ ] 开发者指南已完成
- [ ] 故障排除指南已完成

---

## 🎯 完成标志

当以下条件都满足时，方案实现完成：

✅ 所有检查清单项目都已勾选
✅ 所有测试都通过
✅ 代码审查通过
✅ 文档完整
✅ 性能指标达标
✅ 安全性检查通过

---

## 📞 问题排查

### 常见问题

**Q: 后端无法创建文件夹**
- 检查权限
- 检查路径是否正确
- 查看日志输出

**Q: 前端无法加载数据**
- 检查网络连接
- 检查 API 端点是否正确
- 查看浏览器控制台错误

**Q: 数据同步失败**
- 检查网络连接
- 检查后端是否运行
- 查看日志输出

**Q: 多用户数据混乱**
- 检查用户名是否正确
- 检查文件夹是否隔离
- 查看文件系统

---

## 📝 记录

### 实现日期
- 开始日期：___________
- 完成日期：___________

### 实现者
- 开发者：___________
- 审查者：___________

### 备注
```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

