# EV Cars Scheduler

A comprehensive monorepo solution for scheduling and managing shared Electric Vehicles within a residential society. The project includes a modern Admin Web Portal, a Resident Mobile App, and a robust Backend API with PostgreSQL database integrations.

## Architecture

This project is built using a **Turborepo** monorepo setup. The core technologies include:
- **Backend API & Admin Portal**: [Next.js](https://nextjs.org/) (App Router), React, TailwindCSS
- **Mobile App**: [Expo](https://expo.dev/) (React Native Web, iOS, Android)
- **Database ORM**: [Prisma](https://www.prisma.io/) connecting to Serverless PostgreSQL (e.g., Neon)
- **Validation Contracts**: [Zod](https://zod.dev/) for shared schema validation between frontend and backend
- **Package Manager**: [pnpm](https://pnpm.io/)

### Monorepo Structure
```
apps/
  ├─ api/       (Next.js App: Includes the core API routes + Admin web interface)
  └─ mobile/    (Expo App: The cross-platform mobile app for residents)
packages/
  ├─ contracts/ (Zod schemas and shared TS types)
  └─ db/        (Prisma schema, migrations, seeds, and database client)
```

## Prerequisites

- **Node.js**: v18 or later
- **pnpm**: v8 or later (`npm install -g pnpm`)
- **PostgreSQL Database**: A running instance (e.g., local Postgres or a cloud provider like Neon)

## Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/AtharvaSamant4/ev_cars_scheduler.git
   cd ev_cars_scheduler
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Configure Environment Variables:**
   You will need to set up your `.env` files.
   - At the root of the project, create a `.env` file (you can copy `.env.example` if it exists):
     ```env
     # Required for Prisma
     DATABASE_URL="postgres://user:pass@host/dbname?pgbouncer=true"
     DIRECT_URL="postgres://user:pass@host/dbname"
     JWT_SECRET="your-super-secret-jwt-key"
     ```
   - In `apps/mobile/`, create a `.env` file for the Expo app:
     ```env
     # This tells the mobile app where to find your locally running API
     EXPO_PUBLIC_API_URL="http://localhost:3000/api/v1"
     ```

4. **Initialize the Database:**
   Deploy the database schema and populate it with sample data (50 flats, 5 EVs, Admin/Resident accounts).
   ```bash
   pnpm db:generate
   pnpm db:push   # OR pnpm db:migrate
   pnpm db:seed
   ```

## Running the Application Locally

You can run the different apps individually or simultaneously using Turborepo scripts.

### Start the Next.js API & Admin Portal
```bash
pnpm dev
```
- Admin Portal: `http://localhost:3000/admin`
- Backend API endpoints: `http://localhost:3000/api/v1/*`

### Start the Expo Mobile App (Residents)
In a new terminal window, start the Expo bundler:
```bash
pnpm mobile:start
```
- Press `w` to run the mobile app in your web browser.
- Press `i` to run it in an iOS Simulator.
- Press `a` to run it in an Android Emulator.

> **Note on Mobile LAN Testing:** To test the mobile app on a physical device over your local network, ensure the `EXPO_PUBLIC_API_URL` points to your computer's local IP address (e.g., `http://192.168.1.10:3000/api/v1`) rather than `localhost`.

## Demo Accounts

If you ran the database seeder (`pnpm db:seed`), the following test credentials are created automatically:

**Admin Portal (`http://localhost:3000/admin/login`):**
- **Email:** `admin@greenmeadows.demo`
- **Password:** `Admin@123`

**Resident App (Expo App Login):**
- **Flat Number:** `A101` (up to `A510`)
- **Password:** `Demo@123`

## Useful Commands

- `pnpm lint`: Run ESLint across all workspaces.
- `pnpm typecheck`: Run TypeScript compilation checks across all workspaces.
- `pnpm build`: Create production builds for Next.js.
- `pnpm test`: Run the Vitest test suites.
