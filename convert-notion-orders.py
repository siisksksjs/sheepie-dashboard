#!/usr/bin/env python3
"""
Convert Notion CSV exports to IOMS format
Usage: python convert-notion-orders.py <input.csv> <sku> [output.csv]

Example:
  python convert-notion-orders.py "CerviCloud Pillow.csv" CERVI-PILLOW orders.csv
"""

import csv
import sys
from datetime import datetime

def parse_date(date_str):
    """Convert 'February 9, 2025' to '2025-02-09'"""
    if not date_str or date_str.strip() == '':
        return None
    try:
        dt = datetime.strptime(date_str.strip(), '%B %d, %Y')
        return dt.strftime('%Y-%m-%d')
    except:
        # Try other formats
        try:
            dt = datetime.strptime(date_str.strip(), '%b %d, %Y')
            return dt.strftime('%Y-%m-%d')
        except:
            print(f"Warning: Could not parse date: {date_str}")
            return None

def parse_price(price_str):
    """Convert 'IDR 612,000.00' to '612000'"""
    if not price_str or price_str.strip() == '':
        return '0'
    # Remove IDR, spaces, commas, and .00
    cleaned = price_str.replace('IDR', '').replace(',', '').replace('.00', '').strip()
    try:
        return str(int(float(cleaned)))
    except:
        print(f"Warning: Could not parse price: {price_str}")
        return '0'

def clean_channel(channel_str):
    """Convert 'shopee  ' to 'shopee'"""
    if not channel_str:
        return ''
    return channel_str.strip().lower()

def calculate_channel_fee(channel, price):
    """Calculate approximate channel fee"""
    price_int = int(price) if price else 0
    if price_int == 0:
        return '0'

    fee_rates = {
        'tokopedia': 0.025,  # 2.5%
        'shopee': 0.02,      # 2%
        'tiktok': 0.05,      # 5%
        'offline': 0.0,      # 0%
    }

    rate = fee_rates.get(channel, 0.0)
    fee = int(price_int * rate)
    return str(fee)

def convert_notion_to_ioms(input_file, sku, output_file=None):
    """Convert Notion export to IOMS format"""

    if output_file is None:
        output_file = f"{sku}_orders.csv"

    # Read Notion CSV (semicolon-delimited)
    with open(input_file, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')
        rows = list(reader)

    # Convert to IOMS format
    ioms_rows = []
    order_counter = {}  # Track order sequence per date+channel

    for idx, row in enumerate(rows, start=1):
        # Skip empty rows
        if not row.get('channel') or row.get('channel', '').strip() == '':
            continue

        channel = clean_channel(row.get('channel', ''))
        order_date = parse_date(row.get('order_date', ''))
        quantity = row.get('quantity', '1').strip()
        selling_price = parse_price(row.get('selling_price', '0'))
        notes = row.get('notes', '').strip()

        # Skip if no valid date
        if not order_date:
            print(f"Skipping row {idx}: no valid date")
            continue

        # Generate unique order_id
        date_key = order_date.replace('-', '')
        channel_prefix = channel[:5].upper() if channel else 'ORDER'
        counter_key = f"{channel_prefix}-{date_key}"

        if counter_key not in order_counter:
            order_counter[counter_key] = 0
        order_counter[counter_key] += 1

        order_id = f"{channel_prefix}-{date_key}-{order_counter[counter_key]:03d}"

        # Don't calculate channel fees - selling price already includes them
        channel_fees = ''

        # Determine status (refunds should be "returned")
        status = 'returned' if 'refund' in notes.lower() else 'paid'

        # Create IOMS row
        ioms_row = {
            'order_id': order_id,
            'channel': channel,
            'order_date': order_date,
            'sku': sku,
            'quantity': quantity,
            'selling_price': selling_price,
            'channel_fees': channel_fees,
            'notes': notes,
            'status': status,
        }

        ioms_rows.append(ioms_row)

        # Print progress
        if idx % 10 == 0:
            print(f"Processed {idx} rows...")

    # Write IOMS CSV (comma-delimited)
    fieldnames = ['order_id', 'channel', 'order_date', 'sku', 'quantity', 'selling_price', 'channel_fees', 'notes', 'status']

    with open(output_file, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ioms_rows)

    print(f"\n✅ Conversion complete!")
    print(f"   Input:  {input_file}")
    print(f"   Output: {output_file}")
    print(f"   Converted {len(ioms_rows)} orders")

    # Show channel breakdown
    channel_counts = {}
    for row in ioms_rows:
        ch = row['channel']
        channel_counts[ch] = channel_counts.get(ch, 0) + 1

    print(f"\n📊 Orders by channel:")
    for ch, count in sorted(channel_counts.items()):
        print(f"   {ch}: {count} orders")

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python convert-notion-orders.py <input.csv> <sku> [output.csv]")
        print("\nExample:")
        print('  python convert-notion-orders.py "CerviCloud Pillow.csv" CERVI-PILLOW')
        sys.exit(1)

    input_file = sys.argv[1]
    sku = sys.argv[2]
    output_file = sys.argv[3] if len(sys.argv) > 3 else None

    convert_notion_to_ioms(input_file, sku, output_file)
