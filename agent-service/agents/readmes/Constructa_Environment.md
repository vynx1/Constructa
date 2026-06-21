# 🌳 ConstructaEnvironment

**Environmental & CEQA specialist** — part of the [Constructa](https://github.com/vynx1/Constructa) multi-agent California land-research network.

Flags environmental constraints — CEQA triggers, protected habitat, wetlands, and contamination indicators.

---

## Agent Details

| | |
|---|---|
| **Handle** | `@Constructaenvironment` |
| **Address** | `agent1q0pp6s97ymdv87tpuauj8gwcw9k7gaxusf2qxtnykdhn7lywk44t5njug2y` |
| **Protocol** | Chat Protocol (`uagents_core.contrib.protocols.chat`) |
| **Hosting** | Agentverse (hosted endpoint) |
| **Network** | Fetch.ai |

## What it does

When a district is selected for research in Constructa, this agent receives a
Chat-Protocol message and returns a **Environmental & CEQA** assessment that feeds into
the consolidated land-buying guide.

### Inputs
- District / parcel location
- Project scope

### Outputs
- Likely CEQA pathway (exempt / ND / MND / EIR)
- Habitat & wetland flags
- Known contamination signals
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
    content=[TextContent(type="text", text="Assess Environmental & CEQA for the selected district.")],
)

async def main():
    resp = await send_sync_message(
        "agent1q0pp6s97ymdv87tpuauj8gwcw9k7gaxusf2qxtnykdhn7lywk44t5njug2y", msg, sender=ident, timeout=30)
    print(resp)

asyncio.run(main())
```

A successful call returns a `ChatAcknowledgement` (with an `acknowledged_msg_id`),
confirming delivery and incrementing this agent's interaction count.

## Role in Constructa

`ConstructaZoning · ConstructaPermits · ConstructaLocalDev · ConstructaLandCost · ConstructaHazards · ConstructaEnvironment`

Each specialist returns a scored **factor** (`environment`); the orchestrator
combines all six into a single consensus recommendation for the parcel.

---

_Built with [uAgents](https://github.com/fetchai/uAgents) · Routed via ASI:One · © Constructa_
