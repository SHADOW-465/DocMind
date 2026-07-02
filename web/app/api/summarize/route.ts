import { NextResponse } from "next/server";
import type { LlmThemeNode, LlmSummarizeResult } from "@/lib/summarize/assemble";
import { LENGTH_TARGETS, type LlmCandidate } from "@/lib/summarize/types";

export async function POST(req: Request) {
  try {
    const { candidates, length } = (await req.json()) as {
      candidates: LlmCandidate[];
      length: string;
    };

    if (!Array.isArray(candidates) || candidates.length === 0) {
      return NextResponse.json(
        { error: "bad-request", message: "Missing or invalid candidates list" },
        { status: 400 },
      );
    }

    const N = LENGTH_TARGETS[length] ?? LENGTH_TARGETS.medium;

    const systemPrompt = `You are a professional document summarization assistant.
You will be given a numbered list of candidate sentences, already pre-selected from a PDF as the most information-dense sentences in the document. Your job is to pick the best subset, rewrite each into a plain-language point, and group them into themes.
You MUST output your response strictly as a JSON object, with no markdown code blocks, no backticks, and no explanation.

JSON Schema:
{
  "themes": [
    {
      "label": "Name of the theme/topic (1-3 words)",
      "points": [
        { "index": <the exact "index" value of the candidate you selected>, "text": "The concise, plain-language rewritten summary point" }
      ]
    }
  ]
}

Rules:
1. Select exactly ${N} candidates (or all of them if there are fewer than ${N} total).
2. The "index" field in your output MUST be copied EXACTLY from one of the candidates' "index" values below. Do not invent an index, do not use a position/count instead of the given index, and never reuse the same index twice.
3. Rewrite each selected candidate into one clear, concise, plain-language sentence.
4. Group the selected candidates into 2 to 5 themes with short, professional labels.`;

    const userPrompt = `Candidates:
${candidates.map((c) => `[${c.index}] ${c.text}`).join("\n")}

Select ${N} of these candidates, reword them, group into 2-5 themes, and return the JSON.`;

    const providers: { name: string; url: string; key: string; model: string }[] = [];
    if (process.env.NVIDIA_API_KEY) {
      providers.push({
        name: "nvidia-nim",
        url: "https://integrate.api.nvidia.com/v1/chat/completions",
        key: process.env.NVIDIA_API_KEY,
        model: process.env.LUCENT_NIM_MODEL || "meta/llama-3.3-70b-instruct",
      });
    }
    if (process.env.GROQ_API_KEY) {
      providers.push({
        name: "groq",
        url: "https://api.groq.com/openai/v1/chat/completions",
        key: process.env.GROQ_API_KEY,
        model: process.env.LUCENT_GROQ_MODEL || "llama-3.3-70b-versatile",
      });
    }

    if (providers.length === 0) {
      return NextResponse.json(
        {
          error: "not-configured",
          message: "No LLM API keys (NVIDIA NIM or Groq) are configured on the server.",
        },
        { status: 500 },
      );
    }

    let responseText = "";
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const response = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
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
            response_format: { type: "json_object" },
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
          break;
        }
        throw new Error("Empty completion response");
      } catch (e) {
        errors.push(`${provider.name}: ${(e as Error).message}`);
      }
    }

    if (!responseText) {
      return NextResponse.json(
        { error: "api-failed", message: "All chat backends failed: " + errors.join("; ") },
        { status: 502 },
      );
    }

    let parsed: LlmSummarizeResult;
    try {
      const start = responseText.indexOf("{");
      const end = responseText.lastIndexOf("}");
      if (start === -1 || end === -1 || end < start) {
        throw new Error("Could not find a valid JSON object in completion response");
      }
      parsed = JSON.parse(responseText.substring(start, end + 1));
    } catch (e) {
      return NextResponse.json(
        {
          error: "bad-json",
          message: "Failed to parse JSON from LLM: " + (e as Error).message,
          raw: responseText,
        },
        { status: 500 },
      );
    }

    // Server-side validation: an out-of-range or duplicate index is DROPPED
    // here too (defense in depth -- the client independently validates again
    // in bindPointsToCandidates before anything becomes a citation).
    const validIndices = new Set(candidates.map((c) => c.index));
    const seen = new Set<number>();
    const cleanedThemes: LlmThemeNode[] = (parsed.themes ?? [])
      .map((theme) => ({
        label: theme.label,
        points: (theme.points ?? []).filter((pt) => {
          if (!Number.isInteger(pt.index) || !validIndices.has(pt.index) || seen.has(pt.index)) {
            return false;
          }
          seen.add(pt.index);
          return true;
        }),
      }))
      .filter((theme) => theme.points.length > 0);

    return NextResponse.json({ themes: cleanedThemes });
  } catch (e) {
    return NextResponse.json(
      { error: "internal", message: "Internal server error: " + (e as Error).message },
      { status: 500 },
    );
  }
}
