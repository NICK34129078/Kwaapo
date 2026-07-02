import { supabase } from "../lib/supabase";
import type { Product } from "../types/product";
import {
  mapOrderItemRow,
  mapOrderRow,
  type Order,
  type OrderItem,
  type OrderItemRow,
  type OrderParticipant,
  type OrderRow,
  type BuyerOrder,
  type OrderStatus,
  type PaymentStatus,
  type SellerOrder,
} from "../types/order";
import {
  computePlatformFeeAmount,
  computeSellerAmount,
} from "../constants/platformFee";
import { fetchProductsByIds } from "./productsService";
import { fetchProductVariants } from "./productVariantService";
import {
  formatCheckoutAddressDraft,
  validateCheckoutAddressForPayment,
  validateCheckoutAddressSync,
} from "../utils/checkoutAddressValidation";
import {
  mapOrderFulfillmentRow,
  type OrderFulfillmentInfo,
} from "../utils/orderFulfillmentDisplay";

const ORDER_COLUMNS =
  "id, buyer_id, seller_id, status, subtotal_amount, platform_fee_amount, seller_amount, payment_status, buyer_email, buyer_full_name, shipping_country, shipping_city, shipping_postal_code, shipping_street, shipping_house_number, shipping_phone, seller_note, shipping_status, tracking_code, shipped_at, stripe_checkout_session_id, stripe_payment_intent_id, paid_at, created_at";
const ORDER_FULFILLMENT_COLUMNS =
  "fulfillment_status, payment_reconciled_at, fulfillment_exception_at, refund_requested_at, refund_completed_at";
const ORDER_SELECT = `${ORDER_COLUMNS}, ${ORDER_FULFILLMENT_COLUMNS}`;

export type { OrderFulfillmentInfo };

export type BuyerOrderDetail = BuyerOrder & {
  fulfillment: OrderFulfillmentInfo;
};

export type SellerOrderDetail = SellerOrder & {
  fulfillment: OrderFulfillmentInfo;
};
const ORDER_ITEM_COLUMNS =
  "id, order_id, product_id, product_variant_id, selected_variant_type, selected_variant_value, quantity, unit_price, size, created_at";

export type CheckoutOrderInput = {
  buyerFullName: string;
  buyerEmail: string;
  shippingCountry: string;
  shippingCity: string;
  shippingPostalCode: string;
  shippingStreet: string;
  shippingHouseNumber: string;
  shippingPhone?: string | null;
  sellerNote?: string | null;
  quantity: number;
  size?: string | null;
  productVariantId?: string | null;
  selectedVariantType?: string | null;
  selectedVariantValue?: string | null;
};

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  pending_payment: "paid",
  paid: "processing",
  processing: "shipped",
  shipped: "completed",
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function validateCheckoutInput(input: CheckoutOrderInput): CheckoutOrderInput {
  const formatted = formatCheckoutAddressDraft({
    buyerFullName: input.buyerFullName,
    buyerEmail: input.buyerEmail,
    shippingCountry: input.shippingCountry,
    shippingCity: input.shippingCity,
    shippingPostalCode: input.shippingPostalCode,
    shippingStreet: input.shippingStreet,
    shippingHouseNumber: input.shippingHouseNumber,
    shippingPhone: input.shippingPhone,
  });
  const syncErrors = validateCheckoutAddressSync(formatted);
  const firstError = Object.values(syncErrors)[0];
  if (firstError) {
    throw new Error(firstError);
  }

  const sellerNote = clean(input.sellerNote) || null;
  const quantity = Math.floor(Number(input.quantity));
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("Aantal moet minimaal 1 zijn.");
  }

  return {
    buyerFullName: formatted.buyerFullName,
    buyerEmail: formatted.buyerEmail,
    shippingCountry: formatted.shippingCountry,
    shippingCity: formatted.shippingCity,
    shippingPostalCode: formatted.shippingPostalCode,
    shippingStreet: formatted.shippingStreet,
    shippingHouseNumber: formatted.shippingHouseNumber,
    shippingPhone: formatted.shippingPhone,
    sellerNote,
    quantity,
    size: clean(input.size) || null,
    productVariantId: input.productVariantId ?? null,
    selectedVariantType: clean(input.selectedVariantType) || null,
    selectedVariantValue: clean(input.selectedVariantValue) || null,
  };
}

