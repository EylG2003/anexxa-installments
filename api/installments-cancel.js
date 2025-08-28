const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: "2024-06-20" });
  let body = {};
  try { body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}"); } catch(_){}
  const { subscriptionId, atPeriodEnd = true } = body;

  if (!subscriptionId) return res.status(400).json({ error: "subscriptionId required" });

  const sub = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: !!atPeriodEnd });
  res.json({ canceled: true, cancel_at_period_end: sub.cancel_at_period_end, id: sub.id });
};
