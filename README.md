# Kyabiz — Smart Retail Business Manager

A Google Sheets + Apps Script business management system: POS, inventory (movement-based ledger), purchasing, customers/CRM, suppliers, expenses, dashboards, reports, alerts, audit logging, and role-based permissions.

This package is a **working core system**, not a mockup — every button in the frontend calls a real Apps Script action that reads/writes real Sheets data with locking and validation. It deliberately does not implement *every* item in a full ERP wishlist (see "What's not built yet" below) — building all of it as untested code in one pass would produce something that looks complete but isn't trustworthy. What's here is meant to run correctly today and extend cleanly.

## Folder structure
```
/apps-script/        Paste each file into the Apps Script editor (see SETUP_GUIDE.md Step 5)
  Config.gs           Sheet names, column schemas, roles, permission matrix
  Utils.gs             Sheet I/O helpers, ID generation, locking helper
  Auth.gs               Login, sessions, permission checks
  Audit.gs               Audit log writer/reader
  Alerts.gs                Low-stock / anomaly rules, alerts center
  Products.gs                Product CRUD
  Inventory.gs                 Movement-based stock ledger (the core integrity mechanism)
  Sales.gs                       POS sale completion, cancellation, returns
  Purchases.gs                    PO creation, partial receiving, supplier payments
  Customers.gs                      CRM, statements, credit
  Suppliers.gs                       Supplier records, payables
  Expenses.gs                          Expense recording
  Reports.gs                             Dashboard aggregation + report center
  API.gs                                   doGet/doPost router — single entry point
  Setup.gs                                  One-click sheet + owner-account provisioning

/frontend/
  index.html          App shell (login + sidebar/topbar/main layout)
  css/styles.css       Full design system (see below)
  js/api.js             Backend client (fetch wrapper, token handling)
  js/auth.js              Login/session/permission mirroring
  js/utils.js               Formatting, toasts, modal helpers
  js/dashboard.js             Executive dashboard
  js/pos.js                     Point of Sale (cart, checkout, receipt, print)
  js/inventory.js                 Product list, create, stock adjustment
  js/app.js                         Router + Sales/Purchases/Customers/Suppliers/Expenses/Reports/Alerts views

SETUP_GUIDE.md        Full beginner walkthrough: create sheet -> deploy -> test
README.md             This file — architecture, schema, rationale, roadmap
```

## Architecture at a glance
```
Browser (HTML/CSS/JS)
   |  fetch() POST { action, token, payload }
   v
Apps Script Web App  (API.gs: doPost)
   |  requireSession() -> requirePermission()
   v
Module handler (Sales.gs / Inventory.gs / ...)
   |  withLock() for anything touching stock or money
   v
Google Sheets (via Utils.gs readAll/appendRow/updateRow)
   |
   v
Response { success, data, error }  -> UI updates
```

### Example: completing a sale
```
Cashier taps "Charge" -> Complete Sale
  -> frontend Api.call('completeSale', {...})
  -> API.gs doPost -> requireSession -> requirePermission('sales.create')
  -> Sales.completeSale() acquires LockService.getScriptLock()
      -> validate every line item against live Products data
      -> compute subtotal/discount/tax/total
      -> write Sales row (status COMPLETED)
      -> for each item: write SaleItems row, call applyStockMovement()
           -> Inventory.gs reads current stock, refuses if insufficient,
              writes new Products.CurrentStock, writes InventoryLedger row,
              checks reorder point -> Alerts.gs raises alert if needed
      -> write Payments row
      -> update Customers.Balance if credit/partial
      -> Audit.gs logs SALE_COMPLETED
  -> lock released, response returned
  -> frontend clears cart, shows printable receipt
```

## Why Google Sheets, and where it stops being a good idea
Sheets is workable as a lightweight transactional store for a single-location SMB doing up to a few hundred transactions/day. It is genuinely **not** a relational database:
- No foreign keys or constraints — referential integrity (e.g. a SaleItem pointing at a real Product) is enforced entirely by application code in `Sales.gs`/`Products.gs`, not by the storage layer.
- No true multi-statement transactions/rollback. Our mitigation: validate everything *before* any write, hold a single lock across the whole operation, and write in a fixed safe order (see the comment block at the top of `Sales.gs`). A failure after the first write is rare (quota/runtime errors, not business-logic errors) and leaves an inspectable trail rather than silent corruption — but it is not a database-guaranteed rollback, and you should know that going in.
- Apps Script execution caps out at 6 minutes per invocation and has daily quotas on script runtime, email, and URL fetches — fine for interactive POS use, not for heavy batch analytics over tens of thousands of rows.
- Read/write is fundamentally row-scanning, not indexed. `readAll()` loads a whole sheet into memory each call. This is fine into the low tens of thousands of rows per sheet; beyond that, list/report actions will visibly slow down.

