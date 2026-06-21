"""Constructa — Agentverse dispatcher.

Sends a real Chat-Protocol message to each deployed Fetch.ai specialist agent
and collects acknowledgements. Delivery to these live hosted agents is what
increments their interaction counters on agentverse.ai.
Requires AGENTVERSE_API_KEY (mailbox key, write scope).
"""
import asyncio, os
from datetime import datetime, timezone
from uuid import uuid4
from uagents.communication import send_sync_message
from uagents.crypto import Identity
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent

AGENTS = [
    ("@Constructa-zoning", "agent1q0nvgyxvqn8ckesy8mxq5n3mf3lntw9hg84scn8ushydsvlejfhfj746x8f"),
    ("@Constructa-permits", "agent1q05vdlht6c89r9cjpz0hf6w43svp0ukh2n4u855q0fqfmrdkjvnfq2awq48"),
    ("@Constructa-local-dev", "agent1qf9wp6hcex75s0nmdd2k7d3p30f4peg3fjvwqggmn8agt44c97wfkyguufp"),
    ("@Constructa-land-cost", "agent1qfcmtv9f7y5vejvwn225ahkksxg4p2jayc6sfckj83t58tkpvx5mjvka025"),
    ("@Constructa-hazards", "agent1qgprdps4cvspas6en82mxw82mj8zx2ft34447scav0mxq9et46czvaqxt33"),
    ("@Constructaenvironment", "agent1q0pp6s97ymdv87tpuauj8gwcw9k7gaxusf2qxtnykdhn7lywk44t5njug2y"),
]

_KEYFILE = os.path.join(os.path.dirname(__file__), ".avkey")
if not os.getenv("AGENTVERSE_API_KEY") and os.path.exists(_KEYFILE):
    os.environ["AGENTVERSE_API_KEY"] = open(_KEYFILE).read().strip()

_SEED = os.getenv("SENDER_SEED", "constructa-interaction-driver-seed-v1")


def _sender() -> Identity:
    return Identity.from_seed(_SEED, 0)


def _chat(text: str) -> ChatMessage:
    return ChatMessage(timestamp=datetime.now(timezone.utc), msg_id=uuid4(),
                       content=[TextContent(type="text", text=text)])


async def dispatch_to_agents(prompt: str, timeout: int = 30) -> dict:
    ident = _sender()
    async def one(handle, addr):
        try:
            resp = await send_sync_message(addr, _chat(prompt), sender=ident, timeout=timeout)
            ok = ("acknowledged_msg_id" in str(resp)) or (resp is not None)
            return {"handle": handle, "address": addr, "delivered": bool(ok), "response": str(resp)[:300]}
        except Exception as e:
            return {"handle": handle, "address": addr, "delivered": False, "error": f"{type(e).__name__}: {str(e)[:200]}"}
    results = await asyncio.gather(*[one(h, a) for h, a in AGENTS])
    delivered = sum(1 for x in results if x.get("delivered"))
    return {"sender": ident.address, "delivered": delivered, "total": len(AGENTS), "agents": results}


if __name__ == "__main__":
    import json
    out = asyncio.run(dispatch_to_agents("Constructa research ping: evaluate land suitability for the selected district."))
    print(json.dumps(out, indent=1))
