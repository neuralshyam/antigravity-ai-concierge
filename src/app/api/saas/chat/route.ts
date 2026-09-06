import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { checkPromptSafety } from "@/lib/prompt-guard";
import { prisma } from "@/lib/prisma";

// Valid Merchant API keys (In production, load from your SaaS PostgreSQL/Redis)
const VALID_MERCHANT_KEYS: Record<string, { merchantName: string; plan: string }> = {
  "ebakx_live_sk_test108": {
    merchantName: "Ebakx Marketplace",
    plan: "Enterprise Pro",
  },
};

const saasStoreTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "store_action",
      description:
        "Execute an action on the merchant's store backend: search catalog, fetch live stock/prices, check customer orders, manage shopping cart, and wishlist.",
      parameters: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            enum: [
              "search_products",
              "get_product_details",
              "get_my_orders",
              "track_single_order",
              "get_my_cart",
              "add_to_cart",
              "get_my_wishlist",
              "get_my_profile",
            ],
            description: "The action to execute on the merchant's backend proxy.",
          },
          search_params: {
            type: "object",
            description: "Parameters when intent is 'search_products'.",
            properties: {
              searchTerm: { type: "string", description: "Keywords (e.g. 'shoes', 'phone', 't-shirt')." },
              category: { type: "string", description: "Category filter." },
              minPrice: { type: "number", description: "Minimum price." },
              maxPrice: { type: "number", description: "Maximum price." },
              page: { type: "number", description: "Page number." },
              limit: { type: "number", description: "Items per page." },
            },
          },
          product_id: { type: "string", description: "Product MongoDB ID." },
          order_id: { type: "string", description: "Order ID." },
          cart_item: {
            type: "object",
            description: "Details when intent is 'add_to_cart'.",
            properties: {
              productId: { type: "string", description: "Product ID." },
              quantity: { type: "number", description: "Quantity." },
              color: { type: "string", description: "Color variant." },
              size: { type: "string", description: "Size variant." },
            },
          },
        },
        required: ["intent"],
      },
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    const merchantKey = req.headers.get("x-merchant-key");
    const customerAuth = req.headers.get("authorization"); // Customer JWT forwarded from store backend

    // 1. Verify Merchant Subscription API Key from Neon PostgreSQL
    if (!merchantKey) {
      return NextResponse.json(
        { error: "Unauthorized: Missing X-Merchant-Key. Please provide a valid SaaS API key." },
        { status: 401 }
      );
    }

    // Dynamic Zero-Trust DB Lookup
    const store = await prisma.store.findUnique({
      where: { apiKey: merchantKey },
    });

    if (!store || store.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Unauthorized: API Key is inactive, suspended, or invalid." },
        { status: 401 }
      );
    }

    // Check Quota
    if (store.usedRequests >= store.monthlyQuota) {
      return NextResponse.json(
        { error: "Monthly Plan Quota Exceeded. Please upgrade your subscription tier in the SaaS Dashboard." },
        { status: 429 }
      );
    }

    // PINNED BACKEND CALLBACK: Strictly use the URL registered in Neon DB!
    const storeBackendUrl = store.backendUrl;

    const { messages } = await req.json();
    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json({ error: "GROQ_API_KEY missing on SaaS Server" }, { status: 500 });
    }

    // Asynchronously increment request usage in Neon DB
    prisma.store.update({
      where: { id: store.id },
      data: { usedRequests: { increment: 1 } },
    }).catch(console.error);

    // 2. Meta Llama Prompt Guard 2 (22m) Defense
    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    if (latestUserMsg) {
      const guardResult = await checkPromptSafety(latestUserMsg, groqApiKey);
      if (!guardResult.isSafe) {
        return NextResponse.json({
          reply: "⚠️ Your message was flagged by our safety guardrail. Please keep questions focused on our store products and orders.",
          toolExecutions: [],
          guardBlocked: true,
        });
      }
    }

    const systemMessage: Groq.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: `You are the AI Shopping Assistant for ${store.storeName}.
- CONVERSATION STYLE: Minimal, punchy, engaging, and concise. Deliver direct, helpful answers with just enough warmth and proactivity.
- You have ONE master tool: \`store_action\`. Use it to search products, fetch real-time catalog items, check stock/prices, track orders, view cart, and add products to cart.
- CLICKABLE LINK ENRICHMENT (CRITICAL):
  - Always link product names to their live detail page: \`[Product Title](/best_deal/PRODUCT_ID)\` using the real \`_id\` from the tool result.
  - When mentioning cart, link to \`[My Cart](/my-cart)\`.
  - When mentioning order tracking, link to \`[Track Order](/track-order)\`.
  - When mentioning categories, link to \`[Category Name](/category?category=CategoryName)\`.
- PAGINATION SUPPORT: When searching or listing products, use 'page' and 'limit'. If total > count on current page, mention total results and offer to show the next page.
- Format recommendations with clean Markdown tables or bullet lists.`,
    };

    const chatHistory: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      systemMessage,
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    const groq = new Groq({ apiKey: groqApiKey });

    // 3. LLM Step 1: Tool Decision on Groq LPU
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: chatHistory,
      tools: saasStoreTools,
      tool_choice: "auto",
      temperature: 0.2,
    });

    const choice = response.choices[0];
    const message = choice.message;
    const toolExecutions: Array<{ toolName: string; payload: any; result: any }> = [];

    // 4. Bidirectional Tool Calling: SaaS Core calls BACK into Merchant Backend Proxy with Customer JWT!
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCallResponses: Groq.Chat.Completions.ChatCompletionMessageParam[] = [message];

      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          let parsedPayload: any;
          try {
            parsedPayload = JSON.parse(toolCall.function.arguments);
          } catch {
            parsedPayload = { intent: "search_products" };
          }

          // Bidirectional Callback to Store Backend's Unified Proxy Endpoint!
          let actionResult: any;
          try {
            const callbackRes = await fetch(`${storeBackendUrl}/ai-concierge/execute-action`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(customerAuth ? { Authorization: customerAuth } : {}),
              },
              body: JSON.stringify(parsedPayload),
            });
            actionResult = await callbackRes.json();
          } catch (callbackErr: any) {
            actionResult = { success: false, error: `Store Proxy unreachable: ${callbackErr.message}` };
          }

          toolExecutions.push({
            toolName: "store_action",
            payload: parsedPayload,
            result: actionResult?.data || actionResult,
          });

          toolCallResponses.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(actionResult?.data || actionResult),
          });
        }
      }

      // Check if client requested streaming
      const acceptHeader = req.headers.get("accept") || "";
      const isStreamRequested = acceptHeader.includes("text/event-stream");

      if (isStreamRequested) {
        const stream = await groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          messages: [...chatHistory, ...toolCallResponses],
          tools: saasStoreTools,
          tool_choice: "auto",
          temperature: 0.2,
          stream: true,
        });

        const encoder = new TextEncoder();
        const customStream = new ReadableStream({
          async start(controller) {
            // First emit tool executions event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "tools", toolExecutions })}\n\n`)
            );

            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || "";
              if (content) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "content", delta: content })}\n\n`)
                );
              }
            }
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
            controller.close();
          },
        });

        return new Response(customStream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      }

      // Non-streaming fallback
      const finalCompletion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [...chatHistory, ...toolCallResponses],
        tools: saasStoreTools,
        tool_choice: "auto",
        temperature: 0.2,
      });

      return NextResponse.json({
        reply: finalCompletion.choices[0]?.message?.content || "Here are the details from your store.",
        toolExecutions,
        guardPassed: true,
      });
    }

    // Direct answer without tools
    const acceptHeader = req.headers.get("accept") || "";
    if (acceptHeader.includes("text/event-stream")) {
      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "content", delta: message.content || "How can I assist you today?" })}\n\n`
            )
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        },
      });

      return new Response(customStream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    return NextResponse.json({
      reply: message.content || "How can I assist you today?",
      toolExecutions,
      guardPassed: true,
    });
  } catch (err: any) {
    console.error("SaaS Core Chat Error:", err);
    return NextResponse.json(
      { error: "Failed to process SaaS chat request", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}