**Concurrency (the "two cashiers, last unit" problem):** solved with `LockService.getScriptLock()` wrapped around the entire validate-and-write sequence in `completeSale()`, `adjustStock()`, `receivePurchase()`, etc. (`Utils.gs withLock()`). This serializes competing transactions script-side: whoever's request enters the lock first fully completes (including the stock deduction) before the second request is even allowed to read current stock. The second cashier's sale then correctly sees the reduced stock and fails cleanly with "Insufficient stock" instead of both succeeding against a stale read.

**When to migrate off Sheets:** once you're consistently above ~50-100 transactions/day across multiple locations, need real reporting speed over years of history, or need real concurrent-user scale, move to Postgres/MySQL behind a small REST API. Because the frontend only ever calls `Api.call('actionName', payload)` and never touches Sheets directly, that migration means rewriting the *inside* of the `.gs` handlers (or replacing them with an equivalent Node/Python API) without touching `frontend/` at all.

## Database schema
See `apps-script/Config.gs` → `SCHEMA` for the authoritative column list per sheet (17 sheets). Key relationships:
- `SaleItems.SaleID` → `Sales.SaleID`; `SaleItems.ProductID` → `Products.ProductID`
- `InventoryLedger.ProductID` → `Products.ProductID`; every stock change is one ledger row (never an overwrite)
- `PurchaseItems.PurchaseID` → `Purchases.PurchaseID`; `Purchases.SupplierID` → `Suppliers.SupplierID`
- `Payments.RefType/RefID` → polymorphic reference to `Sales`, `Purchases`, or `Customers`
- All IDs are generated sequential strings (`PROD-000001`, `SALE-000001`, ...) via `Utils.gs nextId()`, backed by `PropertiesService` counters — never a spreadsheet row number.

## Roles & permissions
OWNER, MANAGER, CASHIER, STOREKEEPER, ACCOUNTANT — the full matrix is `PERMISSIONS` in `Config.gs`, enforced by `requirePermission()` inside every handler, not just hidden in the UI (`Auth.can()` in the frontend is a UX convenience only).

## Design system rationale
- **Typography:** Inter for all UI text/labels (excellent legibility at small sizes, strong on Android/mobile), IBM Plex Mono for every money/KPI figure (tabular numerals — digits align in tables/receipts, and it visually separates "data" from "labels" without color).
- **Color:** deep navy (`#1B2A4A`) as primary — signals an established, serious business tool rather than a startup SaaS product; muted teal (`#0E7C7B`) as the single accent color for primary actions, kept to one accent so it stays meaningful; semantic colors (success/warning/danger/info) are desaturated, not neon, and used only for status, never decoration. No gradients, no glassmorphism, no drop-shadows beyond a 1-2px hint — this is deliberate: those patterns read as "generic AI dashboard" per the brief, and a POS a cashier stares at for 8 hours a day should be calm, not stimulating.
- **Layout:** sidebar+topbar on desktop, bottom-nav+collapsible sidebar on mobile — tables become horizontally scrollable rather than being crushed into unreadable cards, since retail staff frequently need to scan a full row (SKU, stock, price) at a glance.

## What's built vs. what's next (be honest about scope)
**Built and working end-to-end:** auth/roles, product CRUD, movement-based inventory ledger with locking, full POS sale flow (validation → stock deduction → payment → receipt → alerts), sale cancellation, customer returns, purchase orders with partial receiving, supplier payments, customer CRM with statements/credit, expenses, an aggregated dashboard with real insights, a 4-report Reports Center, rule-based alerts (low stock, large discount, large adjustment), and audit logging on all sensitive actions.

**Stubbed or intentionally simplified — extend before heavy production use:**
- Stocktaking has a working backend (`submitStockCount`) but no dedicated count-sheet UI yet — wire a form to it.
- ABC analysis, stockout-day forecasting, and full dead-stock UI: `getDeadStock()` exists server-side; expose it as a Reports tab.
- CSV/PDF export: reports render as HTML tables today; add a "Download CSV" button using `Array.join(',')` client-side, or Apps Script's `Utilities` for PDF generation of receipts specifically (the printable receipt already uses `window.print()`, which every browser can also "Save as PDF" from).
- Email/WhatsApp notifications: the `Alerts` sheet is the extensible foundation — add a time-driven Apps Script trigger calling `MailApp.sendEmail()` over open HIGH-severity alerts.
- Barcode camera scanning: POS currently supports keyboard-wedge/USB scanners (Enter-triggered exact match) and manual search; a camera-based scanner needs a JS library like `html5-qrcode` added to `index.html`.

## Development phases delivered
Phase 1 (architecture/schema) → Phase 2 (auth/users) → Phase 3 (products) → Phase 4 (inventory ledger) → Phase 5 (POS/sales) → Phase 6 (purchasing/suppliers) → Phase 7 (customers/credit) → Phase 8 (expenses/payments) → Phase 9 (dashboard/reports) → Phase 10 (audit/security) → Phase 11 (alerts) are implemented. Phases 12-15 (deeper BI, full responsive polish pass, formal test automation, production hardening) are the natural next increment — see "What's next" above for concrete starting points.
