// supabase/functions/send-text/index.ts
// ============================================================
// SEND TEXT — Core Twilio SMS function
// ============================================================
// This is the shared utility that all other functions call
// to actually deliver a text message.
//
// Environment variables needed (set in Supabase Dashboard > Edge Functions > Secrets):
//   TWILIO_ACCOUNT_SID   — from your Twilio console
//   TWILIO_AUTH_TOKEN     — from your Twilio console
//   TWILIO_PHONE_NUMBER   — your Twilio phone number (e.g. +1234567890)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID")!;
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN")!;
const TWILIO_PHONE_NUMBER = Deno.env.get("TWILIO_PHONE_NUMBER")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface SendTextRequest {
  user_id: string;
  to: string;           // recipient phone number
  message: string;
  notification_type: string;
  related_table?: string;
  related_id?: string;
}

serve(async (req: Request) => {
  try {
    const { user_id, to, message, notification_type, related_table, related_id }: SendTextRequest = await req.json();

    if (!to || !message) {
      return new Response(JSON.stringify({ error: "Missing 'to' or 'message'" }), { status: 400 });
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const authHeader = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);

    const twilioResponse = await fetch(twilioUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to,
        From: TWILIO_PHONE_NUMBER,
        Body: message,
      }),
    });

    const twilioResult = await twilioResponse.json();
    const success = twilioResponse.ok;

    // Log the notification
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await supabase.from("notifications").insert({
      user_id,
      notification_type,
      message,
      related_table: related_table || null,
      related_id: related_id || null,
      channel: "sms",
      status: success ? "sent" : "failed",
      sent_at: new Date().toISOString(),
    });

    if (!success) {
      console.error("Twilio error:", twilioResult);
      return new Response(JSON.stringify({ error: "SMS failed", details: twilioResult }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true, sid: twilioResult.sid }), { status: 200 });

  } catch (err) {
    console.error("send-text error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
