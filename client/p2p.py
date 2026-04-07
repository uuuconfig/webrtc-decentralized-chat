"""
P2P 连接管理模块
封装 aiortc WebRTC 连接，管理 DataChannel 收发消息

注意：aiortc 与浏览器 WebRTC 不同，ICE 候选会自动收集并嵌入 SDP，
不需要单独的 icecandidate 事件转发。只需交换 Offer/Answer SDP 即可。
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from aiortc import RTCPeerConnection, RTCSessionDescription, RTCConfiguration, RTCIceServer

logger = logging.getLogger("p2p")

STUN_SERVERS = [
    RTCIceServer(urls=["stun:stun.l.google.com:19302"]),
    RTCIceServer(urls=["stun:stun1.l.google.com:19302"]),
]

RTC_CONFIG = RTCConfiguration(iceServers=STUN_SERVERS)


class PeerConnection:
    """管理与单个对端的 WebRTC 连接"""

    def __init__(self, remote_user: str, on_message=None, on_state_change=None):
        self.remote_user = remote_user
        self.pc = RTCPeerConnection(configuration=RTC_CONFIG)
        self.channel = None
        self._on_message = on_message
        self._on_state_change = on_state_change
        self._connected = False
        self._closed = False
        # 标记为已放弃（glare 解决时），不再触发状态回调
        self._abandoned = False
        # 唯一连接标识符，用于匹配 offer/answer
        self.conn_id = str(uuid.uuid4())[:8]

        @self.pc.on("connectionstatechange")
        async def on_conn_state():
            state = self.pc.connectionState
            logger.info(f"P2P [{self.remote_user}]: {state}")
            self._connected = state == "connected"
            # 如果连接已被放弃（glare 解决），不触发状态回调，避免干扰新连接
            if self._abandoned:
                logger.info(f"跳过已放弃连接的状态回调 [{self.remote_user}]: {state}")
                return
            if self._on_state_change:
                await self._on_state_change(self.remote_user, state)

        @self.pc.on("datachannel")
        def on_datachannel(channel):
            self.channel = channel
            self._setup_channel()

    @property
    def connected(self):
        return self._connected

    def _setup_channel(self):
        """配置 DataChannel 事件"""
        @self.channel.on("open")
        def on_open():
            logger.info(f"DataChannel open [{self.remote_user}]")

        @self.channel.on("message")
        async def on_message(message):
            if self._on_message:
                try:
                    data = json.loads(message)
                except (json.JSONDecodeError, TypeError):
                    data = {"type": "text", "content": str(message)}
                await self._on_message(self.remote_user, data)

        @self.channel.on("close")
        def on_close():
            logger.info(f"DataChannel closed [{self.remote_user}]")

    async def create_offer(self) -> dict:
        """创建 Offer（发起方调用）"""
        self.channel = self.pc.createDataChannel("chat")
        self._setup_channel()

        offer = await self.pc.createOffer()
        await self.pc.setLocalDescription(offer)

        # 等待 ICE 收集完成，这样 SDP 中会包含所有候选
        await self._wait_ice_gathering()

        return {
            "type": "offer",
            "target": self.remote_user,
            "conn_id": self.conn_id,
            "sdp": {
                "type": self.pc.localDescription.type,
                "sdp": self.pc.localDescription.sdp,
            }
        }

    async def handle_offer(self, sdp_data: dict, offer_conn_id: str = None) -> dict:
        """处理收到的 Offer，返回 Answer"""
        offer = RTCSessionDescription(sdp=sdp_data["sdp"], type=sdp_data["type"])
        await self.pc.setRemoteDescription(offer)

        answer = await self.pc.createAnswer()
        await self.pc.setLocalDescription(answer)

        await self._wait_ice_gathering()

        return {
            "type": "answer",
            "target": self.remote_user,
            "conn_id": offer_conn_id,  # 返回发起方的 conn_id，用于匹配
            "sdp": {
                "type": self.pc.localDescription.type,
                "sdp": self.pc.localDescription.sdp,
            }
        }

    async def handle_answer(self, sdp_data: dict):
        """处理收到的 Answer"""
        answer = RTCSessionDescription(sdp=sdp_data["sdp"], type=sdp_data["type"])
        await self.pc.setRemoteDescription(answer)

    async def _wait_ice_gathering(self, timeout: float = 5.0):
        """等待 ICE 候选收集完成（或超时）"""
        if self.pc.iceGatheringState == "complete":
            return
        try:
            await asyncio.wait_for(self._ice_complete_event(), timeout)
        except asyncio.TimeoutError:
            logger.warning(f"ICE gathering timeout [{self.remote_user}]")

    async def _ice_complete_event(self):
        """等待 icegatheringstatechange 变为 complete"""
        event = asyncio.Event()

        @self.pc.on("icegatheringstatechange")
        def check():
            if self.pc.iceGatheringState == "complete":
                event.set()

        # 注册监听器后再次检查，防止已在 complete 状态时错过事件
        if self.pc.iceGatheringState == "complete":
            event.set()
        await event.wait()

    def send_message(self, content: str, msg_type: str = "text") -> bool:
        """通过 DataChannel 发送消息"""
        if self.channel and self.channel.readyState == "open":
            data = json.dumps({
                "type": msg_type,
                "content": content,
                "timestamp": datetime.now().isoformat(),
            })
            self.channel.send(data)
            return True
        return False

    def send_binary(self, data: bytes) -> bool:
        """通过 DataChannel 发送二进制数据"""
        if self.channel and self.channel.readyState == "open":
            self.channel.send(data)
            return True
        return False

    async def close(self, abandon: bool = False):
        """关闭连接
        
        Args:
            abandon: 如果为 True，标记为已放弃，不再触发状态回调
        """
        self._closed = True
        if abandon:
            self._abandoned = True
        await self.pc.close()


class P2PManager:
    """管理所有 P2P 连接"""

    def __init__(self):
        self.connections: dict[str, PeerConnection] = {}
        self._on_message = None
        self._on_state_change = None
        # 记录正在等待 answer 的 offer（用于检测重复 offer）
        self._pending_offers: dict[str, str] = {}  # remote_user -> conn_id
        # 每个 remote_user 的操作锁，防止 create_offer 和 handle_offer 并发竞争
        self._locks: dict[str, asyncio.Lock] = {}

    def _get_lock(self, remote_user: str) -> asyncio.Lock:
        """获取指定用户的操作锁"""
        if remote_user not in self._locks:
            self._locks[remote_user] = asyncio.Lock()
        return self._locks[remote_user]

    def set_callbacks(self, on_message=None, on_state_change=None, **kwargs):
        self._on_message = on_message
        self._on_state_change = on_state_change

    def _create_conn(self, remote_user: str) -> PeerConnection:
        return PeerConnection(
            remote_user=remote_user,
            on_message=self._on_message,
            on_state_change=self._on_state_change,
        )

    async def create_offer(self, remote_user: str, force: bool = False) -> dict:
        """创建并发送 Offer（加锁防止与 handle_offer 并发竞争）"""
        lock = self._get_lock(remote_user)
        async with lock:
            return await self._create_offer_locked(remote_user, force)

    async def _create_offer_locked(self, remote_user: str, force: bool = False) -> dict:
        """创建并发送 Offer（内部实现，已持有锁）"""
        # 关闭旧的非活跃连接
        old = self.connections.get(remote_user)
        if old:
            if old.connected and not force:
                logger.info(f"已与 {remote_user} 连接，跳过 create_offer")
                return None
            # 检查连接是否正在建立中
            if not old._closed and not force:
                pc_state = old.pc.connectionState
                sig_state = old.pc.signalingState
                logger.info(f"检查连接状态 [{remote_user}]: pc={pc_state}, sig={sig_state}, closed={old._closed}")
                
                # 如果连接正在进行中，跳过
                if sig_state != 'closed' and pc_state not in ('failed', 'closed', 'disconnected'):
                    logger.info(f"与 {remote_user} 的连接正在建立中 (pc={pc_state}, sig={sig_state})，跳过 create_offer")
                    return None
            # 强制重连或旧连接已断开/失败，关闭旧连接
            logger.info(f"关闭旧连接 [{remote_user}]，准备重新建立")
            await old.close()
        
        # 清除之前的 pending offer
        self._pending_offers.pop(remote_user, None)
        
        conn = self._create_conn(remote_user)
        self.connections[remote_user] = conn
        offer = await conn.create_offer()
        
        # 记录 pending offer
        self._pending_offers[remote_user] = conn.conn_id
        
        # 在 offer 中标记是否为强制重连
        if force:
            offer["force"] = True
        return offer

    async def handle_offer(self, from_user: str, sdp_data: dict, force: bool = False, offer_conn_id: str = None) -> dict:
        """处理 Offer 并返回 Answer（加锁防止与 create_offer 并发竞争）"""
        lock = self._get_lock(from_user)
        async with lock:
            return await self._handle_offer_locked(from_user, sdp_data, force, offer_conn_id)

    async def _handle_offer_locked(self, from_user: str, sdp_data: dict, force: bool = False, offer_conn_id: str = None) -> dict:
        """处理 Offer 并返回 Answer（内部实现，已持有锁）
        
        信令服务器已处理 Glare 问题，客户端直接接受 offer：
        - 如果已连接，关闭旧连接，接受新 offer 并回复 answer
        - 如果连接正在建立中，关闭旧连接，接受新 offer
        - 否则创建新连接处理 offer
        """
        old = self.connections.get(from_user)
        
        # 如果已连接或正在建立中，关闭旧连接
        if old and not old._closed:
            logger.info(f"关闭旧连接 [{from_user}]，处理新 offer")
            self._pending_offers.pop(from_user, None)
            await old.close(abandon=True)
        
        # 创建新连接处理 offer
        conn = self._create_conn(from_user)
        self.connections[from_user] = conn
        return await conn.handle_offer(sdp_data, offer_conn_id)

    async def handle_answer(self, from_user: str, sdp_data: dict, conn_id: str = None):
        """处理 Answer（加锁防止并发竞争）"""
        lock = self._get_lock(from_user)
        async with lock:
            await self._handle_answer_locked(from_user, sdp_data, conn_id)

    async def _handle_answer_locked(self, from_user: str, sdp_data: dict, conn_id: str = None):
        """处理 Answer（内部实现，已持有锁）"""
        conn = self.connections.get(from_user)
        if conn:
            # 检查 conn_id 是否匹配，如果不匹配说明这是旧连接的 answer，忽略
            if conn_id and conn.conn_id != conn_id:
                logger.info(f"忽略过期的 answer [{from_user}]，conn_id 不匹配: {conn_id} != {conn.conn_id}")
                return
            if conn._closed:
                logger.info(f"忽略已关闭连接的 answer [{from_user}]")
                return
            # 清除 pending offer 记录
            self._pending_offers.pop(from_user, None)
            await conn.handle_answer(sdp_data)

    def send_message(self, remote_user: str, content: str, msg_type: str = "text") -> bool:
        conn = self.connections.get(remote_user)
        if conn:
            return conn.send_message(content, msg_type)
        return False

    def is_connected(self, remote_user: str) -> bool:
        conn = self.connections.get(remote_user)
        return conn.connected if conn else False

    async def close_all(self):
        for conn in self.connections.values():
            await conn.close()
        self.connections.clear()
