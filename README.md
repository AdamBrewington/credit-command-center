# ⚡ Credit Command Center

Personal finance command system. Texts are the product. Dashboard is the admin panel.

## Setup (do these in order)

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `credit-command-center`, set a strong DB password, pick the region closest to you
3. Wait for it to spin up (~2 min)

### 2. Run the Database Schema
1. Go to **SQL Editor** in the Supabase dashboard
2. Paste the entire contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run**
4. Should see "Success. No rows returned" — that's correct

### 3. Create Your Account
1. Go to **Authentication** > **Users** in Supabase dashboard
2. Click **Add User** > **Create New User**
3. Enter your email and password
4. Or: just sign up through the app once it's deployed (Step 7)

### 4. Seed Your Data
1. Go to **Authentication** > **Users**, click your user, copy the UUID
2. Go back to **SQL Editor**
3. Paste the seed data block from the bottom of the schema file
4. Replace `YOUR_USER_ID` with your UUID
5. Run it

### 5. Set Up Your Profile
Run this in SQL Editor (replace the values):
```sql
UPDATE profiles SET
  phone_number = '+1XXXXXXXXXX',  -- your real phone number
  notification_mode = 'smokey',    -- or: standard, aggressive, funny
  timezone = 'America/New_York'
WHERE id = 'YOUR_USER_ID';
```

### 6. Configure Twilio
1. Create a Twilio account at [twilio.com](https://twilio.com)
2. Get a phone number (trial is fine to start)
3. In Supabase dashboard: **Edge Functions** > **Manage Secrets**, add:
   - `TWILIO_ACCOUNT_SID` — from Twilio console
   - `TWILIO_AUTH_TOKEN` — from Twilio console
   - `TWILIO_PHONE_NUMBER` — your Twilio number (format: `+1234567890`)

### 7. Deploy Edge Functions
Install the Supabase CLI, then:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy send-text
supabase functions deploy check-reminders
supabase functions deploy payday-checklist
supabase functions deploy mark-paid
```

### 8. Set Up Cron Jobs
In SQL Editor, run:
```sql
-- Enable pg_cron and pg_net if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Morning reminders at 7am ET (11 UTC)
SELECT cron.schedule('morning-reminders', '0 11 * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-reminders',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );$$
);

-- Payday check at 9am ET (13 UTC)
SELECT cron.schedule('payday-check', '0 13 * * *',
  $$SELECT net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/payday-checklist',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );$$
);
```

### 9. Deploy the Dashboard
1. Create a GitHub repo called `credit-command-center`
2. Push this code to it
3. In GitHub repo **Settings** > **Pages**, set source to "GitHub Actions"
4. In **Settings** > **Secrets and variables** > **Actions**, add:
   - `VITE_SUPABASE_URL` — from Supabase Settings > API
   - `VITE_SUPABASE_ANON_KEY` — from Supabase Settings > API
5. Push to `main` — it auto-deploys

Your dashboard will be live at: `https://YOUR_USERNAME.github.io/credit-command-center/`

### 10. Test the Text System
In Supabase dashboard, go to **Edge Functions** > `send-text` > **Test**:
```json
{
  "user_id": "YOUR_USER_ID",
  "to": "+1XXXXXXXXXX",
  "message": "Credit Command Center is live. Let's go.",
  "notification_type": "custom"
}
```

If you get a text, everything works.

## File Structure
```
credit-command-center/
├── .github/workflows/deploy.yml    # Auto-deploy to GitHub Pages
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx          # Bottom nav shell
│   │   │   ├── ProgressBar.jsx     # Reusable progress bar
│   │   │   └── DebtCard.jsx        # Collection card with payments
│   │   ├── pages/
│   │   │   ├── Login.jsx           # Auth screen
│   │   │   ├── Dashboard.jsx       # Home — progress overview
│   │   │   ├── Collections.jsx     # Debt tracker + mark paid
│   │   │   ├── CreditCards.jsx     # Card utilization tracker
│   │   │   └── Paychecks.jsx       # Paycheck checklists
│   │   ├── styles/global.css       # Dark theme, mobile-first
│   │   ├── App.jsx                 # Router + auth guard
│   │   ├── main.jsx                # Entry point
│   │   └── supabaseClient.js       # Supabase connection
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
└── supabase/
    ├── migrations/
    │   └── 001_initial_schema.sql  # All tables, RLS, views, seed data
    └── functions/
        ├── send-text/index.ts      # Core Twilio SMS sender
        ├── check-reminders/index.ts # Morning reminder cron
        ├── payday-checklist/index.ts # Payday bill checklist
        └── mark-paid/index.ts      # Payment recording + celebration
```
