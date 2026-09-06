# Welcome to ScamSafe!

**ScamSafe** is a web application for Singapore residents who are already in a suspicious interaction — for example a caller or chat claiming to be from a bank, IRAS, or the police.

With ScamSafe, you can:

- Capture what happened by pasting a message, typing a description, or attaching a screenshot.
- See a structured **incident record** with the current stage and risk flags.
- Answer **one** focused question when that answer would change the next step.
- Receive **one official next-action card** (1–3 steps plus a ScamShield / 1799 / SPF source).
- Add more evidence to the **same case** so stage and risk can be re-assessed.

You take every real-world step. ScamSafe never calls a bank, 1799, ScamShield, or the police for you.

ScamSafe is designed for users who:

- Retrieve the project from **this GitHub repository** and run it locally by following [Getting Started](#getting-started).
- Are on **Windows, macOS, or Linux** — a MacBook is not required.
- Can install **Node.js** (this gives you `npm`) and **Python**, then type a few commands in a terminal. You do not need to be a programmer, and you do not need an AWS account for the basic demo.
- After the app is running, use it in a browser (Chrome, Edge, Safari, or Firefox).

This is a prototype. It is not a substitute for your bank, the ScamShield helpline (**1799**), or the Singapore Police Force.

Architecture, tests, and how the graph works are in the [Developer Guide](DeveloperGuide.md). This User Guide is how you **get the app from GitHub and use it**.

> [!TIP]
> **Tip:** For any terms that you are not familiar with, refer to the [Glossary](#glossary) below.

---



## How to use this User Guide

This user guide walks you through retrieving ScamSafe from GitHub, starting it on your computer, and using every feature. You do not need prior programming experience, but you do need Node.js and Python installed (steps below).

Explore the sections below to begin:

1. **Table of Contents**: On GitHub, use the outline on the left / heading list. Use the links in this section to jump around.
2. **[Getting Started](#getting-started)**: Download the repo, install the required tools, and launch the app on Windows, macOS, or Linux.
3. **[Feature Summary](#scamsafe-feature-summary)**: A one-page reference of every action and how to trigger it.
4. **[Features](#features)**: In-depth information for each feature, including format, expected behaviour, and examples.
5. **[FAQ](#faq)**: Answers to common questions about devices, install, and what the app will not do.
6. **[Known Issues](#known-issues)**: Unexpected behaviour and workarounds.
7. **[Acceptable Value Ranges](#acceptable-value-ranges-for-inputs)**: What you can paste or upload.
8. **[Glossary](#glossary)**: Short definitions of terms used in this guide.



### Alert boxes

Within the User Guide, you will see these boxes.

> [!NOTE]
> **Info:** Extra context for the current step.

> [!TIP]
> **Tip:** A small habit that makes the feature easier to use.

> [!WARNING]
> **Caution:** A pitfall that can leak secrets, mix two cases, or skip an official call.

---



## Getting Started

Follow these steps on **your** computer to get ScamSafe from GitHub and run it. The same path works on Windows, macOS, and Linux.

### 1. Install Node.js (this includes `npm`)

You need **Node.js 20 or newer**. Installing Node.js also installs `npm`, which downloads the front-end libraries.

1. Open [https://nodejs.org/](https://nodejs.org/) and download the **LTS** installer for your system (Windows, macOS, or Linux).
2. Run the installer. On Windows, leave the option that adds Node to `PATH` ticked.
3. Close and reopen your terminal, then check:

```text
node -v
npm -v
```

You should see version numbers, not “command not found”.

> [!TIP]
> **Tip: Opening a terminal**
>
> * **Windows:** Start menu → **Command Prompt**, **PowerShell**, or **Windows Terminal**.
> * **macOS:** <kbd>Command</kbd> + <kbd>Space</kbd>, type **Terminal**, press <kbd>Enter</kbd>.
> * **Linux:** Open **Terminal** from your applications menu.

### 2. Install Python

You need **Python 3.11 or newer**. This runs the assess / next-action service.

1. Open [https://www.python.org/downloads/](https://www.python.org/downloads/) and install the latest 3.x for your OS.
2. On **Windows**, tick **Add python.exe to PATH** before you click Install.
3. Check:

```text
python --version
```

On some Mac / Linux setups the command is `python3 --version` instead. Use whichever prints a 3.11+ version.

An AWS / Amazon account is **optional**. Without it, the app still runs using keyword rules (**Keyword fallback**).

### 3. Get the project from GitHub

The source of truth is the repository: [https://github.com/josephkwok001/HackForward](https://github.com/josephkwok001/HackForward).

**Option A — Download ZIP (no Git required)**

1. Open the repo link above in a browser.
2. Click the green **Code** button → **Download ZIP**.
3. Unzip the file to a folder you can find later (for example `Documents\HackForward` on Windows, or `Downloads/HackForward` on a Mac).
4. In your terminal, go into that folder:

```text
cd path/to/HackForward
```

Replace `path/to/HackForward` with the real folder. On Windows File Explorer you can click the address bar, copy the path, and paste it after `cd ` (use quotes if the path has spaces).

**Option B — Clone with Git**

If you already have Git:

```text
git clone https://github.com/josephkwok001/HackForward.git
cd HackForward
```

### 4. Start the website (first terminal)

From the project folder:

```text
cd web
npm install
npm run dev
```

Leave this terminal **open**. The first `npm install` can take a few minutes.

Expected: a message that the app is running at `http://localhost:5173`.

> [!NOTE]
> **Info:** `npm install` only downloads libraries listed in the repo. It is not an App Store install and does not need a Mac.

### 5. Start the assess service (second terminal)

Open a **new** terminal window, go to the same project folder, then:

Always use `python -m pip` and `python -m uvicorn` (not bare `pip` / `uvicorn`). Bare `uvicorn` can start your **system** Python even when `(.venv)` is in the prompt, which then fails with `No module named 'langchain_core'`.

**macOS / Linux**

```text
cd graph
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8080
```

**Windows (Command Prompt)**

```text
cd graph
python -m venv .venv
.venv\Scripts\activate.bat
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8080
```

**Windows (PowerShell)**

```text
cd graph
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app:app --host 127.0.0.1 --port 8080
```

If PowerShell says scripts are disabled, use Command Prompt instead, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

Leave this second terminal **open**. Success looks like `Uvicorn running on http://127.0.0.1:8080`. You now have two processes: the website on port **5173** and the graph on port **8080**.

> [!WARNING]
> **Caution:** If the traceback mentions `/Library/Frameworks/Python.framework/.../uvicorn` (Mac) or another path **outside** `.venv`, you launched the wrong Uvicorn. Stop it with <kbd>Ctrl</kbd> + <kbd>C</kbd>, then rerun `python -m pip install -r requirements.txt` and `python -m uvicorn app:app --host 127.0.0.1 --port 8080` from `graph/` with the venv activated. A prompt like `(.venv) (base)` is fine; `python -m` still uses the venv.

> [!TIP]
> **Tip:** You can skip step 5 and still open the website. Stage / risk and next steps will use the built-in **Keyword fallback**. For the full Amazon Bedrock path, keep step 5 running and add a repo-root `.env` as described in the [Developer Guide](DeveloperGuide.md#setting-up-getting-started).

### 6. Open ScamSafe in your browser

On the **same computer** that is running the terminals, open:

[http://localhost:5173](http://localhost:5173)

A page similar to the description below should appear:

* **Header:** Wordmark **ScamSafe** and a short disclaimer not to share passwords, OTPs, PINs, or full card numbers.
* **Tabs:** **Message**, **Describe**, **Screenshot**.
* **Text box:** Where you paste or type what happened.
* **Buttons:** **Create incident record** and **Use sample**.

> [!WARNING]
> **Caution:** `http://localhost:5173` only works on the computer where you ran `npm run dev`. It will not open from another phone or PC unless you host the app yourself. Keep both terminals running while you use the page.

### 7. Try a sample run

1. Click **Use sample**.
2. Click **Create incident record**.
3. Wait for the short “working” screens.
4. If a question appears, pick an answer or **Skip and see the record**.
5. Read **Stage** and **Risk flags**.
6. Click **Plan next steps**.
7. Tick the checkbox that says you understand **you** will make any call.

### 8. Next

Refer to [Features](#features) for details of each action.

> [!TIP]
> **Tip:** When you first open ScamSafe, the form is empty. **Use sample** fills a fake bank-impersonation SMS so you can walk the full loop. When you are ready for a real case, click **Start a new record** (or **Start over**) and paste your own text.

---



## ScamSafe Feature Summary


| Action                                                                      | How to use it                                                     | Example                            |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| **[Use sample](#trying-the-sample-use-sample)**                             | Click **Use sample**                                              | Loads a fake OCBC / PayNow message |
| **[Create incident (message)](#creating-an-incident-from-a-message)**       | **Message** tab → paste `TEXT` → **Create incident record**       | Paste an SMS, then create          |
| **[Create incident (describe)](#creating-an-incident-from-a-description)**  | **Describe** tab → type `TEXT` → **Create incident record**       | “A man said he was from OCBC…”     |
| **[Create incident (screenshot)](#creating-an-incident-from-a-screenshot)** | **Screenshot** tab → choose image → **Create incident record**    | Photo from Files / Photos          |
| **[Answer one question](#answering-one-clarification-question)**            | Tap a choice, **I'm not sure**, or **Skip and see the record**    | “Has money already left?”          |
| **[View record](#viewing-the-incident-record)**                             | Stay on the **Record** tab after create                           | Stage, risk, facts, history        |
| **[Plan next steps](#planning-next-steps)**                                 | Click **Plan next steps**                                         | Official 1–3 step playbook         |
| **[Add more evidence](#adding-more-evidence-to-the-same-case)**             | **Add more evidence** → new `TEXT` / image → **Add to this case** | “They now asked me to PayNow”      |
| **[Start over](#starting-a-new-record)**                                    | **Start a new record** or **Start over**                          | Different incident or person       |


---



## Features

> [!NOTE]
> **Notes about the format used below**
>
> - Words in `UPPER_CASE` are values **you** supply (for example `TEXT` is the message you paste).
> - Items in square brackets are optional. e.g. `[NOTE]` next to a screenshot.
> - Button and tab names are shown in **bold**, exactly as they appear on the page.
> - On a phone, “click” means **tap**. On Windows, paste with Ctrl + V. On a Mac, paste with Command + V. On a phone, touch and hold, then tap **Paste**.

---



## Getting around the page

This section covers actions that are not about one incident field — they control the application itself.

### Trying the sample: **Use sample**

Loads a built-in bank-impersonation message so you can demo the product without a real case.

Format: **Use sample**

- Replaces the text box with the sample SMS.
- Switches the tab to **Message**.
- Does **not** create the record until you click **Create incident record**.

Example:

- Click **Use sample**, then **Create incident record**.

> [!TIP]
> **Tip:** Use this path for judging demos and first-time practice.

---



## Capturing an incident

This section covers how you get facts into ScamSafe. The app extracts a factual record first. Advice comes later, on **Plan next steps**.

### Creating an incident from a message

Adds a new incident from a pasted SMS, chat, or email.

Format: **Message** → paste `TEXT` → **Create incident record**

- `TEXT` should describe what the other party said or sent.
- You can submit text only. A screenshot is not required.
- Sensitive values that look like card numbers, OTPs, passwords, or PINs are redacted before they are stored in the record.

Examples:

- Paste `OCBC: stay on the line and PayNow the remaining balance. Reply YES.` then click **Create incident record**.
- Copy a WhatsApp thread on your phone, paste it, then create the record.

> [!WARNING]
> **Caution:** Do not type passwords, OTPs, PINs, or full card numbers. If they already appear in the pasted message, ScamSafe tries to hide them — still avoid pasting more than you need.

Expected: A short “Checking what you shared” / “Building your incident record” screen, then either a [clarification question](#answering-one-clarification-question) or the [incident record](#viewing-the-incident-record).

---



### Creating an incident from a description

Adds a new incident from your own words. Useful on a phone when you cannot copy the SMS, or when a screenshot cannot be read.

Format: **Describe** → type `TEXT` → **Create incident record**

- Write what happened and what they asked you to do.
- You do not need formal English.

Example:

- `A man said he was from OCBC. He told me not to hang up and to transfer money.`

---



### Creating an incident from a screenshot

Adds a new incident from an image. The picture stays on **this** device as a file reference. The page tries to read the words on it (on-device).

Format: **Screenshot** → choose `IMAGE` → [`NOTE`] → **Create incident record**

- `IMAGE` should be a common photo type (for example JPG or PNG).
- `[NOTE]` is an optional typed caption in the text box.
- Where to pick the file:
  - **iPhone / iPad:** Photos
  - **Android:** Gallery or Files
  - **Windows:** File Explorer (often Downloads or Pictures)
  - **macOS:** Finder
  - **Chromebook:** Files app

Examples:

- Attach a photo of an SMS, then create the record.
- Attach a photo **and** type `This is the WhatsApp they sent at 2pm`.

> [!NOTE]
> **Info:** If the page says it could not read enough text, type what the screenshot says (use **Describe** or the note box) and try again. Person 3 (assessment) only receives cleaned text plus a file reference — not the raw image bytes.

> [!WARNING]
> **Caution:** Do not upload a photo of your full card, Singpass QR, or a screen that shows a live OTP you are about to type.

---



### Answering one clarification question

Sometimes the record is held back until you answer **one** question that would change the next step (for example whether money already left, or an OTP was shared).

Format: tap `CHOICE` **or** **I'm not sure** **or** **Skip and see the record**

- Only one question is shown at a time.
- Skipping still opens the record; the next-action card may be more generic.
- ScamSafe still will not place a call.

Examples:

- Tap **Yes, money already left** if that is true.
- Tap **Skip and see the record** if you want the facts first.

---



## Reading and acting on a case



### Viewing the incident record

Shows the structured case file after intake (and after any clarification).

Format: stay on the **Record** tab (shown automatically after create)

Typical sections:


| Section                   | Meaning                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| **AI assessment → Stage** | Where the incident is now (not a legal finding)                                                   |
| **Risk flags**            | Urgent signs (transfer requested, OTP, remote app, funds moved)                                   |
| Badge                     | **Amazon Bedrock** if the model classified the case; **Keyword fallback** if word-rules were used |
| **Links and numbers**     | Hostnames and masked phones found in the text. The app does **not** open links or dial numbers    |
| **What you shared**       | Incident type, a short quote, extracted facts                                                     |
| **History**               | Each update on this case; newest at the bottom                                                    |
| **Uncertainty**           | Gaps that still need a human check                                                                |


From this page you can **Plan next steps**, **Add more evidence**, or **Start a new record**.

> [!NOTE]
> **Info:** A notice appears if secrets were redacted or screenshot text was only partly read. The badge does not change what **you** should do: treat urgent flags seriously either way.

---



### Planning next steps

Builds the official next-action card for the current stage and risk flags.

Format: **Plan next steps** (or open the **Next steps** tab after a plan exists)

- Shows a title, 1–3 numbered steps, and an official source link (ScamShield, 1799 guidance, or SPF).
- Tick the checkbox when you understand that **you** will contact the bank, 1799, or the police.
- There is no button that makes ScamSafe place a call. That is intentional.

Example:

- On a sample “active pressure / requested transfer” record, **Plan next steps** tells you to end the contact and check with **1799**, not the caller.

> [!WARNING]
> **Caution:** Use the number **on the back of your card** or the official banking app — not a number from the suspicious message.

---



### Adding more evidence to the same case

Appends a new message, description, or screenshot to the **current** `thread` (same case). History grows. Stage and risk are re-assessed. A previous action card is cleared so you can plan again.

Format: **Add more evidence** → enter `TEXT` and/or `IMAGE` → **Add to this case**

- **Go back** cancels adding and returns you to the last record or plan.
- Do not use this to start a different person’s case.

Example:

- After the sample record, add `They now asked me to PayNow $2000`, then **Plan next steps** again.

---



### Starting a new record

Discards the on-screen case and returns to an empty intake form.

Format: **Start a new record** **or** footer **Start over**

> [!WARNING]
> **Caution:** Closing or refreshing the browser tab also drops the case. This prototype does not keep a login or a saved folder of past incidents. Do not mix two people’s cases on one record.

---



### Saving the data

ScamSafe does **not** save a file on your computer.

- The browser keeps the current case only while the tab stays open.
- If you stop the terminals (`npm run dev` or the Python server), in-memory cases are gone.

There is no manual **Save** button.

---



## FAQ

**Q:** How do I get ScamSafe from GitHub?  

**A:** Follow [Getting Started](#getting-started): install Node.js and Python, download or clone [the repo](https://github.com/josephkwok001/HackForward), run `npm install` / `npm run dev` in `web/`, optionally start the Python graph, then open `http://localhost:5173`.

**Q:** Do I need a Mac / MacBook?  

**A:** No. Getting Started works on Windows, macOS, and Linux.

**Q:** Do I need `npm` and Python?  

**A:** Yes. Node.js (which includes `npm`) runs the website. Python runs the assess / next-action service. Both are free. You do not need to write any code.

**Q:** Do I need Git?  

**A:** No. You can click **Code → Download ZIP** on GitHub and unzip it. Git clone is optional.

**Q:** Do I need an AWS or Amazon account?  

**A:** No. Without AWS keys the same screens work using keyword rules (**Keyword fallback** badge). Bedrock is optional; see the [Developer Guide](DeveloperGuide.md).

**Q:** Which operating systems can I run the repo on?  

**A:** Windows, macOS, and Linux. After it is running, you use it in a browser on that same computer.

**Q:** Can I open `localhost` on my phone?  

**A:** Not by default. `http://localhost:5173` is only the computer where you started `npm run dev`. Use that computer’s browser for the demo.

**Q:** How do I paste on Windows / Mac / phone?  

**A:** Windows or Chromebook: Ctrl + V. Mac: Command + V. Phone: touch and hold in the box, then **Paste**. If paste fails, use the **Describe** tab and type it.

**Q:** Will ScamSafe call my bank or 1799 for me?  

**A:** No. The next-action card is for **you**. Call **1799** or the number on the back of your card.

**Q:** What happens if I refresh or close the tab?  

**A:** The on-screen case is usually gone. Start again.

**Q:** Can ScamSafe recover my money?  

**A:** No. It cannot promise recovery. Call your bank on an official number, then 1799 / SPF through official channels.

**Q:** I am not sure it is a scam. Should I still use official numbers?  

**A:** Yes. Do not call a number from the suspicious message.

**Q:** Do I need prior programming knowledge?  

**A:** No. You only copy the commands in Getting Started. If a command is “not found”, reopen the terminal after installing Node or Python, and check you ticked **Add to PATH** on Windows.

---



## Known issues

1. **`localhost` on a different device.** `http://localhost:5173` only works on the computer where you ran `npm run dev`. Remedy: use that computer’s browser.
2. **Screenshot reading can fail** on blurry photos, dark screenshots, or stylised fonts. Remedy: type what the picture says under **Describe** (or in the note box) and create the record again.
3. **Refresh or stopping the terminals wipes the case.** Intake and graph memory live only in that process. Remedy: keep both terminals and the browser tab open during a demo.
4. **Bedrock unset or failing** shows **Keyword fallback** instead of **Amazon Bedrock**. The record and playbook still appear. Remedy: optional — add a repo-root `.env` as in the [Developer Guide](DeveloperGuide.md#setting-up-getting-started).
5. **`npm` or `python` is not recognised.** The installer did not land on your PATH, or you did not reopen the terminal. Remedy: reinstall with **Add to PATH** (Windows), then open a new terminal and run `node -v` / `python --version` again.
6. **PowerShell refuses to activate `.venv`.** Remedy: use Command Prompt, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
7. **`No module named 'langchain_core'` when starting the graph.** `uvicorn` ran from the **system** Python, not `.venv`. Remedy: from `graph/`, activate the venv, then `python -m pip install -r requirements.txt` and `python -m uvicorn app:app --host 127.0.0.1 --port 8080`. Do not run bare `uvicorn`.

---



## Acceptable Value Ranges for Inputs


| Feature                     | Acceptable inputs                                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Message / Describe text** | Non-empty text once you submit (unless a screenshot is attached). Paste only what you need to explain the situation. Do not include passwords, OTP *values*, PINs, or full card numbers. |
| **Screenshot**              | One image file (`image/`*, typically JPG/PNG). Keep it reasonably small (the client rejects very large images). If on-device reading yields too little text, you must type a caption.    |
| **Clarification choice**    | One of the buttons shown for that question, **I'm not sure** (when offered), or **Skip and see the record**.                                                                             |
| **Add to this case**        | Same rules as create; the new material is appended to the current case, not a new person.                                                                                                |
| **Next-steps checkbox**     | Optional acknowledgement that you will make official contact yourself. It does not send a call.                                                                                          |


---



## Official channels (you contact them)

Confirm the latest numbers and URLs on the official sites if anything looks outdated.


| Need                   | Where to go                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Check or report a scam | [ScamShield](https://www.scamshield.gov.sg/)                                                         |
| Helpline               | **1799** — [ScamShield Helpline](https://www.scamshield.gov.sg/check-for-scams/scamshield-helpline/) |
| Police                 | [Singapore Police Force](https://www.police.gov.sg/)                                                 |
| Your bank              | Number on the **back of your card** or the official banking app — not a number from the message      |


If you are in immediate danger, contact the police through official channels.

---



## Glossary


| Term                 | Meaning                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| **Incident record**  | The structured case file: type, facts, timeline, stage, and risk.                                |
| **Stage**            | Where the incident is now (e.g. active pressure, payment pending). Not a court finding.          |
| **Risk flag**        | An urgent signal such as a requested transfer or funds already moved.                            |
| **Next-action card** | One official playbook (title, 1–3 steps, source link) for **you** to follow.                     |
| **Keyword fallback** | Simple word-rules used when Amazon Bedrock is off or fails.                                      |
| **Amazon Bedrock**   | Cloud model used to classify stage and risk when you add optional AWS keys in `.env`.            |
| **Thread / case**    | One incident. **Add more evidence** stays on the same thread. **Start over** begins another.     |
| **1799**             | ScamShield helpline. You dial it; ScamSafe does not.                                             |
| **OCR**              | Reading words from a screenshot on your device.                                                  |
| **Redaction**        | Hiding card numbers, OTP-like codes, passwords, and PINs before storage.                         |
| **`npm`**            | Node package manager. Comes with Node.js. You use it to install and start the website.           |
| **Terminal**         | The command window (Command Prompt / PowerShell on Windows, Terminal on Mac / Linux).            |


