# SKU Reference Guide

Use these exact SKUs when converting your other Notion exports.

---

## Correct SKUs

| SKU | Product Name | Notes |
|-----|--------------|-------|
| `Cervi-001` | CerviCloud Pillow | ✅ Already converted |
| `Cervi-002` | Cervi Case | Notion: "CerviCloud Pillow Case" |
| `Lumi-001` | LumiCloud Eye Mask | Notion: "LumiCloud EyeMask" |
| `Calmi-001` | CalmiCloud Ear Plug | Notion: "CalmCloud EarPlug" |

---

## Conversion Commands

When you export your other products from Notion, use these commands:

```bash
# Cervi Case (CerviCloud Pillow Case)
python3 convert-notion-orders.py "CerviCloud Pillow Case.csv" Cervi-002

# LumiCloud Eye Mask
python3 convert-notion-orders.py "LumiCloud EyeMask.csv" Lumi-001

# CalmiCloud Ear Plug
python3 convert-notion-orders.py "CalmCloud EarPlug.csv" Calmi-001
```

Replace the CSV filename with your actual Notion export filename.

---

## Import Ready

✅ **CerviCloud Pillow** → `cervi-pillow-orders.csv` (96 orders, SKU: Cervi-001)

Ready to import at: `http://localhost:3001/import`
