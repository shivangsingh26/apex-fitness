import { useState } from "react";
import { View, Text, TextInput, Button, FlatList, Pressable, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { searchAll, upsertFoodFromOff, addManualFood, logFood, FoodRow, Meal } from "../../src/features/food/api";
import { gramsFromServings } from "../../src/features/food/nutrition";
import { FoodData } from "../../src/features/food/off";

export default function AddFood() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodData[]>([]);
  const [selected, setSelected] = useState<FoodRow | null>(null);
  const [meal, setMeal] = useState<Meal>("breakfast");
  const [grams, setGrams] = useState("100");
  const [servings, setServings] = useState("");
  const [mName, setMName] = useState("");
  const [mKcal, setMKcal] = useState("");
  const [mProtein, setMProtein] = useState("");

  async function doSearch() {
    try {
      setResults(await searchAll(query));
    } catch (e) {
      Alert.alert("Search failed", String(e));
    }
  }

  async function pick(d: FoodData) {
    try {
      const row = await upsertFoodFromOff(d);
      setSelected(row);
      setResults([]);
    } catch (e) {
      Alert.alert("Select failed", String(e));
    }
  }

  async function createManual() {
    if (!mName.trim()) return Alert.alert("Name required");
    try {
      const row = await addManualFood(
        mName.trim(),
        { kcal: Number(mKcal) || 0, protein: Number(mProtein) || 0, carb: 0, fat: 0, fiber: 0 },
        null
      );
      setSelected(row);
    } catch (e) {
      Alert.alert("Create failed", String(e));
    }
  }

  async function save() {
    if (!selected) return;
    const g =
      servings && selected.serving_g
        ? gramsFromServings(selected.serving_g, Number(servings))
        : Number(grams);
    if (g <= 0) return Alert.alert("Enter grams or servings");
    try {
      await logFood(date, meal, selected.id, g);
      router.back();
    } catch (e) {
      Alert.alert("Log failed", String(e));
    }
  }

  if (selected) {
    return (
      <View style={{ flex: 1, padding: 16, gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "700" }}>{selected.name}</Text>
        <Text>
          {selected.kcal ?? 0} kcal / 100g
          {selected.serving_g ? ` · serving ${selected.serving_g}g` : ""}
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["breakfast", "lunch", "dinner", "snack"] as Meal[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMeal(m)}
              style={{ padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: meal === m ? "#ddd" : "white" }}
            >
              <Text style={{ textTransform: "capitalize" }}>{m}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput value={grams} onChangeText={setGrams} keyboardType="numeric" placeholder="grams"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
        {selected.serving_g != null && (
          <TextInput value={servings} onChangeText={setServings} keyboardType="numeric"
            placeholder={`servings (× ${selected.serving_g}g)`} style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
        )}
        <Button title="Log it" onPress={save} />
        <Button title="Back" onPress={() => setSelected(null)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <TextInput value={query} onChangeText={setQuery} placeholder="Search Open Food Facts"
        autoCapitalize="none" style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <Button title="Search" onPress={doSearch} />
      <FlatList
        data={results}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <Pressable onPress={() => pick(item)} style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: "#666" }}>
              {item.brand ?? ""} · {Math.round(item.per100.kcal)} kcal/100g
            </Text>
          </Pressable>
        )}
      />
      <Text style={{ fontWeight: "700", marginTop: 8 }}>Or add manually</Text>
      <TextInput value={mName} onChangeText={setMName} placeholder="name"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={mKcal} onChangeText={setMKcal} keyboardType="numeric" placeholder="kcal/100g"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
        <TextInput value={mProtein} onChangeText={setMProtein} keyboardType="numeric" placeholder="protein/100g"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
      </View>
      <Button title="Create manual food" onPress={createManual} />
    </View>
  );
}
