# P2P Chat 改进计划

## 问题分析与解决方案

### 问题1：文件传输和群成员列表挡住输入框

**现象**：文件传输面板和群成员面板会覆盖消息输入框，影响用户体验。

**根本原因**：
- 文件传输面板（`#file-panel`）使用固定定位，可能覆盖输入区域
- 群成员面板（`#group-members-panel`）也是固定定位，在右侧覆盖

**解决方案**：
1. 调整CSS布局，使用flexbox重新组织聊天区域
2. 文件传输面板改为侧边栏形式，不覆盖输入框
3. 群成员面板改为可滚动的右侧栏，输入框始终可见
4. 在移动设备上使用模态框显示

**涉及文件**：
- [`client/static/style.css`](client/static/style.css)
- [`client/static/index.html`](client/static/index.html)

---

### 问题2：群聊消息看不到是谁在说话，需要显示发送者IP地址

**现象**：群聊消息只显示内容，看不到发送者名字和IP地址。

**根本原因**：
- 群消息渲染时（[`app.js:696-732`](client/static/app.js:696)）没有显示发送者信息
- 后端没有收集和传递发送者的IP地址信息
- 群成员列表中也没有显示IP地址

**解决方案**：
1. **后端修改** ([`app.py`](client/app.py))：
   - 在P2P连接时获取对端IP地址
   - 在群消息中附加发送者IP信息
   - 维护群成员IP映射表

2. **前端修改** ([`app.js`](client/static/app.js))：
   - 修改 `appendMessageEl()` 方法，为群消息添加发送者头部
   - 显示格式：`[发送者名字] (IP地址) 时间`
   - 在群成员列表中显示每个成员的IP地址
   - 修改 `renderGroupMembersPanel()` 添加IP显示

3. **数据结构**：
   - 扩展 `connectionStates` 存储IP地址
   - 群消息格式添加 `senderIp` 字段

**涉及文件**：
- [`client/app.py`](client/app.py) - 后端IP收集
- [`client/p2p.py`](client/p2p.py) - P2P连接IP获取
- [`client/static/app.js`](client/static/app.js) - 前端显示

---

### 问题3：群聊选中状态不更新 - 切换群后深色标记还在原来的群

**现象**：选中一个群后显示深色，切换到另一个群，原来的群仍然显示深色。

**根本原因**：
- `renderGroupList()` 方法在渲染时检查 `this.currentChat === groupId && this.currentChatType === 'group'`
- 但当切换群时，虽然 `currentChat` 更新了，但旧的DOM元素的 `active` 类没有被移除
- 问题在于每次渲染都是重新生成整个列表，但可能存在异步更新问题

**解决方案**：
1. 在 `selectChat()` 方法中，先移除所有群列表项的 `active` 类
2. 然后添加新选中群的 `active` 类
3. 或者在 `renderGroupList()` 中确保只有当前选中的群有 `active` 类

**涉及文件**：
- [`client/static/app.js`](client/static/app.js) - `selectChat()` 和 `renderGroupList()` 方法

---

### 问题4：增加客户端删除群聊功能

**现象**：用户无法删除已加入的群聊。

**解决方案**：
1. **前端UI**：
   - 在群列表项上添加删除按钮（右键菜单或长按）
   - 或在群成员面板顶部添加"删除群"按钮
   - 显示确认对话框

2. **前端逻辑** ([`app.js`](client/static/app.js))：
   - 添加 `deleteGroup(groupId)` 方法
   - 从 `this.groups` 中删除
   - 从 `this.groupHistory` 中删除
   - 从 `this.groupUnreadCount` 中删除
   - 从 `this.group_peers` 中删除
   - 保存到localStorage
   - 重新渲染群列表

3. **后端逻辑** ([`app.py`](client/app.py))：
   - 添加 `leave_group_link` 消息类型
   - 通知信令服务器用户离开群
   - 清理本地群数据

4. **信令服务器** ([`signal_server/server.py`](signal_server/server.py))：
   - 处理用户离开群的消息
   - 通知其他群成员该用户已离开

**涉及文件**：
- [`client/static/app.js`](client/static/app.js)
- [`client/static/index.html`](client/static/index.html)
- [`client/app.py`](client/app.py)
- [`signal_server/server.py`](signal_server/server.py)

---

### 问题5：刷新网页后群成员显示未连接，但实际能收到消息

**现象**：
- 用户刷新浏览器后，群成员列表中所有人都显示"未连接"
- 但实际上P2P连接是正常的，能收到消息

