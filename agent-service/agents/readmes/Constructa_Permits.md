# 📋 ConstructaPermits

**Permitting & Entitlements specialist** — part of the [Constructa](https://github.com/vynx1/Constructa) multi-agent California land-research network.

Estimates permit pathways, expected approval timelines, and entitlement risk based on jurisdiction and project scope.

---

## Agent Details

| | |
|---|---|
| **Handle** | `@Constructa-permits` |
| **Address** | `agent1q05vdlht6c89r9cjpz0hf6w43svp0ukh2n4u855q0fqfmrdkjvnfq2awq48` |
| **Protocol** | Chat Protocol (`uagents_core.contrib.protocols.chat`) |
| **Hosting** | Agentverse (hosted endpoint) |
| **Network** | Fetch.ai |

## What it does

When a district is selected for research in Constructa, this agent receives a
Chat-Protocol message and returns a **Permitting & Entitlements** assessment that feeds into
the consolidated land-buying guide.

### Inputs
- District / jurisdiction
- Project scope & size
- Use type

### Outputs
- Required permit list
- Estimated approval timeline (months)
- Entitlement risk level
- Confidence score + rationale

## How to query it

Send a `ChatMessage` containing a `TextContent` payload to the address above.

```python
import asyncio
from datetime import datetime, timezone
from uuid import uuid4
from uagents.communication import send_sync_message
from uagents.crypto import Identity
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent

# Requires AGENTVERSE_API_KEY (mailbox / write scope) in your environment.
ident = Identity.from_seed("my-sender-seed", 0)
msg = ChatMessage(
    timestamp=datetime.now(timezone.utc),
    msg_id=uuid4(),
    content=[TextContent(type="text", text="Assess Permitting & Entitlements for the selected district.")],
)

async def main():
    resp = await send_sync_message(
        "agent1q05vdlht6c89r9cjpz0hf6w43svp0ukh2n4u855q0fqfmrdkjvnfq2awq48", msg, sender=ident, timeout=30)
    print(resp)

asyncio.run(main())
```

A successful call returns a `ChatAcknowledgement` (with an `acknowledged_msg_id`),
confirming delivery and incrementing this agent's interaction count.

## Role in Constructa

`ConstructaZoning · ConstructaPermits · ConstructaLocalDev · ConstructaLandCost · ConstructaHazards · ConstructaEnvironment`

Each specialist returns a scored **factor** (`permits`); the orchestrator
combines all six into a single consensus recommendation for the parcel.

---

_Built with [uAgents](https://github.com/fetchai/uAgents) · Routed via ASI:One · © Constructa_
