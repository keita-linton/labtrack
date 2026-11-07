// server.js — LabTrack v2 entry point.
//
// Thin wrapper: builds the app from src/app.js and starts listening.
// All routes, auth and data access live under src/ — this file only runs
// the server when invoked directly (`node server.js` / `npm start`).
// Tests import createApp() from src/app.js instead, so requiring this file
// has no side effects.

const { createApp } = require('./src/app');

if (require.main === module) {
  const port = process.env.PORT || 3000;
  const app = createApp();
  app.listen(port, () => {
    console.log(`LabTrack v2 running at http://localhost:${port}`);
    console.log('Demo login — username: instructor / password: instructor123');
  });
}

module.exports = { createApp };
