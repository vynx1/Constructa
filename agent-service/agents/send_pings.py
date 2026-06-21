"""
Constructa — Agentverse interaction driver.

Sends a real Chat-Protocol message to each of the 6 deployed specialist agents.
Delivery to a live recipient is what increments its interaction counter on
agentverse.ai. (LLM/agentic completions do NOT touch these counters.)

Run:  python agents/send_pings.py
Env:  SENDER_SEED  (stable identity; defaults to a dev seed)
"""
import asyncio, os, sys
from datetime import datetime, timezone
from uuid import uuid4

from uagents import Agent, Context
from uagents_core.contrib.protocols.chat import (
    ChatMessage, ChatAcknowledgement, TextContent, chat_protocol_spec,
)

# The 6 deployed specialists (address = what shows on Agentverse).
TARGETS = [
    ("@Constructa-zoning", "agent1q0nvgyxvqn8ckesy8mxq5n3mf3lntw9hg84scn8ushydsvlejfhfj746x8f"),
    ("@Constructa-permits", "agent1q05vdlht6c89r9cjpz0hf6w43svp0ukh2n4u855q0fqfmrdkjvnfq2awq48"),
    ("@Constructa-local-dev", "agent1qf9wp6hcex75s0nmdd2k7d3p30f4peg3fjvwqggmn8agt44c97wfkyguufp"),
    ("@Constructa-land-cost", "agent1qfcmtv9f7y5vejvwn225ahkksxg4p2jayc6sfckj83t58tkpvx5mjvka025"),
    ("@Constructa-hazards", "agent1qgprdps4cvspas6en82mxw82mj8zx2ft34447scav0mxq9et46czvaqxt33"),
    ("@Constructaenvironment", "agent1q0pp6s97ymdv87tpuauj8gwcw9k7gaxusf2qxtnykdhn7lywk44t5njug2y"),
]

PROMPT = (
    "Constructa compliance ping: evaluate land suitability for the current "
    "project and reply with score/confidence. (interaction test)"
)

# Mailbox provisioning: uagents picks up AGENTVERSE_API_KEY from env when
# mailbox=True. Without it, outbound messages to hosted agents are dropped.
sender = Agent(
    name="constructa-driver",
    seed=os.getenv("SENDER_SEED", "constructa-interaction-driver-seed-v1"),
    mailbox=True,   # register on Agentverse so replies route back
)

protocol = chat_protocol_spec
from uagents import Protocol
chat = Protocol(spec=chat_protocol_spec)


def _msg(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )


@chat.on_message(ChatMessage)
async def on_reply(ctx: Context, sender_addr: str, msg: ChatMessage):
    for c in msg.content:
        if isinstance(c, TextContent):
            ctx.logger.info(f"REPLY from {sender_addr[:18]}…: {c.text[:120]}")
    await ctx.send(sender_addr, ChatAcknowledgement(
        timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))


@chat.on_message(ChatAcknowledgement)
async def on_ack(ctx: Context, sender_addr: str, msg: ChatAcknowledgement):
    ctx.logger.info(f"ACK from {sender_addr[:18]}… (msg delivered + processed)")


@sender.on_event("startup")
async def fire(ctx: Context):
    ctx.logger.info(f"driver address: {sender.address}")
    for handle, addr in TARGETS:
        try:
            await ctx.send(addr, _msg(PROMPT))
            ctx.logger.info(f"SENT -> {handle} ({addr[:18]}…)")
        except Exception as e:
            ctx.logger.error(f"FAIL -> {handle}: {e}")

sender.include(chat, publish_manifest=True)

if __name__ == "__main__":
    sender.run()