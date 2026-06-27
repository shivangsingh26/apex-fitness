import { parseVisionResponse } from "./vision";
import fixture from "./vision.fixture.json";

describe("parseVisionResponse", () => {
  it("parses a valid multi-item response", () => {
    const items = parseVisionResponse(fixture);
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("Grilled chicken breast");
    expect(items[0].grams).toBe(150);
    expect(items[1].kcal).toBe(260);
  });

  it("returns [] for malformed input", () => {
    expect(parseVisionResponse({})).toEqual([]);
    expect(parseVisionResponse(null)).toEqual([]);
    expect(parseVisionResponse({ items: "nope" })).toEqual([]);
  });

  it("drops items without a name", () => {
    const r = parseVisionResponse({ items: [{ grams: 100, kcal: 100 }] });
    expect(r).toEqual([]);
  });

  it("clamps negatives to 0 and defaults missing numbers", () => {
    const r = parseVisionResponse({ items: [{ name: "X", grams: -5, kcal: 100 }] });
    expect(r[0].grams).toBe(0);
    expect(r[0].protein).toBe(0);
    expect(r[0].confidence).toBe(0);
  });

  it("clamps confidence to [0,1]", () => {
    const r = parseVisionResponse({ items: [{ name: "X", confidence: 5 }] });
    expect(r[0].confidence).toBe(1);
  });
});
