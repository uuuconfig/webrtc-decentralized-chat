#!/usr/bin/env python
"""
简单的存储管理器测试脚本
"""

import sys
import json
from pathlib import Path

# 添加 client 目录到路径
sys.path.insert(0, str(Path(__file__).parent / 'client'))

from storage import StorageManager

def test_storage_manager():
    """测试 StorageManager 功能"""
    print("=" * 60)
    print("P2P Chat 本地存储测试")
    print("=" * 60)
    
    # 初始化存储管理器
    sm = StorageManager(base_path="test_data")
    print("\n✓ StorageManager 初始化成功")
    
    # 测试 1: 初始化用户文件夹
    print("\n[测试 1] 初始化用户文件夹")
    result = sm.init_user_folder("testuser1")
    assert result, "初始化用户文件夹失败"
    print("✓ 用户 testuser1 文件夹初始化成功")
    
    # 测试 2: 保存聊天记录
    print("\n[测试 2] 保存聊天记录")
    chat_data = {
        "user2": [
            {
                "id": "msg_1",
                "from": "me",
                "content": "Hello",
                "timestamp": "2026-04-07T13:59:00Z",
                "isIncognito": False
            }
        ]
    }
    result = sm.save_data("testuser1", "chat_history", chat_data)
    assert result, "保存聊天记录失败"
    print("✓ 聊天记录保存成功")
    
    # 测试 3: 加载聊天记录
    print("\n[测试 3] 加载聊天记录")
    loaded_data = sm.load_data("testuser1", "chat_history")
    assert loaded_data == chat_data, "加载的数据不匹配"
    print("✓ 聊天记录加载成功")
    print(f"  数据内容: {json.dumps(loaded_data, ensure_ascii=False, indent=2)}")
    
    # 测试 4: 保存联系人
    print("\n[测试 4] 保存联系人")
    contacts_data = {
        "user2": {
            "name": "user2",
            "addedAt": "2026-04-07T13:00:00Z"
        },
        "user3": {
            "name": "user3",
            "addedAt": "2026-04-07T13:30:00Z"
        }
    }
    result = sm.save_data("testuser1", "contacts", contacts_data)
    assert result, "保存联系人失败"
    print("✓ 联系人保存成功")
    
    # 测试 5: 保存设置
    print("\n[测试 5] 保存设置")
    settings_data = {
        "theme": "dark",
        "notifications": True,
        "notificationSound": False,
        "defaultIncognito": False,
        "incognitoTimeout": 10,
        "connectTimeout": 30
    }
    result = sm.save_data("testuser1", "settings", settings_data)
    assert result, "保存设置失败"
    print("✓ 设置保存成功")
    
    # 测试 6: 加载所有数据
    print("\n[测试 6] 加载所有数据")
    all_data = sm.load_all_data("testuser1")
    assert "chat_history" in all_data, "缺少 chat_history"
    assert "contacts" in all_data, "缺少 contacts"
    assert "settings" in all_data, "缺少 settings"
    print("✓ 所有数据加载成功")
    print(f"  数据类型: {list(all_data.keys())}")
    
    # 测试 7: 多用户隔离
    print("\n[测试 7] 多用户数据隔离")
    sm.init_user_folder("testuser2")
    user2_chat = {
        "user1": [
            {
                "id": "msg_1",
                "from": "me",
                "content": "Hi from user2",
                "timestamp": "2026-04-07T13:59:00Z",
                "isIncognito": False
            }
        ]
    }
    sm.save_data("testuser2", "chat_history", user2_chat)
    
    # 验证用户 1 的数据未被修改
    user1_data = sm.load_data("testuser1", "chat_history")
    assert user1_data == chat_data, "用户 1 数据被修改"
    
    # 验证用户 2 的数据正确
    user2_data = sm.load_data("testuser2", "chat_history")
    assert user2_data == user2_chat, "用户 2 数据不正确"
    print("✓ 多用户数据完全隔离")
    
    # 测试 8: 用户名验证
    print("\n[测试 8] 用户名安全验证")
    invalid_usernames = ["../admin", "user\x00name", "user\nname", ""]
    for invalid_name in invalid_usernames:
        try:
            sm.init_user_folder(invalid_name)
            print(f"✗ 应该拒绝用户名: {repr(invalid_name)}")
        except ValueError:
            print(f"✓ 正确拒绝非法用户名: {repr(invalid_name)}")
    
    # 测试 9: 验证文件夹结构
    print("\n[测试 9] 验证文件夹结构")
    user1_dir = Path("test_data") / "testuser1"
    assert user1_dir.exists(), "用户文件夹不存在"
    assert (user1_dir / "chat_history.json").exists(), "chat_history.json 不存在"
    assert (user1_dir / "contacts.json").exists(), "contacts.json 不存在"
    assert (user1_dir / "settings.json").exists(), "settings.json 不存在"
    print("✓ 文件夹结构正确")
    print(f"  文件列表: {list(user1_dir.glob('*.json'))}")
    
    print("\n" + "=" * 60)
    print("✅ 所有测试通过！")
    print("=" * 60)

if __name__ == "__main__":
    try:
        test_storage_manager()
    except Exception as e:
        print(f"\n❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
