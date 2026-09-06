import Groq from "groq-sdk";

export interface GuardResult {
  isSafe: boolean;
  score?: number;
  reason?: string;
}

/**
 * Validates prompt using Meta Llama Prompt Guard on Groq
 * Protects the store & LLM from jailbreaks, prompt injections, and system prompt extractors.
 */
export async function checkPromptSafety(
  prompt: string,
  apiKey?: string
): Promise<GuardResult> {
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) {
    // If no key configured, bypass guard
    return { isSafe: true };
  }

  try {
    const groq = new Groq({ apiKey: key });

    // llama-prompt-guard-2-22m or llama-guard-3-8b
    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-prompt-guard-2-22m",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.0,
      max_tokens: 20,
    });

    const output = completion.choices[0]?.message?.content?.trim().toLowerCase() || "";

    // Prompt Guard outputs classifications / safety tokens (e.g. 'unsafe', 'injection', 'jailbreak')
    if (output.includes("unsafe") || output.includes("jailbreak") || output.includes("injection")) {
      return {
        isSafe: false,
        reason: `Potential security risk detected (${output})`,
      };
    }

    return { isSafe: true };
  } catch (err: any) {
    console.warn("Prompt guard check error (falling back to safe):", err?.message || err);
    // Fallback gracefully so legitimate chats aren't blocked if guard endpoint has rate limit
    return { isSafe: true };
  }
}
