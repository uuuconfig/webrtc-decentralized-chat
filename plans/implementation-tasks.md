# P2P Chat 改进实现任务清单

## 任务概览

本文档列出所有需要实现的具体代码修改任务，供Code模式逐一执行。

---

## 任务1：修复UI布局 - 文件传输和群成员列表挡住输入框

### 1.1 分析当前布局问题

**文件**：[`client/static/style.css`](client/static/style.css)

**问题**：
- 文件传输面板使用固定定位，可能覆盖输入框
- 群成员面板也是固定定位，在右侧覆盖聊天区域
- 输入框在小屏幕上被遮挡

### 1.2 修改CSS布局

**目标**：
1. 重新组织聊天区域为三列布局：消息区 + 输入框 + 右侧面板
2. 确保输入框始终可见且可交互
3. 文件传输面板改为侧边栏，不覆盖输入框
4. 在移动设备上使用模态框

**具体修改**：
- 修改 `.chat-main` 为flexbox布局
- 修改 `.input-bar` 为粘性定位（sticky）或固定在底部
- 修改 `.file-panel` 为侧边栏形式
- 修改 `.group-members-panel` 为右侧栏形式
- 添加响应式设计，移动设备上隐藏右侧面板

### 1.3 修改HTML结构（如需要）

**文件**：[`client/static/index.html`](client/static/index.html)

**可能需要调整**：
- 确保输入框在聊天区域内部
- 调整文件传输面板的位置
- 调整群成员面板的位置

---

## 任务2：群聊消息显示发送者信息和IP地址

### 2.1 后端：获取和传递IP地址

**文件**：[`client/p2p.py`](client/p2p.py)

**任务**：
1. 在 `PeerConnection` 类中添加IP地址获取
2. 从WebRTC连接中提取对端IP地址
3. 在消息中附加IP信息

**具体步骤**：
- 修改 `PeerConnection.__init__()` 添加 `remote_ip` 属性
- 在连接建立时（`on_conn_state`）获取IP地址
- 修改 `send_message()` 方法，在消息中包含IP信息

### 2.2 后端：维护IP映射表

**文件**：[`client/app.py`](client/app.py)

**任务**：
1. 在全局状态中添加IP映射表
2. 当P2P连接建立时，记录用户IP
3. 在群消息中附加发送者IP

**具体步骤**：
- 在 `state` 中添加 `user_ips = {}`
- 修改 `on_p2p_state_change()` 回调，当连接建立时记录IP
- 修改 `on_p2p_message()` 回调，在群消息中附加IP
- 修改 `handle_signal_message()` 中的群消息处理，附加IP信息

### 2.3 前端：显示发送者信息

**文件**：[`client/static/app.js`](client/static/app.js)

**任务**：
1. 修改 `appendMessageEl()` 方法，为群消息添加发送者头部
2. 显示格式：`[发送者名字] (IP地址) 时间`
3. 修改 `renderGroupMembersPanel()` 显示IP地址

**具体步骤**：
- 修改 `appendMessageEl()` 中的群消息渲染逻辑
- 添加发送者头部HTML
- 在群成员列表中显示IP地址
- 修改 `renderGroupMembersPanel()` 的HTML生成

### 2.4 数据结构扩展

**任务**：
1. 扩展 `connectionStates` 存储IP地址
2. 修改消息格式包含IP信息

**具体步骤**：
- 将 `connectionStates` 改为对象结构：`{ state: 'connected', ip: '192.168.1.100' }`
- 或添加新的 `userIps` 对象存储IP
- 修改所有使用 `connectionStates` 的地方

---

## 任务3：修复群聊选中状态 - 切换群后深色标记不更新

### 3.1 分析问题

**文件**：[`client/static/app.js`](client/static/app.js)

**问题**：
- `selectChat()` 方法更新 `currentChat` 但没有更新DOM
- `renderGroupList()` 每次都重新生成整个列表，但可能存在时序问题

