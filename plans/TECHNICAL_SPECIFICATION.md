# 本地 JSON 存储 - 技术规范与代码示例

## 📋 目录
1. [后端 StorageManager 类](#后端-storagemanager-类)
2. [后端 API 端点](#后端-api-端点)
3. [前端同步机制](#前端同步机制)
4. [数据验证规则](#数据验证规则)
5. [错误处理](#错误处理)

---

## 后端 StorageManager 类

### 类定义

```python
# client/storage.py

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger("storage")

class StorageManager:
    """管理本地 JSON 文件存储"""
    
    # 支持的数据类型
    DATA_TYPES = {
        'chat_history': 'chat_history.json',
        'group_history': 'group_history.json',
        'contacts': 'contacts.json',
        'settings': 'settings.json',
        'groups': 'groups.json',
    }
    
    # 默认数据结构
    DEFAULT_DATA = {
        'chat_history': {},
        'group_history': {},
        'contacts': {},
        'settings': {
            'theme': 'auto',
            'notifications': True,
            'notificationSound': True,
            'defaultIncognito': False,
            'incognitoTimeout': 10,
            'connectTimeout': 30,
        },
        'groups': {},
    }
    
    def __init__(self, base_path: str = "data"):
        """初始化存储管理器
        
        Args:
            base_path: 数据存储根目录
        """
        self.base_path = Path(base_path)
        self.base_path.mkdir(exist_ok=True)
        logger.info(f"StorageManager initialized with base_path: {self.base_path}")
    
    def _get_user_dir(self, username: str) -> Path:
        """获取用户数据目录路径
        
        Args:
            username: 用户名
            
        Returns:
            用户目录路径
            
        Raises:
            ValueError: 用户名包含非法字符
        """
        # 验证用户名，防止路径遍历
        if not self._validate_username(username):
            raise ValueError(f"Invalid username: {username}")
        
        user_dir = self.base_path / username
        return user_dir
    
    def _validate_username(self, username: str) -> bool:
        """验证用户名合法性
        
        Args:
            username: 用户名
            
        Returns:
            True 如果合法，False 否则
        """
        # 不允许空字符串、路径分隔符、特殊字符
        if not username or len(username) > 100:
            return False
        
        forbidden_chars = ['/', '\\', '..', '\x00', '\n', '\r']
        for char in forbidden_chars:
            if char in username:
                return False
        
        return True
    
    def init_user_folder(self, username: str) -> bool:
        """初始化用户文件夹和默认文件
        
        Args:
            username: 用户名
            
        Returns:
            True 如果成功，False 否则
        """
        try:
            user_dir = self._get_user_dir(username)
            user_dir.mkdir(exist_ok=True)
            
            # 为每个数据类型创建默认文件（如不存在）
            for data_type, filename in self.DATA_TYPES.items():
                file_path = user_dir / filename
                if not file_path.exists():
                    default_data = self.DEFAULT_DATA.get(data_type, {})
                    self._write_json_file(file_path, default_data)
                    logger.info(f"Created default file: {file_path}")
            
            logger.info(f"User folder initialized: {user_dir}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to init user folder for {username}: {e}")
            return False
    
    def load_data(self, username: str, data_type: str) -> Dict[str, Any]:
        """加载单个数据类型
        
        Args:
            username: 用户名
            data_type: 数据类型 (chat_history, contacts, settings 等)
            
        Returns:
            数据字典，如果文件不存在返回默认值
        """
        try:
            if data_type not in self.DATA_TYPES:
                logger.warning(f"Unknown data type: {data_type}")
                return {}
            
            user_dir = self._get_user_dir(username)
            file_path = user_dir / self.DATA_TYPES[data_type]
            
            if not file_path.exists():
                logger.warning(f"File not found: {file_path}, returning default")
                return self.DEFAULT_DATA.get(data_type, {})
            
            data = self._read_json_file(file_path)
            logger.debug(f"Loaded {data_type} for {username}")
            return data
        
        except Exception as e:
            logger.error(f"Failed to load {data_type} for {username}: {e}")
            return self.DEFAULT_DATA.get(data_type, {})
    
    def load_all_data(self, username: str) -> Dict[str, Any]:
        """加载用户所有数据
        
        Args:
            username: 用户名
            
        Returns:
            包含所有数据类型的字典
        """
        all_data = {}
        for data_type in self.DATA_TYPES.keys():
            all_data[data_type] = self.load_data(username, data_type)
        
        logger.info(f"Loaded all data for {username}")
        return all_data
    
    def save_data(self, username: str, data_type: str, data: Dict[str, Any]) -> bool:
        """保存单个数据类型
        
        Args:
            username: 用户名
            data_type: 数据类型
            data: 要保存的数据
            
        Returns:
            True 如果成功，False 否则
        """
        try:
            if data_type not in self.DATA_TYPES:
                logger.warning(f"Unknown data type: {data_type}")
                return False
            
            # 验证数据
            if not self.validate_data(data_type, data):
                logger.warning(f"Data validation failed for {data_type}")
                return False
            
            user_dir = self._get_user_dir(username)
            user_dir.mkdir(exist_ok=True)
            
            file_path = user_dir / self.DATA_TYPES[data_type]
            self._write_json_file(file_path, data)
            
            logger.info(f"Saved {data_type} for {username}")
            return True
        
        except Exception as e:
            logger.error(f"Failed to save {data_type} for {username}: {e}")
            return False
    
    def delete_user_data(self, username: str) -> bool:
        """删除用户所有数据
        
        Args:
            username: 用户名
            
        Returns:
            True 如果成功，False 否则
        """
        try:
            user_dir = self._get_user_dir(username)
            
            if user_dir.exists():
                import shutil
                shutil.rmtree(user_dir)
                logger.info(f"Deleted user data: {user_dir}")
                return True
            
            return False
        
        except Exception as e:
            logger.error(f"Failed to delete user data for {username}: {e}")
            return False
    
    def validate_data(self, data_type: str, data: Any) -> bool:
        """验证数据格式
        
        Args:
            data_type: 数据类型
            data: 要验证的数据
            
        Returns:
            True 如果数据有效，False 否则
        """
        if not isinstance(data, dict):
            logger.warning(f"Data must be dict, got {type(data)}")
            return False
        
        # 根据数据类型进行特定验证
        if data_type == 'settings':
            # settings 应该包含特定的键
            required_keys = ['theme', 'notifications', 'notificationSound']
            if not all(key in data for key in required_keys):
                logger.warning(f"Settings missing required keys")
                return False
        
        elif data_type in ['chat_history', 'group_history']:
            # 这些应该是消息数组的字典
            for key, value in data.items():
                if not isinstance(value, list):
                    logger.warning(f"Message history values must be lists")
                    return False
        
        return True
    
    def _read_json_file(self, file_path: Path) -> Dict[str, Any]:
        """读取 JSON 文件
        
        Args:
            file_path: 文件路径
            
        Returns:
            解析后的 JSON 数据
        """
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    def _write_json_file(self, file_path: Path, data: Dict[str, Any]) -> None:
        """写入 JSON 文件
        
        Args:
            file_path: 文件路径
            data: 要写入的数据
        """
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
```

---

## 后端 API 端点

### 集成到 app.py

```python
# 在 client/app.py 中添加以下代码

from fastapi import HTTPException, status
from storage import StorageManager

# 初始化存储管理器
storage_manager = StorageManager(base_path="data")

# ========== 数据同步 API 端点 ==========

@app.post("/api/data/{username}/{data_type}")
async def save_data(username: str, data_type: str, request: dict):
    """保存用户数据
    
    Args:
        username: 用户名
        data_type: 数据类型 (chat_history, contacts, settings 等)
        request: 请求体 { "data": {...} }
    
    Returns:
        { "success": true, "message": "Data saved successfully" }
    """
    try:
        # 验证用户名
        if not username or len(username) > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username"
            )
        
        # 验证数据类型
        if data_type not in storage_manager.DATA_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown data type: {data_type}"
            )
        
        # 获取请求数据
        data = request.get("data", {})
        
        # 保存数据
        success = storage_manager.save_data(username, data_type, data)
        
        if success:
            return {
                "success": True,
                "message": "Data saved successfully"
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save data"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.get("/api/data/{username}/{data_type}")
async def get_data(username: str, data_type: str):
    """获取用户单个数据类型
    
    Args:
        username: 用户名
        data_type: 数据类型
    
    Returns:
        { "data": {...} }
    """
    try:
        # 验证用户名
        if not username or len(username) > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username"
            )
        
        # 验证数据类型
        if data_type not in storage_manager.DATA_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown data type: {data_type}"
            )
        
        # 加载数据
        data = storage_manager.load_data(username, data_type)
        
        return {
            "data": data
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.get("/api/data/{username}/all")
async def get_all_data(username: str):
    """获取用户所有数据
    
    Args:
        username: 用户名
    
    Returns:
        {
            "chat_history": {...},
            "group_history": {...},
            "contacts": {...},
            "settings": {...},
            "groups": {...}
        }
    """
    try:
        # 验证用户名
        if not username or len(username) > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username"
            )
        
        # 初始化用户文件夹
        storage_manager.init_user_folder(username)
        
        # 加载所有数据
        all_data = storage_manager.load_all_data(username)
        
        return all_data
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading all data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@app.delete("/api/data/{username}")
async def delete_user_data(username: str):
    """删除用户所有数据
    
    Args:
        username: 用户名
    
    Returns:
        { "success": true, "message": "User data deleted" }
    """
    try:
        # 验证用户名
        if not username or len(username) > 100:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username"
            )
        
        # 删除数据
        success = storage_manager.delete_user_data(username)
        
        if success:
            return {
                "success": True,
                "message": "User data deleted"
            }
        else:
            return {
                "success": False,
                "message": "User data not found"
            }
    
    except Exception as e:
        logger.error(f"Error deleting user data: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# 修改现有的 handle_browser_message 函数
async def handle_browser_message(data: dict):
    """处理来自浏览器的消息"""
    msg_type = data.get("type")
    p2p = state["p2p_manager"]
    
    # ... 现有代码 ...
    
    if msg_type == "register":
        state["username"] = data["username"]
        # 初始化用户文件夹
        storage_manager.init_user_folder(data["username"])
        
        ws = state["signal_ws"]
        if ws:
            await ws.send(json.dumps({
                "type": "register",
                "username": data["username"]
            }))
    
    # ... 其他代码 ...
```

---

## 前端同步机制

### 添加到 app.js

```javascript
// 在 App 对象中添加以下属性和方法

const App = {
    // ... 现有属性 ...
    
    // 新增属性
    autoSyncInterval: null,
    dirtyData: new Set(),  // 标记需要同步的数据类型
    syncRetryCount: {},    // 重试计数
    MAX_RETRY: 3,          // 最大重试次数
    SYNC_INTERVAL: 10000,  // 定时同步间隔（10秒）
    
    // ========== 后端同步方法 ==========
    
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
     * 加载单个数据类型
     */
    async loadDataTypeFromBackend(dataType) {
        try {
            const response = await fetch(`/api/data/${this.username}/${dataType}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const result = await response.json();
            return result.data || {};
        } catch (e) {
            console.error(`Failed to load ${dataType} from backend:`, e);
            return {};
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
    
    // ========== 修改现有方法 ==========
    
    /**
     * 修改 init 方法
     */
    init() {
        // 不在这里加载数据，等待登录后从后端加载
        this.bindEvents();
        this.connectWS();
        this.initTheme();
        this.initIncognitoObserver();
    },
    
    /**
     * 修改 onRegistered 方法
     */
    async onRegistered(username) {
        this.username = username;
        
        // 从后端加载所有数据
        await this.loadFromBackend(username);
        
        // 初始化 UI
        this.renderGroupList();
        this.renderUserList();
        
        // 启动自动同步
        this.startAutoSync();
        
        // 显示主界面
        if (this.el.loginView) {
            this.el.loginView.classList.add('hidden');
        }
        if (this.el.mainView) {
            this.el.mainView.classList.remove('hidden');
        }
        
        // 更新设置面板
        this.updateSettingsPanel();
    },
    
    /**
     * 修改 saveHistory 方法
     */
    saveHistory() {
        try {
            localStorage.setItem('p2pchat_history', JSON.stringify(this.chatHistory));
            // 实时同步到后端
            this.syncToBackend('chat_history', this.chatHistory);
        } catch (e) { /* ignore */ }
    },
    
    /**
     * 修改 saveSettings 方法
     */
    saveSettings() {
        try {
            localStorage.setItem('p2pchat_settings', JSON.stringify(this.settings));
            // 标记为脏，定时同步
            this.markDirty('settings');
        } catch (e) { /* ignore */ }
    },
    
    /**
     * 修改 saveContacts 方法
     */
    saveContacts() {
        try {
            localStorage.setItem('p2pchat_contacts', JSON.stringify(this.contacts));
            // 实时同步到后端
            this.syncToBackend('contacts', this.contacts);
        } catch (e) { /* ignore */ }
    },
    
    /**
     * 修改 saveGroups 方法
     */
    saveGroups() {
        try {
            localStorage.setItem('p2pchat_groups', JSON.stringify(this.groups));
            // 实时同步到后端
            this.syncToBackend('groups', this.groups);
        } catch (e) { /* ignore */ }
    },
    
    /**
     * 修改 saveGroupHistory 方法
     */
    saveGroupHistory() {
        try {
            localStorage.setItem('p2pchat_group_history', JSON.stringify(this.groupHistory));
            // 实时同步到后端
            this.syncToBackend('group_history', this.groupHistory);
        } catch (e) { /* ignore */ }
    },
    
    /**
     * 添加登出方法
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
            this.el.loginView.classList.remove('hidden');
        }
        if (this.el.mainView) {
            this.el.mainView.classList.add('hidden');
        }
        
        console.log('Logged out');
    },
};
```

---

## 数据验证规则

### 聊天记录验证

```python
def validate_chat_history(data: dict) -> bool:
    """验证聊天记录格式"""
    if not isinstance(data, dict):
        return False
    
    for username, messages in data.items():
        if not isinstance(username, str):
            return False
        
        if not isinstance(messages, list):
            return False
        
        for msg in messages:
            if not isinstance(msg, dict):
                return False
            
            # 检查必需字段
            required_fields = ['id', 'from', 'content', 'timestamp']
            if not all(field in msg for field in required_fields):
                return False
    
    return True
```

### 联系人验证

```python
def validate_contacts(data: dict) -> bool:
    """验证联系人格式"""
    if not isinstance(data, dict):
        return False
    
    for username, contact_info in data.items():
        if not isinstance(username, str):
            return False
        
        if not isinstance(contact_info, dict):
            return False
        
        # 检查必需字段
        if 'name' not in contact_info:
            return False
    
    return True
```

---

## 错误处理

### 前端错误处理

```javascript
/**
 * 处理同步错误
 */
async syncToBackendWithRetry(dataType, data, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const success = await this.syncToBackend(dataType, data);
            if (success) {
                return true;
            }
        } catch (e) {
            console.error(`Sync attempt ${i + 1} failed:`, e);
            
            if (i < maxRetries - 1) {
                // 指数退避
                await new Promise(resolve => 
                    setTimeout(resolve, Math.pow(2, i) * 1000)
                );
            }
        }
    }
    
    console.error(`Failed to sync ${dataType} after ${maxRetries} attempts`);
    return false;
}
```

### 后端错误处理

```python
@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """全局异常处理"""
    logger.error(f"Unhandled exception: {exc}")
    return {
        "success": False,
        "message": "Internal server error",
        "error": str(exc)
    }
```

