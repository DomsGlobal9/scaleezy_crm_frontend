# ScaleEzy CRM — web app

The CRM screens. Vite + React, the same skin and shared pieces as Inventory's app.

```bash
cp .env.example .env
npm install
npm run dev              # http://localhost:5176
```

Screens so far: **Customers** (`/customers`) — search, paging, a table on a wide screen and cards on a phone.

There is no sign-in page: CRM reads the cookie Inventory's sign-in sets. Somebody who is not
signed in is sent to Inventory's login (`VITE_INVENTORY_URL`).

## Checks

```bash
npm run verify:ui        # drives the screen in a real browser (Edge) against the local service
```

Screenshots land in `scripts/screenshots/`.
