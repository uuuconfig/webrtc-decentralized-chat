"""
P2P Chat 本地客户端
FastAPI Web 服务 + WebSocket 连接信令服务器 + P2P 管理
"""

import asyncio
import json
import logging
import argparse
from datetime import datetime
from pathlib import Path

import yaml
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn
import websockets

from p2p import P2PManager
from storage import StorageManager
from fastapi import HTTPException, status


# ========== 加载配置文件 ==========
def load_client_config() -> dict:
    """加载 client_config.yaml，找不到则返回默认值"""
    config_paths = [
        Path(__file__).parent.parent / "client_config.yaml",  # 项目根目录
        Path(__file__).parent / "client_config.yaml",          # client 目录
    ]
    for p in config_paths:
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                raw = yaml.safe_load(f) or {}
            return raw.get("client", {})
    return {}


_cfg = load_client_config()

# 从配置文件读取值，提供合理的默认值
_default_host = _cfg.get("host", "0.0.0.0")
_default_port = _cfg.get("port", 8000)
_default_signal_url = _cfg.get("signal_server", "ws://localhost:5010")
_default_storage_path = _cfg.get("storage", {}).get("base_path", "data")
_default_max_username_length = _cfg.get("storage", {}).get("max_username_length", 100)
_default_log_level = _cfg.get("log_level", "INFO")
_default_log_format = _cfg.get("log_format", "%(asctime)s [%(levelname)s] %(message)s")

# P2P 相关配置
_p2p_cfg = _cfg.get("p2p", {})
_stun_servers = _p2p_cfg.get("stun_servers", None)
_ice_gathering_timeout = _p2p_cfg.get("ice_gathering_timeout", 5.0)
_check_user_timeout = _p2p_cfg.get("check_user_timeout", 5.0)

# 应用日志配置
logging.basicConfig(level=getattr(logging, _default_log_level, logging.INFO),
                    format=_default_log_format)
logger = logging.getLogger("client")

app = FastAPI()

# 初始化存储管理器（使用配置的路径和用户名长度限制）
storage_manager = StorageManager(base_path=_default_storage_path)

# 全局状态（使用配置值）
state = {
    "username": None,
    "signal_ws": None,
    "p2p_manager": P2PManager(
        stun_servers=_stun_servers,
        ice_gathering_timeout=_ice_gathering_timeout,
    ),
    "browser_ws": None,  # 浏览器 WebSocket 连接
    "signal_url": _default_signal_url,
    "user_list": [],     # 缓存在线用户列表
    # 群链接：groupId -> { "members": [username,...], "creator": str }
    "group_peers": {},   # groupId -> set of peer usernames (不含自己)
    "my_groups": {},     # groupId -> { "members": [...], "creator": str }
    "check_user_futures": {},  # target -> asyncio.Future，用于等待 check_user 结果
    "max_username_length": _default_max_username_length,
    "check_user_timeout": _check_user_timeout,
}

static_dir = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


@app.get("/")
async def index():
    return FileResponse(str(static_dir / "index.html"))


async def send_to_browser(data: dict):
    """发送消息到浏览器"""
    ws = state["browser_ws"]
    if ws:
        try:
            await ws.send_json(data)
        except Exception:
            pass


async def on_p2p_message(remote_user: str, message_data: dict):
    """收到 P2P 消息的回调"""
    msg_type = message_data.get("type", "text")
    content = message_data.get("content", "")

    if msg_type == "group":
        # 群聊消息：content 是 JSON { groupId, text }
        try:
            inner = json.loads(content)
            group_id = inner.get("groupId")
            text = inner.get("text", "")
            await send_to_browser({
                "type": "group_p2p_message",
                "groupId": group_id,
                "from": remote_user,
                "content": text,
                "timestamp": message_data.get("timestamp", datetime.now().isoformat()),
            })
        except Exception as e:
            logger.warning(f"解析群消息失败 [{remote_user}]: {e}")
    else:
        # 单聊消息
        await send_to_browser({
            "type": "chat_message",
            "from": remote_user,
            "content": content,
            "msg_type": msg_type,
            "timestamp": message_data.get("timestamp", datetime.now().isoformat()),
        })


