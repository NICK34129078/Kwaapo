import type { Product } from "./product";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";

export type ShippingStatus = "not_shipped" | "shipped" | "delivered";

export type PaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type Order = {
  id: string;
  buyerId: string;
  sellerId: string;
  status: OrderStatus;
  subtotalAmount: number;
  platformFeeAmount: number;
  sellerAmount: number;
  paymentStatus: PaymentStatus;
  buyerEmail: string | null;
  buyerFullName: string | null;
  shippingCountry: string | null;
  shippingCity: string | null;
  shippingPostalCode: string | null;
  shippingStreet: string | null;
  shippingHouseNumber: string | null;
  shippingPhone: string | null;
  sellerNote: string | null;
  shippingStatus: ShippingStatus;
  trackingCode: string | null;
  shippedAt: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  size: string | null;
  createdAt: string;
};

export type OrderRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  status: string;
  subtotal_amount: number | string;
  platform_fee_amount: number | string;
  seller_amount: number | string;
  payment_status: string | null;
  buyer_email: string | null;
  buyer_full_name: string | null;
  shipping_country: string | null;
  shipping_city: string | null;
  shipping_postal_code: string | null;
  shipping_street: string | null;
  shipping_house_number: string | null;
  shipping_phone: string | null;
  seller_note: string | null;
  shipping_status: string | null;
  tracking_code: string | null;
  shipped_at: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number | string;
  size: string | null;
  created_at: string;
};

export type OrderParticipant = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type SellerOrder = {
  order: Order;
  items: Array<OrderItem & { product?: Product }>;
  buyer: OrderParticipant | null;
};

export type BuyerOrder = {
  order: Order;
  items: Array<OrderItem & { product?: Product }>;
  seller: OrderParticipant | null;
};

const ORDER_STATUSES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
];

const SHIPPING_STATUSES: ShippingStatus[] = [
  "not_shipped",
  "shipped",
  "delivered",
];

const PAYMENT_STATUSES: PaymentStatus[] = [
  "unpaid",
  "paid",
  "failed",
  "refunded",
];

function parseMoney(value: number | string): number {
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isOrderStatus(value: string): value is OrderStatus {
  return (ORDER_STATUSES as string[]).includes(value);
}

export function isShippingStatus(value: string): value is ShippingStatus {
  return (SHIPPING_STATUSES as string[]).includes(value);
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as string[]).includes(value);
}

export function mapOrderRow(row: OrderRow): Order {
  return {
    id: row.id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    status: isOrderStatus(row.status) ? row.status : "pending_payment",
    subtotalAmount: parseMoney(row.subtotal_amount),
    platformFeeAmount: parseMoney(row.platform_fee_amount),
    sellerAmount: parseMoney(row.seller_amount),
    paymentStatus:
      row.payment_status && isPaymentStatus(row.payment_status)
        ? row.payment_status
        : "unpaid",
    buyerEmail: row.buyer_email,
    buyerFullName: row.buyer_full_name,
    shippingCountry: row.shipping_country,
    shippingCity: row.shipping_city,
    shippingPostalCode: row.shipping_postal_code,
    shippingStreet: row.shipping_street,
    shippingHouseNumber: row.shipping_house_number,
    shippingPhone: row.shipping_phone,
    sellerNote: row.seller_note,
    shippingStatus:
      row.shipping_status && isShippingStatus(row.shipping_status)
        ? row.shipping_status
        : "not_shipped",
    trackingCode: row.tracking_code,
    shippedAt: row.shipped_at,
    stripeCheckoutSessionId: row.stripe_checkout_session_id ?? null,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

export function mapOrderItemRow(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    quantity: Math.max(1, row.quantity ?? 1),
    unitPrice: parseMoney(row.unit_price),
    size: row.size,
    createdAt: row.created_at,
  };
}
