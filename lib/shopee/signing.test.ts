import { describe, expect, it } from "vitest"
import { signApiRequest, verifyPushSignature } from "./signing"

// Expected hex values were computed once with python3:
//   hmac.new(key.encode(), f"{pid}{path}{ts}{tok}{shop}".encode(), sha256).hexdigest()
describe("signApiRequest", () => {
  it("matches python script (shop level)", () => {
    expect(
      signApiRequest({
        partnerId: 2042739,
        partnerKey: "test_partner_key_abc123",
        path: "/api/v2/order/get_order_list",
        timestamp: 1730700000,
        accessToken: "tok_abc",
        shopId: 123456789,
      })
    ).toBe("b7d893ecd5681c0ca6cd64e0b54f78ff6e97e6c3490064ddc6de78c6247341e9")
  })

  it("matches python script (auth level)", () => {
    expect(
      signApiRequest({
        partnerId: 2042739,
        partnerKey: "test_partner_key_abc123",
        path: "/api/v2/shop/auth_partner",
        timestamp: 1730700000,
      })
    ).toBe("0c169e3976abc3b9f1523cd0992c6a47be8927b74718e587a453a63bfa54b13f")
  })
})

describe("verifyPushSignature", () => {
  const callbackUrl = "https://dashboard.sheepiesleep.com/api/shopee/push"
  const rawBody = '{"code":3,"data":{"ordersn":"2411040001"}}'
  const pushKey = "push_key_xyz"
  // python3: hmac.new(pushKey, f"{callbackUrl}|{rawBody}", sha256).hexdigest()
  const validSignature = "de32433d627f7f473eb755691bf4611699ed5d1222963ee9db1c01fc5f7ffa62"

  it("accepts valid", () => {
    expect(verifyPushSignature({ callbackUrl, rawBody, authorization: validSignature, pushKey })).toBe(true)
  })

  it("rejects tampered body", () => {
    expect(
      verifyPushSignature({
        callbackUrl,
        rawBody: rawBody.replace("2411040001", "2411040002"),
        authorization: validSignature,
        pushKey,
      })
    ).toBe(false)
  })

  it("rejects missing header", () => {
    expect(verifyPushSignature({ callbackUrl, rawBody, authorization: null, pushKey })).toBe(false)
  })

  it("rejects wrong-length header and wrong key", () => {
    expect(verifyPushSignature({ callbackUrl, rawBody, authorization: "abc", pushKey })).toBe(false)
    expect(verifyPushSignature({ callbackUrl, rawBody, authorization: validSignature, pushKey: "other" })).toBe(false)
  })
})