async def on_p2p_state_change(remote_user: str, conn_state: str):
    """P2P 连接状态变化回调"""
    await send_to_browser({
        "type": "connection_state",
        "user": remote_user,
        "state": conn_state,
    })


async def signal_send(data: dict):
    """通过信令服务器发送消息"""
    ws = state["signal_ws"]
    if ws:
        try:
            await ws.send(json.dumps(data))
        except Exception as e:
            logger.error(f"信令发送失败: {e}")


async def handle_signal_message(raw: str):
    """处理来自信令服务器的消息"""
    data = json.loads(raw)
    msg_type = data.get("type")
    p2p = state["p2p_manager"]

    if msg_type == "registered":
        await send_to_browser({"type": "registered", "username": data["username"]})

    elif msg_type == "user_list":
        state["user_list"] = data["users"]
        await send_to_browser({"type": "user_list", "users": data["users"]})

    elif msg_type == "error":
        await send_to_browser({"type": "error", "message": data["message"]})

    elif msg_type == "check_user_result":
        target = data.get("target")
        exists = data.get("exists")
        # 如果有等待中的 Future，设置结果
        future = state["check_user_futures"].pop(target, None)
        if future and not future.done():
            future.set_result(exists)
        # 同时转发给浏览器
        await send_to_browser({
            "type": "check_user_result",
            "target": target,
            "exists": exists,
            "message": data.get("message")
        })

    elif msg_type == "offer":
        from_user = data["from"]
        force = data.get("force", False)
        offer_conn_id = data.get("conn_id")
        try:
            # 先通知前端正在建立连接（防止竞态条件）
            await send_to_browser({
                "type": "connection_state",
                "user": from_user,
                "state": "connecting",
            })
            answer_data = await p2p.handle_offer(from_user, data["sdp"], force=force, offer_conn_id=offer_conn_id)
            if answer_data is None:
                logger.info(f"忽略来自 {from_user} 的 offer（已连接或 glare）")
                # 如果已连接，通知前端当前状态；否则保持 connecting 状态
                if p2p.is_connected(from_user):
                    await send_to_browser({
                        "type": "connection_state",
                        "user": from_user,
                        "state": "connected",
                    })
                # 如果是 glare 且本地不是 polite peer，保持 connecting 状态等待本地 offer 的 answer
                return
            await signal_send(answer_data)
            await send_to_browser({
                "type": "incoming_connection",
                "from": from_user,
            })
        except Exception as e:
            logger.warning(f"处理 offer 失败 [{from_user}]: {e}")
            # 处理失败，通知前端
            await send_to_browser({
                "type": "connection_state",
                "user": from_user,
                "state": "failed",
            })

    elif msg_type == "answer":
        from_user = data["from"]
        conn_id = data.get("conn_id")
        try:
            await p2p.handle_answer(from_user, data["sdp"], conn_id=conn_id)
        except Exception as e:
            logger.warning(f"处理 answer 失败 [{from_user}]: {e}")

    # ========== 群链接消息 ==========

    elif msg_type == "group_link_created":
        # 自己创建群成功
        group_id = data["groupId"]
        state["group_peers"][group_id] = set()
        state["my_groups"][group_id] = {
            "members": [state["username"]],
            "creator": state["username"],
        }
        logger.info(f"群链接已创建: {group_id}")
        await send_to_browser({
            "type": "group_link_created",
            "groupId": group_id,
        })

    elif msg_type == "group_link_joined":
        # 自己加入群成功，拿到已有成员列表
        group_id = data["groupId"]
        peers = data.get("peers", [])
        all_members = data.get("allMembers", [])

        if group_id not in state["group_peers"]:
            state["group_peers"][group_id] = set()
        if group_id not in state["my_groups"]:
            state["my_groups"][group_id] = {
                "members": all_members,
                "creator": None,
            }
        else:
            state["my_groups"][group_id]["members"] = all_members

        for peer in peers:
            state["group_peers"][group_id].add(peer)

        logger.info(f"加入群 {group_id}，向已有成员发起 P2P: {peers}")
        # 向所有已在群里的人发 offer
        for peer in peers:
            try:
                offer_data = await p2p.create_offer(peer)
                if offer_data:
                    await signal_send(offer_data)
            except Exception as e:
                logger.warning(f"向 {peer} 发起 P2P offer 失败: {e}")

        await send_to_browser({
            "type": "group_link_joined",
            "groupId": group_id,
            "peers": peers,
            "allMembers": all_members,
        })

    elif msg_type == "group_link_peer_joined":
        # 有新人加入了我所在的群
        group_id = data["groupId"]
        new_peer = data["username"]
        all_members = data.get("allMembers", [])

        if group_id in state["group_peers"]:
            state["group_peers"][group_id].add(new_peer)
        if group_id in state["my_groups"]:
            state["my_groups"][group_id]["members"] = all_members

        logger.info(f"群 {group_id} 新成员: {new_peer}")
        # 新成员会主动来 offer，我们等待即可（handle_offer 在 offer 消息里处理）
        await send_to_browser({
            "type": "group_link_peer_joined",
            "groupId": group_id,
            "username": new_peer,
            "allMembers": all_members,
        })

    elif msg_type == "group_link_peer_left":
        # 有人离开了群
        group_id = data["groupId"]
        left_peer = data["username"]
        all_members = data.get("allMembers", [])

        if group_id in state["group_peers"]:
            state["group_peers"][group_id].discard(left_peer)
        if group_id in state["my_groups"]:
            state["my_groups"][group_id]["members"] = all_members

        logger.info(f"群 {group_id} 成员离开: {left_peer}")
        await send_to_browser({
            "type": "group_link_peer_left",
            "groupId": group_id,
            "username": left_peer,
            "allMembers": all_members,
        })


