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
  firebase: {
    apiKey: "AIzaSyBJnu3G88IAeHPaeTnK2fB9St010DflCUI",
    authDomain: "christmas-auction.firebaseapp.com",
    // Check this against Realtime Database > Data in the Firebase console. This is the US default;
    // other regions look like https://christmas-auction-default-rtdb.europe-west1.firebasedatabase.app
    databaseURL: "https://christmas-auction-default-rtdb.firebaseio.com/",
    projectId: "christmas-auction",
    appId: "1:291837948193:web:6e7816ac0e7fda6ec58e60"
  }
};
