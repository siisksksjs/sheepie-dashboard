#!/usr/bin/env python3
"""
Fix duplicate order IDs in combined orders file
"""

import csv

# Read all orders
with open('all-orders.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    orders = list(reader)

# Track unique order IDs and reassign duplicates
order_counter = {}
fixed_orders = []

for order in orders:
    channel = order['channel']
    order_date = order['order_date'].replace('-', '')
    channel_prefix = channel[:5].upper() if channel else 'ORDER'

    counter_key = f"{channel_prefix}-{order_date}"

    if counter_key not in order_counter:
        order_counter[counter_key] = 0
    order_counter[counter_key] += 1

    # Generate new unique order_id
    new_order_id = f"{channel_prefix}-{order_date}-{order_counter[counter_key]:03d}"

    order['order_id'] = new_order_id
    fixed_orders.append(order)

# Write fixed orders
fieldnames = ['order_id', 'channel', 'order_date', 'sku', 'quantity', 'selling_price', 'channel_fees', 'notes', 'status']

with open('all-orders.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(fixed_orders)

print(f"✅ Fixed {len(fixed_orders)} orders")
print(f"   All order IDs are now unique")

# Check for any remaining duplicates
order_ids = [o['order_id'] for o in fixed_orders]
duplicates = [oid for oid in order_ids if order_ids.count(oid) > 1]
if duplicates:
    print(f"⚠️  Warning: Still have duplicates: {set(duplicates)}")
else:
    print("✅ No duplicate order IDs found")
