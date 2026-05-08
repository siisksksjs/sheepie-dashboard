// @ts-nocheck
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })
}

export function assertAuthorizedRequest(req: Request) {
  const expectedSecret = Deno.env.get("NOTIFICATION_FUNCTION_SECRET")

  if (!expectedSecret) {
    return jsonResponse({ error: "NOTIFICATION_FUNCTION_SECRET is not configured" }, 500)
  }

  const actualSecret = req.headers.get("x-notification-secret")

  if (actualSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  return null
}
