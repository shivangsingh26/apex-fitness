import { useState } from "react";
import { View, Text, TextInput, Button, ScrollView, Pressable, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { VisionItem } from "../../src/features/food/vision";
import { uploadFoodPhoto, logVisionItem } from "../../src/features/food/visionApi";
import { Meal } from "../../src/features/food/api";

export default function PhotoReview() {
  const params = useLocalSearchParams<{ date: string; uri: string; items: string }>();
  const date = params.date;
  const [items, setItems] = useState<VisionItem[]>(() => {
    try {
      return JSON.parse(params.items ?? "[]") as VisionItem[];
    } catch {
      return [];
    }
  });
  const [meal, setMeal] = useState<Meal>("lunch");
  const [saving, setSaving] = useState(false);

  function update(i: number, field: keyof VisionItem, value: string) {
    setItems((prev) => {
      const next = [...prev];
      const val = field === "name" ? value : Number(value) || 0;
      next[i] = { ...next[i], [field]: val } as VisionItem;
      return next;
    });
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function logAll() {
    if (items.length === 0) return;
    setSaving(true);
    try {
      const photoPath = params.uri ? await uploadFoodPhoto(params.uri) : null;
      for (const it of items) await logVisionItem(date, meal, it, photoPath);
      router.replace("/(tabs)/food");
    } catch (e) {
      Alert.alert("Log failed", e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Review items</Text>
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
      <ScrollView>
        {items.map((it, i) => (
          <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee", gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: "#999" }}>confidence {(it.confidence * 100).toFixed(0)}%</Text>
              <Pressable onPress={() => removeItem(i)}>
                <Text style={{ color: "red" }}>Remove</Text>
              </Pressable>
            </View>
            <TextInput value={it.name} onChangeText={(v) => update(i, "name", v)} placeholder="name"
              style={{ borderWidth: 1, padding: 8, borderRadius: 8 }} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput value={String(it.grams)} onChangeText={(v) => update(i, "grams", v)} keyboardType="numeric"
                placeholder="g" style={{ borderWidth: 1, padding: 8, borderRadius: 8, flex: 1 }} />
              <TextInput value={String(it.kcal)} onChangeText={(v) => update(i, "kcal", v)} keyboardType="numeric"
                placeholder="kcal" style={{ borderWidth: 1, padding: 8, borderRadius: 8, flex: 1 }} />
              <TextInput value={String(it.protein)} onChangeText={(v) => update(i, "protein", v)} keyboardType="numeric"
                placeholder="protein" style={{ borderWidth: 1, padding: 8, borderRadius: 8, flex: 1 }} />
            </View>
          </View>
        ))}
      </ScrollView>
      <Button title={saving ? "Saving…" : "Log all"} onPress={logAll} disabled={saving} />
      <Button title="Cancel" onPress={() => router.replace("/(tabs)/food")} />
    </View>
  );
}
