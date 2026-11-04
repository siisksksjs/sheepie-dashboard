"""Pull Sheepie's Shopee orders through the Shopee Open Platform API (v2).

  python3 scripts/shopee-orders.py orders 2026-10-25 2026-11-04 out.csv

The access token comes from the deployed dashboard (GET /api/shopee/token). Only the dashboard's cron
refreshes tokens, so this script never authorizes or refreshes anything itself.
Authorize Shopee in the dashboard: More -> Shopee sync.

Reads from .env.local: SHOPEE_PARTNER_KEY (signing), SHOPEE_SYNC_SECRET (dashboard token endpoint),
SHOPEE_PARTNER_ID (optional) and DASHBOARD_URL (optional, default https://dashboard.sheepiesleep.com;
set it to a preview deploy to test). Never prints keys or tokens.
"""
import hashlib, hmac, json, os, sys, time, urllib.error, urllib.parse, urllib.request, csv
from datetime import datetime, timedelta, timezone

HOST = "https://partner.shopeemobile.com"
DEFAULT_DASHBOARD_URL = "https://dashboard.sheepiesleep.com"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIB = timezone(timedelta(hours=7))


def load_env():
    env = {}
    for line in open(os.path.join(ROOT, ".env.local")):
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.strip().split("=", 1)
            env[k.strip().removeprefix("export ").strip()] = v.strip().strip('"').strip("'")
    pid, key = env.get("SHOPEE_PARTNER_ID", "2042739"), env.get("SHOPEE_PARTNER_KEY")
    if not key:
        sys.exit("SHOPEE_PARTNER_KEY is missing from .env.local")
    sync_secret = env.get("SHOPEE_SYNC_SECRET")
    if not sync_secret:
        sys.exit("SHOPEE_SYNC_SECRET is missing from .env.local (same value as the dashboard's SHOPEE_SYNC_SECRET)")
    dashboard_url = (os.environ.get("DASHBOARD_URL") or env.get("DASHBOARD_URL") or DEFAULT_DASHBOARD_URL).rstrip("/")
    return int(pid), key, sync_secret, dashboard_url


PARTNER_ID = PARTNER_KEY = SYNC_SECRET = DASHBOARD_URL = None


def sign(path, ts, access_token="", shop_id=""):
    base = f"{PARTNER_ID}{path}{ts}{access_token}{shop_id}"
    return hmac.new(PARTNER_KEY.encode(), base.encode(), hashlib.sha256).hexdigest()


def call(method, path, params=None, body=None, tok=None):
    ts = int(time.time())
    q = {"partner_id": PARTNER_ID, "timestamp": ts}
    if tok:
        q.update(access_token=tok["access_token"], shop_id=tok["shop_id"],
                 sign=sign(path, ts, tok["access_token"], tok["shop_id"]))
    else:
        q["sign"] = sign(path, ts)
    q.update(params or {})
    url = HOST + path + "?" + urllib.parse.urlencode(q, doseq=False)
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except urllib.error.HTTPError as e:
        r = json.loads(e.read() or b"{}")
    if r.get("error"):
        sys.exit(f"Shopee API {path}: {r.get('error')} - {r.get('message')}")
    return r


def token():
    """Current access token from the dashboard. Read-only: the dashboard cron owns refreshing."""
    req = urllib.request.Request(DASHBOARD_URL + "/api/shopee/token",
                                 headers={"x-shopee-sync-secret": SYNC_SECRET, "User-Agent": "sheepie-shopee-orders/1.0"})
    try:
        r = json.loads(urllib.request.urlopen(req, timeout=30).read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            sys.exit("Shopee is not connected yet. Authorize Shopee in the dashboard: More -> Shopee sync")
        if e.code == 401:
            sys.exit("The dashboard rejected SHOPEE_SYNC_SECRET (401). Check it matches the dashboard's value")
        sys.exit(f"Dashboard token endpoint failed: HTTP {e.code}")
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        sys.exit(f"Could not reach the dashboard token endpoint at {DASHBOARD_URL}: {type(e).__name__}")
    if not r.get("access_token") or not r.get("shop_id"):
        sys.exit("The dashboard returned no access token. Authorize Shopee in the dashboard: More -> Shopee sync")
    return {"shop_id": int(r["shop_id"]), "access_token": r["access_token"]}


def orders(start, end, out):
    tok = token()
    t0 = int(datetime.fromisoformat(start).replace(tzinfo=WIB).timestamp())
    t_end = int((datetime.fromisoformat(end) + timedelta(days=1)).replace(tzinfo=WIB).timestamp())
    sns = []
    while t0 < t_end:  # get_order_list allows at most 15 days per call
        t1 = min(t0 + 15 * 86400, t_end)
        cursor = ""
        while True:
            r = call("GET", "/api/v2/order/get_order_list", {"time_range_field": "create_time", "time_from": t0,
                     "time_to": t1, "page_size": 100, "cursor": cursor}, tok=tok)["response"]
            sns += [o["order_sn"] for o in r.get("order_list", [])]
            if not r.get("more"): break
            cursor = r["next_cursor"]
        t0 = t1
    rows = []
    for i in range(0, len(sns), 50):
        r = call("GET", "/api/v2/order/get_order_detail", {"order_sn_list": ",".join(sns[i:i + 50]),
                 "response_optional_fields": "item_list,total_amount,order_status"}, tok=tok)["response"]
        for o in r.get("order_list", []):
            created = datetime.fromtimestamp(o["create_time"], WIB).strftime("%Y-%m-%d %H:%M")
            for it in o.get("item_list", []):
                rows.append({"order_sn": o["order_sn"], "created_wib": created, "status": o.get("order_status"),
                             "order_total": o.get("total_amount"), "item_name": it.get("item_name"),
                             "model_name": it.get("model_name"), "sku": it.get("model_sku") or it.get("item_sku"),
                             "qty": it.get("model_quantity_purchased"),
                             "unit_price": it.get("model_discounted_price")})
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ["order_sn"])
        w.writeheader(); w.writerows(rows)
    print(f"{len(sns)} orders, {len(rows)} item rows -> {out}")


if __name__ == "__main__":
    if len(sys.argv) != 5 or sys.argv[1] != "orders":
        sys.exit(__doc__)
    PARTNER_ID, PARTNER_KEY, SYNC_SECRET, DASHBOARD_URL = load_env()
    orders(*sys.argv[2:5])
