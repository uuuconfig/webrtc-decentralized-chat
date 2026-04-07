"""
P2P Chat 本地存储管理模块
管理用户数据的文件 I/O 操作
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, Optional
import shutil

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