async def connect_signal_server():
    """连接信令服务器并持续监听"""
    url = state["signal_url"]
    while True:
        try:
            async with websockets.connect(url) as ws:
                state["signal_ws"] = ws
                logger.info(f"已连接信令服务器: {url}")
                await send_to_browser({"type": "signal_connected"})

                # 如果已有用户名，自动注册
                if state["username"]:
                    await ws.send(json.dumps({
                        "type": "register",
                        "username": state["username"]
                    }))

                async for raw in ws:
                    await handle_signal_message(raw)

        except Exception as e:
            logger.warning(f"信令服务器连接断开: {e}")
            state["signal_ws"] = None
            await send_to_browser({"type": "signal_disconnected"})
            await asyncio.sleep(3)  # 3秒后重连


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """浏览器 WebSocket 连接"""
    await websocket.accept()
    state["browser_ws"] = websocket
    logger.info("浏览器已连接")

    # 设置 P2P 回调
    p2p = state["p2p_manager"]
    p2p.set_callbacks(
        on_message=on_p2p_message,
        on_state_change=on_p2p_state_change,
    )

    # 如果已连接信令服务器，通知浏览器并恢复状态
    if state["signal_ws"]:
        await websocket.send_json({"type": "signal_connected"})
        if state["username"]:
            await websocket.send_json({"type": "registered", "username": state["username"]})
            # 发送缓存的用户列表
            if state["user_list"]:
                await websocket.send_json({"type": "user_list", "users": state["user_list"]})
    
    # 恢复所有P2P连接状态
    connection_states = {}
    for peer, conn in p2p.connections.items():
        connection_states[peer] = 'connected' if conn.connected else 'disconnected'
    if connection_states:
        await websocket.send_json({
            "type": "restore_connection_states",
            "states": connection_states
        })

    try:
        while True:
            data = await websocket.receive_json()
            await handle_browser_message(data)
    except WebSocketDisconnect:
        logger.info("浏览器断开连接")
        state["browser_ws"] = None


