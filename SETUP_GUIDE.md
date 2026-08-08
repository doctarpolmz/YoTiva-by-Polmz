# Kyabiz — Setup, Deployment & Testing Guide

## What you're deploying
- **Database:** one Google Sheet (created for you by a setup script — you don't hand-type 20 tabs)
- **Backend/API:** a Google Apps Script project bound to that Sheet, deployed as a Web App
- **Frontend:** static HTML/CSS/JS you can host anywhere (GitHub Pages, Google Sites, Drive, or even open the HTML file locally for testing)

---

## STEP 1 — Create the Google Sheet
1. Go to sheets.google.com → **Blank spreadsheet**.
2. Rename it (top-left) to something like **"Kyabiz Business Data"**.
3. Leave it open — you'll attach Apps Script to it next.

## STEP 2–3 — Sheets and headers (automated)
You do **not** need to manually create 20+ tabs and type every column header — `Setup.gs` does this for you in one click (Step 6 below explains exactly what it creates: every sheet listed in `Config.gs`'s `SCHEMA` object, with the exact headers, frozen header row, and styled header background).

If you ever want to see the schema without running code, open `apps-script/Config.gs` — the `SCHEMA` object is the full column reference for all 17 sheets (name, order, and by extension type — e.g. `CurrentStock` is numeric, `DateTime` is ISO datetime string, IDs are text like `PROD-000001`).

## STEP 4 — Create the Apps Script project
1. In your Sheet: **Extensions → Apps Script**. This opens the script editor already bound to your spreadsheet (important — it's what lets `SpreadsheetApp.getActiveSpreadsheet()` in Setup.gs find the right file).
2. Delete the default empty `Code.gs` file's contents (you'll replace it with our files).

## STEP 5 — Where every .gs file goes
In the Apps Script editor, click the **+** next to "Files" and add a new **Script** file for each of these (name them exactly, without `.gs` — Apps Script adds the extension):

```
Config
Utils
Auth
Audit
Alerts
Products
Inventory
Sales
Purchases
Customers
Suppliers
Expenses
Reports
API
Setup
```

## STEP 6 — Paste the code
Open each file in `/apps-script/` in this package and paste its full contents into the matching file in the Apps Script editor. Save (Ctrl/Cmd+S) after each.

Before running anything, open `Setup.gs` and edit these three lines at the top to your real owner login:
```js
const OWNER_EMAIL = 'owner@example.com';
const OWNER_NAME = 'Business Owner';
const OWNER_PASSWORD = 'ChangeMe123!';
```

Then, in the Apps Script toolbar, select the function dropdown → **`runInitialSetup`** → click **Run**. The first run will ask you to authorize the script (it needs permission to edit the spreadsheet) — click through **Advanced → Go to (project name) → Allow**. When it finishes, a dialog confirms all sheets were created and shows your owner login. **Change that password after your first real login** by adding a "change password" flow, or by re-running `seedOwner_()` with a new password.

## STEP 7 — How the frontend talks to Apps Script
The frontend never touches the Sheet directly. Every action (`login`, `completeSale`, `listProducts`, etc.) is a single `fetch()` POST to your deployed Web App URL, with a JSON body `{ action, token, payload }`. This is implemented once, in `frontend/js/api.js` — every other frontend file calls `Api.call('actionName', {...})` and gets a Promise back.

## STEP 8 — How doGet/doPost work
`API.gs` has two entry points:
- `doGet` — returns a simple JSON status message. It exists so visiting the Web App URL in a browser confirms the backend is alive; it is not used for real data.
- `doPost` — the real API. It parses the JSON body, validates the session token (except for `login`, the one public action), routes to the right handler in `route_()`, and always returns the same JSON envelope: `{ success, data, error }`.

## STEP 9 — Deploy Apps Script as a Web App
1. In the Apps Script editor: **Deploy → New deployment**.
2. Click the gear icon next to "Select type" → **Web app**.
3. Description: "Kyabiz API v1".
4. **Execute as:** *Me* (your account) — this is what lets the script read/write the Sheet on behalf of every user, regardless of who's logged into the frontend.
5. **Who has access:** *Anyone* (see Step 11 for what this means and why it's safe here).
6. Click **Deploy**, authorize again if prompted.

## STEP 10 — Deployment options explained
- **Execute as "Me" vs "User accessing the app":** Choose **Me**. "User accessing" would require every cashier to have their own Google account with edit access to the Sheet — defeats the point of your own login system in `Auth.gs`.
- **Access "Anyone" vs "Anyone with Google account" vs "Only myself":** Since your app has its own email/password login layer (`Auth.gs`), and the Sheet itself is never exposed, "Anyone" just means "anyone can reach the URL" — they still can't do anything without a valid session token from `login`.
- **Versioning:** every time you edit `.gs` files, you must **Deploy → Manage deployments → Edit → New version** for changes to go live at the same URL. Editing the files alone does not update a live deployment.

## STEP 11 — Who should have access
- **To the Apps Script project / Sheet itself:** only you (the owner) and anyone you explicitly trust with spreadsheet edit rights. Nobody else should ever open the raw Sheet — that's exactly the "don't let users touch the spreadsheet" rule the whole app is built around.
- **To the Web App URL:** effectively public reachability is fine, because it's gated by `Auth.gs` logins, not by who can see the URL.
- **To user accounts inside the app:** create one login per staff member via `createUser` (Owner only), with the appropriate role (OWNER/MANAGER/CASHIER/STOREKEEPER/ACCOUNTANT).

## STEP 12–13 — Copy the URL into the frontend
After deploying, copy the **Web app URL** shown (ends in `/exec`). Open `frontend/js/api.js` and replace:
```js
const WEB_APP_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE';
```
with your real URL.

## STEP 14 — Test the connection
Open `frontend/index.html` in a browser (double-click it, or host the `frontend/` folder anywhere static). Log in with the owner email/password from Step 6. If the dashboard loads (even empty), the connection works. If you get "Connection problem," re-check the URL and that the deployment's access is not "Only myself."

## STEP 15 — Create a test product
Inventory → **+ New Product** → fill in Name, SKU, Unit, Cost Price, Selling Price, Opening Stock (e.g. 10) → Save. Check the Sheet: a new row appears in `Products`, and if you set an opening stock, a matching `OPENING_STOCK` row appears in `InventoryLedger`.

## STEP 16–17 — Perform a test sale, watch the Sheet change
Point of Sale → tap the product → Charge → choose Cash → Complete Sale. Then look at the Sheet:
- `Sales` gets one new row (status COMPLETED).
- `SaleItems` gets one row per product sold.
- `Products.CurrentStock` for that product decreases.
- `InventoryLedger` gets a `SALE` row showing PrevBalance → NewBalance.
- `Payments` gets a row for the amount received.

## STEP 18 — Test stock deduction
Sell the same product until stock hits your Reorder Point — check `Alerts` sheet: a `LOW_STOCK` (or `OUT_OF_STOCK`) row should appear automatically, and it shows in the app's Alerts Center.

## STEP 19 — Test purchase receiving
Suppliers → add a supplier. Then (via `createPurchaseOrder` / `receivePurchase` — wire a UI form to these two actions, or call them directly for testing) place an order and receive it; confirm stock increases and `InventoryLedger` logs a `PURCHASE` row.

## STEP 20 — Test customer credit
Add a customer. In POS, select that customer, choose "Credit" as payment method, set Amount Received to 0, complete sale. Check `Customers.Balance` increased by the sale total, and the sale's `BalanceDue` matches.

## STEP 21 — Test permissions
Create a CASHIER user (`createUser`, Owner only). Log in as that cashier — they should be able to sell but should get "You do not have permission..." errors if they try actions gated to `products.editPrice` or `users.manage` (test by calling those actions directly if no UI button is shown, since hidden buttons are a UX nicety, not the real boundary).

## STEP 22 — Test simultaneous transactions
Open the app in two browser tabs, log in as two different cashiers, and both add the *last unit* of a product to cart at the same time. Have both click "Complete Sale" as close together as possible. One should succeed; the other should get "Insufficient stock for X." This works because `completeSale()` runs inside `withLock()` (Apps Script `LockService.getScriptLock()`), which forces every sale to fully finish (or fail) before the next one starts reading stock — see the concurrency explanation in the chat reply for why this specific ordering matters.

## STEP 23 — Troubleshooting
| Symptom | Likely cause | Fix |
|---|---|---|
| "Connection problem" on login | Wrong/missing `WEB_APP_URL`, or deployment access set to "Only myself" | Re-check Step 12 and Step 9 access setting |
| "Session expired" immediately after login | Script cache issue or clock skew | Log in again; sessions last 8 hours via `CacheService` |
| Sale succeeds but stock doesn't move | You edited `Products` sheet columns manually, breaking `SCHEMA` order in `Config.gs` | Never reorder/rename columns by hand; only Setup.gs should define headers |
| "Missing sheet: X" error | A sheet was deleted or renamed | Re-run `runInitialSetup()` — it recreates any missing sheet without touching sheets that already have the correct name |
| Changes to .gs files don't show up | Forgot to create a new deployment version | Deploy → Manage deployments → Edit → New version |
| Two sales of the last unit both seem to succeed | You're testing against two *different* deployments/URLs | Confirm both browser tabs use the identical Web App URL |

---

## Security notes (Section 20)
- No API keys or secrets live in frontend code — only a session token obtained after a real login, which expires after 8 hours.
- Passwords are stored as salted SHA-256 hashes (`Auth.gs`), never plaintext.
- Every write-capable action re-checks the caller's role server-side (`requirePermission`) — a modified or spoofed frontend request still can't bypass this.
- **Known limitation:** Apps Script Web Apps deployed with "Anyone" access are reachable by anyone who has the URL; your real access control is entirely inside `Auth.gs`. If that file has a bug, there's no secondary network-level wall. For a business handling sensitive financial data at scale, a real backend (Node/Django) with proper OAuth and a hardened DB is the eventual upgrade path — see the migration notes in the chat reply.
- Google Sheets itself is not encrypted-at-rest beyond Google's standard account-level protections and has no row-level security — anyone with Editor access to the Sheet can see everything, which is why only trusted admins should ever have direct Sheet access (Step 11).

## Testing checklist
Login/logout · role permission denial · product create/edit/soft-delete · single & multi-item sale · insufficient-stock rejection · cash/credit/partial payment · return processing · purchase order + partial receiving · supplier payment · customer payment · expense recording · each report loads with data · low/out-of-stock alert fires · audit log entries appear for price change, stock adjustment, sale cancellation · concurrent last-unit sale (Step 22) · mobile viewport (≤ 400px) layout · desktop layout · deliberately broken request (e.g. missing field) shows a friendly, not raw, error message.
