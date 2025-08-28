// /api/installments-subscribe.js
const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET, { apiVersion: '2024-06-20' });

    // Accept JSON or form-encoded, commas or dots, and a few alias field names
    const body = req.body || {};
    const rawAmt = (
      body.amountEuro ??
      body.amount ??
      body.total ??
      body.totalEuro ??
      ''
    ).toString();

    const rawMonths = (body.months ?? body.installments ?? body.count ?? '').toString();

    const amountEuro = parseFloat(rawAmt.replace(',', '.'));
    const months = parseInt(rawMonths, 10);

    if (!Number.isFinite(amountEuro) || amountEuro <= 0) {
      return res.status(400).json({ error: 'amountEuro must be > 0' });
    }
    if (!Number.isFinite(months) || months < 2 || months > 12) {
      return res.status(400).json({ error: 'months must be an integer 2–12' });
    }

    // Basic per-month amount (≥ €0.50)
    const perMonthCents = Math.max(50, Math.round((amountEuro * 100) / months));

    const origin = `https://${req.headers.host}`;
    const success_url = `${origin}/success.html?sid={CHECKOUT_SESSION_ID}`;
    const cancel_url = `${origin}/cancel.html`;

    // Create a subscription Checkout (recurring monthly)
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'eur',
          unit_amount: perMonthCents,
          recurring: { interval: 'month', interval_count: 1 },
          product_data: {
            name: `Installment plan (${months} months)`,
            description: `Total €${amountEuro.toFixed(2)} split over ${months} months`
          }
        },
        quantity: 1
      }],
      success_url,
      cancel_url,
      // Store some context
      subscription_data: {
        metadata: {
          total_amount_eur: amountEuro.toFixed(2),
          months: String(months)
        }
      }
    });

    return res.status(200).json({ url: session.url });
  } catch (e) {
    // Surface a helpful error
    return res.status(500).json({ error: e.message || 'Server error' });
  }
};
