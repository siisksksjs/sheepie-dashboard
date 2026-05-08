// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2"
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"
import { renderRestockAlertEmailHtml } from "../_shared/email-html.ts"
import { sendEmail } from "../_shared/resend.ts"

type NotificationEvent = {
  id: string
  payload: {
    sku: string
    productName: string
    shippingMode: "air" | "sea"
    threshold: number
    previousStock: number
    currentStock: number
    leadTimeLabel: string
  }
}

function uniqueEmails(users: Array<{ email?: string | null }>) {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service env is not configured" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: events, error: eventsError } = await supabase
    .from("notification_events")
    .select("id, payload")
    .eq("event_type", "restock_alert")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(20)

  if (eventsError) {
    return jsonResponse({ error: eventsError.message }, 500)
  }

  if (!events || events.length === 0) {
    return jsonResponse({ sent: 0 })
  }

  const eventIds = events.map((event) => event.id)
  await supabase
    .from("notification_events")
    .update({ status: "sending", error_message: null })
    .in("id", eventIds)

  try {
    const { data: userPage, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (usersError) {
      throw new Error(usersError.message)
    }

    const recipients = uniqueEmails(userPage.users)
    const html = renderRestockAlertEmailHtml({
      title: "Restock reorder alert",
      events: (events as NotificationEvent[]).map((event) => event.payload),
    })

    await sendEmail({
      to: recipients,
      subject: `Restock reorder alert: ${events.length} route${events.length === 1 ? "" : "s"}`,
      html,
    })

    await supabase
      .from("notification_events")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .in("id", eventIds)

    return jsonResponse({ sent: eventIds.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email send failure"
    await supabase
      .from("notification_events")
      .update({
        status: "failed",
        error_message: message,
      })
      .in("id", eventIds)

    return jsonResponse({ error: message }, 500)
  }
})
