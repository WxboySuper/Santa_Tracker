'use strict';

const { deleteStripeCustomer } = require('./account-lifecycle');

/** Redacts identifiers in logs so server output stays useful without exposing full values. */
const redactIdentifier = (value) => {
  if (typeof value !== 'string' || value.length <= 4) {
    return value || null;
  }

  return `...${value.slice(-4)}`;
};

/** Returns the Stripe object ID for either an expanded object or a plain ID. */
const getStripeObjectId = (value) => (typeof value === 'string' ? value : value?.id || '');

/** Returns the first usable Stripe ID from a list of expanded objects or plain IDs. */
const getFirstStripeObjectId = (values) => values.map(getStripeObjectId).find(Boolean) || '';

/** Finds a payment intent from invoice payments list via the Invoice Payments API. */
const findPaymentIntentFromInvoicePayments = async (stripe, invoiceId) => {
  if (!stripe.invoicePayments?.list || !invoiceId) return null;
  const invoicePayments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 });
  return getFirstStripeObjectId(invoicePayments.data.map((payment) => payment?.payment?.payment_intent));
};

/** Resolves a refundable payment intent from an invoice across legacy and current Stripe shapes. */
const resolveInvoicePaymentIntentId = async (stripe, invoice) => {
  const legacyPaymentIntent = getStripeObjectId(invoice.payment_intent);
  if (legacyPaymentIntent) return legacyPaymentIntent;

  const fromPayments = getFirstStripeObjectId(
    (invoice.payments?.data || []).map((payment) => payment?.payment?.payment_intent),
  );
  return fromPayments || findPaymentIntentFromInvoicePayments(stripe, getStripeObjectId(invoice.id));
};

/** Refunds a late invoice payment and removes the Stripe customer for a deleted account. */
const refundDeletedAccountInvoice = async (invoice, { stripe, customerId }) => {
  if (!stripe) return;
  const paymentIntentId = await resolveInvoicePaymentIntentId(stripe, invoice);
  if (!paymentIntentId) return;
  await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `account-deletion-invoice-refund:${getStripeObjectId(invoice.id)}` },
  );
  await deleteStripeCustomer({ stripe, customerId });
};

module.exports = {
  getStripeObjectId,
  refundDeletedAccountInvoice,
};

