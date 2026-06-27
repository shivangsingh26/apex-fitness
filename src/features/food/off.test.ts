import { mapOffProduct } from "./off";
import fixture from "./off.fixture.json";

describe("mapOffProduct", () => {
  it("maps a valid OFF product to per-100g FoodData", () => {
    const r = mapOffProduct(fixture);
    expect(r).not.toBeNull();
    expect(r!.name).toBe("Nutella");
    expect(r!.brand).toBe("Ferrero");
    expect(r!.barcode).toBe("3017620422003");
    expect(r!.servingG).toBe(15);
    expect(r!.per100.kcal).toBe(539);
    expect(r!.per100.protein).toBeCloseTo(6.3, 2);
    expect(r!.per100.fiber).toBe(0);
  });
  it("returns null when name missing", () => {
    expect(mapOffProduct({ nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
  });
  it("returns null when energy missing", () => {
    expect(mapOffProduct({ product_name: "X", nutriments: {} })).toBeNull();
  });
});
