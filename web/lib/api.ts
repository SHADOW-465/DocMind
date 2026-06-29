const ML_URL = process.env.NEXT_PUBLIC_ML_URL ?? "http://localhost:8000";

export async function checkHealth(): Promise<boolean> {
  try {
    const r = await fetch(`${ML_URL}/healthz`);
    if (!r.ok) return false;
    const body = await r.json();
    return body.status === "ok";
  } catch {
    return false;
  }
}
