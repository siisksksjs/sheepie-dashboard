# Ads Spend Reporting Design

Date: 2026-04-01
Repo: `dashboard-sheepie`
Status: Proposed

## Objective

Upgrade the existing ads workflow so the dashboard can report monthly sales and profitability per `SKU + channel`, while keeping the current ads module as the foundation.

The system must support:

- ad setup per `SKU + channel`
- daily budget cap planning
- month-end actual ad spend input
- monthly target tracking per SKU
- monthly reporting for:
  - units sold
  - revenue
  - profit before ads
  - ads spend
  - profit after ads
  - target achievement
  - `ads-active` vs `organic` channel split

## Current State

The existing ads module already provides:

- `ad_campaigns` table for campaign records
- `ad_spend_entries` table for spend logging
- spend linkage to Finance
- campaign-level reporting in the `Ad Campaigns` tab

Current limitations:

- campaigns are not tied to a SKU
- campaigns can target multiple channels through `target_channels[]`
- reporting attributes orders by `channel + campaign period`
- the system cannot produce reliable monthly profit-after-ads per SKU
- the system does not model daily budget caps or monthly actual spend by `SKU + channel`

Because of this, the current model over-attributes channel sales to campaigns and cannot distinguish examples like:

- `Lumi + Shopee` as ads-active
- `Lumi + Tokopedia` as organic

## Recommended Direction

Enhance the existing ads module instead of replacing it.

The new reporting model should be centered on:

- `SKU + channel` for setup
- `SKU + channel + month` for actual spend and reporting

The existing campaign system should be retained as legacy history and reused where practical, but the new SKU-level workflow should become the primary operational model.

## Core Concepts

### 1. Ads-Active Channel Sales

Sales for a given `SKU + channel` count as `ads-active` when there is an active ad setup overlapping the sales month.

Example:

- `Cervi + Tokopedia` with an active Tokopedia setup is `ads-active`
- `Cervi + Shopee` without a Shopee setup is `organic`

### 2. Organic Channel Sales

Sales for a given `SKU + channel` count as `organic` when there is no active ad setup for that `SKU + channel` in that month.

This is channel classification, not marketplace attribution.

### 3. Actual Spend vs Budget Cap

`daily_budget_cap` is planning data only.

It must not be treated as actual spend.

Monthly profitability must subtract `actual monthly spend`, not budget cap.

## Data Model

### Ad Setup

Primary operational configuration for paid activity.

Suggested fields:

- `id`
- `sku`
- `channel`
- `objective`
- `daily_budget_cap`
- `start_date`
- `end_date`
- `status`
- `notes`
- `created_at`
- `updated_at`

Rules:

- one setup row represents one `SKU + channel`
- one SKU can have multiple setups across different channels
- a setup may be paused or ended without deleting history
- a setup should not target multiple SKUs

### Monthly Ad Spend

Month-end actual spend input for operational reporting.

Suggested fields:

- `id`
- `month`
- `sku`
- `channel`
- `actual_spend`
- `notes`
- optional `finance_entry_id`
- `created_at`
- `updated_at`

Rules:

- one row per `month + sku + channel`
- this row stores the actual spend number entered at month end
- if no row exists, spend should be treated as missing rather than inferred

### SKU Sales Target

Target configuration for unit goals.

Suggested fields:

- `id`
- `sku`
- `daily_target_units`
- `effective_from`
- optional `effective_to`
- `notes`
- `created_at`
- `updated_at`

Rules:

- targets are SKU-level, not channel-level, in v1
- if targets change mid-year, a new effective row should be created

## Reporting Rules

### Channel-Level Monthly Report

For each `month + sku + channel`, calculate:

- `units_sold`
- `revenue`
- `profit_before_ads`
- `actual_ads_spent`
- `profit_after_ads = profit_before_ads - actual_ads_spent`
- `classification = ads-active | organic`

Classification rule:

- if an active ad setup exists for `sku + channel` during the month, classify as `ads-active`
- otherwise classify as `organic`

Spend rule:

- if a matching monthly spend row exists, use it
- if the channel is organic, spend is `0`
- if the channel is ads-active and no monthly spend row exists, mark spend as missing in the UI rather than silently assuming `0`

### SKU Monthly Summary

For each `month + sku`, calculate:

- `daily_target_units`
- `monthly_target_units`
- `actual_units_sold`
- `target_achievement_percent`
- `revenue`
- `profit_before_ads`
- `total_ads_spent`
- `profit_after_ads`
- `ads-active_channel_units`
- `organic_channel_units`

Monthly target formula:

- `monthly_target_units = daily_target_units x active selling days in the month`

For v1, `active selling days in the month` should default to calendar days in the selected month.

### Budget View

For each `month + sku + channel`, calculate:

- `daily_budget_cap`
- `active_days`
- `monthly_budget_cap = daily_budget_cap x active_days`
- `actual_spend`
- `variance = monthly_budget_cap - actual_spend`

This view is for planning and budget control only.

## UI Structure

The existing `Ad Campaigns` tab should remain, but the primary workflow should change from generic campaigns to SKU-level ads management.

### Section 1: Ad Setup

Purpose:

- define which SKU is running ads on which channel
- define daily budget cap and objective

Example rows:

- `Cervi | Tokopedia | GMV Max | Rp150.000/day | Active`
- `Lumi | Shopee | GMV Max | Rp100.000/day | Active`
- `Calmi | Shopee | GMV Max | Rp50.000/day | Active`

Actions:

- add setup
- edit setup
- pause setup
- end setup

### Section 2: Monthly Spend Input

Purpose:

- input actual spend once at month end

Expected UX:

- filter by month
- show active setups for that month
- enter or edit one `actual_spend` per `SKU + channel`
- optionally attach notes
- optionally create a linked finance entry

Display fields:

- month
- sku
- channel
- daily budget cap
- monthly budget cap
- actual spend
- variance

### Section 3: Monthly Ads Report

Two report views should be provided.

#### SKU Summary

Columns:

- SKU
- daily target
- monthly target
- actual units
- achievement %
- revenue
- profit before ads
- ads spend
- profit after ads

#### Channel Breakdown

Columns:

- SKU
- channel
- units sold
- revenue
- profit before ads
- ads spend
- profit after ads
- classification

This view should make organic sales obvious, especially for cases like:

- `Lumi + Tokopedia`

## Migration Strategy

Do not delete the current ad campaign system.

### Keep

- legacy campaign records
- legacy spend entry records
- finance linkage for ad spend
- changelog history

### Add

- SKU-level ad setup model
- monthly spend model
- SKU sales target model
- new monthly reporting queries and UI

### Transition

The `Ad Campaigns` tab should prioritize the new SKU-level workflow.

The old generic campaign list can be:

- shown in a `Legacy Campaigns` section, or
- hidden behind a secondary view after migration

The new default path should favor the operational questions the user actually asks each month:

- which SKU is running ads on which channel
- how much was actually spent this month
- how many units were sold
- how much profit remained after ads

## Non-Goals For V1

The following are explicitly out of scope:

- true marketplace ad attribution imports
- multi-SKU campaign allocation logic
- daily spend logging requirement
- campaign performance modeling across multiple SKUs
- automated Shopee or Tokopedia spend sync

These can be added later if the business needs stronger attribution than channel classification.

## Open Assumptions Locked For V1

These decisions are intentionally fixed to avoid ambiguity:

- actual spend is entered monthly, not daily
- sales targets are SKU-level, not channel-level
- `ads-active` vs `organic` is based on setup presence, not platform attribution exports
- `Lumi + Tokopedia` with no Tokopedia setup is organic sales with ads spend `0`
- budget cap is never used as a substitute for actual spend

## Success Criteria

The upgrade is successful when the dashboard can answer, for any selected month:

- how many units each SKU sold
- which channel those sales came from
- which sales came from ads-active channels versus organic channels
- how much actual ad spend was assigned to each `SKU + channel`
- what the profit was before ads
- what the profit was after ads
- whether each SKU hit its monthly target
