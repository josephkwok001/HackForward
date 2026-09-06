import type { EscalationRoute, NextAction, OfficialSource, Stage } from "./types";

export const SOURCES = {
  scamshield: {
    id: "scamshield",
    title: "ScamShield",
    url: "https://www.scamshield.gov.sg/",
  },
  helpline: {
    id: "scamshield-1799",
    title: "ScamShield Helpline 1799",
    url: "https://www.scamshield.gov.sg/check-for-scams/scamshield-helpline/",
  },
  police: {
    id: "spf",
    title: "Singapore Police Force",
    url: "https://www.police.gov.sg/",
  },
} satisfies Record<string, OfficialSource>;

const BANK_STEP =
  "Call your bank using the number on the back of your card or through the official banking app. Do not use a number from the message.";

export function actionFor(
  stage: Stage,
  route: EscalationRoute,
): { action: NextAction; sources: OfficialSource[] } {
  if (stage === "money_sent" || route === "police") {
    return {
      sources: [SOURCES.helpline, SOURCES.police],
      action: {
        title: "Call your bank now, then use official reporting channels",
        steps: [
          BANK_STEP,
          "Call 1799. The ScamShield helpline can connect you to participating banks.",
          "File a police report through official SPF channels. ScamSafe cannot do this for you.",
        ],
        source_title: SOURCES.helpline.title,
        source_url: SOURCES.helpline.url,
      },
    };
  }

  if (stage === "payment_pending" || stage === "otp_shared" || route === "bank") {
    return {
      sources: [SOURCES.helpline],
      action: {
        title: "Stop the transfer and call your bank on an official number",
        steps: [
          "Do not send more money, OTPs, or screenshots to the other party.",
          BANK_STEP,
          "If you cannot reach the bank, call 1799 for the ScamShield helpline.",
        ],
        source_title: SOURCES.helpline.title,
        source_url: SOURCES.helpline.url,
      },
    };
  }

  if (stage === "app_installed") {
    return {
      sources: [SOURCES.helpline],
      action: {
        title: "Cut the remote session, then call 1799 or your bank",
        steps: [
          "Turn off Wi-Fi and mobile data if someone may still be controlling the phone.",
          "Uninstall AnyDesk, TeamViewer, or any app they asked you to install — after you are offline if you can.",
          "Call 1799 or your bank on a different device if this one feels compromised.",
        ],
        source_title: SOURCES.helpline.title,
        source_url: SOURCES.helpline.url,
      },
    };
  }

  if (stage === "active_pressure") {
    return {
      sources: [SOURCES.helpline],
      action: {
        title: "End the contact. Check with 1799, not the caller",
        steps: [
          "Hang up or stop replying. Official agencies will not keep you on the line to move money.",
          "Call 1799 on a number you already know, or from the ScamShield site — not a callback number they gave you.",
          "Tell a trusted person nearby what just happened.",
        ],
        source_title: SOURCES.helpline.title,
        source_url: SOURCES.helpline.url,
      },
    };
  }

  if (stage === "link_clicked") {
    return {
      sources: [SOURCES.scamshield],
      action: {
        title: "Do not enter anything else. Verify on ScamShield",
        steps: [
          "Leave the page. Do not type passwords, OTPs, or card numbers.",
          "Open ScamShield or call 1799 to check the message or site.",
          "Later, change important passwords only on official websites you type yourself.",
        ],
        source_title: SOURCES.scamshield.title,
        source_url: SOURCES.scamshield.url,
      },
    };
  }

  if (stage === "repeat_recovery") {
    return {
      sources: [SOURCES.scamshield, SOURCES.police],
      action: {
        title: "Treat recovery helpers as unverified. Use official channels only",
        steps: [
          "Do not pay a ‘recovery agent’ or share more banking details.",
          "Check the contact on ScamShield or call 1799.",
          "If money was already lost, use official police reporting — not someone who messaged you first.",
        ],
        source_title: SOURCES.scamshield.title,
        source_url: SOURCES.scamshield.url,
      },
    };
  }

  return {
    sources: [SOURCES.scamshield],
    action: {
      title: "Do not reply. Check it on ScamShield or 1799",
      steps: [
        "Do not tap links or call a number that came with the message.",
        "Check the SMS, number, or site in the ScamShield app, or call 1799.",
        "If they asked for money or codes, pause and verify before doing anything else.",
      ],
      source_title: SOURCES.scamshield.title,
      source_url: SOURCES.scamshield.url,
    },
  };
}

export const INCIDENT_LABEL: Record<string, string> = {
  bank_impersonation: "Bank impersonation",
  remote_access: "Remote-access request",
  payment_request: "Payment request",
  impersonation: "Official impersonation",
  unknown: "Still unclear",
};

export const STAGE_LABEL: Record<Stage, string> = {
  suspicious_contact: "Suspicious contact",
  active_pressure: "Active pressure",
  link_clicked: "Link clicked",
  app_installed: "Remote app installed",
  otp_shared: "OTP or code shared",
  payment_pending: "Payment pending",
  money_sent: "Money already sent",
  repeat_recovery: "Recovery follow-up",
  unknown: "Still unclear",
};

export const STAGE_BLURB: Record<Stage, string> = {
  suspicious_contact: "Someone reached out and may be impersonating an official. No money or codes have been handed over yet.",
  active_pressure: "They are pushing you to act now — stay on the line, transfer, or keep the contact going.",
  link_clicked: "A link was opened. Do not type passwords, OTPs, or card numbers on that page.",
  app_installed: "A remote-access or screen-sharing app may be on the device.",
  otp_shared: "An OTP or SMS code may already have been typed or read out.",
  payment_pending: "A transfer may have been started and can still be stopped.",
  money_sent: "Money may already have left the account. Use official bank and police channels only.",
  repeat_recovery: "Someone is offering to recover money. Treat that as unverified.",
  unknown: "There is not enough yet to place this on the stage scale.",
};

export const FLAG_LABEL: Record<import("./types").RiskFlag, string> = {
  requested_transfer: "Asked for a transfer",
  requested_otp: "Asked for an OTP",
  requested_remote_access: "Asked for remote access",
  impersonating_official: "Claimed to be official",
  payment_in_progress: "Payment may be in progress",
  funds_already_moved: "Funds may already have moved",
  user_still_on_the_call: "Still in the conversation",
  insufficient_evidence: "Need one more fact",
};

export const FLAG_BLURB: Record<import("./types").RiskFlag, string> = {
  requested_transfer: "They wanted PayNow, a bank transfer, or money moved to another account.",
  requested_otp: "They asked for a one-time password or SMS code.",
  requested_remote_access: "They asked to install an app or see the screen.",
  impersonating_official: "They used a bank, agency, or government name.",
  payment_in_progress: "A transfer may have been started but not finished.",
  funds_already_moved: "Money may already have left the account.",
  user_still_on_the_call: "The conversation may still be live.",
  insufficient_evidence: "One extra answer would change the next step.",
};

export const SAMPLE_MESSAGE = `OCBC Fraud Department: We detected illegal transactions on your account. To protect your funds, transfer the remaining balance to this safe account via PayNow 9123 4567 or verify at https://ocbc-secure-login.xyz/paynow. Stay on the line and do not inform anyone. Reply YES to confirm.`;
