import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve frontend files
app.use(express.static(path.join(__dirname, "public")));

// ------------------------------------------------------
// CONFIG ENDPOINT (required by login + signup pages)
// ------------------------------------------------------
app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || ""
  });
});

// ------------------------------------------------------
// SIMPLE IN-MEMORY JOBS API
// ------------------------------------------------------
let jobs = [];
let idCounter = 1;

// Get all jobs
app.get("/api/jobs", (req, res) => {
  res.json({ jobs });
});

// Create a job
app.post("/api/jobs", (req, res) => {
  const { customerName, address, notes, type } = req.body;

  if (!customerName || !address || !type) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const job = {
    id: idCounter++,
    customerName,
    address,
    notes: notes || "",
    type,
    status: "pending",
    washerAccountId: null,
    createdAt: new Date().toISOString()
  };

  jobs.push(job);
  res.json({ job });
});

// Washer accepts a job
app.post("/api/jobs/:id/accept", (req, res) => {
  const id = Number(req.params.id);
  const { washerAccountId } = req.body;

  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  job.status = "accepted";
  job.washerAccountId = washerAccountId;

  res.json({ job });
});

// ------------------------------------------------------
// START SERVER
// ------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
