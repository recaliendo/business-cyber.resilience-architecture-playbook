import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export default async (req: Request) => {
  const event = JSON.parse(await req.text());
  switch (event.type) {
    case 'checkout.session.completed':
      // grant entitlement without verifying the signature
      break;
  }
  return new Response('ok');
};
