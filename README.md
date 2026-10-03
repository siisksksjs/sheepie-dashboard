# Sheepie IOMS (Inventory & Order Management System)

Internal inventory and order management system for Sheepie brand.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **UI Components:** Radix UI primitives
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Supabase account and project

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Fill in your Supabase credentials in `.env`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-project-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

3. **Run database migrations:**

   In your Supabase SQL editor, run the migration file:
   ```
   supabase/migrations/20260103_initial_schema.sql
   ```

4. **Create a user account:**

   In Supabase Dashboard > Authentication > Users, create a new user with email/password.

5. **Run development server:**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3001](http://localhost:3001)

## Project Structure

```
dashboard-sheepie/
├── app/
│   ├── (dashboard)/         # Protected dashboard routes
│   │   ├── dashboard/       # Main dashboard
│   │   ├── products/        # Product management
│   │   ├── ledger/          # Inventory ledger
│   │   ├── orders/          # Order management
│   │   ├── reports/         # Sales, channel and product reporting
│   │   ├── kpi/             # Monthly sales targets and daily pace
│   │   ├── bio-analytics/   # Traffic and behavior analytics
│   │   └── restock/         # Supplier replenishment workflow
│   ├── login/               # Login page
│   └── layout.tsx           # Root layout
├── components/
│   ├── layout/              # Layout components (Sidebar)
│   └── ui/                  # Reusable UI components
├── lib/
│   ├── supabase/            # Supabase client utilities
│   └── utils.ts             # Utility functions
└── supabase/
    └── migrations/          # Database migrations
```

## Features

- Today overview with hourly orders, product photos, monthly goals, per-product KPI progress and low-stock guidance
- Quick log of usual orders with review, platform filters, favorites and 10-second undo
- Photo-based product catalog and accessible platform logos and names
- Inventory Ledger with search, movement filters and a reviewed KOL sample workflow
- Restock tracking, arrival confirmation and learned lead-time guidance
- Sales reports, monthly KPI targets and bio traffic/behavior analytics
- Customer returns distinguish resaleable goods from defective dead stock

### Return stock handling

Paid and shipped orders have already deducted inventory. An intact cancellation or
checked resaleable return restores physical units. A defective return records a
RETURN and matching OUT_DAMAGE in one transaction: saleable stock stays unchanged.
Dead stock cannot be reopened as a sale or restored as resaleable stock. Existing
restored returns can be written off explicitly; legacy orders without a restoration
record require ledger review instead of an automatic deduction.

Order status and inventory movements commit together. The order row is locked, stale
requests are rejected, and identical retries do not create duplicate movements.

### Required migrations

Apply migrations before deploying the UI. In addition to the earlier catalog and
analytics migrations, this refresh requires:

- `supabase/migrations/20261002_add_listing_images.sql`: product pack photos and the listing-images upload bucket
- `supabase/migrations/20261003050501_order_return_disposition.sql`: return condition, defect note and atomic status/inventory handling

### Return integration tests

`TEST_ORDER_DATABASE_URL` must point to an empty, disposable PostgreSQL database with
permission to create roles and schemas. Run
`npx vitest run lib/orders/return-status.postgres.test.ts` to check packed products,
bundle components, dead stock, resaleable returns, retries, concurrent requests,
transaction rollback and authenticated execution. The suite refuses to run against
an existing orders table. Never use the live database for this test.

## Design System

Matching the main Sheepie website (sheepiesleep.com):
- **Primary:** #213368 (navy blue)
- **Secondary:** #a2c1e0 (light blue)
- **Fonts:** Playfair Display (headings), Quicksand (body)
- **Border radius:** Rounded (1rem)

## Database Schema

### Ledger-First Architecture
- **Stock is computed**, never manually edited
- All inventory movements tracked in append-only ledger
- SKU is immutable (enforced at DB level)
- Ledger entries cannot be deleted (use ADJUSTMENT to fix errors)

### Core Tables
- `products` - Product master data
- `inventory_ledger` - All inventory movements
- `stock_on_hand` - Computed view (SUM of ledger quantities)
- `orders` - Orders and return stock conditions
- `order_line_items` - Pack quantities, prices and cost snapshots
- `bundle_compositions` - Physical component quantities for kits

## Scripts

- `npm run dev` - Start development server (port 3001)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking
- `npm run test:bio-integration` - Apply the bio analytics migration and run behavior tests against the dedicated PostgreSQL database in `TEST_DATABASE_URL`. The database must be empty and disposable, support `pg_cron`, and use a superuser-equivalent test connection with permission to create extensions and roles and to `SET ROLE`. The test cleans up its analytics objects and roles afterward.

## Bio Analytics

`/bio-analytics` combines two independent sources for the `sheepiesleep.com/bio` page.

- **PostHog** supplies traffic: visitors, page views, referrers, and the device,
  browser, OS, country, and region breakdowns.
- **Supabase** supplies behavior: sessions, engaged sessions, section and product views,
  scroll depth, outbound clicks, journeys, and the raw event stream.

The two are counted separately and always labeled. Outbound clicks are clicks toward a
marketplace — they are never reported as purchases or revenue.

### Configuration

Copy `.env.example` to `.env.local` and fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Shared Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anonymous key; reads run under the signed-in user's RLS policies |
| `POSTHOG_API_KEY` | PostHog **personal** API key with project read scope, sent as `Authorization: Bearer` |
| `POSTHOG_PROJECT_ID` | Numeric PostHog project id |
| `POSTHOG_HOST` | `https://us.posthog.com` or `https://eu.posthog.com` |

PostHog is queried **server-side only** through the Query API (`POST
/api/projects/:id/query/`) using HogQL. The personal API key has no `NEXT_PUBLIC_`
prefix, so importing the client module from a browser bundle simply reports the source
as `unconfigured`.

The site side collects the traffic with `posthog-js` on `/bio`, configured through
`NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in the `sheepie` repo. The
project API key there is public by design and can only write events.

### Caching

One dashboard load issues eight HogQL queries in a single `Promise.allSettled` batch,
and every response is cached for **five minutes** via `next.revalidate`.

### Degraded sources

Each source reports `healthy`, `unavailable`, or `unconfigured` independently:

- Missing `POSTHOG_API_KEY` or `POSTHOG_PROJECT_ID` → `unconfigured`; a banner explains
  the setup and all Supabase panels stay fully usable.
- A failing PostHog query → `unavailable`; the successful panels still render, the failed
  ones show an empty state, and the banner lists which queries failed.
- A failing event-detail query degrades only the event table; the aggregate RPCs failing
  raises a single opaque dashboard error rather than leaking database messages.

"No matching events" and "data source unavailable" are always shown as distinct states.

### Retention

Raw events are retained for 13 months. `delete_expired_bio_events(retain_months)` performs
the deletion and is safe to invoke repeatedly.

## License

Private - Internal use only
