# Udhaar Notebook Digitizer

Digitize handwritten udhaar notebooks into a reviewed customer ledger and create polite payment reminders in English, Hindi or Kannada.

## Run

Requires Node.js 18+.

```bash
cd server
copy .env.example .env
npm install
npm start
```

In another terminal:

```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173. For a no-key demo, set `AI_PROVIDER=mock` in `server/.env`.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/scan` | Read an uploaded image without saving entries |
| POST | `/api/entries` | Save reviewed rows in one transaction |
| GET | `/api/ledger` | Return customers, entries and total owed |
| DELETE | `/api/entries/:id` | Delete one ledger entry |
| POST | `/api/reminder` | Generate a reminder in `en`, `hi` or `kn` |
| GET | `/api/usage` | Return scan count and demo price |

## Design decisions

The review step keeps AI output editable before it reaches the ledger. Balances are computed in SQL, the mock fallback keeps local demos usable, and keys remain server-side in `.env`. The interface uses a ledger-book visual language with a red margin accent, ink-blue text and accessible focus states.

## Next steps

Login, real UPI payments, scheduled reminders, image compression, name merging, more languages and Postgres support.
