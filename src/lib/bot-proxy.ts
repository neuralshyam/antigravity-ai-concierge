/**
 * Server-Side Tool Proxy Layer
 * Executes tools requested by the bot.
 * Strictly enforces auth forwarding: if the tool is customer-scoped, it forwards the JWT to the store API.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export const BOT_TOOLS: ToolDefinition[] = [
  {
    name: "search_products",
    description: "Search and discover products in the store catalog by query keywords, category, price range, or stock status.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search keywords (e.g., 'tea', 'mala', 'sesame oil').",
        },
        category: {
          type: "string",
          description: "Optional category filter: 'Devotional', 'Wellness', 'Accessories', 'Groceries', 'Home'.",
        },
        maxPrice: {
          type: "number",
          description: "Maximum budget or price in USD.",
        },
        inStockOnly: {
          type: "boolean",
          description: "Set to true to only show in-stock products.",
        },
      },
    },
  },
  {
    name: "get_my_orders",
    description: "Retrieve list of previous and active orders placed by the currently logged-in customer. Requires customer authentication.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_order_details",
    description: "Get detailed tracking status, carrier, estimated delivery, and items for a specific order ID (e.g. 'ord_1001'). Requires customer authentication.",
    parameters: {
      type: "object",
      properties: {
        orderId: {
          type: "string",
          description: "The order ID to look up (e.g. 'ord_1001', 'ord_1002').",
        },
      },
      required: ["orderId"],
    },
  },
  {
    name: "get_my_profile",
    description: "Get the current customer's profile, saved delivery address, and contact details for personalized assistance. Requires customer authentication.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];

export async function executeToolCall(
  toolName: string,
  args: any,
  customerJwt: string | null,
  baseUrl: string
): Promise<{ success: boolean; data: any; requiresAuth?: boolean }> {
  const authHeaders: Record<string, string> = customerJwt
    ? { Authorization: `Bearer ${customerJwt}` }
    : {};

  switch (toolName) {
    case "search_products": {
      const url = new URL("/api/products", baseUrl);
      if (args.query) url.searchParams.set("q", args.query);
      if (args.category) url.searchParams.set("category", args.category);
      if (args.maxPrice) url.searchParams.set("maxPrice", String(args.maxPrice));
      if (args.inStockOnly !== undefined) url.searchParams.set("inStockOnly", String(args.inStockOnly));

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
            error: "Customer is not logged in. Please ask the user to log in so you can look up their orders.",
          },
        };
      }
      const res = await fetch(`${baseUrl}/api/customer/orders`, {
        headers: authHeaders,
      });
      const data = await res.json();
      return { success: res.ok, data };
    }

    case "get_order_details": {
      if (!customerJwt) {
        return {
          success: false,
          requiresAuth: true,
          data: {
            error: "Customer is not logged in. Please ask the user to log in to view specific order tracking details.",
          },
        };
      }
      const orderId = args.orderId?.trim();
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
            error: "Customer is not logged in. Profile lookup requires authentication.",
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
        data: { error: `Unknown tool: ${toolName}` },
      };
  }
}