### 3.2 修复selectChat方法

**任务**：
1. 在 `selectChat()` 中，先移除所有群列表项的 `active` 类
2. 然后添加新选中群的 `active` 类
3. 对用户列表也做同样处理

**具体步骤**：
- 在 `selectChat()` 开始处添加代码移除旧的 `active` 类
- 调用 `renderGroupList()` 和 `renderUserList()` 重新渲染
- 确保只有当前选中的项有 `active` 类

### 3.3 修复renderGroupList方法

**任务**：
1. 确保 `renderGroupList()` 中只有当前选中的群有 `active` 类
2. 添加调试日志验证

**具体步骤**：
- 检查 `renderGroupList()` 中的 `active` 类判断逻辑
- 确保条件正确：`if (groupId === this.currentChat && this.currentChatType === 'group')`
- 添加日志输出验证

---

## 任务4：增加客户端删除群聊功能

### 4.1 前端UI：添加删除按钮

**文件**：[`client/static/index.html`](client/static/index.html)

**任务**：
1. 在群成员面板顶部添加"删除群"按钮
2. 或在群列表项上添加右键菜单

**具体步骤**：
- 在 `#group-members-panel` 的header中添加删除按钮
- 按钮ID：`delete-group-btn`
- 添加确认对话框

### 4.2 前端逻辑：实现删除功能

**文件**：[`client/static/app.js`](client/static/app.js)

**任务**：
1. 添加 `deleteGroup(groupId)` 方法
2. 从本地存储中删除群信息
3. 重新渲染群列表

**具体步骤**：
- 添加 `deleteGroup()` 方法
- 从 `this.groups` 中删除
- 从 `this.groupHistory` 中删除
- 从 `this.groupUnreadCount` 中删除
- 调用 `saveGroups()` 和 `saveGroupHistory()`
- 调用 `renderGroupList()`
- 如果当前正在查看该群，切换到"未选择"状态

### 4.3 前端事件绑定

**文件**：[`client/static/app.js`](client/static/app.js)

**任务**：
1. 在 `bindEvents()` 中添加删除按钮的事件监听
2. 显示确认对话框

**具体步骤**：
- 在 `bindEvents()` 中添加删除按钮的click事件
- 调用 `showDeleteGroupConfirm()`
- 用户确认后调用 `deleteGroup()`

### 4.4 后端：处理群离开消息

**文件**：[`client/app.py`](client/app.py)

**任务**：
1. 添加 `leave_group_link` 消息类型处理
2. 清理本地群数据
3. 通知信令服务器

**具体步骤**：
- 在 `handle_browser_message()` 中添加 `leave_group_link` 处理
- 从 `state["group_peers"]` 中删除
- 从 `state["my_groups"]` 中删除
- 向信令服务器发送离开消息

### 4.5 信令服务器：处理用户离开

**文件**：[`signal_server/server.py`](signal_server/server.py)

**任务**：
1. 处理 `leave_group_link` 消息
2. 通知其他群成员该用户已离开

**具体步骤**：
- 在信令服务器中添加 `leave_group_link` 消息处理
- 从群成员列表中移除用户
- 广播给其他群成员

---

## 任务5：修复刷新网页后群成员显示未连接的问题

### 5.1 后端：恢复连接状态

**文件**：[`client/app.py`](client/app.py)

**任务**：
1. 浏览器WebSocket重新连接时，发送当前所有已建立的P2P连接状态
2. 发送群成员的连接状态

**具体步骤**：
- 在 `websocket_endpoint()` 中，浏览器连接建立后
- 遍历 `state["p2p_manager"].connections`
- 发送每个连接的状态：`{ type: 'restore_connection_states', states: {...} }`
- 发送群成员信息和连接状态

### 5.2 前端：接收并应用连接状态

**文件**：[`client/static/app.js`](client/static/app.js)

