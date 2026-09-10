# Antigravity AI Concierge: Complete Platform & Integration Guide

A complete guide for running the standalone Bun AI Concierge engine and integrating it with external master SaaS platforms (e.g., SafeFrame SAS), Shopify, WooCommerce, or custom storefronts.

---

## 🏗️ Architecture Summary

```
┌────────────────────────────────────────────────────────┐
│            Master SaaS Platform (SafeFrame)            │
│       • Billing, Key Generation, Admin Dashboard       │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ 1. Upstream Chat Proxy
                            ▼
┌────────────────────────────────────────────────────────┐
│       Standalone Bun Binary (`concierge-core`)         │
│                                                        │
│  🛡️ Meta Llama Prompt Guard 2 (22m)                    │
│  🧠 Groq LPU LLM Agent (`openai/gpt-oss-120b`)         │
│  🔀 Scoped Zero-Trust Store Proxy                      │
│  👑 Master Control Plane APIs                          │
└───────────────────────────┬────────────────────────────┘
                            │
                            │ 2. Scoped REST Callbacks
                            ▼
┌────────────────────────────────────────────────────────┐
│              Merchant E-Commerce Backend               │
│        (Shopify / WooCommerce / Custom API)            │
│  • GET  /products?q=...                                │
│  • GET  /customer/orders (with customer JWT)           │
│  • POST /coupons/validate                              │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Running & Compiling the Binary

### 1. Development Mode
```bash
bun run server
```

### 2. Compile Standalone Binary
```bash
bun run compile
```
*Outputs self-contained binary at `bin/concierge-core` (<500ms build time).*

### 3. Run Compiled Binary
```bash
PORT=8080 ./bin/concierge-core
```

### 4. Docker Deployment
```bash
docker build -t concierge-engine .
docker run -d -p 8080:8080 -e GROQ_API_KEY=your_key concierge-engine
```

---

## 👑 Master Control Plane APIs (For Master SaaS Platforms)

All control plane endpoints require the header:
`x-control-plane-key: antigravity-master-control-secret-108`

### 1. Health Ping
- **Endpoint:** `GET /health` or `GET /control/health`
- **Description:** Uptime, memory, model status, active tenants count.

### 2. Service Discovery Manifest
- **Endpoint:** `GET /control/info`
- **Description:** Returns full OpenAPI spec, JSON request/response schema, and cURL snippets for automatic platform catalog registration.

### 3. Tenant Provisioning
- **Endpoint:** `POST /control/tenants`
- **Payload:**
  ```json
  {
    "storeName": "Mayapur Handicrafts",
    "backendUrl": "https://api.mayapurhandicrafts.com/api/v1",
    "frontendUrl": "https://mayapurhandicrafts.com",
    "tier": "GROWTH",
    "monthlyQuota": 50000,
    "apiKey": "sk_live_mayapur_108"
  }
  ```

### 4. List Active Tenants
- **Endpoint:** `GET /control/tenants`

### 5. Suspend / Delete Tenant
- **Endpoint:** `DELETE /control/tenants/:id`

### 6. Live Telemetry & Stats
- **Endpoint:** `GET /control/stats`
- **Description:** Real-time token consumption, average latency, and blocked prompt injections count.

---

## 💬 Data Plane & Chat Execution APIs

### 1. Chat Completion & Tool Calling
- **Endpoint:** `POST /api/v1/chat` (also supports `/chat`, `/api/saas/chat`, `/api/public/playground`)
- **Headers:**
  - `X-API-Key`: `sk_live_...`
  - `Authorization`: `Bearer <Customer_Session_JWT>` *(optional, passed for order tracking)*
- **Payload:**
  ```json
  {
    "message": "Can you track my order ORD-9912?",
    "systemPrompt": "Optional custom merchant persona override"
  }
  ```
- **Response:**
  ```json
  {
    "id": "chatcmpl-...",
    "response": "I've checked the status of order ORD-9912...",
    "intent_executed": "track_single_order",
    "model": "openai/gpt-oss-120b",
    "latency_ms": 1420
  }
  ```

### 2. Prompt Guard Inspection
- **Endpoint:** `POST /api/v1/guard-check`
- **Payload:** `{"prompt": "User query string"}`

---

## 🌐 1-Line Drop-in Chat Widget (For Merchant Storefronts)

Merchants can embed the AI Concierge anywhere by dropping this single line into their HTML `<head>` or `<body>`:

```html
<script src="http://localhost:8080/widget.js" data-api-key="sk_live_YOUR_STORE_KEY"></script>
```
*Creates a floating chat bubble with instant multi-turn conversation and product search!*
