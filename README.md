# Home Electricity Dashboard

A full-stack Next.js App Router app for reviewing household electricity bills, three LG ThinQ air conditioners, and home-meter readings.

## Run locally

1. Install Node.js 20.9 or newer.
2. Open this project folder in a terminal.
3. Run npm.cmd install in PowerShell (or npm install in Command Prompt).
4. Run npm.cmd run dev and open http://localhost:3000.
5. On first launch, create the account username and password. A new dashboard starts empty unless you import existing records or add bills manually.

Without Turso environment variables, the app uses data/electricity.sqlite. Set DATA_DIR in .env.local to store it elsewhere. The database is excluded from Git and contains your household data and account details.

## Hosting on Vercel with Turso

1. Create a Turso Cloud database and generate a database auth token.
2. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in the Vercel project environment variables for Production (and Preview if needed).
3. Deploy the app. On first request, it creates the required schema in Turso.
4. If you already created an account or recorded data in the local SQLite file, first set the Turso values in a local .env.local, then run npm.cmd run db:migrate:turso. This imports the existing account, bills, AC readings, and meter readings only if the Turso tables are empty. It never copies active login sessions; sign in again after switching databases.
5. If the remote database is empty and you skip the importer, the first user to visit the app can create an account and start entering records.

Keep the Turso auth token private. Never commit .env.local or the database token. The .env.example file contains placeholders only.

## App structure

- src/app: pages, app layout, browser tab icon, and route handlers.
- src/components: dashboard and account forms.
- src/lib: database access, password hashing, session handling, validation, and the empty starter-data template.
- scripts/migrate-local-to-turso.mjs: guarded, one-time local SQLite to Turso data import.
- data: local runtime SQLite database, created on first launch and excluded from Git.

## Login and data

The first account is the app owner. Passwords are salted and hashed with Node's scrypt; session tokens are random, stored as hashes in the database, and held in HttpOnly cookies. Dashboard API routes require an active session. This starter is intended for a single household owner and does not include account recovery or multi-user sharing.

## AI bill review

Choose OpenAI, Google Gemini, or Anthropic, enter the provider's model ID and API key, and confirm the data-sharing checkbox before requesting a review. The app sends up to 24 bill records (including notes), 60 AC readings, and 60 meter readings through its server to the chosen provider. It does not store the API key. The provider may charge for API use and processes submitted data under its own terms.



