# ScaleEzy CRM — web app

The CRM screens. Vite + React, the same skin and shared pieces as Inventory's app.

```bash
cp .env.example .env
npm install
npm run dev              # http://localhost:5176
```

Screens so far:
- **Sign in** — the same email and password as Scaleezy Inventory. The CRM service passes them to
  Inventory, which decides; CRM keeps no passwords and holds no secret. One email in two shops asks
  which shop to open. **Sign out** is in the top bar.
- **Today** (`/today`, the landing page) — follow-ups due (mine or everyone's), birthdays and
  anniversaries this week, regulars not seen lately. The Today tab carries a badge with what is due.
- **Customers** (`/customers`) — search, paging, a table on a wide screen and cards on a phone.
- **Customer page** (`/customers/:id`) — profile, numbers, what they buy, the timeline, and a card for
  follow-ups (drawn as garment swing tags: the hole is the done button) and notes.
- **Duplicates** (`/duplicates`, owner and admin) — two records side by side; merge, different people, undo.

`VITE_INVENTORY_URL` is only for the "Open in Inventory" button.

## Checks

```bash
npm run verify:ui                 # Customers, in Edge, against the local service
npm run verify:customer-page-ui   # the customer page and timeline
npm run verify:signin-ui          # signing in and out, one email in two shops, Inventory unreachable
npm run verify:shops-ui           # a new shop's first visit: "bringing your customers over", then the list
npm run verify:work-ui            # follow-ups, notes, Today, duplicates, at laptop and phone width
```

Screenshots land in `scripts/screenshots/`.
