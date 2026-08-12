# Order Smart Search Design

## Goal

Help the user find and duplicate an order quickly within the latest 100 orders already shown on the Orders page.

## Approved behavior

- Add one search field above the order results.
- Text input matches product names case-insensitively and by partial name.
- Numeric input such as `Rp500.000`, `500.000`, or `500000` matches an exact displayed amount against GMV, Revenue, or Profit.
- The same filtered result set drives both desktop rows and mobile cards.
- Empty input shows all loaded orders.
- A zero-result state explains that no order matched and provides a Clear Search action.
- Existing View and Duplicate actions remain unchanged.

## Implementation boundaries

Filtering is client-side because the page intentionally loads only the latest 100 orders. Parsing and matching live in a small pure helper so exact amount behavior can be tested without rendering the entire Orders page.

## Verification

Tests cover partial product-name matching, exact numeric matching with common Rupiah formats, non-matching amounts, and empty input. UI contract tests cover the search field, shared filtered list, result count, and no-results state.
