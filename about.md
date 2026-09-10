# Antigravity AI Concierge: Multi-Tenant Zero-Trust E-Commerce SaaS

A high-performance, multi-tenant B2B SaaS platform built for external e-commerce stores, merchants, and enterprise brands ("outsiders"). It provides an autonomous, sales-driving AI shopping assistant and customer concierge with **zero-trust cryptographic isolation**, **per-store API key management**, **Meta Llama Prompt Guard 2 (22m)** jailbreak defense, and high-speed **Groq LPU** inference.

---

## 🌐 Built as a Multi-Tenant SaaS for External Stores

This platform is engineered from the ground up as a plug-and-play SaaS for external businesses:
- **Commercial Multi-Tenancy:** External merchants sign up, register their domain/store backend endpoints, and generate isolated production API keys (`sk_live_...`).
- **Zero Integration Hassle:** Merchants embed a lightweight chat widget or connect via REST/SSE streaming API without rewriting their existing store architecture.
- **Fair Tiered Monetization:** Flat monthly SaaS pricing (₹1,000/mo) integrated with Razorpay checkout and webhook-driven subscription life-cycling.
- **Strict Site-Key Isolation:** API keys are cryptographically bound to the merchant's registered origin URL to prevent unauthorized reuse or spoofing.

---

## 🚀 The Core Philosophy: Why Zero-Trust Scoped Proxy Sells to External Clients

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

## 🤝 Onboarding External E-Commerce Clients (SaaS Integration)

To onboard an external e-commerce merchant (Shopify, WooCommerce, Custom Next.js/React storefronts):
1. **Sign Up & Register Site:** The client creates an account on the SaaS portal and registers their store's base API URL.
2. **Obtain API Key:** Generate a store-scoped API key (`sk_live_...`).
3. **Embed Widget / Call API:** The client integrates the chat widget or calls `/api/v1/chat` with their `x-api-key` header and optional customer session JWT in `Authorization`.
4. **Subscription Management:** Automated billing at ₹1,000/mo via Razorpay ensures active access and API quotas.
