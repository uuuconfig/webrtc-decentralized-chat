/**
 * P2P Chat 信令服务器 WebUI
 * 前端逻辑
 */

class DashboardClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.serverStartTime = null;
        this.logs = [];
        this.currentFilter = 'all';
        this.currentSearch = '';
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/dashboard/ws`;
        
        console.log('正在连接到:', url);
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('已连接到信令服务器');
            this.reconnectAttempts = 0;
            this.updateConnectionStatus(true);
        };
        
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('解析消息失败:', e);
            }
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

    handleInitialData(data) {
        this.serverStartTime = new Date(data.server_start_time);
        // 显示服务器启动时间
        document.getElementById('start-time').textContent = this.serverStartTime.toLocaleString('zh-CN');
        this.updateStats(data.stats);
        this.updateUsers(data.users);
        this.updateGroups(data.groups);
        this.updatePendingOffers(data.pending_offers);
        
        // 添加历史日志
        if (data.recent_logs && Array.isArray(data.recent_logs)) {
            this.logs = data.recent_logs;
            this.renderLogs();
        }
    }

    updateStats(stats) {
        document.getElementById('online-users').textContent = stats.online_users || 0;
        document.getElementById('active-groups').textContent = stats.active_groups || 0;
        document.getElementById('pending-offers').textContent = stats.pending_offers || 0;
        document.getElementById('messages-per-second').textContent = 
            (stats.messages_per_second || 0).toFixed(2);
        document.getElementById('total-messages').textContent = stats.total_messages || 0;
        document.getElementById('connection-success-rate').textContent = 
            ((stats.connection_success_rate || 0) * 100).toFixed(1) + '%';
        document.getElementById('avg-connection-time').textContent = 
            Math.round(stats.avg_connection_time_ms || 0) + 'ms';
        
        // 更新运行时长
        if (this.serverStartTime) {
            document.getElementById('uptime').textContent = 
                this.formatUptime(stats.uptime_seconds || 0);
        }
    }

    updateUsers(data) {
        const users = data.users || [];
        const container = document.getElementById('users-list');
        
        if (users.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无在线用户</div>';
            return;
        }
        
        container.innerHTML = users.map(user => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">
                        <span>${this.escapeHtml(user.username)}</span>
                        <span class="status-badge online">
                            <span class="status-dot connected"></span>
                            在线
                        </span>
                    </div>
                </div>
                <div class="list-item-details">
                    <div class="detail-row">
                        <span class="detail-label">连接时间</span>
                        <span class="detail-value">${new Date(user.connected_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">连接时长</span>
                        <span class="detail-value">${this.formatDuration(user.connection_duration_seconds)}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    updateGroups(data) {
        const groups = data.groups || [];
        const container = document.getElementById('groups-list');
        
        if (groups.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无群聊</div>';
            return;
        }
        
        container.innerHTML = groups.map(group => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">
                        <span>群 ID: ${this.escapeHtml(group.group_id.substring(0, 12))}...</span>
                    </div>
                    <span class="status-badge">
                        ${group.online_members}/${group.total_members} 在线
                    </span>
                </div>
                <div class="list-item-details">
                    <div class="detail-row">
                        <span class="detail-label">创建者</span>
                        <span class="detail-value">${this.escapeHtml(group.creator || '-')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">创建时间</span>
                        <span class="detail-value">${new Date(group.created_at).toLocaleString('zh-CN')}</span>
                    </div>
                </div>
                <div class="members-list">
                    <div class="members-list-title">成员列表</div>
                    <div class="members-tags">
                        ${group.members.map(m => `<span class="member-tag">${this.escapeHtml(m)}</span>`).join('')}
                    </div>
                </div>
            </div>
        `).join('');
    }

    updatePendingOffers(data) {
        const offers = data.pending_offers || [];
        const container = document.getElementById('pending-offers-list');
        
        if (offers.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无待处理连接</div>';
            return;
        }
        
        container.innerHTML = offers.map(offer => `
            <div class="list-item">
                <div class="list-item-header">
                    <div class="list-item-title">
                        <span>${this.escapeHtml(offer.from)} → ${this.escapeHtml(offer.to)}</span>
                    </div>
                    <span class="status-badge">
                        <span class="status-dot connecting"></span>
                        进行中
                    </span>
                </div>
                <div class="list-item-details">
                    <div class="detail-row">
                        <span class="detail-label">连接 ID</span>
                        <span class="detail-value">${this.escapeHtml(offer.conn_id.substring(0, 16))}...</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">发起时间</span>
                        <span class="detail-value">${new Date(offer.started_at).toLocaleString('zh-CN')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">耗时</span>
                        <span class="detail-value">${offer.duration_seconds}s</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    addLog(logData) {
        this.logs.unshift(logData);
        if (this.logs.length > 100) {
            this.logs.pop();
        }
        this.renderLogs();
    }

    renderLogs() {
        const filtered = this.filterLogs();
        const container = document.getElementById('logs-container');
        
        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state">暂无日志</div>';
            return;
        }
        
        container.innerHTML = filtered.map(log => `
            <div class="log-entry log-${log.level.toLowerCase()}">
                <span class="log-time">${log.timestamp.substring(11, 19)}</span>
                <span class="log-level">[${log.level}]</span>
                <span class="log-category">${log.category}</span>
                <span class="log-message">${this.escapeHtml(log.message)}</span>
            </div>
        `).join('');
        
        // 自动滚动到底部
        container.scrollTop = container.scrollHeight;
    }

    filterLogs() {
        return this.logs.filter(log => {
            // 按类别筛选
            if (this.currentFilter !== 'all' && log.category !== this.currentFilter) {
                return false;
            }
            
            // 按搜索词筛选
            if (this.currentSearch) {
                const search = this.currentSearch.toLowerCase();
                return log.message.toLowerCase().includes(search) ||
                       (log.username && log.username.toLowerCase().includes(search));
            }
            
            return true;
        });
    }

    updateConnectionStatus(connected) {
        const status = document.getElementById('connection-status');
        if (connected) {
            status.innerHTML = `
                <span class="status-dot connected"></span>
                <span class="status-text">已连接</span>
            `;
        } else {
            status.innerHTML = `
                <span class="status-dot disconnected"></span>
                <span class="status-text">已断开</span>
            `;
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), this.reconnectDelay);
        }
    }

    formatUptime(seconds) {
        seconds = Math.floor(seconds);
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (days > 0) {
            return `${days}天 ${hours}小时 ${minutes}分钟`;
        } else if (hours > 0) {
            return `${hours}小时 ${minutes}分钟`;
        } else {
            return `${minutes}分钟 ${Math.floor(secs)}秒`;
        }
    }

    formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds}秒`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}分钟 ${secs}秒`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}小时 ${minutes}分钟`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ========== 初始化 ==========
let dashboard;

document.addEventListener('DOMContentLoaded', () => {
    dashboard = new DashboardClient();
    dashboard.connect();
    
    // 主题切换
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('dashboard-theme') || 'dark';
    
    if (savedTheme === 'dark') {
        document.body.classList.add('theme-dark');
    }
    
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('theme-dark');
        const isDark = document.body.classList.contains('theme-dark');
        localStorage.setItem('dashboard-theme', isDark ? 'dark' : 'light');
    });
    
    // 日志筛选
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            dashboard.currentFilter = e.target.dataset.filter;
            dashboard.renderLogs();
        });
    });
    
    // 日志搜索
    document.getElementById('log-search').addEventListener('input', (e) => {
        dashboard.currentSearch = e.target.value;
        dashboard.renderLogs();
    });
    
    // 定期更新运行时长
    setInterval(() => {
        if (dashboard.serverStartTime) {
            const uptime = Math.floor((Date.now() - dashboard.serverStartTime.getTime()) / 1000);
            document.getElementById('uptime').textContent = dashboard.formatUptime(uptime);
        }
    }, 1000);
});
