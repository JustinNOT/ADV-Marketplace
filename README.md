# AdVehicles Marketplace — MVP

A minimal marketplace where **drivers** submit their car + route details and **clients** browse & filter by location and other attributes.

## Quick Start (Local)

1. **Install Node 18+** (verify with `node -v`).
2. In a terminal, install dependencies:
   ```bash
   npm install
   ```
3. Run the server (serves API + frontend):
   ```bash
   npm run dev
   ```
   Then open **http://localhost:5173**

> Data is stored in a simple JSON file at `data/drivers.json` (seeded with examples).

## Project Structure

```
advehicles_marketplace_mvp/
├── server.js
├── package.json
├── .gitignore
├── README.md
├── data/
│   └── drivers.json
└── public/
    ├── index.html        # Client-facing listings + filters
    ├── submit.html       # Driver submission form
    ├── css/
    │   └── styles.css
    └── js/
        ├── listings.js
        └── submit.js
```

## Deploying Quickly
- **Render / Railway / Fly.io**: create a Node service, set start command to `npm start`, ensure `PORT` env is provided (this app will respect it).
- **GitHub**: push to a repo, then connect your host of choice.

## Notes
- All fields are intentionally **rich** so you can trim later.
- Add HTTPS + DB (SQLite/Postgres) later when ready. For now, JSON storage keeps it simple.