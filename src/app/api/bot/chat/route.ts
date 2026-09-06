import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { dispatchEbakxAction, EbakxActionPayload } from "@/lib/ebakx-proxy";
import { checkPromptSafety } from "@/lib/prompt-guard";

// Real Ebakx Store Tool Schema for Groq LPU
const ebakxTools: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "ebakx_store_action",
      description:
        "Execute any operation on the live Ebakx marketplace: product discovery, checking stock/pricing, looking up buyer orders, managing the shopping cart, wishlist, and buyer profile.",
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
            description: "The specific marketplace action to perform.",
          },
          search_params: {
            type: "object",
            description: "Parameters when intent is 'search_products'.",
            properties: {
              searchTerm: { type: "string", description: "Keywords (e.g. 'shoes', 'phone', 't-shirt')." },
              category: { type: "string", description: "Category filter (e.g. 'Shoes', 'Smart-Phone', 'T-shirt')." },
              minPrice: { type: "number", description: "Minimum price." },
              maxPrice: { type: "number", description: "Maximum price." },
              page: { type: "number", description: "Page number for pagination (e.g. 1, 2, 3)." },
              limit: { type: "number", description: "Number of items per page (default 5)." },
            },
          },
          product_id: {
            type: "string",
            description: "Product ID when intent is 'get_product_details'.",
          },
          order_id: {
            type: "string",
            description: "Order ID when intent is 'track_single_order'.",
          },
          cart_item: {
            type: "object",
            description: "Details when intent is 'add_to_cart'.",
            properties: {
              productId: { type: "string", description: "Product MongoDB ID to add." },
              quantity: { type: "number", description: "Quantity (default 1)." },
              color: { type: "string", description: "Selected color variant." },
              size: { type: "string", description: "Selected size variant." },
            },
          },
        },
        required: ["intent"],
      },
    },
  },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    const authHeader = req.headers.get("authorization");
    const customerJwt = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey) {
      return NextResponse.json(
        { error: "GROQ_API_KEY is missing in server environment." },
        { status: 500 }
      );
    }

    const groq = new Groq({ apiKey: groqApiKey });

    // Step 1: Meta Llama Prompt Guard 2 (22m) Check
    const latestUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    if (latestUserMsg) {
      const guardResult = await checkPromptSafety(latestUserMsg, groqApiKey);
      if (!guardResult.isSafe) {
        return NextResponse.json({
          reply: "⚠️ Your message was flagged by our safety guardrail. Please keep questions focused on our store products, orders, and services.",
          toolExecutions: [],
          guardBlocked: true,
        });
      }
    }

    const systemMessage: Groq.Chat.Completions.ChatCompletionMessageParam = {
      role: "system",
      content: `You are the AI Shopping Assistant for the Ebakx Marketplace.
- CONVERSATION STYLE: Minimal, punchy, engaging, and concise. Avoid robotic fluff, long paragraphs, or unnecessary preambles. Deliver direct, helpful answers with just enough warmth and proactivity to keep the shopping experience smooth and delightful.
- You have ONE master tool: \`ebakx_store_action\`. Use it to search products, fetch real-time catalog items, check stock/prices, track orders, view cart, and add products to cart.
- CLICKABLE LINK ENRICHMENT (CRITICAL):
  - Always link product names to their live detail page: \`[Product Title](/best_deal/PRODUCT_ID)\` using the real \`_id\` from the tool result.
  - When mentioning cart, link it to \`[My Cart](/my-cart)\`.
  - When mentioning order tracking, link to \`[Track Order](/track-order)\`.
  - When mentioning categories, link to \`[Category Name](/category?category=CategoryName)\`.
- PAGINATION SUPPORT: When searching or listing products, use 'page' and 'limit'. If total > count on current page, mention total results and offer to show the next page (e.g. "Showing 1-5 of 12. Say 'next page' to see more!").
- Format product recommendations with clean Markdown tables or bullet lists including clickable product links, price, stock, and key features.`,
    };

    const chatHistory: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
      systemMessage,
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ];

    // Step 2: Groq LPU reasoning with ebakx_store_action tool
    const response = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      messages: chatHistory,
      tools: ebakxTools,
      tool_choice: "auto",
      temperature: 0.2,
    });

    const choice = response.choices[0];
    const message = choice.message;
    const toolExecutions: Array<{ toolName: string; payload: EbakxActionPayload; result: any }> = [];

    // Step 3: Handle Tool Calling via Ebakx Live Express Backend Proxy
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCallResponses: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        message,
      ];

      for (const toolCall of message.tool_calls) {
        if (toolCall.type === "function") {
          let parsedArgs: EbakxActionPayload;
          try {
            parsedArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            parsedArgs = { intent: "search_products" };
          }

          // Dispatches directly to http://localhost:5000/api/v1
          const execution = await dispatchEbakxAction(parsedArgs, customerJwt);

          toolExecutions.push({
            toolName: "ebakx_store_action",
            payload: parsedArgs,
            result: execution.data,
          });

          toolCallResponses.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(execution.data),
          });
        }
      }

      // Step 4: Final completion with live backend data
      const finalCompletion = await groq.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: [...chatHistory, ...toolCallResponses],
        tools: ebakxTools,
        tool_choice: "auto",
        temperature: 0.2,
      });

      return NextResponse.json(
        {
          reply: finalCompletion.choices[0]?.message?.content || "Here are the details from Ebakx.",
          toolExecutions,
          guardPassed: true,
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        reply: message.content || "How can I help you find what you need on Ebakx today?",
        toolExecutions,
        guardPassed: true,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Bot chat error:", err);
    return NextResponse.json(
      { error: "Failed to process chat message", details: err?.message || String(err) },
      { status: 500, headers: corsHeaders }
    );
  }
}
