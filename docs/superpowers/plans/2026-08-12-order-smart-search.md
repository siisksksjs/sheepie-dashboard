# Order Smart Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add instant product-name and exact financial-amount search to the latest 100 Orders so matching orders can be duplicated quickly.

**Architecture:** Put query parsing and order matching in a pure `lib/orders/search.ts` helper. Keep query state in `OrdersListClient`, derive one filtered array, and render it through both mobile and desktop layouts without changing the existing duplication action.

**Tech Stack:** React, TypeScript, Next.js, Vitest

---

### Task 1: Build and test the search matcher

**Files:**
- Create: `lib/orders/search.ts`
- Create: `lib/orders/search.test.ts`

- [ ] **Step 1: Write failing tests**

Cover empty input, case-insensitive partial product names, and exact numeric matches using `Rp500.000`, `500.000`, and `500000`. Confirm a nearby amount does not match.

- [ ] **Step 2: Verify tests fail**

Run `npm test -- lib/orders/search.test.ts`; expect failure because the helper does not exist.

- [ ] **Step 3: Implement the pure matcher**

Export `filterOrdersForSearch(orders, query)`. Treat an input made only of an optional `Rp` prefix, digits, dots, commas, and spaces as an amount; normalize it to integer Rupiah and compare it exactly with rounded GMV, Revenue, and Profit. Otherwise search normalized product names.

- [ ] **Step 4: Verify matcher tests pass**

Run `npm test -- lib/orders/search.test.ts`; expect all search tests to pass.

### Task 2: Add the Orders search interface

**Files:**
- Modify: `components/orders/orders-list-client.tsx`
- Create: `lib/orders/search-ui-contract.test.ts`

- [ ] **Step 1: Write a failing UI contract test**

Assert the component renders a Search input, derives `filteredOrders`, maps both layouts from that array, reports result count, and includes a Clear Search no-results action.

- [ ] **Step 2: Verify the UI contract fails**

Run `npm test -- lib/orders/search-ui-contract.test.ts`; expect failure before the UI is added.

- [ ] **Step 3: Implement the UI**

Add a search icon and input above the lists, filter immediately as the user types, show a concise matching-order count, render both layouts from `filteredOrders`, and show an empty result card with Clear Search when needed.

- [ ] **Step 4: Verify UI and search tests**

Run `npm test -- lib/orders/search.test.ts lib/orders/search-ui-contract.test.ts`; expect all tests to pass.

### Task 3: Verify

**Files:**
- Verify only

- [ ] **Step 1: Run typecheck and touched-file lint**

Run `npm run typecheck` and ESLint on the changed source files; expect no errors.

- [ ] **Step 2: Run the full test suite**

Run `npm test`; expect all tests to pass.

- [ ] **Step 3: Inspect final diff**

Run `git diff --check` and confirm unrelated inventory changes remain untouched.
