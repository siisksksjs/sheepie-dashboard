export async function triggerNotificationSender() {
  const functionSecret = process.env.NOTIFICATION_FUNCTION_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!functionSecret || !supabaseUrl) {
    return { success: false, skipped: true, error: "Notification sender env is not configured" }
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-notification-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-notification-secret": functionSecret,
      },
      body: JSON.stringify({ source: "dashboard" }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, skipped: false, error: text || response.statusText }
    }

    return { success: true, skipped: false }
  } catch (error) {
    return {
      success: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Unknown notification sender error",
    }
  }
}
