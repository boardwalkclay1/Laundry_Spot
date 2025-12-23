import express from "express";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Supabase (service role)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// -------------------------------
// Create Stripe customer for new Supabase user
// -------------------------------
app.post("/api/create-stripe-customer", async (req, res) => {
  try {
    const { user_id, email } = req.body;

    if (!user_id || !email) {
      return res.status(400).json({ error: "Missing user_id or email" });
    }

    // Create Stripe customer
    const customer = await stripe.customers.create({
      email,
      metadata: { supabase_user_id: user_id }
    });

    // Save to Supabase
    await supabase
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", user_id);

    res.json({ customer_id: customer.id });
  } catch (err) {
    console.error("Stripe customer error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------
// Create Payment Intent
// -------------------------------
app.post("/api/create-payment-intent", async (req, res) => {
  try {
    const { amount, customer_id } = req.body;

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      customer: customer_id
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error("Payment intent error:", err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------
// Stripe Webhook
// -------------------------------
app.post(
  "/api/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle events
    if (event.type === "payment_intent.succeeded") {
      console.log("Payment succeeded:", event.data.object.id);
    }

    res.json({ received: true });
  }
);

// -------------------------------
// Start server
// -------------------------------
app.listen(4242, () => {
  console.log("Server running on port 4242");
});
