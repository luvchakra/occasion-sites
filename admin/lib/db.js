// Row <-> API shape mapping for the Supabase-backed tables. Every route
// keeps returning the same camelCase JSON it always has, so the frontend
// needed zero changes for the Supabase migration.
const supabase = require('./supabase');

function orThrow(error, status = 500) {
  if (!error) return;
  const err = new Error(error.message);
  err.status = status;
  throw err;
}

const mapCustomer = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email || '',
  phone: r.phone || '',
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const mapOrder = (r) => ({
  id: r.id,
  orderNumber: r.order_number,
  customerId: r.customer_id,
  title: r.title,
  occasionType: r.occasion_type,
  templateId: r.template_id,
  slug: r.slug,
  occasionDate: r.occasion_date || '',
  status: r.status,
  publishedPath: r.published_path || '',
  publicUrl: r.public_url || '',
  config: r.config || {},
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const mapInvoice = (r) => ({
  id: r.id,
  invoiceNumber: r.invoice_number,
  orderId: r.order_id,
  issueDate: r.issue_date || '',
  dueDate: r.due_date || '',
  items: r.items || [],
  notes: r.notes || '',
  status: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at
});

const mapOccasion = (r) => ({ code: r.code, label: r.label });

const mapSettings = (r) => ({
  businessName: (r && r.business_name) || '',
  address: (r && r.address) || '',
  email: (r && r.email) || '',
  phone: (r && r.phone) || '',
  paymentDetails: (r && r.payment_details) || ''
});

module.exports = { supabase, orThrow, mapCustomer, mapOrder, mapInvoice, mapOccasion, mapSettings };