function shortProfile(row: ProfileRow): OrderParticipant {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
  };
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    throw error;
  }
  if (!user?.id) {
    throw new Error("Niet ingelogd.");
  }
  return user.id;
}

async function fetchProfilesByIds(
  ids: string[]
): Promise<Map<string, OrderParticipant>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map(
    ((data ?? []) as ProfileRow[]).map((row) => [row.id, shortProfile(row)])
  );
}

async function fetchItemsForOrders(
  orderIds: string[]
): Promise<Map<string, Array<OrderItem & { product?: Product }>>> {
  if (orderIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("order_items")
    .select(ORDER_ITEM_COLUMNS)
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const items = ((data ?? []) as OrderItemRow[]).map(mapOrderItemRow);
  const products = await fetchProductsByIds(items.map((item) => item.productId));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const map = new Map<string, Array<OrderItem & { product?: Product }>>();

  for (const item of items) {
    const next = {
      ...item,
      product: productsById.get(item.productId),
    };
    const list = map.get(item.orderId) ?? [];
    list.push(next);
    map.set(item.orderId, list);
  }

  return map;
}

export async function createOrderFromProduct(
  product: Product,
  inputOrSize?: CheckoutOrderInput | string | null
): Promise<Order> {
  const buyerId = await getCurrentUserId();
  if (!product?.id) {
    throw new Error("Product ontbreekt.");
  }

  const checkout =
    typeof inputOrSize === "object" && inputOrSize !== null
      ? validateCheckoutInput(inputOrSize)
      : validateCheckoutInput({
          buyerFullName: "Test koper",
          buyerEmail: "test@example.com",
          shippingCountry: "Nederland",
          shippingCity: "Onbekend",
          shippingPostalCode: "0000 AA",
          shippingStreet: "Teststraat",
          shippingHouseNumber: "1",
          quantity: 1,
          size: inputOrSize ?? null,
        });

  const usesVariantCheckout = product.usesVariants && product.variantsReady;
  if (usesVariantCheckout) {
    if (!checkout.productVariantId) {
      throw new Error("Kies eerst een maat.");
    }
    const variants = await fetchProductVariants(product.id);
    const variant = variants.find((v) => v.id === checkout.productVariantId);
    if (!variant || !variant.isActive || variant.stock < checkout.quantity) {
      throw new Error("De gekozen maat is niet meer op voorraad.");
    }
    if (variant.productId !== product.id) {
      throw new Error("Ongeldige maatkeuze.");
    }
  } else {
    if (product.stock <= 0) {
      throw new Error("Dit product is niet op voorraad.");
    }
    if (product.sizes.length > 0 && !checkout.size) {
      throw new Error("Kies eerst een maat.");
    }
  }

  if (buyerId === product.ownerId) {
    throw new Error("Je kunt je eigen product niet bestellen.");
  }

  const isRealCheckout = typeof inputOrSize === "object" && inputOrSize !== null;
  if (isRealCheckout) {
    const addressErrors = await validateCheckoutAddressForPayment({
      buyerFullName: checkout.buyerFullName,
      buyerEmail: checkout.buyerEmail,
      shippingCountry: checkout.shippingCountry,
      shippingCity: checkout.shippingCity,
      shippingPostalCode: checkout.shippingPostalCode,
      shippingStreet: checkout.shippingStreet,
      shippingHouseNumber: checkout.shippingHouseNumber,
      shippingPhone: checkout.shippingPhone,
    });
    const firstAddressError = Object.values(addressErrors)[0];
    if (firstAddressError) {
      throw new Error(firstAddressError);
    }
  }

  const subtotal = roundMoney(product.price * checkout.quantity);
  const platformFee = computePlatformFeeAmount(subtotal);
  const sellerAmount = computeSellerAmount(subtotal);

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      buyer_id: buyerId,
      seller_id: product.ownerId,
      status: "pending_payment",
      payment_status: "unpaid",
      subtotal_amount: subtotal,
      platform_fee_amount: platformFee,
      seller_amount: sellerAmount,
      buyer_email: checkout.buyerEmail,
      buyer_full_name: checkout.buyerFullName,
      shipping_country: checkout.shippingCountry,
      shipping_city: checkout.shippingCity,
      shipping_postal_code: checkout.shippingPostalCode,
      shipping_street: checkout.shippingStreet,
      shipping_house_number: checkout.shippingHouseNumber,
      shipping_phone: checkout.shippingPhone,
      seller_note: checkout.sellerNote,
      shipping_status: "not_shipped",
    })
    .select(ORDER_COLUMNS)
    .single<OrderRow>();

  if (orderError) {
    throw orderError;
  }

  const order = mapOrderRow(orderData);
  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    quantity: checkout.quantity,
    unit_price: product.price,
    size: checkout.size,
    product_variant_id: checkout.productVariantId,
    selected_variant_type: checkout.selectedVariantType ?? (checkout.productVariantId ? "size" : null),
    selected_variant_value: checkout.selectedVariantValue ?? checkout.size,
  });

  if (itemError) {
    throw itemError;
  }

  return order;
}

