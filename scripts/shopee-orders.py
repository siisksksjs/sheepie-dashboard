"""Pull Sheepie's Shopee orders through the Shopee Open Platform API (v2).

  python3 scripts/shopee-orders.py auth                          # one-time: open the shop authorization page
  python3 scripts/shopee-orders.py token '<redirected URL>'      # then: exchange the code Shopee redirected with
  python3 scripts/shopee-orders.py orders 2026-10-25 2026-11-04 out.csv

Reads SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY from .env.local. Tokens are kept in .shopee/token.json
(gitignored, chmod 600) and refreshed automatically. Never prints keys or tokens.
"""
import hashlib, hmac, json, os, secrets, subprocess, sys, time, urllib.parse, urllib.request, csv
from datetime import datetime, timedelta, timezone

HOST = "https://partner.shopeemobile.com"
REDIRECT = os.environ.get("SHOPEE_REDIRECT", "https://dashboard.sheepiesleep.com/favicon.ico")  # must match the app's redirect domain
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKEN_FILE = os.path.join(ROOT, ".shopee", "token.json")
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
    return int(pid), key


PARTNER_ID, PARTNER_KEY = load_env()


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


def save_token(r, shop_id):
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    tok = {"shop_id": int(shop_id), "access_token": r["access_token"], "refresh_token": r["refresh_token"],
           "expires_at": int(time.time()) + int(r.get("expire_in", 14400)) - 300}
    json.dump(tok, open(TOKEN_FILE, "w"))
    os.chmod(TOKEN_FILE, 0o600)
    return tok


def auth():
    path = "/api/v2/shop/auth_partner"
    ts = int(time.time())
    url = HOST + path + "?" + urllib.parse.urlencode({"partner_id": PARTNER_ID, "timestamp": ts,
                                                      "sign": sign(path, ts), "redirect": REDIRECT})
    subprocess.run(["open", url])
    print("Opened Shopee authorization. After approving, run:\n  python3 scripts/shopee-orders.py token '<the URL Shopee redirected to>'")


def exchange(redirected_url):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(redirected_url).query)
    if "code" not in q or "shop_id" not in q:
        sys.exit("That URL has no code/shop_id")
    shop_id = int(q["shop_id"][0])
    r = call("POST", "/api/v2/auth/token/get", body={"code": q["code"][0], "shop_id": shop_id, "partner_id": PARTNER_ID})
    save_token(r, shop_id)
    print("Authorized shop", shop_id)


def token():
    if not os.path.exists(TOKEN_FILE):
        sys.exit("Not authorized yet: run `python3 scripts/shopee-orders.py auth` first")
    tok = json.load(open(TOKEN_FILE))
    if time.time() >= tok["expires_at"]:
        r = call("POST", "/api/v2/auth/access_token/get",
                 body={"refresh_token": tok["refresh_token"], "shop_id": tok["shop_id"], "partner_id": PARTNER_ID})
        tok = save_token(r, tok["shop_id"])
    return tok


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
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "auth": auth()
    elif cmd == "token": exchange(sys.argv[2])
    elif cmd == "orders": orders(*sys.argv[2:5])
    else: sys.exit(__doc__)
