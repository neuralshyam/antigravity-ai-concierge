# Antigravity AI — Developer Platform & Zero-Trust Concierge Core

A multi-tenant, zero-trust AI Sales Concierge and API Marketplace for e-commerce platforms.

## 🚀 Features
- **Zero-Trust Store Proxy:** The AI SaaS never holds or accesses customer store databases directly. All actions execute through store backend callbacks using customer JWT authorization.
- **Dynamic Site Registration & API Keys:** Generate isolated `sk_live_...` API keys bound strictly to registered backend URLs to prevent cross-app key reuse.
- **Realtime SSE Streaming:** Live token-by-token streaming using Server-Sent Events with sub-200ms latency.
- **Security & Safety Guardrails:** Integrated with Meta Llama Prompt Guard 2 (22m) for prompt injection and jailbreak defense.
- **PostgreSQL Database:** Powered by Neon PostgreSQL with Prisma ORM.

## 🛠️ Tech Stack
- Next.js 16 (App Router)
- Neon PostgreSQL + Prisma ORM
- Groq LPU (`openai/gpt-oss-120b` + `meta-llama/llama-prompt-guard-2-22m`)
- Tailwind CSS & Lucide Icons

## 📦 Setup & Run
\`\`\`bash
bun install
bunx prisma db push
bun dev
\`\`\`
