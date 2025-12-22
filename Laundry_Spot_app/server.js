// server.js (Laundry Spot - unified backend)

require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ---------- BASIC APP CONFIG ----------
const PORT = process.env.PORT || 4242;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

app.use(cors());
app.use(express.json());

// Serve static frontend files (put all your HTML/CSS/JS in ./public)
app.use(express.static(path.join(__dirname, 'public')));

// ---------- SUPABASE SETUP (SERVER-SIDE) ----------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// This client uses the SERVICE ROLE key – keep it ONLY on the server
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// ---------- CONFIG ENDPOINT FOR FRONTEND ----------
app.get('/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,           // for frontend auth
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY, // for Stripe.js
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
  });
});

// ---------- JOBS API (CUSTOMER REQUESTS) ----------
// Expected Supabase table: jobs (id, customer_name, address, notes, type, status, washer_account_id)

app.post('/api/jobs', async (req, res) => {
  try {
    const { customerName, address, notes, type } = req.body;

    if (!customerName || !address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const { data, error } = await supabaseAdmin
      .from('jobs')
      .insert([
        {
          customer_name: customerName,
          address,
          notes: notes || '',
          type: type || 'pickup',
          status: 'pending'
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error inserting job:', error);
      return res.status(500).json({ error: 'Failed to create job' });
    }

    res.json({ job: mapJob(data) });
  } catch (err) {
    console.error('Error in POST /api/jobs:', err);
    res.status(500).json({ error: 'Server error creating job' });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error('Error fetching jobs:', error);
      return res.status(500).json({ error: 'Failed to fetch jobs' });
    }

    res.json({ jobs: (data || []).map(mapJob) });
  } catch (err) {
    console.error('Error in GET /api/jobs:', err);
    res.status(500).json({ error: 'Server error fetching jobs' });
  }
});

app.post('/api/jobs/:id/accept', async (req, res) => {
  try {
    const { id } = req.params;
    const { washerAccountId } = req.body;

    if (!washerAccountId) {
      return res.status(400).json({ error: 'washerAccountId is required' });
    }

    const { data, error } = await supabaseAdmin
      .from('jobs')
      .update({
        status: 'accepted',
        washer_account_id: washerAccountId
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error accepting job:', error);
      return res.status(500).json({ error: 'Failed to accept job' });
    }

    res.json({ job: mapJob(data) });
  } catch (err) {
    console.error('Error in POST /api/jobs/:id/accept:', err);
    res.status(500).json({ error: 'Server error accepting job' });
  }
});

// Helper to map DB row to frontend shape
function mapJob(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    address: row.address,
    notes: row.notes,
    type: row.type,
    status: row.status,
    washerAccountId: row.washer_account_id || null
  };
}

// ---------- STRIPE: CUSTOMER PAYMENTS (CARDS & PORTAL) ----------

// Create SetupIntent so customer can securely save a card
app.post('/api/payments/create-setup-intent', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find or create Stripe customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    let customer = customers.data[0];

    if (!customer) {
      customer = await stripe.customers.create({ email });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card']
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    console.error('Error creating setup intent:', err);
    res.status(500).json({ error: 'Failed to create setup intent' });
  }
});

// Create Stripe Billing Portal session so customer can manage payment methods
app.post('/api/payments/create-portal-session', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const customers = await stripe.customers.list({ email, limit: 1 });
    const customer = customers.data[0];

    if (!customer) {
      return res.status(400).json({ error: 'Customer not found' });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${BASE_URL}/customer-payment.html`
    });

    res.json({ url: portalSession.url });
  } catch (err) {
    console.error('Error creating portal session:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ---------- STRIPE: WASHER CONNECT ONBOARDING ----------

// Create a Stripe Connect account for washer
app.post('/api/washer/create-account', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      email
    });

    res.json({ accountId: account.id });
  } catch (err) {
    console.error('Error creating washer account:', err);
    res.status(500).json({ error: 'Failed to create washer Stripe account' });
  }
});

// Create onboarding link for washer to complete their Stripe account
app.post('/api/washer/create-account-link', async (req, res) => {
  try {
    const { accountId } = req.body;

    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${BASE_URL}/washer-onboarding.html`,
      return_url: `${BASE_URL}/washer-dashboard.html`,
      type: 'account_onboarding'
    });

    res.json({ url: accountLink.url });
  } catch (err) {
    console.error('Error creating washer account link:', err);
    res.status(500).json({ error: 'Failed to create washer onboarding link' });
  }
});

// ---------- ROOT ROUTE (OPTIONAL) ----------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`Laundry Spot server running at ${BASE_URL}`);
});
