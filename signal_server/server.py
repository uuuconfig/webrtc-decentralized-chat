"""
P2P Chat 信令服务器
负责：用户注册、转发 SDP Offer/Answer、群聊链接管理、用户存在性检查
支持：WebUI 仪表板、实时统计数据推送
"""

import asyncio
import json
import logging
import secrets
import time
from datetime import datetime
from collections import deque
from pathlib import Path
from websockets.asyncio.server import serve
from aiohttp import web

# ========== 日志配置 ==========
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("signal")

# ========== 全局数据结构 ==========
clients: dict[str, object] = {}
group_links: dict[str, dict] = {}
pending_offers: dict[tuple, str] = {}
webui_connections: set = set()

# ========== 统计数据 ==========
class ServerStats:
    def __init__(self):
        self.start_time = time.time()
        self.total_messages = 0
        self.successful_connections = 0
        self.total_connection_attempts = 0
        self.connection_times = deque(maxlen=100)
        self.message_timestamps = deque(maxlen=60)
        self.user_connection_times = {}
        self.total_users_ever = 0
        self.offer_start_times = {}
    
    def get_uptime_seconds(self):
        return int(time.time() - self.start_time)
    
    def get_messages_per_second(self):
        if not self.message_timestamps:
            return 0
        now = time.time()
        recent = [t for t in self.message_timestamps if now - t < 60]
        return len(recent) / 60 if recent else 0
    
    def get_connection_success_rate(self):
        if self.total_connection_attempts == 0:
            return 0
        return self.successful_connections / self.total_connection_attempts
    
    def get_avg_connection_time_ms(self):
        if not self.connection_times:
            return 0
        return sum(self.connection_times) / len(self.connection_times)

stats = ServerStats()

# ========== 日志处理器 ==========
log_buffer = deque(maxlen=100)

class WebUILogHandler(logging.Handler):
    def emit(self, record):
        try:
            message = record.getMessage()
            category = self._extract_category(message)
            username = self._extract_username(message)
            
            log_data = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "level": record.levelname,
                "category": category,
                "message": message,
                "username": username
            }
            
            log_buffer.append(log_data)
            
            # 推送给所有 WebUI 连接
            asyncio.create_task(broadcast_to_webui({
                "type": "log",
                "data": log_data
            }))
        except Exception as e:
            self.handleError(record)
    
    def _extract_category(self, message):
        if "注册" in message:
            return "register"
        elif "offer" in message.lower():
            return "offer"
        elif "answer" in message.lower():
            return "answer"
        elif "群" in message:
            return "group"
        elif "错误" in message or "异常" in message:
            return "error"
        else:
            return "other"
    
    def _extract_username(self, message):
        import re
        match = re.search(r'(\w+)', message)
        return match.group(1) if match else None

# 添加自定义日志处理器
webui_log_handler = WebUILogHandler()
logger.addHandler(webui_log_handler)

# ========== WebUI 管理函数 ==========
async def broadcast_to_webui(message):
    """广播消息给所有 WebUI 连接"""
    disconnected = set()
    for ws in webui_connections:
        try:
            await ws.send(json.dumps(message))
        except Exception:
            disconnected.add(ws)
    
    webui_connections.difference_update(disconnected)

def get_stats_dict():
    """获取统计数据字典"""
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "online_users": len(clients),
        "total_users_ever": stats.total_users_ever,
        "active_groups": len(group_links),
        "pending_offers": len(pending_offers),
        "uptime_seconds": stats.get_uptime_seconds(),
        "total_messages": stats.total_messages,
        "messages_per_second": stats.get_messages_per_second(),
        "successful_connections": stats.successful_connections,
        "total_connection_attempts": stats.total_connection_attempts,
        "connection_success_rate": stats.get_connection_success_rate(),
        "avg_connection_time_ms": stats.get_avg_connection_time_ms()
    }