**任务**：
1. 在 `handleMessage()` 中添加 `restore_connection_states` 消息处理
2. 更新 `connectionStates` 对象
3. 重新渲染用户列表和群成员面板

**具体步骤**：
- 在 `handleMessage()` 中添加新的case
- 接收连接状态信息
- 更新 `this.connectionStates`
- 调用 `renderUserList()` 和 `renderGroupMembersPanel()`

---

## 任务6：客户端重启后自动重连群聊P2P连接

### 6.1 前端：自动加入群

**文件**：[`client/static/app.js`](client/static/app.js)

**任务**：
1. 修改 `selectChat()` 方法
2. 如果是群聊且没有连接到该群，自动发送加入请求

**具体步骤**：
- 在 `selectChat()` 中，如果 `type === 'group'`
- 检查是否已经加入过该群（检查 `state["group_peers"]` 中是否有该群）
- 如果没有加入，发送 `join_group_link` 消息
- 添加标志位防止重复加入

### 6.2 后端：处理重新加入

**文件**：[`client/app.py`](client/app.py)

**任务**：
1. 修改 `join_group_link` 处理逻辑
2. 检查是否已经加入过
3. 如果已加入，直接返回已有成员列表

**具体步骤**：
- 在 `handle_browser_message()` 的 `join_group_link` 处理中
- 检查 `state["my_groups"]` 中是否已有该群
- 如果已有，直接发送 `group_link_joined` 消息
- 如果未有，向信令服务器发送加入请求

### 6.3 前端：标记群加入状态

**文件**：[`client/static/app.js`](client/static/app.js)

**任务**：
1. 添加 `groupJoinedStatus` 对象跟踪群加入状态
2. 防止重复加入

**具体步骤**：
- 添加 `groupJoinedStatus = {}` 对象
- 在 `selectChat()` 中检查该对象
- 加入成功后标记为已加入
- 防止重复发送加入请求

---

## 实现顺序建议

1. **第一阶段**（基础修复）：
   - 任务3：修复选中状态（最简单，影响最直接）
   - 任务1：修复UI布局（影响用户体验）

2. **第二阶段**（功能增强）：
   - 任务6：自动重连群聊（用户体验改进）
   - 任务4：删除群功能（功能完整性）

3. **第三阶段**（信息显示）：
   - 任务2：显示发送者和IP（需要后端配合）
   - 任务5：恢复连接状态（稳定性改进）

---

## 测试检查清单

### 任务1测试
- [ ] 在1920x1080屏幕上，输入框完全可见
- [ ] 在1366x768屏幕上，输入框完全可见
- [ ] 在手机屏幕上（375x667），输入框完全可见
- [ ] 文件传输面板打开时，输入框仍可见
- [ ] 群成员面板打开时，输入框仍可见

### 任务2测试
- [ ] 群聊消息显示发送者名字
- [ ] 群聊消息显示发送者IP地址
- [ ] 群成员列表显示每个成员的IP
- [ ] 多用户群聊，验证IP显示正确

### 任务3测试
- [ ] 选中群A，显示深色
- [ ] 切换到群B，群A的深色消失，群B显示深色
- [ ] 快速切换多个群，选中状态始终正确

### 任务4测试
- [ ] 删除群按钮可见
- [ ] 点击删除，显示确认对话框
- [ ] 确认删除后，群从列表中消失
- [ ] 群历史记录被清除
- [ ] 如果正在查看该群，切换到"未选择"状态

### 任务5测试
- [ ] 建立P2P连接后，刷新浏览器
- [ ] 刷新后，连接状态正确显示（已连接）
- [ ] 群成员列表显示正确的连接状态
- [ ] 能正常收发消息

### 任务6测试
- [ ] 加入群后，重启Python服务
- [ ] 点击群聊，自动重连
- [ ] 能正常收发消息
- [ ] 不需要重新输入群链接ID
