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
│   │   ├── finance/         # Cash flow and account tracking
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

- Dedicated `Restock` tab for supplier orders, arrival confirmation, and learned lead-time tracking
- Ledger-first stock handling: restocks increase stock only when marked `arrived`
- Finance cash-out tracking on supplier `order_date`
- Dashboard restock guidance that learns lead time from recent completed shipments

### Phase 1 (Current)
- ✅ Product Master (SKU, name, variant, cost, reorder point)
- ✅ Inventory Ledger (append-only, computed stock)
- ✅ Stock on Hand view (real-time computed from ledger)
- ✅ Authentication & authorization

### Phase 2 (Planned)
- Orders CRUD (Paid/Cancelled/Returned)
- Auto-generate ledger entries from orders
- Sales reporting

### Phase 3 (Planned)
- Bundle composition management
- Bundle stock availability
- Low stock alerts

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
- `orders` - Order records (Phase 2)
- `order_line_items` - Order details (Phase 2)
- `bundle_compositions` - Bundle definitions (Phase 3)

## Scripts

- `npm run dev` - Start development server (port 3001)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking

## License

Private - Internal use only
