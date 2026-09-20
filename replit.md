# Index AP Study App

## Run on Replit

- The app is a single Node.js server that serves the frontend and Socket.io multiplayer features.
- The Replit workflow runs `PORT=5000 npm start`.
- AI features run locally in each user's browser through WebLLM and WebGPU. No API key or AI provider credits are required. The first AI use downloads a small model and later uses are cached on that device.
- Users need a current WebGPU-capable browser, such as Chrome or Edge.
- No database or frontend build step is required.

## Checks

- Run `npm test` for the end-to-end server and multiplayer checks.