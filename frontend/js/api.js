/* api.js — single point of contact with the Apps Script backend.
   IMPORTANT: replace WEB_APP_URL with your deployed Web App URL (Step 12-13
   of the setup guide). Never put an API key or secret here — the backend
   authenticates via session token only, obtained from login(). */

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwt8tqNFc1QUkAxIW1nSa-C5TNbsTIRWa9RYP_JkQK5cUgnYtttmAY8mKT_yyTE0L0/exec';

const Api = {
  token: localStorage.getItem('kyabiz_token') || null,

  setToken: function (token) {
    this.token = token;
    if (token) localStorage.setItem('kyabiz_token', token);
    else localStorage.removeItem('kyabiz_token');
  },

  call: function (action, payload) {
    const body = { action: action, token: this.token, payload: payload || {} };
    return fetch(WEB_APP_URL, {
      method: 'POST',
      // text/plain avoids a CORS preflight against the Apps Script endpoint
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json.success) {
          if (json.error && json.error.message === 'Session expired. Please log in again.') {
            Auth.logout();
          }
          throw new Error(json.error ? json.error.message : 'Unknown error');
        }
        return json.data;
      });
  }
};
