# Daily KPI Email Setup

The daily KPI email is implemented in `supabase/functions/send-daily-kpi-report`.

It sends the current month KPI status at midnight Jakarta time:

- Cron expression: `0 17 * * *`
- Time: `00:00 Asia/Jakarta`
- Recipients: all authenticated user emails
- Provider: existing Resend setup

## Deploy

Deploy the Edge Function first with the GitHub Action:

```text
.github/workflows/deploy-supabase-functions.yml
```

Required GitHub Actions secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF` = `ckiqiqvkvkgzlwfllead`

You can also deploy manually:

```bash
npx supabase functions deploy send-daily-kpi-report --project-ref ckiqiqvkvkgzlwfllead --no-verify-jwt
```

Then apply the schedule migration:

```bash
npx supabase db push --include-all
```

Or apply only:

```sql
supabase/migrations/20260704_schedule_daily_kpi_email.sql
```

Do not schedule the cron before the Edge Function is deployed, because the cron calls:

```text
/functions/v1/send-daily-kpi-report
```
