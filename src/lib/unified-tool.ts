import { Type, FunctionDeclaration } from "@google/genai";

/**
 * UNIFIED E-COMMERCE ACTION SCHEMA
 * Instead of dozens of fragmented tools, the LLM calls ONE unified tool: `ecommerce_action`.
 */
export type EcommerceIntent =
  | "search_catalog"
  | "get_my_orders"
  | "track_order"
  | "get_my_profile";

export interface UnifiedEcommercePayload {
  intent: EcommerceIntent;
  search_params?: {
    query?: string;
    category?: string;
    maxPrice?: number;
    inStockOnly?: boolean;
  };
  order_params?: {
    orderId?: string;
  };
}

export const UNIFIED_ECOMMERCE_TOOL: FunctionDeclaration = {
  name: "ecommerce_action",
  description:
    "Single unified entrypoint to perform any store operation: product discovery, checking order statuses, tracking shipments, or customer profile lookups. All operations automatically inherit the user's active session permissions.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      intent: {
        type: Type.STRING,
        description:
          "The specific store operation: 'search_catalog' (public search & inventory), 'get_my_orders' (list customer orders), 'track_order' (track specific order by ID), 'get_my_profile' (customer profile & saved address).",
      },
      search_params: {
        type: Type.OBJECT,
        description: "Parameters used when intent is 'search_catalog'.",
        properties: {
          query: { type: Type.STRING, description: "Keywords or product names." },
          category: { type: Type.STRING, description: "Category filter (e.g., 'Wellness', 'Devotional', 'Groceries')." },
          maxPrice: { type: Type.NUMBER, description: "Budget limit." },
          inStockOnly: { type: Type.BOOLEAN, description: "Only return items in stock." },
        },
      },
      order_params: {
        type: Type.OBJECT,
        description: "Parameters used when intent is 'track_order'.",
        properties: {
          orderId: { type: Type.STRING, description: "The specific order ID (e.g. 'ord_1001')." },
        },
      },
    },
    required: ["intent"],
  },
};

/**
 * UNIFIED PROXY DISPATCHER
 * Routes the intent internally to the right Next.js API route while forwarding the user's JWT.
 */
export async function dispatchUnifiedAction(
  payload: UnifiedEcommercePayload,
  customerJwt: string | null,
  baseUrl: string
): Promise<{ success: boolean; data: any; requiresAuth?: boolean }> {
  const { intent, search_params, order_params } = payload;
  const authHeaders: Record<string, string> = customerJwt
    ? { Authorization: `Bearer ${customerJwt}` }
    : {};

  switch (intent) {
    case "search_catalog": {
      const url = new URL("/api/products", baseUrl);
      if (search_params?.query) url.searchParams.set("q", search_params.query);
      if (search_params?.category) url.searchParams.set("category", search_params.category);
      if (search_params?.maxPrice) url.searchParams.set("maxPrice", String(search_params.maxPrice));
      if (search_params?.inStockOnly !== undefined) url.searchParams.set("inStockOnly", String(search_params.inStockOnly));

      const res = await fetch(url.toString());
      const data = await res.json();
      return { success: res.ok, data };
    }

    case "get_my_orders": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: {
            error: "Authentication required. Ask the user to log in to view their order history.",
          },
        };
      }
      const res = await fetch(`${baseUrl}/api/customer/orders`, {
        headers: authHeaders,
      });
      const data = await res.json();
      return { success: res.ok, data };
    }

    case "track_order": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: {
            error: "Authentication required. Ask the user to log in to track this order.",
          },
        };
      }
      const orderId = order_params?.orderId?.trim();
      if (!orderId) {
        return {
          success: false,
          data: { error: "Missing orderId in order_params." },
        };
      }
      const res = await fetch(`${baseUrl}/api/customer/orders/${encodeURIComponent(orderId)}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      return { success: res.ok, data };
    }

    case "get_my_profile": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: {
            error: "Authentication required. Profile access requires the customer to log in.",
          },
        };
      }
      const res = await fetch(`${baseUrl}/api/customer/me`, {
        headers: authHeaders,
      });
      const data = await res.json();
      return { success: res.ok, data };
    }

    default:
      return {
        success: false,
        data: { error: `Unsupported intent: ${intent}` },
      };
  }
}
