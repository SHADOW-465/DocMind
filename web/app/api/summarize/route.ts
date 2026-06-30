import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { sentences, length } = await req.json();

    if (!Array.isArray(sentences) || sentences.length === 0) {
      return NextResponse.json(
        { error: "bad-request", message: "Missing or invalid sentences list" },
        { status: 400 }
      );
    }

    const lengthTargets: Record<string, number> = { short: 6, medium: 10, detailed: 16 };
    const N = lengthTargets[length] || 10;

    const systemPrompt = `You are a professional document summarization assistant.
Given a list of numbered sentences from a PDF, you must select the most important ones to summarize the text, rewrite them into concise plain-language points, and group them into themes.
You MUST output your response strictly as a JSON object, with no markdown code blocks, no backticks, and no explanation.

JSON Schema:
{
  "themes": [
    {
      "label": "Name of the theme/topic (1-3 words)",
      "points": [
        {
          "index": 0-based index of the original sentence selected as anchor,
          "text": "The concise, plain-language rewritten summary point"
        }
      ]
    }
  ]
}

Rules:
1. Select the top N most important sentences to summarize the text. N is based on length preference:
   - For "short": Select exactly 6 sentences.
   - For "medium": Select exactly 10 sentences.
   - For "detailed": Select exactly 16 sentences.
   (If there are fewer total sentences than N, select all of them.)
2. For each selected sentence, rewrite it into a single clear, concise, plain-language sentence.
3. Group the selected sentences into 2 to 5 themes. Each theme must have a short, professional label.
4. Each selected sentence's index MUST refer to a valid index in the input list. Do not hallucinate indices.
`;

    const userPrompt = `Here are the sentences from the document:
${sentences.map((s, idx) => `[${idx}] ${s}`).join("\n")}

Please select the top ${N} sentences, reword them, group them into 2 to 5 themes, and output the JSON response.`;

    const providers = [];
    if (process.env.NVIDIA_API_KEY) {
      providers.push({
        name: "nvidia-nim",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        key: process.env.NVIDIA_API_KEY,
        model: "meta/llama-3.1-8b-instruct",
      });
    }
    if (process.env.GROQ_API_KEY) {
      providers.push({
        name: "groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: process.env.GROQ_API_KEY,
        model: "llama-3.1-8b-instant",
      });
    }

    if (providers.length === 0) {
      return NextResponse.json(
        { error: "not-configured", message: "No LLM API keys (NVIDIA NIM or Groq) are configured on the server." },
        { status: 500 }
      );
    }

    let responseText = "";
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0,
            max_tokens: 2048,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) {
          responseText = text;
          break; // successfully got response
        }
        throw new Error("Empty completion response");
      } catch (e) {
        errors.push(`${provider.name}: ${(e as Error).message}`);
      }
    }

    if (!responseText) {
      return NextResponse.json(
        { error: "api-failed", message: "All chat backends failed: " + errors.join("; ") },
        { status: 502 }
      );
    }

    // Parse and extract the JSON response
    try {
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start === -1 || end === -1 || end < start) {
        throw new Error("Could not find a valid JSON object in completion response");
      }
      const jsonStr = responseText.substring(start, end + 1);
      const summaryResult = JSON.parse(jsonStr);

      return NextResponse.json(summaryResult);
    } catch (e) {
      return NextResponse.json(
        { error: "bad-json", message: "Failed to parse JSON from LLM: " + (e as Error).message, raw: responseText },
        { status: 500 }
      );
    }

  } catch (e) {
    return NextResponse.json(
      { error: "internal", message: "Internal server error: " + (e as Error).message },
      { status: 500 }
    );
  }
}