/** @deprecated Gebruik createOrderFromProduct */
export const createTestOrderFromProduct = createOrderFromProduct;

export async function markSellerOrderAsShipped(
  orderId: string,
  trackingCode?: string | null
): Promise<Order> {
  const sellerId = await getCurrentUserId();

  const { data: existing, error: readError } = await supabase
    .from("orders")
    .select("shipping_status, payment_status")
    .eq("id", orderId)
    .eq("seller_id", sellerId)
    .maybeSingle<{ shipping_status: string; payment_status: string }>();

  if (readError) {
    throw readError;
  }
  if (!existing) {
    throw new Error("Bestelling niet gevonden.");
  }
  if (existing.payment_status !== "paid") {
    throw new Error("Deze bestelling kan niet meer als verzonden worden gemarkeerd.");
  }
  if (existing.shipping_status === "shipped" || existing.shipping_status === "delivered") {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("id", orderId)
      .single<OrderRow>();
    if (error) {
      throw error;
    }
    return mapOrderRow(data);
  }

  const patch: Record<string, unknown> = {
    status: "shipped",
    shipping_status: "shipped",
    shipped_at: new Date().toISOString(),
  };
  const cleanTrackingCode = clean(trackingCode);
  if (cleanTrackingCode) {
    patch.tracking_code = cleanTrackingCode;
  }

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("seller_id", sellerId)
    .select(ORDER_COLUMNS)
    .single<OrderRow>();

  if (error) {
    throw error;
  }

  return mapOrderRow(data);
}

export type SellerOrderActivity = {
  orderId: string;
  createdAt: string;
  buyerId: string;
  buyerName: string;
  productName: string;
  productImageUrl: string | null;
  subtotalAmount: number;
};

export async function fetchSellerOrderActivities(
  limit = 40
): Promise<SellerOrderActivity[]> {
  const sellerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 80));

  if (error) {
    throw error;
  }

  const orders = ((data ?? []) as OrderRow[]).map(mapOrderRow);
  if (orders.length === 0) {
    return [];
  }

  const itemsByOrderId = await fetchItemsForOrders(orders.map((o) => o.id));

  return orders.map((order) => {
    const items = itemsByOrderId.get(order.id) ?? [];
    const first = items[0];
    return {
      orderId: order.id,
      createdAt: order.createdAt,
      buyerId: order.buyerId,
      buyerName: order.buyerFullName?.trim() || "Koper",
      productName: first?.product?.name ?? "Product",
      productImageUrl: first?.product?.images[0] ?? null,
      subtotalAmount: order.subtotalAmount,
    };
  });
}

