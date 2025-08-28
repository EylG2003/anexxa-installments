const Stripe = require("stripe");

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    req.on("data", (chunk) => (data = Buffer.concat([data, chunk])));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("POST only");

  const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: "2024-06-20" });
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");

  let event;
  try {
    const buf = await readRawBody(req);
    event = stripe.webhooks.constructEvent(buf, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        console.log("✅ checkout.session.completed", { id: s.id, subscription: s.subscription, customer: s.customer });
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object;
        console.log("💚 invoice.payment_succeeded", { invoice: inv.id, subscription: inv.subscription, amount_paid: inv.amount_paid });
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        console.log("💔 invoice.payment_failed", { invoice: inv.id, subscription: inv.subscription });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        console.log("🛑 subscription ended", { subscription: sub.id });
        break;
      }
      default:
        console.log("ℹ️ event", event.type);
    }
    res.json({ received: true });
  } catch (e) {
    console.error("Webhook handler error:", e);
    res.status(500).send("Webhook handler error");
  }
};
