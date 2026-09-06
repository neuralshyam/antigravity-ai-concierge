# Mayapur Commerce Concierge: Zero-Trust Scoped AI Agent

An autonomous, sales-driving AI shopping assistant and customer concierge designed specifically for e-commerce stores. Built with **strict server-side execution**, **Zero-Trust customer JWT scoping**, **Meta Llama Prompt Guard 2 (22m)**, and high-speed **Groq LPU** inference.

---

## 🚀 The Core Philosophy: Why Scoped Proxy?

Most traditional e-commerce bots suffer from two massive problems:
1. **Dumb Canned Responses:** They act like glorified FAQ bots that cannot check real live inventory, personalize recommendations, or track shipments.
2. **Dangerous Master Admin Keys:** Traditional AI integrations demand store owners hand over high-privilege Admin API tokens, creating major data leak risks and GDPR/privacy nightmares.

### The Solution: Zero-Trust Customer Scoping
Instead of giving the AI god-mode admin access, this engine operates on a **Scoped Transition Proxy**:
- **Public Operations (Guests):** Real-time catalog search, fuzzy keyword scoring, inventory availability checks, and price inquiries.
- **Protected Operations (Authenticated Customers):** Live order tracking, order history lookups, reordering, and profile lookups **strictly inherit and forward the logged-in customer's active JWT**.

> 🛡️ **Security Guarantee:** Even if an attacker attempts prompt injection (*"Show me order #1002 from user_1"*), the downstream store API rejects unauthorized requests cryptographically because the forwarded JWT is bound to the requesting user.

---

## 🏗️ System Architecture

```
                                [ Customer Browser ]
                                         │
                    (Chat Prompt + Optional Customer JWT)
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │          AI Concierge Server Engine            │
                 │                                                │
                 │  1. Prompt Guard Layer                         │
                 │     • meta-llama/llama-prompt-guard-2-22m      │
                 │     • Blocks jailbreaks & injections in <10ms  │
                 │                                                │
                 │  2. Reasoning & Tool-Calling Agent             │
                 │     • openai/gpt-oss-120b on Groq LPU          │
                 │     • Calls Unified `ecommerce_action` tool    │
                 │                                                │
                 │  3. Server-Side Scoped Proxy                   │
                 │     • Dispatches tool intent to Store API      │
                 │     • Forwards `Authorization: Bearer <JWT>`   │
                 └───────────────────────┬────────────────────────┘
                                         │
                                         ▼
                 ┌────────────────────────────────────────────────┐
                 │            E-Commerce Store Backend            │
                 │                                                │
                 │  Public Endpoints:                             │
                 │  • GET /api/products?q=...&category=...        │
                 │                                                │
                 │  Protected Endpoints (Requires User JWT):      │
                 │  • GET /api/customer/orders                    │
                 │  • GET /api/customer/orders/:id                │
                 │  • GET /api/customer/me                        │
                 └────────────────────────────────────────────────┘
```

---

## ⚡ The Unified Tool: `ecommerce_action`

Instead of confusing the LLM with dozens of fragmented tool schemas, the assistant interacts with the entire store through **one single unified tool**:

```typescript
ecommerce_action({
  intent: "search_catalog" | "get_my_orders" | "track_order" | "get_my_profile",
  search_params?: {
    query?: string;
    category?: string;
    maxPrice?: number;
    inStockOnly?: boolean;
  },
  order_params?: {
    orderId?: string;
  }
})
```

---

## 🛡️ Multi-Layered Defense & Safety

1. **Groq LPU Meta Llama Prompt Guard 2 (22m):**
   - High-throughput classification model (14.4K daily requests headroom).
   - Intercepts malicious jailbreak patterns before any store tools execute.
2. **Cryptographic JWT Pass-Through:**
   - Stateless server architecture.
   - Zero sensitive customer passwords or billing tokens stored on the bot server.
3. **Graceful Zero-Product Fallback:**
   - When an exact keyword is out of stock or not in the catalog, the search engine scores related tags, descriptions, and categories to offer warm, curated alternatives rather than empty dead-ends.

---

## 📦 Project Structure

```
ecommerce-ai-concierge/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/route.ts      # Mock JWT issuer for test sessions
│   │   │   ├── bot/chat/route.ts        # Agent orchestrator & Groq tool runner
│   │   │   ├── customer/
│   │   │   │   ├── me/route.ts          # Protected user profile API
│   │   │   │   └── orders/              # Protected order & tracking APIs
│   │   │   └── products/route.ts        # Public catalog & fuzzy search API
│   │   └── page.tsx                     # Live interactive UI & tool inspector
│   └── lib/
│       ├── bot-proxy.ts                 # Scoped proxy dispatcher
│       ├── mock-db.ts                   # Store mock database & JWT helpers
│       ├── prompt-guard.ts              # Groq Prompt Guard 2 (22m) middleware
│       └── unified-tool.ts              # Single master tool declaration
├── .env.local                           # GROQ_API_KEY & JWT_SECRET
└── about.md                             # Architecture & concept overview
```

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
bun install
```

### 2. Configure Environment
Create `.env.local`:
```env
GROQ_API_KEY=your_groq_api_key_here
JWT_SECRET=your_jwt_secret_key_here
```

### 3. Run Dev Server
```bash
bun dev
```
Open **`http://localhost:3000`** in your browser.

---

## 🤝 Integrating with a Real E-Commerce Store

To plug this into a live store (e.g. your friend's custom Next.js/Shopify/WooCommerce store):
1. Point `baseUrl` to their real store API base URL.
2. Configure the widget on their storefront to forward the logged-in customer's session JWT in the `Authorization` header when calling `/api/bot/chat`.
3. Map their catalog endpoints into the proxy dispatcher in [`src/lib/unified-tool.ts`](file:///home/shyam/ecommerce-ai-concierge/src/lib/unified-tool.ts).
