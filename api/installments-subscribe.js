// Create a Checkout Session that charges monthly for N cycles
const Stripe = require("stripe");

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
}

// crude "add months" that lands near same day next month
function addMonthsTs(tsSeconds, months) {
  const d = new Date(tsSeconds * 1000);
  d.setMonth(d.getMonth() + months);
  return Math.floor(d.getTime() / 1000);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: "2024-06-20" });

  // body can be object or string on Vercel
  let body = {};
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch (_) {}

  const {
    amountCents,         // total amount in cents (e.g., 3000 = €30.00)
    months = 3,          // number of monthly payments (>=2)
    currency = "eur",    // "eur", "gbp", ...
    description = "Installment plan"
  } = body;

  if (!amountCents || amountCents < 50) {
    return res.status(400).json({ error: "amountCents required (>=50)" });
  }
  if (!months || months < 2 || months > 24) {
    return res.status(400).json({ error: "months must be between 2 and 24" });
  }

  // Equal splits; last payment may differ by a cent due to rounding (acceptable for MVP)
  const perInstallment = Math.round(amountCents / months);
  const origin = getOrigin(req);

  // Create a product+price for this ad-hoc plan (OK for MVP)
  const product = await stripe.products.create({
    name: "Anexxa Installment Plan",
    description,
    metadata: { total_amount: String(amountCents), months: String(months) }
  });

  const price = await stripe.prices.create({
    unit_amount: perInstallment,
    currency,
    recurring: { interval: "month", interval_count: 1 },
    product: product.id
  });

  // Cancel automatically after N cycles by using a future cancel_at
  const now = Math.floor(Date.now() / 1000);
  const cancelAt = addMonthsTs(now, months);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: false,
    payment_method_collection: "always",
    subscription_data: {
      cancel_at: cancelAt,
      metadata: {
        months: String(months),
        total_amount: String(amountCents),
        per_installment: String(perInstallment)
      }
    },
    success_url: `${origin}/success.html?sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cancel.html`
  });

  return res.status(200).json({ url: session.url });
};
