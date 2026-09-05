from state import EscalationRoute, NextAction, OfficialSource, RiskFlag, Stage

SOURCES = {
    "scamshield": OfficialSource(
        id="scamshield",
        title="ScamShield",
        url="https://www.scamshield.gov.sg/",
        excerpt="Check a message, number, or site on the official ScamShield site or app.",
    ),
    "helpline": OfficialSource(
        id="scamshield-1799",
        title="ScamShield Helpline 1799",
        url="https://www.scamshield.gov.sg/check-for-scams/scamshield-helpline/",
        excerpt="Call 1799 yourself. The helpline can connect you to participating banks.",
    ),
    "police": OfficialSource(
        id="spf",
        title="Singapore Police Force",
        url="https://www.police.gov.sg/",
        excerpt="File a report only through official SPF channels. ScamSafe cannot do this for you.",
    ),
}

ALLOWED_URLS = {item.url for item in SOURCES.values()}

BANK_STEP = (
    "Call your bank using the number on the back of your card or through the official banking app. "
    "Do not use a number from the message."
)


def pick_route(stage: Stage, flags: list[RiskFlag]) -> EscalationRoute:
    if stage == "money_sent":
        return "police"
    if stage in ("payment_pending", "otp_shared") or "payment_in_progress" in flags:
        return "bank"
    return "scamshield_or_1799"


def retrieve_official(stage: Stage, route: EscalationRoute) -> list[OfficialSource]:
    pack = action_pack(stage, route)
    return pack["sources"]


def action_pack(stage: Stage, route: EscalationRoute) -> dict:
    if stage == "money_sent" or route == "police":
        return {
            "sources": [SOURCES["helpline"], SOURCES["police"]],
            "action": NextAction(
                title="Call your bank now, then use official reporting channels",
                steps=[
                    BANK_STEP,
                    "Call 1799. The ScamShield helpline can connect you to participating banks.",
                    "File a police report through official SPF channels. ScamSafe cannot do this for you.",
                ],
                source_title=SOURCES["helpline"].title,
                source_url=SOURCES["helpline"].url,
            ),
            "why": [
                "Money may already have left the account, so bank contact comes first.",
                "1799 can connect you to a participating bank.",
                "A police report is only through official SPF channels.",
            ],
        }
    if stage in ("payment_pending", "otp_shared") or route == "bank":
        return {
            "sources": [SOURCES["helpline"]],
            "action": NextAction(
                title="Stop the transfer and call your bank on an official number",
                steps=[
                    "Do not send more money, OTPs, or screenshots to the other party.",
                    BANK_STEP,
                    "If you cannot reach the bank, call 1799 for the ScamShield helpline.",
                ],
                source_title=SOURCES["helpline"].title,
                source_url=SOURCES["helpline"].url,
            ),
            "why": [
                "Stop any further transfer or code sharing first.",
                "Use a number you already have for the bank, not one from the message.",
            ],
        }
    if stage == "app_installed":
        return {
            "sources": [SOURCES["helpline"]],
            "action": NextAction(
                title="Cut the remote session, then call 1799 or your bank",
                steps=[
                    "Turn off Wi-Fi and mobile data if someone may still be controlling the phone.",
                    "Uninstall AnyDesk, TeamViewer, or any app they asked you to install — after you are offline if you can.",
                    "Call 1799 or your bank on a different device if this one feels compromised.",
                ],
                source_title=SOURCES["helpline"].title,
                source_url=SOURCES["helpline"].url,
            ),
            "why": [
                "Cut the remote session before sharing more information.",
                "Use another device to contact 1799 or the bank.",
            ],
        }
    if stage == "active_pressure":
        return {
            "sources": [SOURCES["helpline"]],
            "action": NextAction(
                title="End the contact. Check with 1799, not the caller",
                steps=[
                    "Hang up or stop replying. Official agencies will not keep you on the line to move money.",
                    "Call 1799 on a number you already know, or from the ScamShield site — not a callback number they gave you.",
                    "Tell a trusted person nearby what just happened.",
                ],
                source_title=SOURCES["helpline"].title,
                source_url=SOURCES["helpline"].url,
            ),
            "why": [
                "End the live pressure first.",
                "Verify on 1799 or ScamShield, not a number they provided.",
            ],
        }
    if stage == "link_clicked":
        return {
            "sources": [SOURCES["scamshield"]],
            "action": NextAction(
                title="Do not enter anything else. Verify on ScamShield",
                steps=[
                    "Leave the page. Do not type passwords, OTPs, or card numbers.",
                    "Open ScamShield or call 1799 to check the message or site.",
                    "Later, change important passwords only on official websites you type yourself.",
                ],
                source_title=SOURCES["scamshield"].title,
                source_url=SOURCES["scamshield"].url,
            ),
            "why": ["Do not enter more details on a page you do not trust."],
        }
    if stage == "repeat_recovery":
        return {
            "sources": [SOURCES["scamshield"], SOURCES["police"]],
            "action": NextAction(
                title="Treat recovery helpers as unverified. Use official channels only",
                steps=[
                    "Do not pay a ‘recovery agent’ or share more banking details.",
                    "Check the contact on ScamShield or call 1799.",
                    "If money was already lost, use official police reporting — not someone who messaged you first.",
                ],
                source_title=SOURCES["scamshield"].title,
                source_url=SOURCES["scamshield"].url,
            ),
            "why": ["Recovery callers are not an official channel."],
        }
    return {
        "sources": [SOURCES["scamshield"]],
        "action": NextAction(
            title="Do not reply. Check it on ScamShield or 1799",
            steps=[
                "Do not tap links or call a number that came with the message.",
                "Check the SMS, number, or site in the ScamShield app, or call 1799.",
                "If they asked for money or codes, pause and verify before doing anything else.",
            ],
            source_title=SOURCES["scamshield"].title,
            source_url=SOURCES["scamshield"].url,
        ),
        "why": ["Verify first. Do not continue the conversation."],
    }