def get_users_list():
    """获取在线用户列表"""
    users = []
    for username in clients:
        connected_at = stats.user_connection_times.get(username, time.time())
        users.append({
            "username": username,
            "connected_at": datetime.utcfromtimestamp(connected_at).isoformat() + "Z",
            "connection_duration_seconds": int(time.time() - connected_at)
        })
    return users

def get_groups_list():
    """获取群聊列表（只返回有在线成员的群聊）"""
    groups = []
    for group_id, group_data in group_links.items():
        online_members = group_data.get("online_members", set())
        # 只显示有在线成员的群聊
        if online_members:
            groups.append({
                "group_id": group_id,
                "creator": group_data.get("creator"),
                "created_at": group_data.get("created_at", datetime.utcnow().isoformat() + "Z"),
                "total_members": len(group_data.get("members", [])),
                "online_members": len(online_members),
                "members": list(group_data.get("members", []))
            })
    return groups

def get_pending_offers_list():
    """获取待处理连接列表"""
    offers = []
    for (from_user, to_user), conn_id in pending_offers.items():
        started_at = stats.offer_start_times.get(conn_id, time.time())
        offers.append({
            "from": from_user,
            "to": to_user,
            "conn_id": conn_id,
            "started_at": datetime.utcfromtimestamp(started_at).isoformat() + "Z",
            "duration_seconds": int(time.time() - started_at)
        })
    return offers

# ========== 信令服务器处理函数 ==========
async def send_to_user(username: str, data: dict):
    """发送消息给指定用户"""
    if username in clients:
        try:
            await clients[username].send(json.dumps(data))
            return True
        except Exception:
            pass
    return False

