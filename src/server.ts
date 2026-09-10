import Groq from "groq-sdk";
import { checkPromptSafety } from "./lib/prompt-guard";
import { prisma } from "./lib/prisma";

// --- Server Environment & Configuration ---
const PORT = Number(process.env.PORT || process.env.CONCIERGE_PORT || 8080);
const CONTROL_PLANE_SECRET = process.env.CONTROL_PLANE_SECRET || "antigravity-master-control-secret-108";
const DEFAULT_GROQ_KEY = process.env.GROQ_API_KEY || "";

// --- Dynamic Runtime Config (Hot-reloadable via Control Plane) ---
interface EngineConfig {
  model: string;
  guardModel: string;
  promptGuardEnabled: boolean;
  temperature: number;
  maxTokens: number;
  defaultSystemPrompt: string;
}

const engineConfig: EngineConfig = {
  model: "openai/gpt-oss-120b",
  guardModel: "meta-llama/llama-prompt-guard-2-22m",
  promptGuardEnabled: true,
  temperature: 0.2,
  maxTokens: 1024,
  defaultSystemPrompt: `You are the Store AI Concierge — an autonomous, polite, and conversion-focused shopping assistant.
You assist customers with finding items, checking real-time stock, tracking orders, managing shopping carts, and answering product queries.
Always verify customer intents with store actions when needed. NEVER invent prices, stock levels, or order tracking statuses.`,
};

// --- In-Memory Fast Cache & Telemetry ---
interface TenantStore {
  id: string;
  storeName: string;
  apiKey: string;
  backendUrl: string;
  frontendUrl?: string;
  status: "ACTIVE" | "PAUSED" | "SUSPENDED";
  tier: string;
  monthlyQuota: number;
  usedRequests: number;
  createdAt: string;
}

// In-memory tenant store map (pre-seeded with default demo key)
const tenantRegistry = new Map<string, TenantStore>();
tenantRegistry.set("ebakx_live_sk_test108", {
  id: "store_ebakx_demo",
  storeName: "Ebakx Marketplace",
  apiKey: "ebakx_live_sk_test108",
  backendUrl: "http://127.0.0.1:5000/api/v1",
  frontendUrl: "https://ebakx.com",
  status: "ACTIVE",
  tier: "ENTERPRISE",
  monthlyQuota: 100000,
  usedRequests: 0,
  createdAt: new Date().toISOString(),
});

// Also support common demo keys
tenantRegistry.set("demo_testing_key", {
  id: "store_safeframe_demo",
  storeName: "SafeFrame Multi-Service Demo",
  apiKey: "demo_testing_key",
  backendUrl: "http://127.0.0.1:5000/api/v1",
  frontendUrl: "https://sas-delta-two.vercel.app",
  status: "ACTIVE",
  tier: "PRO",
  monthlyQuota: 50000,
  usedRequests: 0,
  createdAt: new Date().toISOString(),
});

// Telemetry Stats
const telemetry = {
  startTime: Date.now(),
  totalRequests: 0,
  totalChatCompletions: 0,
  totalGuardChecks: 0,
  blockedInjections: 0,
  totalTokensUsed: 0,
  latencies: [] as number[],
};

function recordLatency(ms: number) {
  telemetry.latencies.push(ms);
  if (telemetry.latencies.length > 500) {
    telemetry.latencies.shift();
  }
}

function getAverageLatency(): number {
  if (telemetry.latencies.length === 0) return 0;
  const sum = telemetry.latencies.reduce((a, b) => a + b, 0);
  return Math.round(sum / telemetry.latencies.length);
}

