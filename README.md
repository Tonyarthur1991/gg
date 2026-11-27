# Daily Roadmap

An iPhone app that collects what happened today and turns it into a plan for tomorrow.

```
 iPhone app (Expo)                     Your server (Node)            Claude
 ─────────────────                     ──────────────────            ──────
 Captures: notes, dictated voice  ──►  POST /roadmap  ──────────►   writes the plan
 notes, pasted WhatsApp/iMessage       checks APP_TOKEN              (top 3, schedule,
 Calendar (today + tomorrow)           holds ANTHROPIC_API_KEY        replies owed, ...)
 Steps today                      ◄──  returns JSON roadmap  ◄────
 Nightly reminder notification
```

There's also an email roadmap: a scheduled Claude task reads Gmail, Google Calendar and Granola each evening and emails you a plan. It's set up separately, outside this repo.

## What it can and can't see

| Source | How |
|---|---|
| Calendar | Read from the iPhone calendar (includes Google Calendar if it's added in iOS Settings → Calendar → Accounts). |
| Steps | iPhone motion sensor. |
| Conversations | You dictate a voice note after a call or meeting (keyboard 🎤). The app does not record people secretly. That's illegal in many places, and iOS blocks it anyway. |
| WhatsApp / iMessage | iOS doesn't let apps read them. Long-press a message → Copy → paste into the app. |
| Email | Covered by the nightly email roadmap task, not by the app. |

Captures stay on the phone and are deleted after 3 days. They're only sent, to your own server, when you tap **Generate**.

## Setup (no Mac needed)

### 1. Deploy the server (about 10 minutes)

1. Get an API key at <https://console.anthropic.com>.
2. Make a random token, for example by running `openssl rand -hex 24`, or with any password generator (at least 24 characters).
3. Deploy `server/` to [Render](https://render.com) as a **Web Service**:
   - Root directory: `server`
   - Build command: `npm install`
   - Start command: `npm start`
   - Environment variables: `ANTHROPIC_API_KEY`, `APP_TOKEN`
4. Open `https://<your-service>.onrender.com/health`. It should show `{"ok":true}`.

### 2. Build the iPhone app in the cloud

You need an [Apple Developer account](https://developer.apple.com/programs/) ($99/year) and a free [Expo account](https://expo.dev). You can run these commands on any Windows/Linux computer, or in the browser at <https://expo.dev> using a GitHub-connected build.

```bash
cd app
npm install
npx expo install --fix          # aligns package versions with the Expo SDK
# edit app.json → ios.bundleIdentifier, e.g. com.yourname.dailyroadmap
npm install -g eas-cli
eas login
eas build --platform ios --profile production   # builds on Expo's Macs and asks for your Apple login
eas submit --platform ios --latest              # uploads to TestFlight
```

Install **TestFlight** from the App Store on your iPhone, accept the invite, and install Daily Roadmap.

### 3. First run

Open the app → **Settings** → enter the server URL and the token from step 1 → **Save**. Allow calendar, motion and notifications when asked.

## Develop

```bash
cd server && npm install && cp .env.example .env   # fill it in
npm run dev
```
