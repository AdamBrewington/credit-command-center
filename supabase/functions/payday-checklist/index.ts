// supabase/functions/payday-checklist/index.ts
// ============================================================
// PAYDAY CHECKLIST — Texts your bill checklist on paydays
// ============================================================
// Cron runs daily, checks if today is a payday.
// If yes, builds the checklist and texts it.
//
// Schedule:
// SELECT cron.schedule('payday-check', '0 13 * * *',
//   $$SELECT net.http_post(
//     url := 'YOUR_SUPABASE_URL/functions/v1/payday-checklist',
//     headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
//   );$$
// );
// (13 UTC = 9am ET — so you get it after morning coffee)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (_req: Request) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const today = new Date().toISOString().split("T")[0];

  // Check if today is a payday for any user
  const { data: paychecks } = await supabase
    .from("paychecks")
    .select("*, profiles!inner(phone_number, notification_mode)")
    .eq("pay_date", today);

  if (!paychecks || paychecks.length === 0) {
    return new Response(JSON.stringify({ message: "Not a payday" }), { status: 200 });
  }

  let sent = 0;

  for (const paycheck of paychecks) {
    const userId = paycheck.user_id;
    const phone = paycheck.profiles?.phone_number;
    const mode = paycheck.profiles?.notification_mode || "standard";

    if (!phone) continue;

    // Get bills assigned to this paycheck
    const { data: bills } = await supabase
      .from("bills")
      .select("*")
      .eq("user_id", userId)
      .eq("assigned_paycheck_label", paycheck.paycheck_label)
      .order("priority");

    // Get debt payments due soon (within 14 days)
    const twoWeeksOut = new Date();
    twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);

    const { data: debtPayments } = await supabase
      .from("payments")
      .select("*, collections(account_name)")
      .eq("user_id", userId)
      .eq("status", "unpaid")
      .lte("due_date", twoWeeksOut.toISOString().split("T")[0])
      .gte("due_date", today)
      .order("due_date");

    // Build the checklist
    const amount = paycheck.expected_amount ? `$${paycheck.expected_amount}` : "check";
    let checklist = "";

    if (mode === "smokey") {
      checklist += `PAYDAY. ${paycheck.paycheck_label} just hit — ${amount}. This money has a job. Here's the plan:\n\n`;
    } else {
      checklist += `${paycheck.paycheck_label} — ${amount}\nHere's your checklist:\n\n`;
    }

    // Bills
    if (bills && bills.length > 0) {
      for (const bill of bills) {
        const method = bill.pay_method ? ` via ${bill.pay_method}` : "";
        const autopay = bill.autopay ? " (autopay)" : "";
        checklist += `- ${bill.bill_name}: $${bill.amount}${method}${autopay}\n`;
      }
      checklist += "\n";
    }

    // Debt payments
    if (debtPayments && debtPayments.length > 0) {
      checklist += "DEBT PAYMENTS:\n";
      for (const dp of debtPayments) {
        const name = dp.collections?.account_name || "Unknown";
        checklist += `- ${name}: $${dp.amount} due ${dp.due_date}\n`;
      }
      checklist += "\n";
    }

    // Calculate leftover
    const totalBills = (bills || []).reduce((sum: number, b: any) => sum + parseFloat(b.amount), 0);
    const totalDebt = (debtPayments || []).reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
    const totalObligations = totalBills + totalDebt;

    if (paycheck.expected_amount) {
      const leftover = paycheck.expected_amount - totalObligations;
      if (mode === "smokey") {
        checklist += `After obligations: $${leftover.toFixed(2)} left. That's for groceries and gas. NOT for auctions. NOT for games. This check has a job.`;
      } else {
        checklist += `Remaining after obligations: $${leftover.toFixed(2)}\nStick to essentials. You're building something.`;
      }
    }

    // Send
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/send-text`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          to: phone,
          message: checklist,
          notification_type: "payday_checklist",
        }),
      });
      sent++;
    } catch (err) {
      console.error("Failed to send payday checklist:", err);
    }
  }

  return new Response(JSON.stringify({ paychecks_found: paychecks.length, sent }), { status: 200 });
});