async def handler(websocket):
    username = None
    try:
        async for raw in websocket:
            data = json.loads(raw)
            msg_type = data.get("type")

            if msg_type == "register":
                username = data["username"]
                if username in clients and clients[username] is not websocket:
                    old_ws = clients[username]
                    try:
                        await old_ws.close()
                    except Exception:
                        pass
                
                clients[username] = websocket
                stats.user_connection_times[username] = time.time()
                stats.total_users_ever += 1
                
                logger.info(f"用户注册: {username} (在线: {len(clients)})")
                
                await websocket.send(json.dumps({
                    "type": "registered",
                    "username": username
                }))
                
                # 推送统计数据更新
                await broadcast_to_webui({
                    "type": "stats_update",
                    "data": get_stats_dict()
                })
                await broadcast_to_webui({
                    "type": "users_update",
                    "data": {"users": get_users_list()}
                })

            elif msg_type == "check_user":
                target = data.get("target", "").strip()
                if not target:
                    await websocket.send(json.dumps({
                        "type": "check_user_result",
                        "target": target,
                        "exists": False,
                        "message": "用户名不能为空"
                    }))
                    continue
                
                exists = target in clients
                await websocket.send(json.dumps({
                    "type": "check_user_result",
                    "target": target,
                    "exists": exists,
                    "message": f"用户 '{target}' {'在线' if exists else '不在线'}"
                }))
                logger.info(f"检查用户: {target} - {'存在' if exists else '不存在'}")

            elif msg_type == "offer":
                target = data.get("target")
                conn_id = data.get("conn_id")
                force = data.get("force", False)
                
                if not target or target not in clients:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"用户 '{target}' 不在线"
                    }))
                    continue
                
                offer_key = (username, target)
                reverse_key = (target, username)
                
                if force and offer_key in pending_offers:
                    logger.info(f"清除旧的 pending offer: {username} -> {target}（强制重连）")
                    del pending_offers[offer_key]
                
                if offer_key in pending_offers:
                    logger.info(f"拒绝重复 offer: {username} -> {target}（已有 pending offer）")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "已有待处理的连接请求，请稍候"
                    }))
                elif reverse_key in pending_offers:
                    logger.info(f"拒绝 offer: {username} -> {target}（对方已发起，等待 answer）")
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": "对方已发起连接请求，请等待"
                    }))
                else:
                    pending_offers[offer_key] = conn_id
                    stats.offer_start_times[conn_id] = time.time()
                    stats.total_connection_attempts += 1
                    data["from"] = username
                    await clients[target].send(json.dumps(data))
                    logger.info(f"转发 offer: {username} -> {target} (conn_id={conn_id})")
                    
                    # 推送待处理连接更新
                    await broadcast_to_webui({
                        "type": "pending_offers_update",
                        "data": {"pending_offers": get_pending_offers_list()}
                    })

            elif msg_type == "answer":
                target = data.get("target")
                conn_id = data.get("conn_id")
                
                if target and target in clients:
                    offer_key = (target, username)
                    if offer_key in pending_offers:
                        del pending_offers[offer_key]
                        
                        # 计算连接时间
                        if conn_id in stats.offer_start_times:
                            connection_time = time.time() - stats.offer_start_times[conn_id]
                            stats.connection_times.append(connection_time)
                            stats.successful_connections += 1
                            del stats.offer_start_times[conn_id]
                    
                    data["from"] = username
                    await clients[target].send(json.dumps(data))
                    logger.info(f"转发 answer: {username} -> {target} (conn_id={conn_id})")
                    
                    # 推送统计数据更新
                    await broadcast_to_webui({
                        "type": "stats_update",
                        "data": get_stats_dict()
                    })
                    await broadcast_to_webui({
                        "type": "pending_offers_update",
                        "data": {"pending_offers": get_pending_offers_list()}
                    })
                else:
                    await websocket.send(json.dumps({
                        "type": "error",
                        "message": f"用户 '{target}' 不在线"
                    }))

            # ========== 群链接功能 ==========
            elif msg_type == "create_group_link":
                group_id = secrets.token_urlsafe(12)
                group_links[group_id] = {
                    "members": [username],
                    "online_members": {username},
                    "creator": username,
                    "created_at": datetime.utcnow().isoformat() + "Z"
                }
                logger.info(f"创建群链接: {group_id} by {username}")
                await websocket.send(json.dumps({
                    "type": "group_link_created",
                    "groupId": group_id,
                }))
                
                # 推送群聊列表更新
                await broadcast_to_webui({
                    "type": "groups_update",
                    "data": {"groups": get_groups_list()}
                })

            elif msg_type == "join_group_link":
                group_id = data.get("groupId", "").strip()
                if group_id not in group_links:
                    group_links[group_id] = {
                        "members": [username],
                        "online_members": {username},
                        "creator": None,
                        "created_at": datetime.utcnow().isoformat() + "Z"
                    }
                    logger.info(f"群 {group_id} 不存在，为用户 {username} 重新创建")
                    await websocket.send(json.dumps({
                        "type": "group_link_joined",
                        "groupId": group_id,
                        "peers": [],
                        "allMembers": [username],
                    }))
                else:
                    group = group_links[group_id]
                    is_new_member = username not in group["members"]
                    
                    if is_new_member:
                        group["members"].append(username)
                    
                    if "online_members" not in group:
                        group["online_members"] = set()
                    group["online_members"].add(username)
                    
                    online_peers = [m for m in group["online_members"] if m != username]

                    logger.info(f"用户 {username} {'加入' if is_new_member else '重新连接'}群 {group_id}，在线成员: {online_peers}")

                    await websocket.send(json.dumps({
                        "type": "group_link_joined",
                        "groupId": group_id,
                        "peers": online_peers,
                        "allMembers": group["members"],
                    }))

                    if is_new_member:
                        for peer in online_peers:
                            await send_to_user(peer, {
                                "type": "group_link_peer_joined",
                                "groupId": group_id,
                                "username": username,
                                "allMembers": group["members"],
                            })
                    else:
                        for peer in online_peers:
                            await send_to_user(peer, {
                                "type": "group_link_peer_joined",
                                "groupId": group_id,
                                "username": username,
                                "allMembers": group["members"],
                            })
                
                # 推送群聊列表更新
                await broadcast_to_webui({
                    "type": "groups_update",
                    "data": {"groups": get_groups_list()}
                })

            elif msg_type == "leave_group_link":
                group_id = data.get("groupId", "").strip()
                if group_id in group_links:
                    group = group_links[group_id]
                    if username in group["members"]:
                        group["members"].remove(username)
                    if "online_members" in group:
                        group["online_members"].discard(username)
                    
                    logger.info(f"用户 {username} 主动离开群 {group_id}，剩余成员: {group['members']}")
                    
                    online = group.get("online_members", set())
                    for peer in online:
                        await send_to_user(peer, {
                            "type": "group_link_peer_left",
                            "groupId": group_id,
                            "username": username,
                            "allMembers": group["members"],
                        })
                
                # 推送群聊列表更新
                await broadcast_to_webui({
                    "type": "groups_update",
                    "data": {"groups": get_groups_list()}
                })

    except Exception as e:
        logger.warning(f"连接异常: {username} - {e}")
    finally:
        if username and username in clients:
            del clients[username]
            logger.info(f"用户离线: {username} (在线: {len(clients)})")

            keys_to_delete = [key for key in pending_offers.keys() if username in key]
            for key in keys_to_delete:
                del pending_offers[key]
                logger.info(f"清理 pending offer: {key}")

            for group_id, group in list(group_links.items()):
                if "online_members" not in group:
                    group["online_members"] = set()
                if username in group["online_members"]:
                    group["online_members"].discard(username)
                    logger.info(f"用户 {username} 离线，从群 {group_id} 在线列表移除")
                    for peer in group["online_members"]:
                        await send_to_user(peer, {
                            "type": "group_link_peer_left",
                            "groupId": group_id,
                            "username": username,
                            "allMembers": group["members"],
                        })
            
            # 推送统计数据更新
            await broadcast_to_webui({
                "type": "stats_update",
                "data": get_stats_dict()
            })
            await broadcast_to_webui({
                "type": "users_update",
                "data": {"users": get_users_list()}
            })
            await broadcast_to_webui({
                "type": "groups_update",
                "data": {"groups": get_groups_list()}
            })

