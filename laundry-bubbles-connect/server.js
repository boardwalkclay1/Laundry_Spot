require('dotenv').config();

const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const Stripe = require('stripe');

const app = express();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const BASE_URL = process.env.BASE_URL || 'http://localhost:4242';
const PORT = process.env.PORT || 4242;

// In-memory job storage
let jobs = [];
let nextJobId = 1;

app.use(bodyParser.json());
app.use(express.static('public'));

// Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/customer', (req, res) => res.sendFile(path.join(__dirname, 'public', 'customer-dashboard.html')));
app.get('/washer/onboarding', (req, res) => res.sendFile(path.join(__dirname, 'public', 'washer-onboarding.html')));
app.get('/washer/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'washer-dashboard.html')));

// Create job
app.post('/api/jobs', (req, res) => {
  const { customerName, address, notes } = req.body;

  if (!customerName || !address) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const newJob = {
    id: nextJobId++,
    customerName,
    address,
    notes: notes || '',
    priceCents: 1500,
    status: 'pending',
    washerAccountId: null,
    paymentIntentId: null
  };

  jobs.push(newJob);
  res.json({ job: newJob });
});

// List jobs
app.get('/api/jobs', (req, res) => {
  res.json({ jobs: jobs.filter(j => j.status === 'pending') });
});

// Accept job
app.post('/api/jobs/:id/accept', (req, res) => {
  const jobId = parseInt(req.params.id);
  const { washerAccountId } = req.body;

  const job = jobs.find(j => j.id === jobId);
  if (!job) return res.status(404).json({ error: 'Job not found.' });
  if (job.status !== 'pending') return res.status(400).json({ error: 'Job already taken.' });

  job.status = 'accepted';
  job.washerAccountId = washerAccountId;

  res.json({ job });
});

// PaymentIntent
app.post('/api/jobs/:id/pay', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const { paymentMethodId } = req.body;

    const job = jobs.find(j => j.id === jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: job.priceCents,
      currency: 'usd',
      payment_method: paymentMethodId,
      confirm: true,
      description: `Laundry job #${job.id}`
    });

    job.paymentIntentId = paymentIntent.id;

    res.json({ paymentIntent });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Payment failed.' });
  }
});

// Create Connect account
app.post('/api/washer/create-account', async (req, res) => {
  try {
    const { email } = req.body;

    const account = await stripe.accounts.create({
      type: 'express',
      email,
      capabilities: { transfers: { requested: true } },
      business_type: 'individual'
    });

    res.json({ accountId: account.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

// Create onboarding link
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
    console.error(err);
    res.status(500).json({ error: 'Could not create onboarding link.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on ${BASE_URL}`);
});
