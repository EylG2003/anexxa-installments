// api/installments-subscribe.js
const Stripe = require('stripe');

async function readBody(req) {
  // Robust body parser for Vercel functions
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8') || '';
  try { return JSON.parse(raw); } catch { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');

  try {
    if (!process.env.STRIPE_SECRET) return res.status(500).send('Missing STRIPE_SECRET');
    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });

    const body = await readBody(req);
    let { amountCents, months, currency = 'eur', description = 'Installment plan' } = body || {};
    amountCents = parseInt(amountCents, 10);
    months = parseInt(months, 10);

    if (!amountCents || amountCents < 50) return res.status(400).send('amountCents must be >= 50');
    if (!months || months < 2 || months > 12) return res.status(400).send('months must be between 2 and 12');

    const perCents = Math.round(amountCents / months);

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const base = `https://${host}`;

    // Create a Subscription checkout (monthly), store metadata with total & months
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `${description} — ${months} × ${(perCents / 100).toFixed(2)} ${currency.toUpperCase()}` },
          unit_amount: perCents,
          // 👇 THIS is essential for subscriptions
          recurring: { interval: 'month', interval_count: 1 }
        },
        quantity: 1
      }],
      subscription_data: {
        metadata: {
          plan_months: String(months),
          total_amount_cents: String(amountCents)
        }
        // NOTE: We can auto-cancel after N months later via webhook by scheduling cancellation.
      },
      success_url: `${base}/success.html?sid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cancel.html`
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('subscribe error:', e);
    return res.status(500).send(e.message);
  }
};