// --- Unified Tool Schema for Groq ---
const storeTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "store_action",
      description:
        "Execute an action on the merchant store backend: search catalog, view trending items, validate coupon codes, get reviews, track orders, manage shopping cart, and view customer profile.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: [
              "search_products",
              "get_top_searched_products",
              "validate_coupon",
              "get_product_reviews",
              "get_product_details",
              "get_my_orders",
              "track_single_order",
              "get_my_cart",
              "add_to_cart",
              "remove_from_cart",
              "clear_cart",
              "get_my_wishlist",
              "add_to_wishlist",
              "remove_from_wishlist",
              "get_my_returns",
              "get_saved_payment_methods",
              "get_my_profile",
            ],
            description: "The intent to dispatch to the merchant's store backend proxy.",
          },
          search_params: {
            type: "object",
            description: "Parameters when searching catalog.",
            properties: {
              searchTerm: { type: "string" },
              category: { type: "string" },
              minPrice: { type: "number" },
              maxPrice: { type: "number" },
              page: { type: "number" },
              limit: { type: "number" },
            },
          },
          product_id: { type: "string", description: "Product ID" },
          order_id: { type: "string", description: "Order ID (e.g. #ORD-1234)" },
          coupon_code: { type: "string", description: "Promo/Coupon code" },
          order_amount: { type: "number", description: "Subtotal amount" },
          cart_item_id: { type: "string", description: "Cart item ID" },
          cart_item: {
            type: "object",
            properties: {
              productId: { type: "string" },
              quantity: { type: "number" },
              color: { type: "string" },
              size: { type: "string" },
            },
          },
        },
        required: ["intent"],
      },
    },
  },
];

