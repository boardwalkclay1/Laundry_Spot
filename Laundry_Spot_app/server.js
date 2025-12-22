import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.static(path.join(__dirname, "public")));

app.get("/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
  });
});

// Jobs API
let jobs = [];
let idCounter = 1;

app.get("/api/jobs", (req, res) => {
  res.json({ jobs });
});

app.post("/api/jobs", (req, res) => {
  const { customerName, address, notes, type } = req.body;

  const job = {
    id: idCounter++,
    customerName,
    address,
    notes,
    type,
    status: "pending",
    washerAccountId: null
  };

  jobs.push(job);
  res.json({ job });
});

app.post("/api/jobs/:id/accept", (req, res) => {
  const id = Number(req.params.id);
  const { washerAccountId } = req.body;

  const job = jobs.find(j => j.id === id);
  if (!job) return res.status(404).json({ error: "Job not found" });

  job.status = "accepted";
  job.washerAccountId = washerAccountId;

  res.json({ job });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
