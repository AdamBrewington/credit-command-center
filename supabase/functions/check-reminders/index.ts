// supabase/functions/check-reminders/index.ts
// ============================================================
// CHECK REMINDERS — Daily morning cron
// ============================================================
// Runs every morning. Checks for:
//   - Debt payments due in the next 3 days
//   - Credit card statements closing in 5 days or 2 days
//   - Credit card due dates in 3 days
//   - High utilization warnings
//
// Set up cron in Supabase Dashboard > Database > Extensions > pg_cron
// Or use: SELECT cron.schedule('morning-reminders', '0 11 * * *',
//   $$SELECT net.http_post(
//     url := 'YOUR_SUPABASE_URL/functions/v1/check-reminders',
//     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
//   );$$
// );
// (11 UTC = 7am ET — adjust for your timezone)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const messages: Array<{ user_id: string; to: string; message: string; notification_type: string; related_table?: string; related_id?: string }> = [];

  // Get all users with phone numbers
  const { data: profiles } = await supabase.from("profiles").select("id, phone_number, timezone, notification_mode").not("phone_number", "is", null);

  if (!profiles || profiles.length === 0) {
    return new Response(JSON.stringify({ message: "No profiles with phone numbers" }), { status: 200 });
  }

  for (const profile of profiles) {
    const userId = profile.id;
    const phone = profile.phone_number;
    const mode = profile.notification_mode || "standard";
    const today = new Date();

    // ---- DEBT PAYMENT REMINDERS ----
    const threeDaysOut = new Date(today);
    threeDaysOut.setDate(today.getDate() + 3);
    const oneDayOut = new Date(today);
    oneDayOut.setDate(today.getDate() + 1);

    const { data: upcomingPayments } = await supabase
      .from("payments")
      .select("*, collections(account_name)")
      .eq("user_id", userId)
      .eq("status", "unpaid")
      .lte("due_date", threeDaysOut.toISOString().split("T")[0])
      .gte("due_date", today.toISOString().split("T")[0])
      .order("due_date");

    if (upcomingPayments && upcomingPayments.length > 0) {
      for (const payment of upcomingPayments) {
        const accountName = payment.collections?.account_name || "Unknown";
        const daysUntil = Math.ceil((new Date(payment.due_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const urgency = daysUntil <= 1 ? "TOMORROW" : `in ${daysUntil} days`;

        let msg = "";
        if (mode === "smokey") {
          msg = `Yo. ${accountName} payment of $${payment.amount} is due ${urgency}. Handle that shit. No excuses.`;
        } else if (mode === "aggressive") {
          msg = `ACTION REQUIRED: ${accountName} — $${payment.amount} due ${urgency}. Pay it now. Don't let this slide.`;
        } else if (mode === "funny") {
          msg = `Hey big spender — ${accountName} wants $${payment.amount} ${urgency}. Pay up so they stop bothering us.`;
        } else {
          msg = `Reminder: ${accountName} payment of $${payment.amount} is due ${urgency}. You've got this.`;
        }

        messages.push({
          user_id: userId,
          to: phone,
          message: msg,
          notification_type: "debt_payment_due",
          related_table: "payments",
          related_id: payment.id,
        });
      }
    }

    // ---- CREDIT CARD STATEMENT CLOSE REMINDERS ----
    const { data: cards } = await supabase
      .from("credit_cards")
      .select("*")
      .eq("user_id", userId);

    if (cards) {
      const currentDay = today.getDate();

      for (const card of cards) {
        const closeDay = card.statement_close_day;
        const dueDay = card.due_date_day;

        // Days until statement close (simplified — same month logic)
        let daysUntilClose = closeDay - currentDay;
        if (daysUntilClose < 0) daysUntilClose += 30; // rough next-month estimate

        // Statement close reminders (5 days and 2 days out)
        if (daysUntilClose === 5 || daysUntilClose === 2) {
          const utilization = card.credit_limit > 0 ? ((card.current_balance / card.credit_limit) * 100).toFixed(1) : "0";
          const targetHigh = card.target_reported_balance_high || card.credit_limit * 0.09;
          const payDown = Math.max(0, card.current_balance - targetHigh).toFixed(2);

          let msg = "";
          if (mode === "smokey") {
            msg = `${card.card_name} statement closes in ${daysUntilClose} days. Balance: $${card.current_balance}. Utilization: ${utilization}%. ${parseFloat(payDown) > 0 ? `Pay down $${payDown} or you're reporting too high. Fix it.` : `Looking clean. Keep it there.`}`;
          } else {
            msg = `${card.card_name} statement closes in ${daysUntilClose} days. Balance: $${card.current_balance} (${utilization}% utilization). ${parseFloat(payDown) > 0 ? `Pay ~$${payDown} to hit your target report balance.` : `On target. No action needed.`}`;
          }

          messages.push({
            user_id: userId,
            to: phone,
            message: msg,
            notification_type: "statement_closing_soon",
            related_table: "credit_cards",
            related_id: card.id,
          });
        }

        // Due date reminder (3 days out)
        let daysUntilDue = dueDay - currentDay;
        if (daysUntilDue < 0) daysUntilDue += 30;

        if (daysUntilDue === 3) {
          let msg = "";
          if (mode === "smokey") {
            msg = `${card.card_name} due date in 3 days. Pay the remaining statement balance. No interest. No exceptions. Don't be dumb.`;
          } else {
            msg = `${card.card_name} payment due in 3 days. Confirm the remaining statement balance is paid. No interest — keep it clean.`;
          }

          messages.push({
            user_id: userId,
            to: phone,
            message: msg,
            notification_type: "due_date_soon",
            related_table: "credit_cards",
            related_id: card.id,
          });
        }

        // High utilization warning (check daily)
        if (card.credit_limit > 0) {
          const util = (card.current_balance / card.credit_limit) * 100;
          if (util > 30) {
            messages.push({
              user_id: userId,
              to: phone,
              message: `WARNING: ${card.card_name} utilization is at ${util.toFixed(0)}%. Target is under 9%. Current balance: $${card.current_balance}. Pay this down ASAP.`,
              notification_type: "high_utilization_warning",
              related_table: "credit_cards",
              related_id: card.id,
            });
          }
        }
      }
    }
  }

  // Send all messages
  let sent = 0;
  let failed = 0;

  for (const msg of messages) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-text`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(msg),
      });

      if (res.ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return new Response(JSON.stringify({ total: messages.length, sent, failed }), { status: 200 });
});
