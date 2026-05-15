// supabase/functions/mark-paid/index.ts
// ============================================================
// MARK PAID — Record a payment and trigger celebration if done
// ============================================================
// Called from the dashboard when you tap "Mark Paid"
// Updates the payment record, recalculates collection balance,
// and fires a celebration text if the account hits $0.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MarkPaidRequest {
  payment_id: string;
  user_id: string;
  confirmation_number?: string;
}

serve(async (req: Request) => {
  try {
    const { payment_id, user_id, confirmation_number }: MarkPaidRequest = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get the payment
    const { data: payment, error: payError } = await supabase
      .from("payments")
      .select("*, collections(id, account_name, current_balance, original_balance, settlement_amount)")
      .eq("id", payment_id)
      .eq("user_id", user_id)
      .single();

    if (payError || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), { status: 404 });
    }

    if (payment.status === "paid") {
      return new Response(JSON.stringify({ error: "Already paid" }), { status: 400 });
    }

    // Mark payment as paid
    await supabase
      .from("payments")
      .update({
        status: "paid",
        paid_date: new Date().toISOString().split("T")[0],
        confirmation_number: confirmation_number || null,
      })
      .eq("id", payment_id);

    // Update collection balance
    const collection = payment.collections;
    const newBalance = Math.max(0, parseFloat(collection.current_balance) - parseFloat(payment.amount));

    const newStatus = newBalance <= 0 ? "paid" : "active_plan";

    await supabase
      .from("collections")
      .update({
        current_balance: newBalance,
        status: newStatus,
      })
      .eq("id", collection.id);

    // Get user profile for phone and notification mode
    const { data: profile } = await supabase
      .from("profiles")
      .select("phone_number, notification_mode")
      .eq("id", user_id)
      .single();

    if (!profile?.phone_number) {
      return new Response(JSON.stringify({ success: true, message: "Paid but no phone for notification" }), { status: 200 });
    }

    const phone = profile.phone_number;
    const mode = profile.notification_mode || "standard";

    if (newBalance <= 0) {
      // ACCOUNT COMPLETE — fire celebration
      const celebrationMsg = getCelebrationMessage(mode, collection.account_name, collection.original_balance);

      await fetch(`${SUPABASE_URL}/functions/v1/send-text`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id,
          to: phone,
          message: celebrationMsg,
          notification_type: "debt_account_completed",
          related_table: "collections",
          related_id: collection.id,
        }),
      });
    } else {
      // Payment logged — send confirmation
      const remaining = newBalance.toFixed(2);
      let msg = "";

      if (mode === "smokey") {
        msg = `${collection.account_name} — $${payment.amount} PAID. Remaining: $${remaining}. You're chopping this thing down. Keep going.`;
      } else if (mode === "aggressive") {
        msg = `PAID: ${collection.account_name} — $${payment.amount}. Remaining: $${remaining}. Stay locked in.`;
      } else if (mode === "funny") {
        msg = `Cha-ching! $${payment.amount} sent to ${collection.account_name}. Only $${remaining} left. Almost there, champ.`;
      } else {
        msg = `Payment logged: ${collection.account_name} — $${payment.amount} paid. Remaining: $${remaining}. One step closer.`;
      }

      await fetch(`${SUPABASE_URL}/functions/v1/send-text`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id,
          to: phone,
          message: msg,
          notification_type: "debt_payment_success",
          related_table: "payments",
          related_id: payment_id,
        }),
      });
    }

    // Check total progress for a bonus message
    const { data: summary } = await supabase
      .from("collections_summary")
      .select("*")
      .eq("user_id", user_id)
      .single();

    return new Response(JSON.stringify({
      success: true,
      new_balance: newBalance,
      account_complete: newBalance <= 0,
      total_progress: summary ? `${summary.percent_complete}%` : null,
    }), { status: 200 });

  } catch (err) {
    console.error("mark-paid error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});


function getCelebrationMessage(mode: string, accountName: string, originalBalance: number): string {
  switch (mode) {
    case "smokey":
      return [
        `${accountName} got KNOCKED THE FUCK OUT. $${originalBalance} charge-off — DONE. That's one less collector with your name in their mouth. You did that.`,
        `${accountName} is DEAD. $${originalBalance} — gone. Finished. You just took a negative account off the board. That's how you build. Keep going.`,
        `You just bodied ${accountName}. $${originalBalance} — erased. They can't call you about this one anymore. Who's next?`,
      ][Math.floor(Math.random() * 3)];

    case "aggressive":
      return `ACCOUNT CLEARED: ${accountName} — $${originalBalance} DONE. One more negative account eliminated. No mercy. Move to the next one.`;

    case "funny":
      return `RIP ${accountName} ($${originalBalance}). Gone but not mourned. Your credit report just got a little lighter. Pop a sparkling water and celebrate.`;

    default:
      return `${accountName} is fully paid — $${originalBalance} handled. That's one more negative account off the board. Great work. Keep building.`;
  }
}
