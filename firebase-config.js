/* Live game settings.
 *
 * demo: true   -> everything runs inside one browser (great for trying it out;
 *                 each tab acts as a different person). Nothing is shared between phones.
 * demo: false  -> uses your Firebase project so all phones stay in sync.
 *
 * To go live: create a Firebase project, add a Web app, copy its config below,
 * turn on Anonymous sign-in, create a Realtime Database, paste in database.rules.json,
 * and set demo to false. See README.md for the step-by-step.
 */
window.XMAS_CONFIG = {
  demo: true,
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
    projectId: "YOUR_PROJECT",
    appId: "YOUR_APP_ID"
  }
};
