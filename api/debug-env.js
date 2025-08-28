module.exports = (req, res) => {
  const k = process.env.STRIPE_SECRET || "";
  const env = k.startsWith("sk_live_") ? "live" : (k.startsWith("sk_test_") ? "test" : "missing");
  res.status(200).json({ stripeKeyEnv: env, hasKey: !!k });
};