**根本原因**：
- 刷新后浏览器WebSocket重新连接
- 前端状态被清空，`connectionStates` 被重置
- 后端没有在浏览器重新连接时恢复群成员的连接状态
- P2P连接本身没有断开，但前端不知道

**解决方案**：
1. **后端修改** ([`app.py`](client/app.py))：
   - 浏览器WebSocket重新连接时，发送当前所有已建立的P2P连接状态
   - 发送格式：`{ type: 'restore_connection_states', states: { user: 'connected', ... } }`

2. **前端修改** ([`app.js`](client/static/app.js))：
   - 在WebSocket连接建立时，接收并恢复连接状态
   - 更新 `connectionStates` 对象
   - 重新渲染用户列表和群成员面板

3. **P2P连接保活**：
   - 确保P2P连接在浏览器刷新时不被销毁
   - 或者在浏览器重新连接时快速重建P2P连接

**涉及文件**：
- [`client/app.py`](client/app.py) - 恢复连接状态
- [`client/static/app.js`](client/static/app.js) - 接收并应用连接状态

---

### 问题6：客户端重启后需要重新输入群链接才能P2P连接，希望自动重连

**现象**：
- 用户加入群后，如果客户端重启（Python服务重启）
- 需要重新输入群链接ID才能重新连接
- 希望点击群聊时自动重连

**根本原因**：
- 群信息保存在浏览器localStorage中
- 但后端Python服务重启后，`state["group_peers"]` 和 `state["my_groups"]` 被清空
- 前端没有在选择群时自动向后端发送"加入群"请求

**解决方案**：
1. **前端修改** ([`app.js`](client/static/app.js))：
   - 在 `selectChat()` 方法中，如果是群聊且当前没有连接到该群的任何成员
   - 自动发送 `join_group_link` 消息给后端
   - 添加标志位防止重复加入

2. **后端修改** ([`app.py`](client/app.py))：
   - 接收 `join_group_link` 消息时，检查是否已经加入过
   - 如果已加入，直接返回已有成员列表
   - 如果未加入，向信令服务器发送加入请求

3. **持久化群信息**：
   - 在浏览器localStorage中保存群信息（已有）
   - 在后端启动时，从浏览器恢复群信息（通过WebSocket）
   - 或者在后端维护群信息的持久化存储

**涉及文件**：
- [`client/static/app.js`](client/static/app.js) - `selectChat()` 方法
- [`client/app.py`](client/app.py) - 群加入逻辑

---

## 实现优先级

1. **高优先级**（影响用户体验）：
   - 问题1：UI布局修复
   - 问题3：选中状态修复
   - 问题6：自动重连群聊

2. **中优先级**（功能完整性）：
   - 问题2：显示发送者和IP
   - 问题4：删除群功能

3. **低优先级**（稳定性）：
   - 问题5：刷新后连接状态恢复

---

## 技术细节

### 数据结构扩展

```javascript
// 前端 - 扩展connectionStates存储IP
connectionStates: {
  'username': 'connected',  // 现有
  'username_ip': '192.168.1.100',  // 新增
}

// 或者改为对象结构
connectionStates: {
  'username': {
    state: 'connected',
    ip: '192.168.1.100',
    lastUpdate: timestamp
  }
}
```

### 消息格式扩展

```javascript
// 群消息格式
{
  type: 'group_p2p_message',
  groupId: 'xxx',
  from: 'username',
  fromIp: '192.168.1.100',  // 新增
  content: 'message',
  timestamp: 'iso-string'
}
```

### 后端IP获取

```python
# 从WebRTC连接获取对端IP
# aiortc PeerConnection 的 remoteDescription 中可能包含IP
# 或者从 DataChannel 的统计信息中获取
```

---

## 测试计划

1. **问题1测试**：
   - 在不同屏幕尺寸下测试输入框可见性
   - 测试文件传输面板和群成员面板的显示

2. **问题2测试**：
   - 多用户群聊，验证发送者名字和IP显示正确
   - 验证群成员列表中IP显示

3. **问题3测试**：
   - 快速切换不同群，验证选中状态正确

4. **问题4测试**：
   - 删除群后，验证群从列表中消失
   - 验证群历史记录被清除

5. **问题5测试**：
   - 刷新浏览器，验证连接状态正确显示

6. **问题6测试**：
   - 重启Python服务，点击群聊，验证自动重连
   - 验证能正常收发消息
