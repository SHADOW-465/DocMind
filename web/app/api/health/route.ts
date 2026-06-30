import { NextResponse } from "next/server";

export async function GET() {
  const hasKey = !!(process.env.NVIDIA_API_KEY || process.env.GROQ_API_KEY);
  return NextResponse.json({
    status: "ok",
    fallbackEnabled: hasKey,
    provider: process.env.NVIDIA_API_KEY ? "nvidia-nim" : (process.env.GROQ_API_KEY ? "groq" : "none")
  });
}
