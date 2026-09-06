/**
 * Zero-Touch Ebakx E-Commerce Proxy Adapter
 * 
 * Maps directly to your friend's Express backend WITHOUT touching a single line
 * of his existing codebase.
 * 
 * Express Base URL: defaults to process.env.EBAKX_BACKEND_URL or http://localhost:5000/api/v1
 */

export interface EbakxSearchParams {
  searchTerm?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

export interface EbakxActionPayload {
  intent:
    | "search_products"
    | "get_product_details"
    | "get_my_orders"
    | "track_single_order"
    | "get_my_cart"
    | "add_to_cart"
    | "get_my_wishlist"
    | "get_my_profile";
  search_params?: EbakxSearchParams;
  product_id?: string;
  order_id?: string;
  cart_item?: {
    productId: string;
    quantity?: number;
    color?: string;
    size?: string;
  };
}

export async function dispatchEbakxAction(
  payload: EbakxActionPayload,
  customerJwt: string | null,
  customBackendUrl?: string
): Promise<{ success: boolean; data: any; requiresAuth?: boolean }> {
  const backendBase =
    customBackendUrl ||
    process.env.EBAKX_BACKEND_URL ||
    "http://localhost:5000/api/v1";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (customerJwt) {
    headers["Authorization"] = customerJwt.startsWith("Bearer ")
      ? customerJwt
      : `Bearer ${customerJwt}`;
  }

  const { intent, search_params, product_id, order_id, cart_item } = payload;

  switch (intent) {
    // 1. PUBLIC: Search & Discover Products in Ebakx Catalog
    case "search_products": {
      const url = new URL(`${backendBase}/product/get-all-products`);
      if (search_params?.searchTerm) url.searchParams.set("searchTerm", search_params.searchTerm);
      if (search_params?.category) url.searchParams.set("category", search_params.category);
      if (search_params?.minPrice) url.searchParams.set("minPrice", String(search_params.minPrice));
      if (search_params?.maxPrice) url.searchParams.set("maxPrice", String(search_params.maxPrice));
      if (search_params?.page) url.searchParams.set("page", String(search_params.page));
      url.searchParams.set("limit", String(search_params?.limit || 5));

      try {
        const res = await fetch(url.toString(), { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to query Ebakx products: ${err.message}` } };
      }
    }

    // 2. PUBLIC: Get Single Product Details & Variants
    case "get_product_details": {
      if (!product_id) {
        return { success: false, data: { error: "Missing product_id" } };
      }
      try {
        const res = await fetch(`${backendBase}/product/get-single-product/${encodeURIComponent(product_id)}`, { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to fetch product details: ${err.message}` } };
      }
    }

    // 3. PROTECTED: Buyer Order History
    case "get_my_orders": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: { error: "Please log in with your Ebakx account to view your orders." },
        };
      }
      try {
        const res = await fetch(`${backendBase}/order/get-all-order-for-buyer`, { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to fetch buyer orders: ${err.message}` } };
      }
    }

    // 4. PROTECTED: Track Specific Order
    case "track_single_order": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: { error: "Please log in with your Ebakx account to track this order." },
        };
      }
      if (!order_id) {
        return { success: false, data: { error: "Missing order_id" } };
      }
      try {
        const res = await fetch(`${backendBase}/order/get-single-order/${encodeURIComponent(order_id)}`, { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to track order: ${err.message}` } };
      }
    }

    // 5. PROTECTED: Get My Cart
    case "get_my_cart": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: { error: "Please log in to view items in your cart." },
        };
      }
      try {
        const res = await fetch(`${backendBase}/cart/my-cart`, { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to retrieve cart: ${err.message}` } };
      }
    }

    // 6. PROTECTED: Add Item to Cart
    case "add_to_cart": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: { error: "Please log in to add items to your cart." },
        };
      }
      if (!cart_item?.productId) {
        return { success: false, data: { error: "Missing cart_item.productId" } };
      }
      try {
        const res = await fetch(`${backendBase}/cart/add/${encodeURIComponent(cart_item.productId)}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            quantity: cart_item.quantity || 1,
            color: cart_item.color,
            size: cart_item.size,
          }),
        });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to add to cart: ${err.message}` } };
      }
    }

    // 7. PROTECTED: Wishlist
    case "get_my_wishlist": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: { error: "Please log in to view your wishlist." },
        };
      }
      try {
        const res = await fetch(`${backendBase}/wishlist/my-wishlist`, { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to fetch wishlist: ${err.message}` } };
      }
    }

    // 8. PROTECTED: Buyer Profile
    case "get_my_profile": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: { error: "Please log in to view profile." },
        };
      }
      try {
        const res = await fetch(`${backendBase}/user/profile`, { headers });
        const json = await res.json();
        return { success: res.ok, data: json?.data || json };
      } catch (err: any) {
        return { success: false, data: { error: `Failed to fetch user profile: ${err.message}` } };
      }
    }

    default:
      return { success: false, data: { error: `Unknown intent: ${intent}` } };
  }
}