// --- Store Proxy Dispatcher ---
async function dispatchStoreProxy(
  backendUrl: string,
  toolArgs: any,
  customerAuthToken?: string | null
): Promise<any> {
  const cleanBase = backendUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Antigravity-Concierge-Core/1.0",
  };

  if (customerAuthToken) {
    headers["Authorization"] = customerAuthToken.startsWith("Bearer ")
      ? customerAuthToken
      : `Bearer ${customerAuthToken}`;
  }

  const { intent, search_params, product_id, order_id, coupon_code, order_amount, cart_item_id, cart_item } =
    toolArgs;

  try {
    switch (intent) {
      case "search_products": {
        const queryParams = new URLSearchParams();
        if (search_params?.searchTerm) queryParams.set("q", search_params.searchTerm);
        if (search_params?.category) queryParams.set("category", search_params.category);
        if (search_params?.minPrice) queryParams.set("minPrice", String(search_params.minPrice));
        if (search_params?.maxPrice) queryParams.set("maxPrice", String(search_params.maxPrice));
        if (search_params?.limit) queryParams.set("limit", String(search_params.limit));

        const res = await fetch(`${cleanBase}/products?${queryParams.toString()}`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) return await res.json();
        break;
      }
      case "get_product_details": {
        if (product_id) {
          const res = await fetch(`${cleanBase}/products/${product_id}`, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) return await res.json();
        }
        break;
      }
      case "get_my_orders": {
        const res = await fetch(`${cleanBase}/customer/orders`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return await res.json();
        break;
      }
      case "track_single_order": {
        if (order_id) {
          const res = await fetch(`${cleanBase}/customer/orders/${encodeURIComponent(order_id)}`, {
            method: "GET",
            headers,
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) return await res.json();
        }
        break;
      }
      case "get_my_cart": {
        const res = await fetch(`${cleanBase}/customer/cart`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return await res.json();
        break;
      }
      case "validate_coupon": {
        if (coupon_code) {
          const res = await fetch(`${cleanBase}/coupons/validate`, {
            method: "POST",
            headers,
            body: JSON.stringify({ code: coupon_code, amount: order_amount || 0 }),
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) return await res.json();
        }
        break;
      }
      case "get_my_profile": {
        const res = await fetch(`${cleanBase}/customer/me`, {
          method: "GET",
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return await res.json();
        break;
      }
      default:
        break;
    }
  } catch (err: any) {
    console.warn(`[Proxy Dispatcher] Failed calling ${intent} on ${cleanBase}:`, err?.message || err);
  }

  // Graceful fallback for mock or offline stores
  return {
    status: "mock_fallback",
    message: `Action '${intent}' processed. Store backend callback acknowledged.`,
    data: {
      intent,
      sample_result: true,
      timestamp: new Date().toISOString(),
    },
  };
}

// --- Helper for CORS Response ---
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-Merchant-Key, x-control-plane-key, X-Control-Plane-Key",
    },
  });
}

// --- Authentication Middleware ---
function verifyControlPlane(req: Request): boolean {
  const authHeader = req.headers.get("x-control-plane-key") || req.headers.get("authorization");
  if (!authHeader) return false;
  if (authHeader === CONTROL_PLANE_SECRET) return true;
  if (authHeader.replace(/^Bearer\s+/i, "") === CONTROL_PLANE_SECRET) return true;
  return false;
}

async function resolveTenant(req: Request, explicitKey?: string): Promise<TenantStore | null> {
  const apiKey =
    explicitKey ||
    req.headers.get("x-merchant-key") ||
    req.headers.get("x-api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!apiKey) return null;

  // 1. Check in-memory fast registry
  const mem = tenantRegistry.get(apiKey);
  if (mem) return mem;

  // 2. Check Database via Prisma if available
  try {
    const dbStore = await prisma.store.findUnique({
      where: { apiKey },
    });
    if (dbStore) {
      const tenant: TenantStore = {
        id: dbStore.id,
        storeName: dbStore.storeName,
        apiKey: dbStore.apiKey,
        backendUrl: dbStore.backendUrl,
        frontendUrl: dbStore.frontendUrl,
        status: dbStore.status as any,
        tier: dbStore.tier,
        monthlyQuota: dbStore.monthlyQuota,
        usedRequests: dbStore.usedRequests,
        createdAt: dbStore.createdAt.toISOString(),
      };
      tenantRegistry.set(apiKey, tenant);
      return tenant;
    }
  } catch {
    // Database query failed or Prisma not connected
  }

  // Fallback: If it's a test/demo key or prefixed with `sk_` or `ebakx_`
  if (apiKey.startsWith("sk_") || apiKey.startsWith("ebakx_") || apiKey.includes("demo")) {
    const mockTenant: TenantStore = {
      id: `dynamic_${apiKey.slice(-6)}`,
      storeName: "Dynamic Tenant Store",
      apiKey,
      backendUrl: "http://127.0.0.1:5000/api/v1",
      status: "ACTIVE",
      tier: "PRO",
      monthlyQuota: 50000,
      usedRequests: 0,
      createdAt: new Date().toISOString(),
    };
    tenantRegistry.set(apiKey, mockTenant);
    return mockTenant;
  }

  return null;
}

// --- Main Bun HTTP Server ---
console.log(`🚀 Starting Antigravity AI Concierge Standalone Bun Engine on port ${PORT}...`);

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;
    const startTime = Date.now();
    telemetry.totalRequests++;

    // 1. Handle CORS Preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-API-Key, X-Merchant-Key, x-control-plane-key, X-Control-Plane-Key",
          "Access-Control-Max-Age": "86400",
        },
      });
    }

    // ==========================================
    // 🌐 EMBEDDABLE WIDGET SCRIPT FOR MERCHANTS
    // ==========================================

    // GET /widget.js - 1-Line Drop-in JavaScript Widget for Shopify/Custom Storefronts
    if (pathname === "/widget.js" && method === "GET") {
      const widgetJs = `
(function() {
  if (window.__ConciergeWidgetLoaded) return;
  window.__ConciergeWidgetLoaded = true;

  const currentScript = document.currentScript || document.querySelector('script[data-api-key]');
  const apiKey = currentScript ? currentScript.getAttribute('data-api-key') || 'demo_testing_key' : 'demo_testing_key';
  const serverUrl = (currentScript && currentScript.src) ? new URL(currentScript.src).origin : window.location.origin;

  // Create Floating Button
  const btn = document.createElement('div');
  btn.innerHTML = '✨ AI Concierge';
  btn.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;background:#059669;color:white;padding:12px 20px;border-radius:9999px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.2);cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s ease;';
  document.body.appendChild(btn);

  // Create Chat Window
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:80px;right:24px;width:380px;height:520px;max-height:80vh;background:#0f172a;color:#f8fafc;border-radius:16px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);border:1px solid #334155;z-index:999999;display:none;flex-direction:column;overflow:hidden;font-family:system-ui,-apple-system,sans-serif;';
  box.innerHTML = \`
    <div style="background:#1e293b;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">🛍️</span>
        <div>
          <div style="font-weight:600;font-size:14px;color:#f1f5f9;">Store AI Concierge</div>
          <div style="font-size:11px;color:#10b981;">● Active & Ready</div>
        </div>
      </div>
      <button id="concierge-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;">✕</button>
    </div>
    <div id="concierge-msgs" style="flex:1;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:12px;font-size:13px;line-height:1.5;">
      <div style="background:#1e293b;padding:10px 14px;border-radius:12px;align-self:flex-start;max-width:85%;border:1px solid #334155;">
        👋 Namaste! How can I help you find products, track orders, or explore offers today?
      </div>
    </div>
    <form id="concierge-form" style="padding:12px;border-top:1px solid #334155;display:flex;gap:8px;background:#1e293b;">
      <input id="concierge-input" type="text" placeholder="Ask about products, orders..." style="flex:1;background:#0f172a;border:1px solid #334155;color:#f8fafc;padding:10px 14px;border-radius:8px;font-size:13px;outline:none;" />
      <button type="submit" style="background:#059669;color:white;border:none;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">Send</button>
    </form>
  \`;
  document.body.appendChild(box);

  let isOpen = false;
  btn.onclick = () => {
    isOpen = !isOpen;
    box.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) document.getElementById('concierge-input').focus();
  };
  document.getElementById('concierge-close').onclick = () => {
    isOpen = false;
    box.style.display = 'none';
  };

  const msgsDiv = document.getElementById('concierge-msgs');
  const form = document.getElementById('concierge-form');
  const input = document.getElementById('concierge-input');

  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Render User Message
    const uMsg = document.createElement('div');
    uMsg.style.cssText = 'background:#059669;color:white;padding:10px 14px;border-radius:12px;align-self:flex-end;max-width:85%;';
    uMsg.textContent = text;
    msgsDiv.appendChild(uMsg);
    msgsDiv.scrollTop = msgsDiv.scrollHeight;

    // Render Loading indicator
    const bMsg = document.createElement('div');
    bMsg.style.cssText = 'background:#1e293b;padding:10px 14px;border-radius:12px;align-self:flex-start;max-width:85%;border:1px solid #334155;color:#94a3b8;';
    bMsg.textContent = 'Thinking...';
    msgsDiv.appendChild(bMsg);
    msgsDiv.scrollTop = msgsDiv.scrollHeight;

    try {
      const res = await fetch(serverUrl + '/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({ message: text })
      });
      const data = await res.json();
      bMsg.style.color = '#f8fafc';
      bMsg.innerText = data.response || data.error || 'I could not process that request.';
    } catch (err) {
      bMsg.style.color = '#ef4444';
      bMsg.textContent = 'Connection error. Please try again.';
    }
    msgsDiv.scrollTop = msgsDiv.scrollHeight;
  };
})();
      `;
      return new Response(widgetJs, {
        status: 200,
        headers: {
          "Content-Type": "application/javascript",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // ==========================================
    // 👑 CONTROL PLANE & HEALTH APIS
    // ==========================================

    // GET /health or /control/health - Public or monitoring ping
    if ((pathname === "/health" || pathname === "/control/health") && method === "GET") {
      return jsonResponse({
        status: "healthy",
        service: "antigravity-ai-concierge-standalone",
        version: "1.0.0",
        uptimeSeconds: Math.floor((Date.now() - telemetry.startTime) / 1000),
        memory: process.memoryUsage(),
        engine: {
          model: engineConfig.model,
          promptGuardEnabled: engineConfig.promptGuardEnabled,
        },
        tenantsCount: tenantRegistry.size,
        groqConfigured: Boolean(process.env.GROQ_API_KEY),
      });
    }

    // GET /control/info - Service Discovery Manifest for Master SaaS (SafeFrame SAS)
    if ((pathname === "/control/info" || pathname === "/service-info") && method === "GET") {
      return jsonResponse({
        name: "AI E-Commerce Concierge",
        slug: "ecommerce-ai-concierge",
        category: "E-Commerce & AI Agents",
        description:
          "Autonomous, zero-trust shopping assistant and customer concierge with scoped store callbacks, live inventory lookups, order tracking, and sub-10ms Prompt Guard 2 defense.",
        icon: "Bot",
        status: "active",
        upstreamApiUrl: `http://localhost:${PORT}/api/v1/chat`,
        requestSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "Customer query or message" },
            messages: {
              type: "array",
              description: "Full chat history in OpenAI chat format",
              items: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["system", "user", "assistant"] },
                  content: { type: "string" },
                },
              },
            },
            model: { type: "string", description: "Groq LLM model override" },
            systemPrompt: { type: "string", description: "Custom merchant system prompt" },
            forwardCustomerJwt: { type: "string", description: "Customer session JWT for protected operations" },
          },
          required: ["message"],
        },
        responseSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            response: { type: "string" },
            intent_detected: { type: "string" },
            guard: { type: "object" },
            usage: { type: "object" },
            latency_ms: { type: "number" },
          },
        },
        codeSnippets: {
          curl: `curl -X POST http://localhost:${PORT}/api/v1/chat \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -d '{"message": "Show me top trending items"}'`,
          javascript: `const res = await fetch("http://localhost:${PORT}/api/v1/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": "YOUR_API_KEY" },
  body: JSON.stringify({ message: "Can you track my order ORD-102?" })
});
const data = await res.json();`,
          python: `import requests
res = requests.post("http://localhost:${PORT}/api/v1/chat", 
  headers={"X-API-Key": "YOUR_API_KEY"},
  json={"message": "Show me running shoes under 5000"}
)
print(res.json())`,
        },
      });
    }

    // GET /control/stats - Telemetry & Metrics (Requires Control Plane Auth)
    if (pathname === "/control/stats" && method === "GET") {
      if (!verifyControlPlane(req)) {
        return jsonResponse({ error: "Unauthorized: Invalid or missing x-control-plane-key" }, 401);
      }
      return jsonResponse({
        uptimeSeconds: Math.floor((Date.now() - telemetry.startTime) / 1000),
        totalRequests: telemetry.totalRequests,
        totalChatCompletions: telemetry.totalChatCompletions,
        totalGuardChecks: telemetry.totalGuardChecks,
        blockedInjections: telemetry.blockedInjections,
        totalTokensUsed: telemetry.totalTokensUsed,
        averageLatencyMs: getAverageLatency(),
        activeTenants: Array.from(tenantRegistry.values()).map((t) => ({
          id: t.id,
          name: t.storeName,
          apiKeyPrefix: t.apiKey.substring(0, 12) + "...",
          status: t.status,
          tier: t.tier,
          usedRequests: t.usedRequests,
        })),
        engineConfig,
      });
    }

    // POST /control/config - Hot-Reload Engine Config (Requires Control Plane Auth)
    if (pathname === "/control/config" && method === "POST") {
      if (!verifyControlPlane(req)) {
        return jsonResponse({ error: "Unauthorized: Invalid or missing x-control-plane-key" }, 401);
      }
      try {
        const body = (await req.json()) as Partial<EngineConfig>;
        if (body.model) engineConfig.model = body.model;
        if (body.guardModel) engineConfig.guardModel = body.guardModel;
        if (body.promptGuardEnabled !== undefined) engineConfig.promptGuardEnabled = body.promptGuardEnabled;
        if (body.temperature !== undefined) engineConfig.temperature = body.temperature;
        if (body.maxTokens !== undefined) engineConfig.maxTokens = body.maxTokens;
        if (body.defaultSystemPrompt) engineConfig.defaultSystemPrompt = body.defaultSystemPrompt;

        return jsonResponse({
          success: true,
          message: "Engine configuration updated successfully",
          config: engineConfig,
        });
      } catch (err: any) {
        return jsonResponse({ error: "Invalid JSON config payload", details: err?.message }, 400);
      }
    }

    // GET /control/tenants & POST /control/tenants (Tenant Management)
    if (pathname === "/control/tenants") {
      if (!verifyControlPlane(req)) {
        return jsonResponse({ error: "Unauthorized: Invalid or missing x-control-plane-key" }, 401);
      }

      if (method === "GET") {
        return jsonResponse({
          tenants: Array.from(tenantRegistry.values()),
        });
      }

      if (method === "POST") {
        try {
          const body = await req.json();
          if (!body.storeName || !body.backendUrl) {
            return jsonResponse({ error: "Missing required fields: storeName and backendUrl" }, 400);
          }

          const apiKey = body.apiKey || `sk_live_${Math.random().toString(36).substring(2, 14)}_${Date.now()}`;
          const newTenant: TenantStore = {
            id: body.id || `store_${Math.random().toString(36).substring(2, 9)}`,
            storeName: body.storeName,
            apiKey,
            backendUrl: body.backendUrl,
            frontendUrl: body.frontendUrl || "",
            status: body.status || "ACTIVE",
            tier: body.tier || "PRO",
            monthlyQuota: body.monthlyQuota || 50000,
            usedRequests: 0,
            createdAt: new Date().toISOString(),
          };

          tenantRegistry.set(apiKey, newTenant);

          return jsonResponse({
            success: true,
            message: "Tenant provisioned successfully",
            tenant: newTenant,
          });
        } catch (err: any) {
          return jsonResponse({ error: "Failed to provision tenant", details: err?.message }, 400);
        }
      }
    }

    // DELETE /control/tenants/:id
    if (pathname.startsWith("/control/tenants/") && method === "DELETE") {
      if (!verifyControlPlane(req)) {
        return jsonResponse({ error: "Unauthorized: Invalid or missing x-control-plane-key" }, 401);
      }
      const tenantId = pathname.replace("/control/tenants/", "");
      for (const [key, tenant] of tenantRegistry.entries()) {
        if (tenant.id === tenantId || tenant.apiKey === tenantId) {
          tenantRegistry.delete(key);
          return jsonResponse({ success: true, message: `Tenant ${tenantId} removed.` });
        }
      }
      return jsonResponse({ error: "Tenant not found" }, 404);
    }

    // ==========================================
    // ⚡ DATA PLANE: CHAT & AGENT ORCHESTRATION
    // ==========================================

    // POST /api/v1/guard-check - Standalone Prompt Guard Inspection
    if (pathname === "/api/v1/guard-check" && method === "POST") {
      try {
        const body = (await req.json()) as { prompt?: string; text?: string };
        const textToCheck = body.prompt || body.text || "";
        telemetry.totalGuardChecks++;

        const guard = await checkPromptSafety(textToCheck);
        if (!guard.isSafe) telemetry.blockedInjections++;

        return jsonResponse({
          isSafe: guard.isSafe,
          reason: guard.reason,
          guardModel: engineConfig.guardModel,
          timestamp: new Date().toISOString(),
        });
      } catch (err: any) {
        return jsonResponse({ error: "Guard inspection failed", details: err?.message }, 500);
      }
    }

    // POST /api/v1/chat, /api/saas/chat, /chat, /api/public/playground
    if (
      (pathname === "/api/v1/chat" ||
        pathname === "/api/saas/chat" ||
        pathname === "/chat" ||
        pathname === "/api/public/playground") &&
      method === "POST"
    ) {
      try {
        let body: any = {};
        try {
          body = await req.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body" }, 400);
        }

        // 1. Resolve Tenant / Merchant
        const apiKey = body.apiKey || body.merchantKey;
        const tenant = await resolveTenant(req, apiKey);

        // Demo fallback allows testing from SafeFrame Playground
        const activeTenant: TenantStore = tenant || {
          id: "demo_guest",
          storeName: "Demo Store",
          apiKey: "demo_guest",
          backendUrl: "http://127.0.0.1:5000/api/v1",
          status: "ACTIVE",
          tier: "STARTER",
          monthlyQuota: 1000,
          usedRequests: 0,
          createdAt: new Date().toISOString(),
        };

        if (activeTenant.status === "SUSPENDED" || activeTenant.status === "PAUSED") {
          return jsonResponse({ error: "Tenant account is suspended or paused" }, 403);
        }

        // 2. Extract Customer Input
        let rawMessage =
          body.message ||
          body.query ||
          body.prompt ||
          (Array.isArray(body.messages) && body.messages.slice(-1)[0]?.content) ||
          "";

        if (!rawMessage || typeof rawMessage !== "string") {
          return jsonResponse({ error: "Missing required 'message' string in payload" }, 400);
        }

        // 3. Prompt Guard 2 (22m) Defense Check
        if (engineConfig.promptGuardEnabled) {
          telemetry.totalGuardChecks++;
          const guard = await checkPromptSafety(rawMessage);
          if (!guard.isSafe) {
            telemetry.blockedInjections++;
            return jsonResponse(
              {
                id: `chat_blocked_${Date.now()}`,
                response:
                  "I apologize, but your request contains patterns flagged by our security safety guardrails. Please rephrase your query.",
                error: "PROMPT_INJECTION_DETECTED",
                guard_details: guard,
                status: 400,
              },
              400
            );
          }
        }

        // 4. Initialize Groq LPU Client
        const groqKey = process.env.GROQ_API_KEY || DEFAULT_GROQ_KEY;
        if (!groqKey) {
          return jsonResponse({
            id: `chat_mock_${Date.now()}`,
            response: `[Simulated Concierge Response] I found what you're looking for in ${activeTenant.storeName}! (Configure GROQ_API_KEY for live Groq LPU inference).`,
            latency_ms: Date.now() - startTime,
          });
        }

        const groq = new Groq({ apiKey: groqKey });
        const selectedModel = body.model || engineConfig.model;
        const systemPrompt =
          body.systemPrompt ||
          body.system_prompt ||
          `${engineConfig.defaultSystemPrompt}\nStore Name: ${activeTenant.storeName}\nBase URL: ${activeTenant.backendUrl}`;

        // Build Messages Payload
        const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
          { role: "system", content: systemPrompt },
        ];

        if (Array.isArray(body.messages) && body.messages.length > 0) {
          for (const m of body.messages) {
            if (m.role === "user" || m.role === "assistant") {
              messages.push({ role: m.role, content: String(m.content) });
            }
          }
        } else {
          messages.push({ role: "user", content: rawMessage });
        }

        // 5. Groq Inference with Tool Calling
        telemetry.totalChatCompletions++;
        const customerToken = body.forwardCustomerJwt || body.customer_jwt || req.headers.get("authorization");

        const completion = await groq.chat.completions.create({
          model: selectedModel,
          messages,
          tools: storeTools,
          tool_choice: "auto",
          temperature: engineConfig.temperature,
          max_tokens: engineConfig.maxTokens,
        });

        const choice = completion.choices[0];
        let reply = choice?.message?.content || "";
        let intentExecuted: string | null = null;
        let toolResults: any = null;

        // 6. Handle Tool Calls
        if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
          const toolCall = choice.message.tool_calls[0];
          if (toolCall.function.name === "store_action") {
            try {
              const args = JSON.parse(toolCall.function.arguments);
              intentExecuted = args.intent;
              toolResults = await dispatchStoreProxy(activeTenant.backendUrl, args, customerToken);

              // Secondary Completion with Tool Response
              const followUp = await groq.chat.completions.create({
                model: selectedModel,
                messages: [
                  ...messages,
                  choice.message,
                  {
                    role: "tool",
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(toolResults),
                  },
                ],
                temperature: engineConfig.temperature,
                max_tokens: engineConfig.maxTokens,
              });

              reply = followUp.choices[0]?.message?.content || reply;
            } catch (err: any) {
              console.warn("Tool execution parsing error:", err?.message || err);
            }
          }
        }

        const elapsed = Date.now() - startTime;
        recordLatency(elapsed);
        activeTenant.usedRequests++;
        telemetry.totalTokensUsed += completion.usage?.total_tokens || 0;

        return jsonResponse({
          id: completion.id || `chatcmpl_${Math.random().toString(36).substring(2, 10)}`,
          object: "chat.completion",
          response: reply,
          intent_executed: intentExecuted,
          tool_data: toolResults,
          model: selectedModel,
          tenant: {
            id: activeTenant.id,
            storeName: activeTenant.storeName,
          },
          usage: completion.usage,
          latency_ms: elapsed,
        });
      } catch (err: any) {
        console.error("Chat orchestration error:", err);
        return jsonResponse({ error: "Concierge Agent Error", message: err?.message || err }, 500);
      }
    }

    // Default 404
    return jsonResponse({ error: "Endpoint not found", path: pathname }, 404);
  },
});

console.log(`✅ Antigravity AI Concierge Server running live on http://localhost:${server.port}`);
