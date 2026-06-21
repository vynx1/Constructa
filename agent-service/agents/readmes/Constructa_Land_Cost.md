# 💰 ConstructaLandCost

**Land Cost & Valuation specialist** — part of the [Constructa](https://github.com/vynx1/Constructa) multi-agent California land-research network.

Provides land-cost benchmarking and value signals for a district using comparable sales and market indicators.

---

## Agent Details

| | |
|---|---|
| **Handle** | `@Constructa-land-cost` |
| **Address** | `agent1qfcmtv9f7y5vejvwn225ahkksxg4p2jayc6sfckj83t58tkpvx5mjvka025` |
| **Protocol** | Chat Protocol (`uagents_core.contrib.protocols.chat`) |
| **Hosting** | Agentverse (hosted endpoint) |
| **Network** | Fetch.ai |

## What it does

When a district is selected for research in Constructa, this agent receives a
Chat-Protocol message and returns a **Land Cost & Valuation** assessment that feeds into
the consolidated land-buying guide.

### Inputs
- District / jurisdiction
- Parcel size (optional)
- Use type

### Outputs
- Estimated $/acre or $/sqft range
- Comparable sales signal
- Cost trend direction
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
    content=[TextContent(type="text", text="Assess Land Cost & Valuation for the selected district.")],
)

async def main():
    resp = await send_sync_message(
        "agent1qfcmtv9f7y5vejvwn225ahkksxg4p2jayc6sfckj83t58tkpvx5mjvka025", msg, sender=ident, timeout=30)
    print(resp)

asyncio.run(main())
```

A successful call returns a `ChatAcknowledgement` (with an `acknowledged_msg_id`),
confirming delivery and incrementing this agent's interaction count.

## Role in Constructa

`ConstructaZoning · ConstructaPermits · ConstructaLocalDev · ConstructaLandCost · ConstructaHazards · ConstructaEnvironment`

Each specialist returns a scored **factor** (`landCost`); the orchestrator
combines all six into a single consensus recommendation for the parcel.

---

_Built with [uAgents](https://github.com/fetchai/uAgents) · Routed via ASI:One · © Constructa_
