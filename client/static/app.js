/**
 * P2P Chat 前端逻辑
 * 四栏布局 UI + 群聊功能 + 设置面板
 */

const App = {
    ws: null,
    username: null,
    currentChat: null,
    currentChatType: 'user', // 'user' or 'group'
    users: [],
    contacts: {},  // 我的联系人：username -> { name, addedAt }
    chatHistory: {},
    unreadCount: {},
    connectionStates: {},
    connectingPeers: new Set(),

    // 菜单模式
    menuMode: 'chat', // 'chat', 'group', 'settings'

    // 群聊功能
    groups: {},
    groupHistory: {},
    groupUnreadCount: {},
    groupJoinedStatus: {},
    selectedMembers: new Set(),

    // 设置
    settings: {
        theme: 'auto',
        notifications: true,
        notificationSound: true,
        defaultIncognito: false,
        incognitoTimeout: 10,
        connectTimeout: 30,
    },

    // 连接超时计时器
    connectTimeoutTimers: new Map(),

    // 无痕消息模式
    incognitoMode: false,
    incognitoObserver: null,
    incognitoTimers: new Map(),
    messageIdCounter: 0,

    // 后端同步相关
    autoSyncInterval: null,
    dirtyData: new Set(),
    syncRetryCount: {},
    MAX_RETRY: 3,
    SYNC_INTERVAL: 10000,

    // 头像颜色
    avatarColors: [
        'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
        'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
        'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
        'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    ],

    el: {
        // 登录
        loginView: document.getElementById('login-view'),
        usernameInput: document.getElementById('username-input'),
        loginBtn: document.getElementById('login-btn'),
        signalStatus: document.getElementById('signal-status'),
        
        // 主界面
        mainView: document.getElementById('main-view'),
        menuAvatar: document.getElementById('menu-avatar'),
        sidebar: document.getElementById('sidebar'),
        
        // 侧边栏面板
        chatPanel: document.getElementById('chat-panel'),
        groupPanel: document.getElementById('group-panel'),
        settingsPanel: document.getElementById('settings-panel'),
        
        // 联系人列表
        userList: document.getElementById('user-list'),
        addContactInput: document.getElementById('add-contact-input'),
        addContactBtn: document.getElementById('add-contact-btn'),
        groupList: document.getElementById('group-list'),
        
        // 聊天区域
        noChat: document.getElementById('no-chat'),
        chatArea: document.getElementById('chat-area'),
        chatTargetName: document.getElementById('chat-target-name'),
        chatAvatar: document.getElementById('chat-avatar'),
        peerStatusDot: document.getElementById('peer-status-dot'),
        peerStatusText: document.getElementById('peer-status-text'),
        connectionMethod: document.getElementById('connection-method'),
        messages: document.getElementById('messages'),
        messageInput: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        notifications: document.getElementById('notifications'),
        
        // 功能按钮
        incognitoToggle: document.getElementById('incognito-toggle'),
        filePanelToggle: document.getElementById('file-panel-toggle'),
        groupMembersToggle: document.getElementById('group-members-toggle'),
        clearChatBtn: document.getElementById('clear-chat-btn'),
        retryP2pBtn: document.getElementById('retry-p2p-btn'),
        
        // 请求连接
        connectRequestBar: document.getElementById('connect-request-bar'),
        requestConnectBtn: document.getElementById('request-connect-btn'),
        connectRequestHint: document.getElementById('connect-request-hint'),
        
        // 确认 Modal
        confirmModal: document.getElementById('confirm-modal'),
        modalTitle: document.getElementById('modal-title'),
        modalMessage: document.getElementById('modal-message'),
        modalTargetName: document.getElementById('modal-target-name'),
        modalCancel: document.getElementById('modal-cancel'),
        modalConfirm: document.getElementById('modal-confirm'),
        
        // 删除群聊 Modal
        deleteGroupModal: document.getElementById('delete-group-modal'),
        deleteGroupModalTitle: document.getElementById('delete-group-modal-title'),
        deleteGroupModalMessage: document.getElementById('delete-group-modal-message'),
        deleteGroupModalTargetName: document.getElementById('delete-group-modal-target-name'),
        deleteGroupModalCancel: document.getElementById('delete-group-modal-cancel'),
        deleteGroupModalConfirm: document.getElementById('delete-group-modal-confirm'),
        
        // 群聊面板
        createGroupLinkBtn: document.getElementById('create-group-link-btn'),
        groupLinkResult: document.getElementById('group-link-result'),
        groupLinkValue: document.getElementById('group-link-value'),
        copyGroupLinkBtn: document.getElementById('copy-group-link-btn'),
        joinGroupInput: document.getElementById('join-group-input'),
        joinGroupBtn: document.getElementById('join-group-btn'),
        groupList: document.getElementById('group-list'),

        // 群成员状态面板
        groupMembersPanel: document.getElementById('group-members-panel'),
        groupMembersClose: document.getElementById('group-members-close'),
        groupMembersLinkId: document.getElementById('group-members-link-id'),
        copyGroupIdBtn: document.getElementById('copy-group-id-btn'),
        groupMembersList: document.getElementById('group-members-list'),
        
        // 设置
        settingsUsername: document.getElementById('settings-username'),
        themeSelect: document.getElementById('theme-select'),
        notificationToggle: document.getElementById('notification-toggle'),
        soundToggle: document.getElementById('sound-toggle'),
        defaultIncognitoToggle: document.getElementById('default-incognito-toggle'),
        incognitoTimeout: document.getElementById('incognito-timeout'),
        connectTimeout: document.getElementById('connect-timeout'),
        clearAllData: document.getElementById('clear-all-data'),
        exportData: document.getElementById('export-data'),
    },

    init() {
        // 不在这里加载数据，等待登录后从后端加载
        this.bindEvents();
        this.connectWS();
        this.initTheme();
        this.initIncognitoObserver();
    },

    // ========== WebSocket ==========

    connectWS() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${location.host}/ws`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        this.ws.onmessage = (e) => {
            const data = JSON.parse(e.data);
            this.handleMessage(data);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, reconnecting...');
            setTimeout(() => this.connectWS(), 3000);
        };
    },

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    },

    handleMessage(data) {
        switch (data.type) {
            case 'signal_connected':
                this.updateSignalStatus(true);
                break;
            case 'signal_disconnected':
                this.updateSignalStatus(false);
                break;
            case 'registered':
                this.onRegistered(data.username);
                break;
            case 'user_list':
                this.updateUserList(data.users);
                break;
            case 'check_user_result':
                this.onCheckUserResult(data);
                break;
            case 'error':
                this.notify(data.message, 'error');
                break;
            case 'chat_message':
                this.onChatMessage(data);
                break;
            case 'incoming_connection':
                // 标记为正在连接中，防止重复发起连接
                this.connectingPeers.add(data.from);
                break;
            case 'connection_state':
                this.onConnectionState(data.user, data.state);
                break;
            case 'send_status':
                this.onSendStatus(data);
                break;
            case 'restore_connection_states':
                this.onRestoreConnectionStates(data.states);
                break;
            // 群链接消息
            case 'group_link_created':
                this.onGroupLinkCreated(data);
                break;
            case 'group_link_joined':
                this.onGroupLinkJoined(data);
                break;
            case 'group_link_peer_joined':
                this.onGroupLinkPeerJoined(data);
                break;
            case 'group_link_peer_left':
                this.onGroupLinkPeerLeft(data);
                break;
            case 'group_p2p_message':
                this.onGroupP2PMessage(data);
                break;
            case 'group_send_status':
                this.onGroupSendStatus(data);
                break;
        }
    },

    // ========== 群链接消息处理 ==========

    onGroupLinkCreated(data) {
        const groupId = data.groupId;
        // 在本地记录自己创建的群
        this.groups[groupId] = {
            id: groupId,
            members: [this.username],
            creator: this.username,
        };
        this.saveGroups();
        this.renderGroupList();

        // 显示群链接
        if (this.el.groupLinkResult) {
            this.el.groupLinkResult.classList.remove('hidden');
        }
        if (this.el.groupLinkValue) {
            this.el.groupLinkValue.value = groupId;
        }
        this.notify('群链接已创建，复制 ID 分享给好友', 'info');
    },

    onGroupLinkJoined(data) {
        const { groupId, peers, allMembers } = data;
        const isExisting = !!this.groups[groupId];
        this.groups[groupId] = {
            id: groupId,
            members: allMembers,
            creator: this.groups[groupId]?.creator || null,
        };
        this.saveGroups();
        this.renderGroupList();

        // 只在首次加入时显示通知，rejoin 不显示
        if (!isExisting) {
            if (peers.length === 0) {
                this.notify('已加入群，等待其他人加入...', 'info');
            } else {
                this.notify(`已加入群，正在与 ${peers.join('、')} 建立 P2P 连接...`, 'info');
            }
        }

        // 若当前正在查看这个群，刷新成员面板
        if (this.currentChat === groupId && this.currentChatType === 'group') {
            this.renderGroupMembersPanel(groupId);
        }
    },

    onGroupLinkPeerJoined(data) {
        const { groupId, username, allMembers } = data;
        if (this.groups[groupId]) {
            this.groups[groupId].members = allMembers;
            this.saveGroups();
        }
        this.renderGroupList();
        this.notify(`${username} 加入了群`, 'info');

        if (this.currentChat === groupId && this.currentChatType === 'group') {
            this.renderGroupMembersPanel(groupId);
        }
    },

    onGroupLinkPeerLeft(data) {
        const { groupId, username, allMembers } = data;
        if (this.groups[groupId]) {
            this.groups[groupId].members = allMembers;
            this.saveGroups();
        }
        this.renderGroupList();
        this.notify(`${username} 离开了群`, 'info');

        if (this.currentChat === groupId && this.currentChatType === 'group') {
            this.renderGroupMembersPanel(groupId);
        }
    },

    onGroupP2PMessage(data) {
        const { groupId, from, content, timestamp } = data;
        const msg = {
            id: ++this.messageIdCounter,
            from: from,
            content: content,
            timestamp: timestamp,
            direction: 'received',
            isIncognito: false,
        };

        if (!this.groupHistory[groupId]) this.groupHistory[groupId] = [];
        this.groupHistory[groupId].push(msg);
        this.saveGroupHistory();

        if (groupId === this.currentChat && this.currentChatType === 'group') {
            this.appendMessageEl(msg);
            this.scrollToBottom();
        } else {
            this.groupUnreadCount[groupId] = (this.groupUnreadCount[groupId] || 0) + 1;
            this.renderGroupList();
            const group = this.groups[groupId];
            const name = group ? group.id.slice(0, 8) : groupId;
            this.notify(`[群 ${name}] ${from}: ${content.substring(0, 30)}`, 'info');
        }
    },

    onGroupSendStatus(data) {
        if (data.failedPeers && data.failedPeers.length > 0) {
            this.notify(`以下成员 P2P 未连接，消息未送达: ${data.failedPeers.join(', ')}`, 'warn');
        }
    },

    saveGroupHistory() {
        try {
            localStorage.setItem('p2pchat_group_history', JSON.stringify(this.groupHistory));
            // 实时同步到后端
            this.syncToBackend('group_history', this.groupHistory);
        } catch (e) { /* ignore */ }
    },

    loadGroupHistory() {
        try {
            const data = localStorage.getItem('p2pchat_group_history');
            if (data) {
                this.groupHistory = JSON.parse(data);
            }
        } catch (e) {
            this.groupHistory = {};
        }
    },

    // ========== Login ==========

    updateSignalStatus(connected) {
        const dot = this.el.signalStatus.querySelector('.status-dot');
        const text = this.el.signalStatus.querySelector('span:last-child');
        if (connected) {
            dot.className = 'status-dot connected';
            text.textContent = '已连接';
            this.el.loginBtn.disabled = false;
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = '连接信令服务器中...';
            this.el.loginBtn.disabled = true;
        }
    },

    doLogin() {
        const name = this.el.usernameInput.value.trim();
        if (!name) return;
        this.send({ type: 'register', username: name });
    },

    async onRegistered(username) {
        this.username = username;
        
        // 清除旧用户的内存状态和 localStorage，防止数据残留
        this.chatHistory = {};
        this.groupHistory = {};
        this.contacts = {};
        this.groups = {};
        this.unreadCount = {};
        this.groupUnreadCount = {};
        this.clearLocalStorage();
        
        // 从后端加载所有数据
        await this.loadFromBackend(username);
        
        // 更新菜单头像
        if (this.el.menuAvatar) {
            this.el.menuAvatar.textContent = username.charAt(0).toUpperCase();
            this.el.menuAvatar.style.background = this.getAvatarColor(username);
        }
        
        // 更新设置中的用户名
        if (this.el.settingsUsername) {
            this.el.settingsUsername.textContent = username;
        }
        
        // 初始化 UI
        this.renderGroupList();
        this.renderUserList();
        
        // 切换视图
        this.el.loginView.classList.remove('active');
        this.el.mainView.classList.add('active');
        
        // 应用默认无痕模式设置
        if (this.settings.defaultIncognito) {
            this.incognitoMode = true;
            if (this.el.incognitoToggle) {
                this.el.incognitoToggle.classList.add('active');
            }
        }
        
        // 启动自动同步
        this.startAutoSync();
        
        this.notify(`欢迎, ${username}!`, 'info');
    },

    // ========== User List ==========

    updateUserList(users) {
        // 不再使用服务器发送的用户列表，改为使用本地联系人
        this.renderUserList();
    },

    getAvatarColor(name) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return this.avatarColors[Math.abs(hash) % this.avatarColors.length];
    },

    renderUserList() {
        const ul = this.el.userList;
        if (!ul) return;
        ul.innerHTML = '';

        const contactNames = Object.keys(this.contacts);
        if (contactNames.length === 0) {
            ul.innerHTML = '<li class="empty-list">暂无联系人，请添加</li>';
            return;
        }

        contactNames.forEach(user => {
            const li = document.createElement('li');
            li.className = 'contact-item';
            if (user === this.currentChat && this.currentChatType === 'user') {
                li.classList.add('active');
            }

            const state = this.connectionStates[user];
            const isConnected = state === 'connected';
            const lastMsg = this.getLastMessage(user);
            const unread = this.unreadCount[user] || 0;

            li.innerHTML = `
                <div class="avatar" style="background: ${this.getAvatarColor(user)}">
                    ${this.escapeHtml(user.charAt(0).toUpperCase())}
                    <span class="online-indicator ${isConnected ? '' : 'offline'}"></span>
                </div>
                <div class="contact-info">
                    <div class="contact-name">${this.escapeHtml(user)}</div>
                    <div class="contact-preview">${lastMsg ? this.escapeHtml(lastMsg) : (isConnected ? 'P2P 已连接' : '点击开始聊天')}</div>
                </div>
                ${unread > 0 && user !== this.currentChat ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
                <button class="btn-delete-contact" data-contact="${this.escapeHtml(user)}" title="删除联系人">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            `;

            li.addEventListener('click', (e) => {
                if (!e.target.closest('.btn-delete-contact')) {
                    this.selectChat(user, 'user');
                }
            });

            const deleteBtn = li.querySelector('.btn-delete-contact');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.showDeleteContactConfirm(user);
                });
            }

            ul.appendChild(li);
        });
    },

    getLastMessage(user) {
        const history = this.chatHistory[user];
        if (!history || history.length === 0) return null;
        const last = history[history.length - 1];
        if (last.direction === 'system') return null;
        const prefix = last.direction === 'sent' ? '你: ' : '';
        return prefix + last.content.substring(0, 30);
    },

    // ========== Chat ==========

    selectChat(target, type = 'user') {
        this.currentChat = target;
        this.currentChatType = type;
        
        if (type === 'user') {
            this.unreadCount[target] = 0;
        } else {
            this.groupUnreadCount[target] = 0;
        }

        // 移除所有列表项的active类
        document.querySelectorAll('.contact-item.active').forEach(item => {
            item.classList.remove('active');
        });

        // Update UI
        this.el.noChat.classList.add('hidden');
        this.el.chatArea.classList.remove('hidden');
        
        if (type === 'user') {
            this.el.chatTargetName.textContent = target;
            this.el.chatAvatar.textContent = target.charAt(0).toUpperCase();
            this.el.chatAvatar.style.background = this.getAvatarColor(target);
            this.el.chatAvatar.classList.remove('group-avatar');

            // Hide group members panel
            if (this.el.groupMembersPanel) this.el.groupMembersPanel.classList.add('hidden');

            // 隐藏header中的群成员按钮和删除按钮
            if (this.el.groupMembersToggle) {
                this.el.groupMembersToggle.style.display = 'none';
            }
            const deleteBtn = document.getElementById('delete-group-btn-header');
            if (deleteBtn) {
                deleteBtn.style.display = 'none';
            }

            // Update connection status
            const state = this.connectionStates[target];
            this.updatePeerStatus(state || 'disconnected');
        } else {
            // 群聊
            const group = this.groups[target];
            if (group) {
                this.el.chatTargetName.textContent = `群 ${target.slice(0, 8)}`;
                this.el.chatAvatar.textContent = '#';
                this.el.chatAvatar.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                this.el.chatAvatar.classList.add('group-avatar');
                this.updatePeerStatusForGroup(target);
                // 显示成员状态面板
                this.renderGroupMembersPanel(target);
                if (this.el.groupMembersPanel) {
                    this.el.groupMembersPanel.classList.remove('hidden');
                }
                // 显示header中的群成员按钮和删除按钮
                if (this.el.groupMembersToggle) {
                    this.el.groupMembersToggle.style.display = 'block';
                }
                const deleteBtn = document.getElementById('delete-group-btn-header');
                if (deleteBtn) {
                    deleteBtn.style.display = 'block';
                }
            }
        }

        // 显示/隐藏请求连接按钮
        if (type === 'user') {
            this.updateConnectRequestBar(target);
        } else {
            // 群聊：显示请求连接按钮（如果未加入）
            this.updateConnectRequestBarForGroup(target);
        }

        // Render messages
        this.renderMessages();
        this.renderUserList();

        // Focus input
        this.el.messageInput.focus();

        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            this.el.sidebar.classList.remove('open');
        }
    },

    updatePeerStatus(state) {
        const dot = this.el.peerStatusDot;
        const text = this.el.peerStatusText;
        const badge = this.el.connectionMethod;

        if (state === 'connected') {
            dot.className = 'status-dot connected';
            text.textContent = 'P2P 已连接';
            badge.textContent = 'P2P';
            badge.className = 'connection-badge connected';
            if (this.el.retryP2pBtn) {
                this.el.retryP2pBtn.style.display = 'none';
            }
        } else if (state === 'connecting' || state === 'checking') {
            dot.className = 'status-dot connecting';
            text.textContent = '连接中...';
            badge.textContent = '连接中';
            badge.className = 'connection-badge';
            if (this.el.retryP2pBtn) {
                this.el.retryP2pBtn.style.display = 'none';
            }
        } else {
            dot.className = 'status-dot disconnected';
            text.textContent = '未连接';
            badge.textContent = '未连接';
            badge.className = 'connection-badge offline';
            if (this.el.retryP2pBtn) {
                this.el.retryP2pBtn.style.display = 'block';
            }
        }
    },

    sendMessage() {
        const content = this.el.messageInput.value.trim();
        if (!content || !this.currentChat) return;

        if (this.currentChatType === 'group') {
            // 群消息走 P2P mesh
            this.send({
                type: 'group_p2p_message',
                groupId: this.currentChat,
                content: content,
            });
            // 本地显示
            const msg = {
                id: ++this.messageIdCounter,
                from: this.username,
                content: content,
                timestamp: new Date().toISOString(),
                direction: 'sent',
                isIncognito: false,
            };
            if (!this.groupHistory[this.currentChat]) this.groupHistory[this.currentChat] = [];
            this.groupHistory[this.currentChat].push(msg);
            this.saveGroupHistory();
            this.appendMessageEl(msg);
            this.scrollToBottom();
            this.el.messageInput.value = '';
            this.el.messageInput.focus();
            return;
        }

        // 单聊 P2P
        const state = this.connectionStates[this.currentChat];
        if (state !== 'connected') {
            this.notify('P2P 未连接，无法发送消息', 'warn');
            return;
        }

        const messageData = {
            text: content,
            isIncognito: this.incognitoMode
        };

        this.send({
            type: 'send_message',
            target: this.currentChat,
            content: JSON.stringify(messageData),
            msg_type: this.incognitoMode ? 'incognito' : 'text',
        });

        const msg = {
            id: ++this.messageIdCounter,
            from: this.username,
            content: content,
            timestamp: new Date().toISOString(),
            direction: 'sent',
            isIncognito: this.incognitoMode,
        };
        this.addMessage(this.currentChat, msg);

        this.el.messageInput.value = '';
        this.el.messageInput.focus();
    },

    onChatMessage(data) {
        const from = data.from;
        
        // 检查该联系人是否已被删除
        if (!this.contacts[from]) {
            console.info(`收到已删除联系人 ${from} 的消息，忽略`);
            return;
        }
        
        // 解析消息内容
        let content = data.content;
        let isIncognito = data.msg_type === 'incognito';
        
        try {
            const parsed = JSON.parse(data.content);
            if (parsed.text !== undefined) {
                content = parsed.text;
                isIncognito = parsed.isIncognito || isIncognito;
            }
        } catch (e) {
            // 普通文本消息
        }


        const msg = {
            id: ++this.messageIdCounter,
            from: from,
            content: content,
            timestamp: data.timestamp,
            direction: 'received',
            isIncognito: isIncognito,
        };

        this.addMessage(from, msg, isIncognito);

        if (from !== this.currentChat) {
            this.unreadCount[from] = (this.unreadCount[from] || 0) + 1;
            this.renderUserList();
            if (!isIncognito) {
                this.notify(`${from}: ${content.substring(0, 50)}`, 'info');
            } else {
                this.notify(`${from} 发来一条无痕消息`, 'info');
            }
        }
    },

    addMessage(chatUser, msg, skipSave = false) {
        // 无痕消息不保存到历史记录
        if (!msg.isIncognito) {
            if (!this.chatHistory[chatUser]) {
                this.chatHistory[chatUser] = [];
            }
            this.chatHistory[chatUser].push(msg);
            if (!skipSave) {
                this.saveHistory();
            }
        }

        if (chatUser === this.currentChat) {
            this.appendMessageEl(msg);
            this.scrollToBottom();
        }

        this.renderUserList();
    },

    renderMessages() {
        this.el.messages.innerHTML = '';
        this.incognitoTimers.forEach(timer => clearTimeout(timer));
        this.incognitoTimers.clear();

        const history = this.currentChatType === 'group'
            ? (this.groupHistory[this.currentChat] || [])
            : (this.chatHistory[this.currentChat] || []);
        history.forEach(msg => this.appendMessageEl(msg));
        this.scrollToBottom();
    },

    appendMessageEl(msg) {
        const div = document.createElement('div');
        div.className = `message ${msg.direction}`;
        
        // 无痕消息特殊处理
        if (msg.isIncognito) {
            div.classList.add('incognito');
            div.dataset.msgId = msg.id;
        }

        const time = this.formatTime(msg.timestamp);

        if (msg.direction === 'system') {
            div.innerHTML = `<div class="message-bubble">${this.escapeHtml(msg.content)}</div>`;
        } else if (msg.isIncognito) {
            div.innerHTML = `
                <div class="message-bubble">
                    ${this.escapeHtml(msg.content)}
                    <span class="incognito-indicator">👻</span>
                </div>
                <div class="message-meta">${time}</div>
                <div class="countdown"></div>
            `;
            // 对于接收到的无痕消息，使用 Intersection Observer 监控
            if (msg.direction === 'received') {
                this.observeIncognitoMessage(div, msg.id);
            }
        } else {
            // 群聊消息显示发送者信息
            let senderInfo = '';
            if (this.currentChatType === 'group' && msg.direction === 'received') {
                const senderIp = msg.fromIp ? ` (${msg.fromIp})` : '';
                senderInfo = `<div class="message-sender">${this.escapeHtml(msg.from)}${senderIp}</div>`;
            }
            
            div.innerHTML = `
                ${senderInfo}
                <div class="message-bubble">${this.escapeHtml(msg.content)}</div>
                <div class="message-meta">${time}</div>
            `;
        }

        this.el.messages.appendChild(div);
        return div;
    },

    scrollToBottom() {
        const el = this.el.messages;
        requestAnimationFrame(() => {
            el.scrollTop = el.scrollHeight;
        });
    },

    // ========== Connection State ==========

    onConnectionState(user, state) {
        const prevState = this.connectionStates[user];
        this.connectionStates[user] = state;
        this.renderUserList();

        if (user === this.currentChat && this.currentChatType === 'user') {
            this.updatePeerStatus(state);
        }

        // 若该用户是当前群的成员，刷新成员面板
        if (this.currentChatType === 'group' && this.currentChat) {
            const group = this.groups[this.currentChat];
            if (group && group.members && group.members.includes(user)) {
                this.renderGroupMembersPanel(this.currentChat);
                this.updatePeerStatusForGroup(this.currentChat);
            }
        }

        if (state === 'connected') {
            this.connectingPeers.delete(user);
            this.clearConnectTimeout(user);
            if (prevState !== 'connected') {
                this.addSystemMessage(user, 'P2P 连接已建立');
            }
        } else if (state === 'connecting' || state === 'checking') {
            // 标记为正在连接中，防止重复发起连接
            this.connectingPeers.add(user);
        } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
            this.connectingPeers.delete(user);
            this.clearConnectTimeout(user);
            if (prevState === 'connected') {
                this.addSystemMessage(user, 'P2P 连接已断开');
            }
        }

        // 更新请求连接按钮状态
        if (user === this.currentChat && this.currentChatType === 'user') {
            this.updateConnectRequestBar(user);
        }
    },

    onSendStatus(data) {
        if (data.method === 'failed') {
            this.notify('消息发送失败：P2P 未连接', 'error');
        }
    },

    onRestoreConnectionStates(states) {
        // 恢复连接状态
        if (states && typeof states === 'object') {
            Object.assign(this.connectionStates, states);
        }
        // 重新渲染UI
        this.renderUserList();
        if (this.currentChatType === 'group' && this.currentChat) {
            this.renderGroupMembersPanel(this.currentChat);
            this.updatePeerStatusForGroup(this.currentChat);
        }
    },

    addSystemMessage(chatUser, text) {
        const msg = {
            from: 'system',
            content: text,
            timestamp: new Date().toISOString(),
            direction: 'system',
        };
        this.addMessage(chatUser, msg);
    },

    // ========== Notifications ==========

    notify(text, level = 'info') {
        const div = document.createElement('div');
        div.className = `notification ${level}`;
        div.textContent = text;
        this.el.notifications.appendChild(div);

        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transition = 'opacity 0.3s';
            setTimeout(() => div.remove(), 300);
        }, 3000);
    },

    // ========== 后端数据同步 ==========

    /**
     * 从后端加载所有数据（登录时调用）
     */
    async loadFromBackend(username) {
        try {
            const response = await fetch(`/api/data/${username}/all`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            // 加载到 localStorage
            if (data.chat_history) {
                localStorage.setItem('p2pchat_history', JSON.stringify(data.chat_history));
                this.chatHistory = data.chat_history;
            }
            
            if (data.group_history) {
                localStorage.setItem('p2pchat_group_history', JSON.stringify(data.group_history));
                this.groupHistory = data.group_history;
            }
            
            if (data.contacts) {
                localStorage.setItem('p2pchat_contacts', JSON.stringify(data.contacts));
                this.contacts = data.contacts;
            }
            
            if (data.settings) {
                localStorage.setItem('p2pchat_settings', JSON.stringify(data.settings));
                this.settings = { ...this.settings, ...data.settings };
            }
            
            if (data.groups) {
                localStorage.setItem('p2pchat_groups', JSON.stringify(data.groups));
                this.groups = data.groups;
            }
            
            console.log('Data loaded from backend successfully');
            return true;
        } catch (e) {
            console.error('Failed to load data from backend:', e);
            // 如果后端加载失败，使用本地 localStorage
            this.loadHistory();
            this.loadSettings();
            this.loadGroupHistory();
            this.loadGroups();
            this.loadContacts();
            return false;
        }
    },

    /**
     * 同步数据到后端（实时保存）
     */
    async syncToBackend(dataType, data) {
        if (!this.username) {
            console.warn('Username not set, skipping sync');
            return false;
        }
        
        try {
            const response = await fetch(
                `/api/data/${this.username}/${dataType}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ data: data })
                }
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                console.log(`${dataType} synced to backend successfully`);
                // 清除重试计数
                delete this.syncRetryCount[dataType];
                return true;
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (e) {
            console.error(`Failed to sync ${dataType}:`, e);
            
            // 重试机制
            const retryCount = this.syncRetryCount[dataType] || 0;
            if (retryCount < this.MAX_RETRY) {
                this.syncRetryCount[dataType] = retryCount + 1;
                console.log(`Retrying ${dataType} (${retryCount + 1}/${this.MAX_RETRY})...`);
                
                // 延迟后重试
                setTimeout(() => {
                    this.syncToBackend(dataType, data);
                }, 2000 * (retryCount + 1));
            } else {
                console.error(`Failed to sync ${dataType} after ${this.MAX_RETRY} retries`);
                delete this.syncRetryCount[dataType];
            }
            
            return false;
        }
    },

    /**
     * 标记数据为脏（需要定时同步）
     */
    markDirty(dataType) {
        this.dirtyData.add(dataType);
    },

    /**
     * 启动自动同步
     */
    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }
        
        this.autoSyncInterval = setInterval(() => {
            this.flushDirtyData();
        }, this.SYNC_INTERVAL);
        
        console.log('Auto sync started');
    },

    /**
     * 停止自动同步
     */
    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
        
        console.log('Auto sync stopped');
    },

    /**
     * 刷新脏数据（定时同步）
     */
    async flushDirtyData() {
        if (this.dirtyData.size === 0) {
            return;
        }
        
        const dirtyTypes = Array.from(this.dirtyData);
        this.dirtyData.clear();
        
        for (const dataType of dirtyTypes) {
            let data = {};
            
            switch (dataType) {
                case 'chat_history':
                    data = this.chatHistory;
                    break;
                case 'group_history':
                    data = this.groupHistory;
                    break;
                case 'contacts':
                    data = this.contacts;
                    break;
                case 'settings':
                    data = this.settings;
                    break;
                case 'groups':
                    data = this.groups;
                    break;
            }
            
            await this.syncToBackend(dataType, data);
        }
    },

    /**
     * 清空 localStorage
     */
    clearLocalStorage() {
        localStorage.removeItem('p2pchat_history');
        localStorage.removeItem('p2pchat_group_history');
        localStorage.removeItem('p2pchat_contacts');
        localStorage.removeItem('p2pchat_settings');
        localStorage.removeItem('p2pchat_groups');
        console.log('localStorage cleared');
    },

    /**
     * 登出
     */
    logout() {
        // 停止自动同步
        this.stopAutoSync();
        
        // 清空 localStorage
        this.clearLocalStorage();
        
        // 重置前端状态
        this.username = null;
        this.currentChat = null;
        this.users = [];
        this.contacts = {};
        this.chatHistory = {};
        this.unreadCount = {};
        this.connectionStates = {};
        this.groups = {};
        this.groupHistory = {};
        this.groupUnreadCount = {};
        this.dirtyData.clear();
        this.syncRetryCount = {};
        
        // 关闭 WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // 显示登录界面
        if (this.el.loginView) {
            this.el.loginView.classList.add('active');
        }
        if (this.el.mainView) {
            this.el.mainView.classList.remove('active');
        }
        
        console.log('Logged out');
    },

    // ========== Storage ==========

    saveHistory() {
        try {
            const data = JSON.stringify(this.chatHistory);
            localStorage.setItem('p2pchat_history', data);
            // 实时同步到后端
            this.syncToBackend('chat_history', this.chatHistory);
        } catch (e) { /* ignore */ }
    },

    loadHistory() {
        try {
            const data = localStorage.getItem('p2pchat_history');
            if (data) {
                this.chatHistory = JSON.parse(data);
            }
        } catch (e) {
            this.chatHistory = {};
        }
    },

    // ========== Utils ==========

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatTime(isoStr) {
        try {
            const d = new Date(isoStr);
            return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    },

    // ========== Events ==========

    bindEvents() {
        // 登录事件
        this.el.loginBtn.addEventListener('click', () => this.doLogin());
        this.el.usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.doLogin();
        });

        // 添加联系人事件
        if (this.el.addContactBtn) {
            this.el.addContactBtn.addEventListener('click', () => this.addContact());
        }
        if (this.el.addContactInput) {
            this.el.addContactInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.addContact();
            });
        }

        // 菜单切换事件
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                const mode = item.dataset.menu;
                if (mode) this.switchMenuMode(mode);
            });
        });

        // 发送消息事件
        if (this.el.sendBtn) {
            this.el.sendBtn.addEventListener('click', () => this.sendMessage());
        }
        if (this.el.messageInput) {
            this.el.messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }

        // 无痕模式切换
        if (this.el.incognitoToggle) {
            this.el.incognitoToggle.addEventListener('click', () => this.toggleIncognitoMode());
        }

        // 重试P2P连接按钮
        if (this.el.retryP2pBtn) {
            this.el.retryP2pBtn.addEventListener('click', () => this.retryP2PConnection());
        }

        // 请求连接按钮
        if (this.el.requestConnectBtn) {
            this.el.requestConnectBtn.addEventListener('click', () => {
                if (this.currentChatType === 'user') {
                    this.requestP2PConnect();
                } else if (this.currentChatType === 'group') {
                    this.requestGroupConnect();
                }
            });
        }

        // 清除聊天记录
        if (this.el.clearChatBtn) {
            this.el.clearChatBtn.addEventListener('click', () => this.showClearConfirm());
        }
        if (this.el.modalCancel) {
            this.el.modalCancel.addEventListener('click', () => this.hideClearConfirm());
        }
        if (this.el.modalConfirm) {
            this.el.modalConfirm.addEventListener('click', () => this.clearChatData());
        }
        if (this.el.confirmModal) {
            const backdrop = this.el.confirmModal.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => this.hideClearConfirm());
            }
        }

        // 群链接按钮
        if (this.el.createGroupLinkBtn) {
            this.el.createGroupLinkBtn.addEventListener('click', () => {
                this.send({ type: 'create_group_link' });
            });
        }
        if (this.el.copyGroupLinkBtn) {
            this.el.copyGroupLinkBtn.addEventListener('click', () => {
                const val = this.el.groupLinkValue ? this.el.groupLinkValue.value : '';
                if (val) {
                    navigator.clipboard.writeText(val).then(() => this.notify('群链接已复制', 'info'));
                }
            });
        }
        if (this.el.joinGroupBtn) {
            this.el.joinGroupBtn.addEventListener('click', () => {
                const id = this.el.joinGroupInput ? this.el.joinGroupInput.value.trim() : '';
                if (!id) { this.notify('请输入群链接 ID', 'warn'); return; }
                this.send({ type: 'join_group_link', groupId: id });
            });
        }
        if (this.el.joinGroupInput) {
            this.el.joinGroupInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.el.joinGroupBtn && this.el.joinGroupBtn.click();
            });
        }
        // 群成员列表切换按钮
        const groupMembersToggleBtn = document.getElementById('group-members-toggle');
        if (groupMembersToggleBtn) {
            groupMembersToggleBtn.addEventListener('click', () => {
                if (this.el.groupMembersPanel) {
                    this.el.groupMembersPanel.classList.toggle('hidden');
                }
            });
        }
        if (this.el.groupMembersClose) {
            this.el.groupMembersClose.addEventListener('click', () => {
                if (this.el.groupMembersPanel) this.el.groupMembersPanel.classList.add('hidden');
            });
        }
        const deleteGroupBtn = document.getElementById('delete-group-btn-header');
        if (deleteGroupBtn) {
            deleteGroupBtn.addEventListener('click', () => {
                if (this.currentChat && this.currentChatType === 'group') {
                    this.showDeleteGroupConfirm(this.currentChat);
                }
            });
        }
        if (this.el.deleteGroupModalCancel) {
            this.el.deleteGroupModalCancel.addEventListener('click', () => {
                this.hideDeleteGroupConfirm();
                this.hideDeleteContactConfirm();
            });
        }
        if (this.el.deleteGroupModalConfirm) {
            this.el.deleteGroupModalConfirm.addEventListener('click', () => {
                if (this.pendingDeleteContactName) {
                    this.deleteContact(this.pendingDeleteContactName);
                    this.hideDeleteContactConfirm();
                } else {
                    this.confirmDeleteGroup();
                }
            });
        }
        if (this.el.deleteGroupModal) {
            const backdrop = this.el.deleteGroupModal.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => {
                    this.hideDeleteGroupConfirm();
                    this.hideDeleteContactConfirm();
                });
            }
        }
        if (this.el.copyGroupIdBtn) {
            this.el.copyGroupIdBtn.addEventListener('click', () => {
                const fullId = this.el.groupMembersLinkId ? this.el.groupMembersLinkId.dataset.full : '';
                if (fullId) {
                    navigator.clipboard.writeText(fullId).then(() => this.notify('群链接已复制', 'info'));
                }
            });
        }

        // 设置事件
        if (this.el.themeSelect) {
            this.el.themeSelect.addEventListener('change', (e) => this.changeTheme(e.target.value));
        }
        if (this.el.notificationToggle) {
            this.el.notificationToggle.addEventListener('change', (e) => {
                this.settings.notifications = e.target.checked;
                this.saveSettings();
            });
        }
        if (this.el.soundToggle) {
            this.el.soundToggle.addEventListener('change', (e) => {
                this.settings.notificationSound = e.target.checked;
                this.saveSettings();
            });
        }
        if (this.el.defaultIncognitoToggle) {
            this.el.defaultIncognitoToggle.addEventListener('change', (e) => {
                this.settings.defaultIncognito = e.target.checked;
                this.saveSettings();
            });
        }
        if (this.el.incognitoTimeout) {
            this.el.incognitoTimeout.addEventListener('change', (e) => {
                this.settings.incognitoTimeout = parseInt(e.target.value);
                this.saveSettings();
            });
        }
        if (this.el.connectTimeout) {
            this.el.connectTimeout.addEventListener('change', (e) => {
                this.settings.connectTimeout = parseInt(e.target.value);
                this.saveSettings();
            });
        }
        if (this.el.clearAllData) {
            this.el.clearAllData.addEventListener('click', () => this.showClearAllConfirm());
        }
        if (this.el.exportData) {
            this.el.exportData.addEventListener('click', () => this.exportChatData());
        }
    },

    // ========== 菜单切换 ==========

    switchMenuMode(mode) {
        this.menuMode = mode;
        
        // 更新菜单按钮状态
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.toggle('active', item.dataset.menu === mode);
        });
        
        // 切换侧边栏面板
        if (this.el.chatPanel) {
            this.el.chatPanel.classList.toggle('active', mode === 'chat');
        }
        if (this.el.groupPanel) {
            this.el.groupPanel.classList.toggle('active', mode === 'group');
        }
        if (this.el.settingsPanel) {
            this.el.settingsPanel.classList.toggle('active', mode === 'settings');
        }
        
        // 如果切换到设置，隐藏聊天区域
        if (mode === 'settings') {
            this.el.noChat.classList.remove('hidden');
            this.el.chatArea.classList.add('hidden');
            this.currentChat = null;
        }
    },

    // ========== Feature 1: 无痕消息模式 ==========

    toggleIncognitoMode() {
        this.incognitoMode = !this.incognitoMode;
        this.el.incognitoToggle.classList.toggle('active', this.incognitoMode);
        
        if (this.incognitoMode) {
            this.el.messageInput.placeholder = '无痕消息模式已开启...';
            this.notify('无痕模式已开启，消息将在对方阅读后 10 秒消失', 'info');
        } else {
            this.el.messageInput.placeholder = '输入消息...';
        }
    },

    initIncognitoObserver() {
        this.incognitoObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const msgEl = entry.target;
                    const msgId = msgEl.dataset.msgId;
                    if (msgId && !this.incognitoTimers.has(msgId)) {
                        this.startIncognitoTimer(msgEl, msgId);
                    }
                }
            });
        }, { threshold: 0.5 });
    },

    observeIncognitoMessage(msgEl, msgId) {
        if (this.incognitoObserver) {
            this.incognitoObserver.observe(msgEl);
        }
    },

    startIncognitoTimer(msgEl, msgId) {
        let countdown = 10;
        const countdownEl = msgEl.querySelector('.countdown');
        
        // 显示倒计时
        const updateCountdown = () => {
            if (countdownEl) {
                countdownEl.textContent = `${countdown}s 后消失`;
            }
        };
        updateCountdown();

        const intervalId = setInterval(() => {
            countdown--;
            updateCountdown();
            
            if (countdown <= 0) {
                clearInterval(intervalId);
                // 执行消失动画
                msgEl.classList.add('fading');
                setTimeout(() => {
                    msgEl.remove();
                    this.incognitoTimers.delete(msgId);
                    if (this.incognitoObserver) {
                        this.incognitoObserver.unobserve(msgEl);
                    }
                }, 500);
            }
        }, 1000);

        this.incognitoTimers.set(msgId, intervalId);
    },


    // ========== Feature 3: 动态氛围主题 ==========

    initTheme() {
        // 应用保存的主题设置
        if (this.el.themeSelect) {
            this.el.themeSelect.value = this.settings.theme;
        }
        this.applyTheme();
        // 每分钟检查一次（仅自动模式）
        setInterval(() => {
            if (this.settings.theme === 'auto') {
                this.applyTheme();
            }
        }, 60000);
    },

    changeTheme(theme) {
        this.settings.theme = theme;
        this.saveSettings();
        this.applyTheme();
    },

    applyTheme() {
        const theme = this.settings.theme;
        
        if (theme === 'dark') {
            document.body.classList.add('theme-dark');
        } else if (theme === 'light') {
            document.body.classList.remove('theme-dark');
        } else {
            // auto - 根据时间
            const hour = new Date().getHours();
            const isDark = hour < 6 || hour >= 18;
            document.body.classList.toggle('theme-dark', isDark);
        }
    },

    // ========== Feature 4: 清空本地聊天数据 ==========

    showClearConfirm() {
        if (!this.currentChat) {
            this.notify('请先选择聊天对象', 'warn');
            return;
        }
        
        if (this.el.modalTargetName) {
            this.el.modalTargetName.textContent = this.currentChat;
        }
        if (this.el.confirmModal) {
            this.el.confirmModal.classList.add('open');
        }
    },

    hideClearConfirm() {
        if (this.el.confirmModal) {
            this.el.confirmModal.classList.remove('open');
        }
    },

    clearChatData() {
        if (!this.currentChat) return;
        
        if (this.currentChatType === 'user') {
            delete this.chatHistory[this.currentChat];
            delete this.unreadCount[this.currentChat];
        } else {
            delete this.groupHistory[this.currentChat];
            delete this.groupUnreadCount[this.currentChat];
        }
        
        this.saveHistory();
        
        if (this.el.messages) {
            this.el.messages.innerHTML = '';
        }
        
        this.incognitoTimers.forEach(timer => clearTimeout(timer));
        this.incognitoTimers.clear();
        
        this.renderUserList();
        this.renderGroupList();
        this.hideClearConfirm();
        this.notify('聊天记录已清除', 'info');
    },

    showClearAllConfirm() {
        if (this.el.modalTitle) {
            this.el.modalTitle.textContent = '清除所有数据';
        }
        if (this.el.modalMessage) {
            this.el.modalMessage.innerHTML = '此操作不可恢复，将清空所有本地聊天记录。是否继续？';
        }
        if (this.el.modalTargetName) {
            this.el.modalTargetName.textContent = '';
        }
        if (this.el.modalConfirm) {
            this.el.modalConfirm.onclick = () => this.clearAllData();
        }
        if (this.el.confirmModal) {
            this.el.confirmModal.classList.add('open');
        }
    },

    clearAllData() {
        this.chatHistory = {};
        this.groupHistory = {};
        this.unreadCount = {};
        this.groupUnreadCount = {};
        this.saveHistory();
        
        if (this.el.messages) {
            this.el.messages.innerHTML = '';
        }
        
        this.renderUserList();
        this.renderGroupList();
        this.hideClearConfirm();
        this.notify('所有聊天记录已清除', 'info');
    },

    exportChatData() {
        const data = {
            chatHistory: this.chatHistory,
            groupHistory: this.groupHistory,
            groups: this.groups,
            exportedAt: new Date().toISOString(),
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `p2pchat_export_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.notify('聊天记录已导出', 'info');
    },

    // ========== 设置管理 ==========

    loadSettings() {
        try {
            const data = localStorage.getItem('p2pchat_settings');
            if (data) {
                this.settings = { ...this.settings, ...JSON.parse(data) };
            }
        } catch (e) {
            console.error('加载设置失败:', e);
        }
        
        // 应用设置到 UI
        this.applySettingsToUI();
    },

    saveSettings() {
        try {
            localStorage.setItem('p2pchat_settings', JSON.stringify(this.settings));
            // 标记为脏，定时同步
            this.markDirty('settings');
        } catch (e) {
            console.error('保存设置失败:', e);
        }
    },

    applySettingsToUI() {
        if (this.el.themeSelect) {
            this.el.themeSelect.value = this.settings.theme;
        }
        if (this.el.notificationToggle) {
            this.el.notificationToggle.checked = this.settings.notifications;
        }
        if (this.el.soundToggle) {
            this.el.soundToggle.checked = this.settings.notificationSound;
        }
        if (this.el.defaultIncognitoToggle) {
            this.el.defaultIncognitoToggle.checked = this.settings.defaultIncognito;
        }
        if (this.el.incognitoTimeout) {
            this.el.incognitoTimeout.value = this.settings.incognitoTimeout;
        }
        if (this.el.connectTimeout) {
            this.el.connectTimeout.value = this.settings.connectTimeout;
        }
    },

    // ========== 群聊功能 ==========

    renderGroupList() {
        const ul = this.el.groupList;
        if (!ul) return;
        ul.innerHTML = '';

        const groupIds = Object.keys(this.groups);
        if (groupIds.length === 0) {
            ul.innerHTML = '<li class="empty-list">暂无群组</li>';
            return;
        }

        groupIds.forEach(groupId => {
            const group = this.groups[groupId];
            const li = document.createElement('li');
            li.className = 'contact-item';
            if (groupId === this.currentChat && this.currentChatType === 'group') {
                li.classList.add('active');
            }

            const unread = this.groupUnreadCount[groupId] || 0;
            const memberCount = group.members ? group.members.length : 1;
            const shortId = groupId.slice(0, 8);

            li.innerHTML = `
                <div class="avatar group-avatar" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)">#</div>
                <div class="contact-info">
                    <div class="contact-name">群 ${this.escapeHtml(shortId)}</div>
                    <div class="contact-preview">${memberCount} 位成员</div>
                </div>
                ${unread > 0 ? `<span class="unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
            `;

            li.addEventListener('click', () => this.selectChat(groupId, 'group'));
            ul.appendChild(li);
        });
    },

    // 渲染群成员状态面板
    renderGroupMembersPanel(groupId) {
        const group = this.groups[groupId];
        if (!group) return;

        if (this.el.groupMembersLinkId) {
            this.el.groupMembersLinkId.textContent = groupId.slice(0, 16) + '...';
            this.el.groupMembersLinkId.title = groupId;
            this.el.groupMembersLinkId.dataset.full = groupId;
        }

        const ul = this.el.groupMembersList;
        if (!ul) return;
        ul.innerHTML = '';

        const members = group.members || [];
        members.forEach(member => {
            const li = document.createElement('li');
            li.className = 'group-member-item';

            let connState, dotClass, stateText, memberIp = '';
            if (member === this.username) {
                dotClass = 'connected';
                stateText = '（我）';
            } else {
                connState = this.connectionStates[member];
                // 如果connectionStates是对象格式，提取IP
                if (typeof connState === 'object' && connState !== null) {
                    memberIp = connState.ip ? ` ${connState.ip}` : '';
                    connState = connState.state;
                }
                
                if (connState === 'connected') {
                    dotClass = 'connected';
                    stateText = 'P2P 已连接';
                } else if (connState === 'connecting' || connState === 'checking') {
                    dotClass = 'connecting';
                    stateText = '连接中...';
                } else {
                    dotClass = 'disconnected';
                    stateText = '未连接';
                }
            }

            li.innerHTML = `
                <div class="avatar" style="background: ${this.getAvatarColor(member)}; width:28px; height:28px; font-size:0.7rem; flex-shrink:0">
                    ${this.escapeHtml(member.charAt(0).toUpperCase())}
                </div>
                <div class="group-member-info">
                    <div class="group-member-name">${this.escapeHtml(member)}${memberIp}</div>
                    <div class="group-member-state">
                        <span class="status-dot ${dotClass}" style="width:6px;height:6px"></span>
                        <span>${stateText}</span>
                    </div>
                </div>
            `;
            ul.appendChild(li);
        });
    },

    saveGroups() {
        try {
            localStorage.setItem('p2pchat_groups', JSON.stringify(this.groups));
            // 实时同步到后端
            this.syncToBackend('groups', this.groups);
        } catch (e) { /* ignore */ }
    },

    loadGroups() {
        try {
            const data = localStorage.getItem('p2pchat_groups');
            if (data) this.groups = JSON.parse(data);
        } catch (e) { this.groups = {}; }
    },

    deleteGroup(groupId) {
        // 通知后端离开群聊
        this.send({ type: 'leave_group', groupId: groupId });

        // 从本地存储中删除群信息
        delete this.groups[groupId];
        delete this.groupHistory[groupId];
        delete this.groupUnreadCount[groupId];
        if (this.groupJoinedStatus) {
            delete this.groupJoinedStatus[groupId];
        }
        
        // 保存更新
        this.saveGroups();
        this.saveGroupHistory();
        
        // 如果当前正在查看该群，切换到未选择状态
        if (this.currentChat === groupId && this.currentChatType === 'group') {
            this.currentChat = null;
            this.currentChatType = null;
            this.el.noChat.classList.remove('hidden');
            this.el.chatArea.classList.add('hidden');
            if (this.el.groupMembersPanel) {
                this.el.groupMembersPanel.classList.add('hidden');
            }
        }
        
        // 重新渲染群列表
        this.renderGroupList();
        this.notify('群聊已删除', 'info');
    },

    showDeleteGroupConfirm(groupId) {
        if (this.el.deleteGroupModalTargetName) {
            this.el.deleteGroupModalTargetName.textContent = groupId.slice(0, 8);
        }
        if (this.el.deleteGroupModal) {
            this.el.deleteGroupModal.classList.add('open');
        }
        this.pendingDeleteGroupId = groupId;
    },

    hideDeleteGroupConfirm() {
        if (this.el.deleteGroupModal) {
            this.el.deleteGroupModal.classList.remove('open');
        }
        this.pendingDeleteGroupId = null;
    },

    confirmDeleteGroup() {
        if (this.pendingDeleteGroupId) {
            this.deleteGroup(this.pendingDeleteGroupId);
            this.hideDeleteGroupConfirm();
        }
    },

    updatePeerStatusForGroup(groupId) {
        const group = this.groups[groupId];
        const memberCount = group ? group.members.length : 0;
        if (this.el.peerStatusDot) {
            this.el.peerStatusDot.className = 'status-dot connected';
        }
        if (this.el.peerStatusText) {
            this.el.peerStatusText.textContent = `群聊 · ${memberCount} 位成员`;
        }
        if (this.el.connectionMethod) {
            this.el.connectionMethod.textContent = 'P2P 群聊';
            this.el.connectionMethod.className = 'connection-badge connected';
        }
        if (this.el.retryP2pBtn) {
            this.el.retryP2pBtn.style.display = 'none';
        }
    },

    retryP2PConnection() {
        if (!this.currentChat || this.currentChatType !== 'user') {
            this.notify('请先选择一个联系人', 'warn');
            return;
        }

        const target = this.currentChat;
        
        // 防抖：如果正在连接中，忽略重复点击
        if (this.connectingPeers.has(target)) {
            this.notify('正在连接中，请稍候...', 'warn');
            return;
        }
        
        // 禁用按钮 3 秒防止暴力点击
        if (this.el.retryP2pBtn) {
            this.el.retryP2pBtn.disabled = true;
            setTimeout(() => {
                if (this.el.retryP2pBtn) {
                    this.el.retryP2pBtn.disabled = false;
                }
            }, 3000);
        }

        this.connectingPeers.add(target);
        this.updatePeerStatus('connecting');
        // 发送 force: true 标志，后端会清除旧的 pending offer 并创建新连接
        this.send({ type: 'connect_peer', target: target, force: true });
        this.notify(`正在重新尝试与 ${target} 建立 P2P 连接...`, 'info');
    },

    // ========== 请求连接管理 ==========

    updateConnectRequestBar(target) {
        const bar = this.el.connectRequestBar;
        const btn = this.el.requestConnectBtn;
        const hint = this.el.connectRequestHint;
        if (!bar || !btn) return;

        const state = this.connectionStates[target];

        if (state === 'connected') {
            // 已连接，隐藏请求按钮
            bar.classList.add('hidden');
        } else if (state === 'connecting' || state === 'checking') {
            // 连接中，显示但禁用按钮
            bar.classList.remove('hidden');
            btn.disabled = true;
            btn.classList.add('connecting');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/>
                </svg>
                连接中...
            `;
            if (hint) hint.textContent = '正在建立 P2P 连接';
        } else {
            // 未连接/失败/断开，显示可点击按钮
            bar.classList.remove('hidden');
            btn.disabled = false;
            btn.classList.remove('connecting');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/>
                </svg>
                请求 P2P 连接
            `;
            if (hint) {
                if (state === 'failed') {
                    hint.textContent = '连接失败，可重新尝试';
                } else if (state === 'disconnected' || state === 'closed') {
                    hint.textContent = '连接已断开';
                } else {
                    hint.textContent = '点击按钮发起 P2P 连接';
                }
            }
        }
    },

    updateConnectRequestBarForGroup(groupId) {
        const bar = this.el.connectRequestBar;
        const btn = this.el.requestConnectBtn;
        const hint = this.el.connectRequestHint;
        if (!bar || !btn) return;

        const group = this.groups[groupId];
        if (!group) {
            bar.classList.add('hidden');
            return;
        }

        // 检查是否已加入过群（本次会话）
        const joined = this.groupJoinedStatus && this.groupJoinedStatus[groupId];
        if (joined) {
            bar.classList.add('hidden');
        } else {
            bar.classList.remove('hidden');
            btn.disabled = false;
            btn.classList.remove('connecting');
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36M20.49 15a9 9 0 0 1-14.85 3.36"/>
                </svg>
                请求加入群聊
            `;
            if (hint) hint.textContent = '点击按钮与群成员建立 P2P 连接';
        }
    },

    requestP2PConnect() {
        if (!this.currentChat || this.currentChatType !== 'user') return;

        const target = this.currentChat;

        // 防抖
        if (this.connectingPeers.has(target)) {
            this.notify('正在连接中，请稍候...', 'warn');
            return;
        }

        const connState = this.connectionStates[target];
        if (connState === 'connected') {
            this.notify('已连接', 'info');
            return;
        }

        this.connectingPeers.add(target);
        this.updatePeerStatus('connecting');
        this.updateConnectRequestBar(target);
        this.send({ type: 'connect_peer', target: target });
        this.startConnectTimeout(target);
    },

    requestGroupConnect() {
        if (!this.currentChat || this.currentChatType !== 'group') return;

        const groupId = this.currentChat;
        if (!this.groupJoinedStatus) {
            this.groupJoinedStatus = {};
        }
        this.groupJoinedStatus[groupId] = true;
        this.send({ type: 'rejoin_group', groupId: groupId });

        // 隐藏请求按钮
        if (this.el.connectRequestBar) {
            this.el.connectRequestBar.classList.add('hidden');
        }
        this.notify('正在与群成员建立 P2P 连接...', 'info');
    },

    startConnectTimeout(target) {
        this.clearConnectTimeout(target);
        const timeout = (this.settings.connectTimeout || 30) * 1000;
        const timer = setTimeout(() => {
            this.connectTimeoutTimers.delete(target);
            // 如果还在连接中，标记为超时
            const state = this.connectionStates[target];
            if (state === 'connecting' || state === 'checking') {
                this.connectingPeers.delete(target);
                this.connectionStates[target] = 'timeout';
                this.notify(`与 ${target} 的连接超时`, 'warn');
                if (target === this.currentChat && this.currentChatType === 'user') {
                    this.updatePeerStatus('disconnected');
                    this.updateConnectRequestBar(target);
                }
                this.renderUserList();
            }
        }, timeout);
        this.connectTimeoutTimers.set(target, timer);
    },

    clearConnectTimeout(target) {
        if (this.connectTimeoutTimers.has(target)) {
            clearTimeout(this.connectTimeoutTimers.get(target));
            this.connectTimeoutTimers.delete(target);
        }
    },

    // ========== 联系人管理 ==========

    addContact() {
        const name = this.el.addContactInput ? this.el.addContactInput.value.trim() : '';
        if (!name) {
            this.notify('请输入用户名', 'warn');
            return;
        }
        if (name === this.username) {
            this.notify('不能添加自己', 'warn');
            return;
        }
        if (this.contacts[name]) {
            this.notify('该联系人已存在', 'warn');
            return;
        }

        // 直接添加到本地联系人列表
        this.contacts[name] = {
            name: name,
            addedAt: new Date().toISOString()
        };
        this.saveContacts();
        this.renderUserList();
        if (this.el.addContactInput) {
            this.el.addContactInput.value = '';
        }
        this.notify(`已添加联系人 ${name}`, 'info');
    },

    onCheckUserResult(data) {
        const target = data.target;
        const exists = data.exists;

        if (exists) {
            // 用户存在，添加到联系人
            this.contacts[target] = {
                name: target,
                addedAt: new Date().toISOString()
            };
            this.saveContacts();
            this.renderUserList();
            if (this.el.addContactInput) {
                this.el.addContactInput.value = '';
            }
            this.notify(`已添加联系人 ${target}`, 'info');
        } else {
            this.notify(`用户 ${target} 不存在或离线`, 'warn');
        }
    },

    showDeleteContactConfirm(contactName) {
        if (this.el.deleteGroupModalTargetName) {
            this.el.deleteGroupModalTargetName.textContent = contactName;
        }
        if (this.el.deleteGroupModal) {
            this.el.deleteGroupModal.classList.add('open');
        }
        this.pendingDeleteContactName = contactName;
    },

    hideDeleteContactConfirm() {
        if (this.el.deleteGroupModal) {
            this.el.deleteGroupModal.classList.remove('open');
        }
        this.pendingDeleteContactName = null;
    },

    deleteContact(contactName) {
        delete this.contacts[contactName];
        delete this.chatHistory[contactName];
        delete this.unreadCount[contactName];
        this.saveContacts();
        this.saveHistory();
        this.renderUserList();

        // 如果当前正在查看该联系人，切换到未选择状态
        if (this.currentChat === contactName && this.currentChatType === 'user') {
            this.currentChat = null;
            this.currentChatType = null;
            this.el.noChat.classList.remove('hidden');
            this.el.chatArea.classList.add('hidden');
        }

        this.notify('联系人已删除', 'info');
    },

    saveContacts() {
        try {
            localStorage.setItem('p2pchat_contacts', JSON.stringify(this.contacts));
            // 实时同步到后端
            this.syncToBackend('contacts', this.contacts);
        } catch (e) { /* ignore */ }
    },

    loadContacts() {
        try {
            const data = localStorage.getItem('p2pchat_contacts');
            if (data) this.contacts = JSON.parse(data);
        } catch (e) { this.contacts = {}; }
    },
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
