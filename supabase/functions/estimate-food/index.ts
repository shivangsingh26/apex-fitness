// Deno Edge Function: estimate foods from an image via OpenAI vision.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          kcal: { type: "number" },
          protein: { type: "number" },
          carb: { type: "number" },
          fat: { type: "number" },
          fiber: { type: "number" },
          confidence: { type: "number" },
        },
        required: ["name", "grams", "kcal", "protein", "carb", "fat", "fiber", "confidence"],
      },
    },
  },
  required: ["items"],
};

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const key = Deno.env.get("OPENAI_API_KEY");
    if (!key) return new Response(JSON.stringify({ error: "Missing API key" }), { status: 500, headers: cors });
    const model = Deno.env.get("OPENAI_VISION_MODEL") ?? "gpt-4o";

    const { image } = await req.json();
    if (!image) return new Response(JSON.stringify({ error: "Missing image" }), { status: 400, headers: cors });
    const dataUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

    const body = {
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify each distinct food in this image. For each, estimate the portion in grams " +
                "and the macros for THAT portion (kcal, protein, carb, fat, fiber in grams) and a " +
                "confidence 0-1. Return only the structured object.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "food_items", schema: SCHEMA, strict: true },
      },
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Vision provider error" }), { status: 500, headers: cors });
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content);
    return new Response(JSON.stringify(parsed), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: "Estimation failed" }), { status: 500, headers: cors });
  }
});
