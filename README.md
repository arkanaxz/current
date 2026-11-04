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

The first account is the Admin owner. The Admin can create viewer accounts in Settings. Viewers can inspect shared household bills, saved AI reviews, and add comments, but cannot edit readings or access Admin Settings. Passwords are salted and hashed with Node's scrypt; session tokens are random, stored as hashes in the database, and held in HttpOnly cookies. Dashboard API routes require an active session. Account recovery is not included.

## AI bill review

Choose OpenAI, Google Gemini, or Anthropic in Admin Settings; after entering your API key, the app loads the text models available to that key and selects one for you. The key is encrypted in the database with AES-GCM using CURRENT_DATA_ENCRYPTION_KEY (recommended) or TURSO_AUTH_TOKEN. Keep the encryption secret stable; changing it makes the saved provider key unreadable. Enable automatic analysis only after accepting the data-sharing notice. Each Admin entry/update can then create a saved review; manual review is also available. Up to 24 bills (including notes), 60 AC readings, and 60 meter readings are sent to the selected provider. Web search is enabled for current tariff/news references where supported, and AI reviews are visible to signed-in viewers who may comment. The provider may charge for model and search use and processes data under its own terms. Set CURRENT_DATA_ENCRYPTION_KEY in Vercel and local .env.local to a long random secret for key encryption; if unset, the configured Turso token is used.





## In-progress billing cycles and Mac access

You can add a partial billing-cycle entry before the utility bill arrives. By default the cycle runs from the 16th through the next 16th. Enter usage and any known charge lines so far, then open the row and edit the same entry when more values arrive. The Admin can trigger a saved AI review or enable automatic reviews in Settings. Estimates for current-cycle usage and future charge lines are labelled as estimates and should be checked against the final utility bill.

The deployed Vercel website works in current browsers on Windows and Mac. Open the same Vercel project URL on your Mac and sign in with the same account; both devices use the shared Turso database. Use the Admin-created viewer credentials for read-and-comment access.


AC reading entries offer Home Office, Living Room, and Masters Bedroom. Each reading can include total operating hours; the AC summary shows Home Office consumption and the requested first-floor and second-floor totals.