async def handle_browser_message(data: dict):
    """处理来自浏览器的消息"""
    msg_type = data.get("type")
    p2p = state["p2p_manager"]

    if msg_type == "check_user":
        target = data.get("target", "").strip()
        if not target:
            await send_to_browser({"type": "error", "message": "用户名不能为空"})
            return
        await signal_send({"type": "check_user", "target": target})

    elif msg_type == "register":
        state["username"] = data["username"]
        # 清除旧用户的群聊状态，防止不同用户间数据互通
        state["group_peers"] = {}
        state["my_groups"] = {}
        # 初始化用户文件夹
        storage_manager.init_user_folder(data["username"])
        ws = state["signal_ws"]
        if ws:
            await ws.send(json.dumps({
                "type": "register",
                "username": data["username"]
            }))

    elif msg_type == "connect_peer":
        target = data["target"]
        force = data.get("force", False)
        try:
            # 先检查对方是否在线
            if not state["signal_ws"]:
                await send_to_browser({
                    "type": "error",
                    "message": "信令服务器未连接"
                })
                await send_to_browser({
                    "type": "connection_state",
                    "user": target,
                    "state": "failed",
                })
                return

            # 创建 Future 等待 check_user 结果
            loop = asyncio.get_event_loop()
            future = loop.create_future()
            state["check_user_futures"][target] = future
            await signal_send({"type": "check_user", "target": target})

            try:
                is_online = await asyncio.wait_for(future, timeout=state["check_user_timeout"])
            except asyncio.TimeoutError:
                state["check_user_futures"].pop(target, None)
                await send_to_browser({
                    "type": "error",
                    "message": f"检查用户 {target} 在线状态超时"
                })
                await send_to_browser({
                    "type": "connection_state",
                    "user": target,
                    "state": "failed",
                })
                return

            if not is_online:
                await send_to_browser({
                    "type": "error",
                    "message": f"用户 {target} 不在线，无法建立连接"
                })
                await send_to_browser({
                    "type": "connection_state",
                    "user": target,
                    "state": "failed",
                })
                return

            # 对方在线，创建 offer（force=true 时会清除旧连接）
            offer_data = await p2p.create_offer(target, force=force)
            if offer_data is None:
                if p2p.is_connected(target):
                    await send_to_browser({
                        "type": "connection_state",
                        "user": target,
                        "state": "connected",
                    })
                else:
                    await send_to_browser({
                        "type": "connection_state",
                        "user": target,
                        "state": "connecting",
                    })
                return
            # 成功创建 offer，通知前端正在连接
            await send_to_browser({
                "type": "connection_state",
                "user": target,
                "state": "connecting",
            })
            # 在 offer 中标记 force 标志，让信令服务器知道这是强制重连
            if force:
                offer_data["force"] = True
            await signal_send(offer_data)
        except Exception as e:
            logger.warning(f"创建 offer 失败 [{target}]: {e}")
            await send_to_browser({
                "type": "connection_state",
                "user": target,
                "state": "failed",
            })

    elif msg_type == "send_message":
        target = data["target"]
        content = data["content"]
        msg_sub_type = data.get("msg_type", "text")

        sent = p2p.send_message(target, content, msg_sub_type)

        if sent:
            await send_to_browser({
                "type": "send_status",
                "target": target,
                "method": "p2p",
            })
        else:
            await send_to_browser({
                "type": "send_status",
                "target": target,
                "method": "failed",
            })

    elif msg_type == "get_connection_state":
        target = data["target"]
        connected = p2p.is_connected(target)
        await send_to_browser({
            "type": "connection_state",
            "user": target,
            "state": "connected" if connected else "disconnected",
        })

    # ========== 群链接操作 ==========

    elif msg_type == "create_group_link":
        # 请求信令服务器生成一个新群链接
        await signal_send({"type": "create_group_link"})

    elif msg_type == "join_group_link":
        # 用链接ID加入群
        group_id = data.get("groupId", "").strip()
        if not group_id:
            await send_to_browser({"type": "error", "message": "群链接不能为空"})
            return
        await signal_send({"type": "join_group_link", "groupId": group_id})

    elif msg_type == "rejoin_group":
        # 重新加入群（用于恢复 P2P 连接，不会在信令服务器重复添加成员）
        group_id = data.get("groupId", "").strip()
        if not group_id:
            return
        # 确保本地状态已初始化
        if group_id not in state["group_peers"]:
            state["group_peers"][group_id] = set()
        if group_id not in state["my_groups"]:
            state["my_groups"][group_id] = {"members": [], "creator": None}
        # 通知信令服务器重新加入（信令服务器会处理去重）
        await signal_send({"type": "join_group_link", "groupId": group_id})

    elif msg_type == "leave_group":
        # 主动离开群聊
        group_id = data.get("groupId", "").strip()
        if not group_id:
            return
        # 清理本地状态
        state["group_peers"].pop(group_id, None)
        state["my_groups"].pop(group_id, None)
        # 通知信令服务器离开群
        await signal_send({"type": "leave_group_link", "groupId": group_id})

    elif msg_type == "group_p2p_message":
        # 向群里所有已连接的 P2P 对端发送消息
        group_id = data.get("groupId")
        content = data.get("content", "")
        peers = state["group_peers"].get(group_id, set())

        group_content = json.dumps({"groupId": group_id, "text": content})
        failed = []
        for peer in peers:
            sent = p2p.send_message(peer, group_content, "group")
            if not sent:
                failed.append(peer)

        await send_to_browser({
            "type": "group_send_status",
            "groupId": group_id,
            "failedPeers": failed,
        })


