# Black Orange Login Portal (React + Express + MySQL)

This project contains:
- `client`: React (Vite) login/signup portal (black and orange theme)
- `server`: Node.js + Express auth API with MySQL user storage

## 1) Free Database Recommendation

Use **TiDB Cloud Serverless** (free tier, MySQL-compatible protocol).

1. Create a free TiDB Serverless cluster.
2. Create a database.
3. Copy connection details into `server/.env`.
4. Run `server/schema.sql` once to create the `users` table.

If you already created the table before role support, run:

```bash
cd server
node scripts/migrate-role.js
node scripts/migrate-hierarchy-stores.js
```

## 2) Backend Setup (Express API)

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

Required envs in `server/.env`:

- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL`
- `JWT_SECRET`
- `CORS_ORIGIN`

## 3) Frontend Setup (React)

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

Required env in `client/.env`:

- `VITE_API_BASE_URL` (example: `http://localhost:4000`)

## 4) Netlify + API Hosting

Netlify is for frontend static hosting.

1. Deploy `client` folder to Netlify.
2. Set Netlify environment variable:
   - `VITE_API_BASE_URL=https://your-api-domain.com`
3. Deploy backend (`server`) on a Node host like Render or Railway.
4. In backend environment variables set:
   - DB values from TiDB
   - `JWT_SECRET`
   - `CORS_ORIGIN=https://your-netlify-site.netlify.app`

## 5) API Endpoints

- `POST /api/auth/signup`
  - body: `{ "name": "...", "email": "...", "password": "..." }`
  - creates Manager account only
- `POST /api/auth/login`
  - body: `{ "email": "...", "password": "..." }`

- `POST /api/employees` (Manager only)
  - body: `{ "name": "...", "email": "...", "password": "..." }`
- `GET /api/employees` (Manager only)

- `POST /api/stores` (Manager only)
  - body: `{ "name": "...", "officeNumber": "...", "phone": "...", "address": "..." }`
- `GET /api/stores` (Manager or Employee)

Both return:

```json
{
  "message": "...",
  "token": "...",
  "user": {
    "id": 1,
    "name": "...",
    "email": "...",
    "role": "Manager|Employee",
    "managerId": null
  }
}
```
