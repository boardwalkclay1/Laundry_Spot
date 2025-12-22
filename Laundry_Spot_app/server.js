require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const BASE_URL = process.env.BASE_URL || 'http://localhost:4242';
const PORT = process.env.PORT || 4242;

// ---------- Supabase client ----------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

app.use(bodyParser.json());

// Serve all static files from the root folder
app.use(express.static(__dirname));

/* -------------------------
   PAGE ROUTES
-------------------------- */

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'index.html'))
);

app.get('/customer', (req, res) =>
  res.sendFile(path.join(__dirname, 'customer-dashboard.html'))
);

app.get('/washer/onboarding', (req, res) =>
  res.sendFile(path.join(__dirname, 'washer-onboarding.html'))
);

app.get('/washer/dashboard', (req, res) =>
  res.sendFile(path.join(__dirname, 'washer-dashboard.html'))
);

/* -------------------------
   JOB CREATION (Supabase)
-------------------------- */

app.post('/api/jobs', async (req, res) => {
  try {
    const { customerName, address, notes } = req.body;

    if (!customerName || !address) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const { data, error } = await supabase
      .from('jobs')
      .insert([
        {
          customer_name: customerName,
          address,
          notes: notes || '',
          price_cents: 1500,
          status: 'pending',
          washer_id: null,
          payment_intent_id: null
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert job error:', error);
      return res.status(500).json({ error: 'Could not create job.' });
    }

    // Map DB fields to the shape the frontend expects
    const job = {
      id: data.id,
      customerName: data.customer_name,
      address: data.address,
      notes: data.notes,
      priceCents: data.price_cents,
      status: data.status,
      washerAccountId: data.washer_id,
      paymentIntentId: data.payment_intent_id
    };

    res.json({ job });
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ error: 'Server error creating job.' });
  }
});

/* -------------------------
   LIST PENDING JOBS (Supabase)
-------------------------- */

app.get('/api/jobs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Supabase list jobs error:', error);
      return res.status(500).json({ error: 'Could not fetch jobs.' });
    }

    const jobs = data.map(j => ({
      id: j.id,
      customerName: j.customer_name,
      address: j.address,
      notes: j.notes,
      priceCents: j.price_cents,
      status: j.status,
      washerAccountId: j.washer_id,
      paymentIntentId: j.payment_intent_id
    }));

    res.json({ jobs });
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: 'Server error fetching jobs.' });
  }
});

/* -------------------------
   ACCEPT JOB (Supabase)
-------------------------- */

app.post('/api/jobs/:id/accept', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { washerAccountId } = req.body; // could be washer_id

    // Make sure job is still pending
    const { data: jobData, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !jobData) {
      console.error('Supabase fetch job error:', fetchError);
      return res.status(404).json({ error: 'Job not found.' });
    }

    if (jobData.status !== 'pending') {
      return res.status(400).json({ error: 'Job already taken.' });
    }

    const { data, error } = await supabase
      .from('jobs')
      .update({
        status: 'accepted',
        washer_id: washerAccountId
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) {
      console.error('Supabase update job error:', error);
      return res.status(500).json({ error: 'Could not accept job.' });
    }

    const job = {
      id: data.id,
      customerName: data.customer_name,
      address: data.address,
      notes: data.notes,
      priceCents: data.price_cents,
      status: data.status,
      washerAccountId: data.washer_id,
      paymentIntentId: data.payment_intent_id
    };

    res.json({ job });
  } catch (err) {
    console.error('Accept job error:', err);
    res.status(500).json({ error: 'Server error accepting job.' });
  }
});

/* -------------------------
   PAYMENT INTENT (Stripe + Supabase)
-------------------------- */

app.post('/api/jobs/:id/pay', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { paymentMethodId } = req.body;

    const { data: jobData, error: fetchError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !jobData) {
      console.error('Supabase fetch job for pay error:', fetchError);
      return res.status(404).json({ error: 'Job not found.' });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: jobData.price_cents,
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      description: `Laundry job #${jobData.id}`
    });

    const { error: updateError } = await supabase
      .from('jobs')
      .update({ payment_intent_id: paymentIntent.id })
      .eq('id', jobId);

    if (updateError) {
      console.error('Supabase update paymentIntent error:', updateError);
      // we still return paymentIntent, but log the failure
    }

    res.json({ paymentIntent });
  } catch (err) {
    console.error('Stripe payment error:', err);
    res.status(500).json({ error: 'Payment failed.' });
  }
});

/* -------------------------
   STRIPE CONNECT ACCOUNT + WASHER RECORD
-------------------------- */

app.post('/api/washer/create-account', async (req, res) => {
  try {
    const { email } = req.body;

    const account = await stripe.accounts.create({
      type: 'express',
      email,
      capabilities: {
        transfers: { requested: true }
      },
      business_type: 'individual'
    });

    // Store washer in Supabase
    const { data, error } = await supabase
      .from('washers')
      .insert([
        {
          email,
          stripe_account_id: account.id
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert washer error:', error);
      // we still return the Stripe accountId so onboarding can continue
    }

    res.json({ accountId: account.id, washer: data || null });
  } catch (err) {
    console.error('Create washer account error:', err);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

/* -------------------------
   STRIPE ONBOARDING LINK
-------------------------- */

app.post('/api/washer/create-account-link', async (req, res) => {
  try {
    const { accountId } = req.body;

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${BASE_URL}/washer-onboarding.html?refresh=true`,
      return_url: `${BASE_URL}/washer-dashboard.html?onboarding_complete=true`,
      type: 'account_onboarding'
    });

    res.json({ url: link.url });
  } catch (err) {
    console.error('Create onboarding link error:', err);
    res.status(500).json({ error: 'Could not create onboarding link.' });
  }
});

/* -------------------------
   START SERVER
-------------------------- */

app.listen(PORT, () => {
  console.log(`Unified Laundry Spot + Stripe + Supabase server running at ${BASE_URL}`);
});