# ========== 数据同步 API 端点 ==========

@app.post("/api/data/{username}/{data_type}")
async def save_data(username: str, data_type: str, request: dict):
    """保存用户数据"""
    try:
        # 验证用户名
        if not username or len(username) > state["max_username_length"]:
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


@app.get("/api/data/{username}/all")
async def get_all_data(username: str):
    """获取用户所有数据"""
    try:
        # 验证用户名
        if not username or len(username) > state["max_username_length"]:
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


@app.get("/api/data/{username}/{data_type}")
async def get_data(username: str, data_type: str):
    """获取用户单个数据类型"""
    try:
        # 验证用户名
        if not username or len(username) > state["max_username_length"]:
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


@app.delete("/api/data/{username}")
async def delete_user_data(username: str):
    """删除用户所有数据"""
    try:
        # 验证用户名
        if not username or len(username) > state["max_username_length"]:
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


@app.on_event("startup")
async def startup():
    """启动时连接信令服务器"""
    asyncio.create_task(connect_signal_server())


@app.on_event("shutdown")
async def shutdown():
    await state["p2p_manager"].close_all()


def main():
    parser = argparse.ArgumentParser(description="P2P Chat 客户端")
    parser.add_argument("--port", type=int, default=_default_port,
                        help=f"本地 Web 服务端口 (配置默认: {_default_port})")
    parser.add_argument("--signal", type=str, default=_default_signal_url,
                        help=f"信令服务器地址 (配置默认: {_default_signal_url})")
    parser.add_argument("--host", type=str, default=_default_host,
                        help=f"监听地址 (配置默认: {_default_host})")
    args = parser.parse_args()

    state["signal_url"] = args.signal
    logger.info(f"配置文件已加载: host={args.host}, port={args.port}, signal={args.signal}")
    logger.info(f"启动本地服务: http://localhost:{args.port}")
    logger.info(f"信令服务器: {args.signal}")

    uvicorn.run(app, host=args.host, port=args.port, log_level=_default_log_level.lower())


if __name__ == "__main__":
    main()
