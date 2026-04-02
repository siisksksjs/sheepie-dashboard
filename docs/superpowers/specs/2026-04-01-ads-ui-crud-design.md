# Ads UI CRUD Design

Date: 2026-04-01
Repo: `dashboard-sheepie`
Status: Approved for implementation

## Objective

Add proper dashboard CRUD for the new SKU-level ads system so operators can manage:

- ad setups
- monthly ad spend rows
- SKU sales targets

from dedicated dashboard pages rather than entering data directly in Supabase.

## Current State

The new ads reporting backend already exists:

- `sku_ad_setups`
- `monthly_ad_spend`
- `sku_sales_targets`
- `Monthly Ads Report` bundle and workspace

Current limitation:

- `/ad-campaigns` is read-first only
- operators cannot create, edit, or delete the new records from the dashboard
- `/ad-campaigns/new` still creates the old legacy campaign model only

## Decision

Use separate CRUD pages, not inline modals.

The new primary routes:

- `/ad-campaigns/setup/new`
- `/ad-campaigns/setup/[id]/edit`
- `/ad-campaigns/spend/new`
- `/ad-campaigns/spend/[id]/edit`
- `/ad-campaigns/targets/new`
- `/ad-campaigns/targets/[id]/edit`

Deletion should happen from `/ad-campaigns` list sections with explicit confirmation.

## Navigation Model

`/ad-campaigns` remains the control center.

It should show:

- `Ad Setup`
- `Monthly Spend`
- `Sales Targets`
- `Monthly Ads Report`
- `Legacy Campaigns`

Each of the first three sections should expose primary actions:

- `Add Setup`
- `Add Spend`
- `Add Target`

Each row should expose row actions:

- `Edit`
- `Delete`
- `Pause` / `End` for setup rows when applicable

Legacy campaigns remain secondary and visually separated.

## CRUD Scope

### Ad Setup

Create/edit fields:

- `sku`
- `channel`
- `objective`
- `daily_budget_cap`
- `start_date`
- `end_date`
- `status`
- `notes`

Row actions:

- create
- edit
- pause
- end
- delete

Rules:

- form must prevent empty required fields
- `end_date` cannot be earlier than `start_date`
- delete must require confirmation

### Monthly Spend

Create/edit fields:

- `month`
- `sku`
- `channel`
- `actual_spend`
- `notes`

Row actions:

- create
- edit
- delete

Rules:

- month must normalize to first day of month
- `actual_spend` must be non-negative
- editing an existing `month + sku + channel` row should update the existing record, not duplicate it

### Sales Targets

Create/edit fields:

- `sku`
- `daily_target_units`
- `effective_from`
- `effective_to`
- `notes`

Row actions:

- create
- edit
- delete

Rules:

- `effective_to` cannot be earlier than `effective_from`
- overlap protection remains enforced by the database

## UX Direction

### `/ad-campaigns`

Keep it read-first and operational:

- section tables show current rows
- section headers include add buttons
- row actions are light and direct
- destructive actions require confirm UI

### Separate Form Pages

Each form page should:

- keep the layout simple and focused
- include a back link to `/ad-campaigns`
- clearly show whether the user is creating or editing
- submit through server actions
- redirect back to `/ad-campaigns` on success
- show inline error message on failure

## Server Actions

The existing ads action layer should be extended with:

- update/delete actions for setups
- update/delete actions for monthly spend rows
- update/delete actions for sales targets

Existing create/read actions should be reused where possible.

All new mutations should:

- return structured `{ success, data?, error? }`
- revalidate `/ad-campaigns`
- revalidate `/reports` if reporting-visible data changes

## Non-Goals

Out of scope for this slice:

- bulk import for ads setup/spend/targets
- finance linkage UI for monthly spend
- legacy campaign editor redesign
- marketplace attribution imports

## Success Criteria

The feature is successful when:

- operators can fully CRUD setups, spend rows, and targets from the dashboard
- the dedicated pages are the source of creation/editing for the new ads system
- `/ad-campaigns` remains the central operational view
- reports continue to reflect the updated records without manual refresh hacks
