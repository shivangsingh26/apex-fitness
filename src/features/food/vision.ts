export type VisionItem = {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber: number;
  confidence: number;
};

function nonNeg(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}

export function parseVisionResponse(raw: unknown): VisionItem[] {
  if (!raw || typeof raw !== "object") return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  const out: VisionItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const name = (it as { name?: unknown }).name;
    if (typeof name !== "string" || name.trim() === "") continue;
    const o = it as Record<string, unknown>;
    out.push({
      name: name.trim(),
      grams: nonNeg(o.grams),
      kcal: nonNeg(o.kcal),
      protein: nonNeg(o.protein),
      carb: nonNeg(o.carb),
      fat: nonNeg(o.fat),
      fiber: nonNeg(o.fiber),
      confidence: clamp01(o.confidence),
    });
  }
  return out;
}
