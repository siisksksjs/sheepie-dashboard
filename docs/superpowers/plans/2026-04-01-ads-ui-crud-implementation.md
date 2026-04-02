# Ads UI CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add dashboard CRUD UI for SKU ad setups, monthly spend rows, and sales targets using separate create/edit pages and row-level actions from `/ad-campaigns`.

**Architecture:** Extend the new SKU-level ads workspace with explicit action links and row controls, then add dedicated App Router pages for create/edit forms. Reuse the ads server-action layer for mutations so `/ad-campaigns` and `/reports` stay in sync via revalidation.

**Tech Stack:** Next.js App Router, TypeScript, server actions, existing UI primitives, existing ads reporting/action layer, Vitest contract tests.

---

## File Map

- Modify: `lib/actions/ad-campaigns.ts`
  - add update/delete mutations for setups, spend rows, and targets
- Modify: `components/ad-campaigns/ads-setup-workspace.tsx`
  - add add/edit/delete/pause/end controls wired to separate pages or actions
- Create: `components/ad-campaigns/setup-form.tsx`
- Create: `components/ad-campaigns/spend-form.tsx`
- Create: `components/ad-campaigns/target-form.tsx`
- Create: `app/(dashboard)/ad-campaigns/setup/new/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/setup/[id]/edit/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/spend/new/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/spend/[id]/edit/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/targets/new/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/targets/[id]/edit/page.tsx`
- Create or modify: `lib/ads/ads-ui-crud.test.ts`
  - cover route/form/workspace wiring and mutation surface

## Task 1: Add Mutation Actions For Setup, Spend, And Targets

**Files:**
- Modify: `lib/actions/ad-campaigns.ts`
- Create or modify: `lib/ads/ads-ui-crud.test.ts`

- [ ] Add `updateSkuAdSetup`, `deleteSkuAdSetup`, `pauseSkuAdSetup`, `endSkuAdSetup`
- [ ] Add `updateMonthlyAdSpend`, `deleteMonthlyAdSpend`
- [ ] Add `updateSkuSalesTarget`, `deleteSkuSalesTarget`
- [ ] Ensure all mutations return structured `{ success, data?, error? }`
- [ ] Ensure all mutations revalidate `/ad-campaigns` and `/reports`
- [ ] Add targeted tests for the new mutation surface
- [ ] Run: `npm test -- lib/ads/ads-ui-crud.test.ts`
- [ ] Run: `npx eslint lib/actions/ad-campaigns.ts lib/ads/ads-ui-crud.test.ts`

## Task 2: Add Reusable Form Components

**Files:**
- Create: `components/ad-campaigns/setup-form.tsx`
- Create: `components/ad-campaigns/spend-form.tsx`
- Create: `components/ad-campaigns/target-form.tsx`
- Create or modify: `lib/ads/ads-ui-crud.test.ts`

- [ ] Add setup form with required fields, back link, inline errors, create/edit mode
- [ ] Add spend form with required fields, month normalization, create/edit mode
- [ ] Add target form with required fields, effective window validation, create/edit mode
- [ ] Keep forms focused and redirect back to `/ad-campaigns` on success
- [ ] Add contract/render tests for the three forms
- [ ] Run: `npm test -- lib/ads/ads-ui-crud.test.ts`
- [ ] Run: `npm run typecheck`

## Task 3: Add Dedicated Create/Edit Pages

**Files:**
- Create: `app/(dashboard)/ad-campaigns/setup/new/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/setup/[id]/edit/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/spend/new/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/spend/[id]/edit/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/targets/new/page.tsx`
- Create: `app/(dashboard)/ad-campaigns/targets/[id]/edit/page.tsx`
- Create or modify: `lib/ads/ads-ui-crud.test.ts`

- [ ] Wire each page to the correct form
- [ ] Load initial record data for edit pages
- [ ] Return a safe not-found/error state if edit record is missing
- [ ] Add tests covering route/page wiring
- [ ] Run: `npm test -- lib/ads/ads-ui-crud.test.ts`
- [ ] Run: `npx eslint 'app/(dashboard)/ad-campaigns/setup/new/page.tsx' 'app/(dashboard)/ad-campaigns/setup/[id]/edit/page.tsx' 'app/(dashboard)/ad-campaigns/spend/new/page.tsx' 'app/(dashboard)/ad-campaigns/spend/[id]/edit/page.tsx' 'app/(dashboard)/ad-campaigns/targets/new/page.tsx' 'app/(dashboard)/ad-campaigns/targets/[id]/edit/page.tsx'`

## Task 4: Add CRUD Controls To The Workspace

**Files:**
- Modify: `components/ad-campaigns/ads-setup-workspace.tsx`
- Create or modify: `lib/ads/ads-ui-crud.test.ts`

- [ ] Add `Add Setup`, `Add Spend`, and `Add Target` buttons linking to the new pages
- [ ] Add row-level `Edit` actions for setups, spend rows, and targets
- [ ] Add row-level destructive actions with confirmation for setups, spend rows, and targets
- [ ] Add `Pause` and `End` actions for setup rows where relevant
- [ ] Keep legacy campaigns secondary
- [ ] Add tests covering workspace CRUD navigation/actions
- [ ] Run: `npm test -- lib/ads/ads-ui-crud.test.ts`
- [ ] Run: `npm run typecheck`

## Task 5: Final Verification

**Files:**
- No new feature files expected

- [ ] Run: `npm test -- lib/ads/schema-contracts.test.ts lib/ads/reporting.test.ts lib/ads/workspace-contract.test.ts lib/ads/workspace-ui.test.ts lib/ads/reports-contract.test.ts lib/ads/ads-ui-crud.test.ts`
- [ ] Run: `npm run typecheck`
- [ ] Run: `npm run build`
- [ ] Manual smoke test:
  - create setup
  - edit setup
  - pause/end setup
  - delete setup
  - create/edit/delete spend row
  - create/edit/delete target
  - confirm `/ad-campaigns` and `/reports` reflect changes
