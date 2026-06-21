
import asyncio
from uagents.resolver import AlmanacApiResolver
TARGETS = [
    ("@Constructa-zoning", "agent1q0nvgyxvqn8ckesy8mxq5n3mf3lntw9hg84scn8ushydsvlejfhfj746x8f"),
    ("@Constructa-permits", "agent1q05vdlht6c89r9cjpz0hf6w43svp0ukh2n4u855q0fqfmrdkjvnfq2awq48"),
    ("@Constructa-local-dev", "agent1qf9wp6hcex75s0nmdd2k7d3p30f4peg3fjvwqggmn8agt44c97wfkyguufp"),
    ("@Constructa-land-cost", "agent1qfcmtv9f7y5vejvwn225ahkksxg4p2jayc6sfckj83t58tkpvx5mjvka025"),
    ("@Constructa-hazards", "agent1qgprdps4cvspas6en82mxw82mj8zx2ft34447scav0mxq9et46czvaqxt33"),
    ("@Constructaenvironment", "agent1q0pp6s97ymdv87tpuauj8gwcw9k7gaxusf2qxtnykdhn7lywk44t5njug2y"),
]
async def main():
    r = AlmanacApiResolver()
    live = 0
    for handle, addr in TARGETS:
        try:
            prefix, endpoints = await r.resolve(addr)
            ok = bool(endpoints)
            live += ok
            print(f"{handle:24s} -> {'LIVE' if ok else 'NOT REGISTERED'}  endpoints={endpoints}")
        except Exception as e:
            print(f"{handle:24s} -> ERROR {e}")
    print(f"\\nSUMMARY: {live}/{len(TARGETS)} agents registered with a reachable endpoint")
asyncio.run(main())