# ========== HTTP 服务处理函数 ==========
async def serve_dashboard(request):
    """提供 WebUI 主页面"""
    dashboard_path = Path(__file__).parent / "dashboard" / "index.html"
    if dashboard_path.exists():
        return web.FileResponse(dashboard_path)
    return web.Response(text="Dashboard not found", status=404)

async def dashboard_websocket(request):
    """WebUI WebSocket 连接处理"""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    
    webui_connections.add(ws)
    
    try:
        # 发送初始数据
        initial_data = {
            "type": "initial_data",
            "data": {
                "server_start_time": datetime.utcfromtimestamp(stats.start_time).isoformat() + "Z",
                "stats": get_stats_dict(),
                "users": get_users_list(),
                "groups": get_groups_list(),
                "pending_offers": get_pending_offers_list(),
                "recent_logs": list(log_buffer)
            }
        }
        await ws.send_json(initial_data)
        
        # 定期推送统计数据
        while True:
            await asyncio.sleep(1)
            await ws.send_json({
                "type": "stats_update",
                "data": get_stats_dict()
            })
    except Exception as e:
        logger.error(f"WebUI WebSocket 错误: {e}")
    finally:
        webui_connections.discard(ws)
    
    return ws

# ========== 主函数 ==========
async def main():
    signal_port = 5010
    http_port = 5011
    
    # 创建 HTTP 应用
    app = web.Application()
    app.router.add_get('/dashboard', serve_dashboard)
    app.router.add_get('/dashboard/ws', dashboard_websocket)
    app.router.add_static('/dashboard/static', Path(__file__).parent / "dashboard")
    
    # 启动 HTTP 服务
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", http_port)
    await site.start()
    
    logger.info(f"WebUI 访问地址: http://localhost:{http_port}/dashboard")
    
    # 启动 WebSocket 信令服务
    async with serve(handler, "0.0.0.0", signal_port):
        logger.info(f"信令服务器启动在 ws://0.0.0.0:{signal_port}")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
