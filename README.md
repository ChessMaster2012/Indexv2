# Index — AP Study App

A study app with an AI tutor, AI-generated flashcards/quizzes, spaced-repetition review,
solo study games, and **live multiplayer trivia** with a room code — like Kahoot/Blooket/Quizlet
Live, but you own the server. No login required to play, no vendor lock-in, deploys anywhere
Node.js runs.

## What's inside

- **One Node.js server** (`server.js`) using Express + Socket.io. It serves the whole app and
  runs the real-time multiplayer game engine in memory (no database needed).
- **Local browser AI** powered by WebLLM and WebGPU. The AI tutor, lessons, and study-set
  generation run on each user's device without an API key or provider credits.
- **One HTML/CSS/JS client** (`public/index.html`) — the whole front end, no build step.
- **Four multiplayer game modes**, all built on the same fair, server-authoritative question
  engine (the server — not the browser — decides who was first and what's correct, and never
  sends the correct answer to players until after they've locked in):
  - **Trivia Dash** — classic speed trivia, fastest correct answers score the most.
  - **Rocket Race** — every correct answer moves your rocket further down the track.
  - **Tower Climb** — correct answers stack a block on your tower; tallest tower wins.
  - **Gold Rush** — correct answers earn gold, which you can gamble on mystery chests
    between questions for a random bonus.

## Run it locally

```bash
npm install
npm start
```

Then open **http://localhost:3000**. That's it — notes, flashcards, solo games, and all four
live multiplayer modes work immediately with zero configuration. To play a live game across
two devices on the same network, open the same URL using your computer's local IP
(e.g. `http://192.168.1.23:3000`) instead of `localhost` on the other device.

### Using the local AI features

The AI Tutor, "Learn a topic" lessons, and the "generate flashcards/quiz" buttons run locally
in a current WebGPU-capable browser such as Chrome or Edge. On first use, the browser downloads
the small Qwen2.5 0.5B model and caches it on that device. No API key, server secret, or
provider credits are required. A device without WebGPU can still use notes, existing study
sets, solo games, and multiplayer games.

Because it's a small local model, it occasionally used to produce a flashcard or quiz question
with a missing answer choice. The app now validates every generated card/question/checkpoint
and retries once if something comes back incomplete — and on load it automatically cleans up
any already-broken cards or questions left over in study sets you built before this update.

## Accounts

Sign in isn't required — anyone can still tap **Just set a nickname** and join a live game with
zero setup, same as before. Signing in adds a profile (first/last name, school, grade) that's
remembered across devices and used as your default nickname everywhere.

Three ways in, from the same **Sign in** button:
- **Email** or **phone number** + password — works immediately, no configuration needed.
  Passwords are hashed (scrypt) and never stored in plain text; accounts live in
  `data/users.json` on your server (add `data/` to your deploy's persistent storage if your
  host wipes the filesystem on redeploy — Render/Railway/Fly volumes, or just accept that
  accounts reset on redeploy for a small classroom tool).
- **Continue with Google** — optional. Hidden until you set `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` (see `.env.example` for the exact Google Cloud Console steps,
  including the redirect URI you need to register).

After first sign-up (any method), the app prompts for first/last name, school, and grade —
editable any time from the same **Sign in** button once you're signed in.

## Deploy it so anyone can join

Any host that runs Node.js works. A few easy, free-tier-friendly options:

### Render.com (easiest)
1. Push this folder to a GitHub repo.
2. On Render: **New → Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Deploy. Render gives you a public URL like `https://your-app.onrender.com` — that's the
   link you share with your class. Free tier sleeps after inactivity, so the first load after
   idle time takes a few extra seconds.

### Railway.app
Same idea: connect the repo and deploy. Railway gives you a public URL immediately.

### Fly.io
`fly launch` in this folder, accept the defaults (it'll detect the Node app), then `fly deploy`.

### Your own VPS / any server
```bash
git clone <your-repo>
cd index-app
npm install
npm install -g pm2        # keeps it running after you disconnect
pm2 start server.js --name index-app
```
Put a reverse proxy (nginx/Caddy) in front for HTTPS and a real domain if you want one.

### A note on scale
Room state lives in the server's memory, which is what makes this deployable with zero
infrastructure (no database to provision). That's perfect for classroom-sized games — one
teacher, one class, tens of players. It resets if the server restarts or redeploys, and it's
not built for thousands of simultaneous rooms on a single free-tier instance. For a single
class at a time, any of the options above is more than enough.

## How multiplayer works, briefly

- The **host** picks (or AI-generates) a quiz and a game mode, and gets a 5-character room code.
- **Players** open the same URL on their own device, enter the code and a nickname — no
  account needed — and join a live roster.
- The **server** is the source of truth: it times each question, grades every answer, and only
  reveals the correct one after everyone's answered or time runs out. This is different from
  the earlier Claude-artifact version of this app, where the multiplayer data lived in a
  Claude-only feature restricted to signed-in members of one organization. This version has no
  such restriction — anyone with the link and the code can play.

## Project structure

```
index-app/
├── server.js          Express + Socket.io backend, AI proxy, game engine
├── public/
│   └── index.html      the entire front end
├── package.json
├── .env.example         copy to .env to enable AI features
└── README.md
```
