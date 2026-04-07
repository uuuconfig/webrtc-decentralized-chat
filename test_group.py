import asyncio, json, websockets

async def go():
    async with websockets.connect("ws://localhost:5010") as aw:
        async with websockets.connect("ws://localhost:5010") as bw:
            await aw.send(json.dumps({"type":"register","username":"TestA"}))
            r = json.loads(await aw.recv())
            print("1. Alice registered:", r["type"])
            await bw.recv()  # user_list

            await bw.send(json.dumps({"type":"register","username":"TestB"}))
            r = json.loads(await bw.recv())
            print("2. Bob registered:", r["type"])
            await aw.recv(); await bw.recv()  # user_list updates

            # Alice 创建群链接
            await aw.send(json.dumps({"type":"create_group_link"}))
            r = json.loads(await aw.recv())
            assert r["type"] == "group_link_created", r
            gid = r["groupId"]
            print(f"3. Group link created: {gid[:16]}...")

            # Bob 加入群
            await bw.send(json.dumps({"type":"join_group_link","groupId":gid}))
            rb = json.loads(await bw.recv())
            assert rb["type"] == "group_link_joined", rb
            assert "TestA" in rb["peers"], rb
            assert set(rb["allMembers"]) == {"TestA","TestB"}, rb
            print(f"4. Bob joined. peers={rb['peers']}, allMembers={rb['allMembers']}")

            # Alice 收到通知
            ra = json.loads(await aw.recv())
            assert ra["type"] == "group_link_peer_joined", ra
            assert ra["username"] == "TestB", ra
            assert set(ra["allMembers"]) == {"TestA","TestB"}, ra
            print(f"5. Alice notified: {ra['username']} joined. allMembers={ra['allMembers']}")

            print("\n✅ ALL TESTS PASSED")

asyncio.run(go())