export async function fetchSellerOrders(): Promise<SellerOrder[]> {
  const sellerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const orders = ((data ?? []) as OrderRow[]).map(mapOrderRow);
  const [itemsByOrderId, buyersById] = await Promise.all([
    fetchItemsForOrders(orders.map((order) => order.id)),
    fetchProfilesByIds(orders.map((order) => order.buyerId)),
  ]);

  return orders.map((order) => ({
    order,
    items: itemsByOrderId.get(order.id) ?? [],
    buyer: buyersById.get(order.buyerId) ?? null,
  }));
}

export async function fetchBuyerOrders(): Promise<BuyerOrder[]> {
  const buyerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const orders = ((data ?? []) as OrderRow[]).map(mapOrderRow);
  const [itemsByOrderId, sellersById] = await Promise.all([
    fetchItemsForOrders(orders.map((order) => order.id)),
    fetchProfilesByIds(orders.map((order) => order.sellerId)),
  ]);

  return orders.map((order) => ({
    order,
    items: itemsByOrderId.get(order.id) ?? [],
    seller: sellersById.get(order.sellerId) ?? null,
  }));
}

export async function fetchBuyerOrderById(
  orderId: string
): Promise<BuyerOrderDetail | null> {
  const buyerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("buyer_id", buyerId)
    .maybeSingle<OrderRow & {
      fulfillment_status?: string | null;
      payment_reconciled_at?: string | null;
      fulfillment_exception_at?: string | null;
      refund_requested_at?: string | null;
      refund_completed_at?: string | null;
    }>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const order = mapOrderRow(data);
  const fulfillment = mapOrderFulfillmentRow(data);
  const [itemsByOrderId, sellersById] = await Promise.all([
    fetchItemsForOrders([order.id]),
    fetchProfilesByIds([order.sellerId]),
  ]);

  return {
    order,
    fulfillment,
    items: itemsByOrderId.get(order.id) ?? [],
    seller: sellersById.get(order.sellerId) ?? null,
  };
}

export async function fetchSellerOrderById(
  orderId: string
): Promise<SellerOrderDetail | null> {
  const sellerId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", orderId)
    .eq("seller_id", sellerId)
    .maybeSingle<OrderRow & {
      fulfillment_status?: string | null;
      payment_reconciled_at?: string | null;
      fulfillment_exception_at?: string | null;
      refund_requested_at?: string | null;
      refund_completed_at?: string | null;
    }>();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const order = mapOrderRow(data);
  const fulfillment = mapOrderFulfillmentRow(data);
  const [itemsByOrderId, buyersById] = await Promise.all([
    fetchItemsForOrders([order.id]),
    fetchProfilesByIds([order.buyerId]),
  ]);

  return {
    order,
    fulfillment,
    items: itemsByOrderId.get(order.id) ?? [],
    buyer: buyersById.get(order.buyerId) ?? null,
  };
}

export function getNextOrderStatus(
  status: OrderStatus
): OrderStatus | null {
  return NEXT_STATUS[status] ?? null;
}

export function canMoveToOrderStatus(
  current: OrderStatus,
  next: OrderStatus
): boolean {
  if (next === "cancelled") {
    return current !== "completed" && current !== "refunded";
  }
  return NEXT_STATUS[current] === next;
}

export async function updateSellerOrderStatus(
  orderId: string,
  currentStatus: OrderStatus,
  nextStatus: OrderStatus
): Promise<Order> {
  if (!canMoveToOrderStatus(currentStatus, nextStatus)) {
    throw new Error("Deze statuswijziging is niet toegestaan.");
  }

  const sellerId = await getCurrentUserId();
  const patch: Record<string, unknown> = { status: nextStatus };
  if (nextStatus === "shipped") {
    patch.shipping_status = "shipped";
    patch.shipped_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .eq("seller_id", sellerId)
    .select(ORDER_COLUMNS)
    .single<OrderRow>();

  if (error) {
    throw error;
  }

  return mapOrderRow(data);
}

export type { BuyerOrder, OrderStatus, PaymentStatus, SellerOrder };
