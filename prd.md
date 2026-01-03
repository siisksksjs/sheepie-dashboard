# Product Requirements Document (PRD)

## Product Name

Internal Inventory & Order Management System (IOMS)

## Owner

Sheepie Ops Team (Founder-led)

## Problem Statement

Current inventory and order tracking relies on Notion tables that mix sales, revenue, and stock logic. This creates:

* Manual mental math to know real stock levels
* Risk of overselling or late restocking
* Duplicated logic per product
* No enforceable rules for bundles, returns, or adjustments

The system must move from *visual tracking* to *enforced operational truth*.

---

## Goals (What success looks like)

1. Know **real-time stock on hand** per SKU at any moment
2. Track **units sold** accurately (separate from revenue)
3. Support **offline, promo, affiliate, and non-revenue movements** cleanly
4. Reduce daily ops time and cognitive load
5. Be simple enough to maintain solo

## Non-Goals (Explicitly out of scope for v1)

* Customer-facing features
* Accounting / tax filing
* Marketplace auto-sync (Shopee/Tokopedia APIs)
* Forecasting or AI predictions
* Multi-warehouse support

---

## User Personas

### Primary User: Founder / Ops

* Reviews stock daily
* Imports orders manually (CSV)
* Decides restock timing
* Needs trustable numbers

### Secondary User: Ops Staff (future)

* Logs stock IN/OUT
* Cannot break system logic

---

## Core Concepts (System Principles)

1. **Ledger-first inventory**: Stock is computed, never typed
2. **Separation of concerns**:

   * Orders ≠ Inventory ≠ Costs
3. **Single source of truth** per concept
4. **Boring UI, strict logic**

---

## Functional Requirements

### 1. Product Master

**Purpose**: Single authoritative list of sellable items

Fields:

* SKU (unique, immutable)
* Product Name
* Variant (optional)
* Cost per Unit (COGS)
* Reorder Point (units)
* Is Bundle (boolean)
* Bundle Composition (if bundle)
* Status (Active / Discontinued)

Rules:

* SKU cannot be edited after creation
* No sales or stock quantities stored here

---

### 2. Inventory Ledger

**Purpose**: Track every stock movement

Fields:

* Entry ID
* Date
* SKU
* Movement Type:

  * IN (Purchase)
  * OUT (Sale)
  * OUT (Promo / Gift)
  * OUT (Damage / Loss)
  * RETURN
  * ADJUSTMENT
* Quantity (+ / - enforced by type)
* Reference (Order ID, note)
* Created By

Rules:

* All stock changes must create a ledger entry
* Current stock = SUM(quantity) per SKU
* Ledger entries are append-only (no delete, only adjustment)

---

### 3. Orders

**Purpose**: Commercial record of sales

Fields:

* Order ID
* Channel (Shopee / Tokopedia / TikTok / Offline)
* Order Date
* Status (Paid / Shipped / Cancelled / Returned)
* Line Items:

  * SKU
  * Quantity
  * Selling Price
* Channel Fees (optional)
* Notes

Rules:

* Creating a Paid order automatically creates ledger OUT entries
* Cancelling or Returning creates reversing ledger entries
* Orders never store stock levels

---

### 4. Bundles / Sets

**Purpose**: Support multi-SKU products

Logic:

* Bundle SKU maps to component SKUs
* Selling 1 bundle generates multiple OUT ledger entries
* Bundle stock availability = MIN(component stock / required qty)

---

### 5. Reporting & Dashboards

#### Inventory View

* Current stock per SKU
* Low stock alerts (below reorder point)

#### Sales View

* Units sold per SKU (time-filtered)
* Revenue per SKU / channel

#### Ops View

* Recent ledger activity
* Manual adjustments log

---

## Non-Functional Requirements

### Performance

* Must handle 50k+ ledger rows without degradation

### Reliability

* Daily automated database backup
* Manual CSV export available

### Security

* Auth required (email/password)
* Role-based access (Admin / Ops)

### Maintainability

* Clear schema
* No hidden magic or auto-corrections

---

## Tech Stack (v1)

* Frontend: Next.js
* Backend: Supabase (Postgres + Auth)
* Database: Postgres (ledger-based schema)
* Hosting: Vercel or equivalent
* AI: None in v1

---

## Data Migration Plan

1. Export historical sales from Notion
2. Normalize SKUs
3. Import as Orders + Ledger OUT entries
4. Manually input initial stock as Ledger IN

---

## Milestones

### Phase 1 – Foundation

* Product Master
* Inventory Ledger
* Manual ledger entry

### Phase 2 – Orders

* Order creation
* Auto ledger generation
* Reporting

### Phase 3 – Bundles & Alerts

* Bundle logic
* Low stock notifications

---

## Risks & Mitigations

| Risk               | Mitigation        |
| ------------------ | ----------------- |
| Scope creep        | Hard v1 cutoff    |
| Data inconsistency | Ledger-only stock |
| Overengineering    | No AI, no sync    |

---

## Success Metrics

* Zero manual stock math
* Zero overselling incidents
* <5 minutes daily ops review

---

## Open Questions

* Do we need multi-currency support?
* How often will historical data be archived?

---

## Appendix

**Guiding Principle**: If the system allows incorrect data, it is wrong by design.
