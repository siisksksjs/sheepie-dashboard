// @ts-nocheck
type SendEmailInput = {
  to: string[]
  subject: string
  html: string
}

export async function sendEmail(input: SendEmailInput) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  const from = Deno.env.get("EMAIL_FROM")

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured")
  }

  if (!from) {
    throw new Error("EMAIL_FROM is not configured")
  }

  if (input.to.length === 0) {
    throw new Error("No recipients found")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  })

  const bodyText = await response.text()

  if (!response.ok) {
    throw new Error(bodyText || `Resend failed with ${response.status}`)
  }

  return bodyText ? JSON.parse(bodyText) : {}
}
