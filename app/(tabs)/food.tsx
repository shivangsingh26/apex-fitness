import { useCallback, useState } from "react";
import { View, Text, Button, ScrollView, Pressable, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getDiary, deleteLog, DiaryDay, Meal } from "../../src/features/food/api";
import { remaining } from "../../src/features/food/nutrition";

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function Food() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [diary, setDiary] = useState<DiaryDay | null>(null);

  const load = useCallback(() => {
    getDiary(date).then(setDiary).catch((e) => Alert.alert("Load failed", String(e)));
  }, [date]);

  useFocusEffect(load);

  async function remove(id: string) {
    try {
      await deleteLog(id);
      load();
    } catch (e) {
      Alert.alert("Delete failed", String(e));
    }
  }

  const left = diary ? remaining(diary.totals, diary.targets.kcal, diary.targets.protein) : null;

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Button title="‹" onPress={() => setDate((d) => shiftDate(d, -1))} />
        <Text style={{ fontWeight: "700" }}>{date}</Text>
        <Button title="›" onPress={() => setDate((d) => shiftDate(d, 1))} />
      </View>

      {diary && (
        <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
          <Text style={{ fontWeight: "600" }}>
            {Math.round(diary.totals.kcal)} kcal · P {Math.round(diary.totals.protein)}g · C{" "}
            {Math.round(diary.totals.carb)}g · F {Math.round(diary.totals.fat)}g
          </Text>
          {left && left.kcalLeft != null && (
            <Text style={{ color: left.kcalLeft >= 0 ? "green" : "red" }}>
              {Math.round(left.kcalLeft)} kcal left · {Math.round(left.proteinLeft ?? 0)}g protein left
            </Text>
          )}
        </View>
      )}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Add food" onPress={() => router.push({ pathname: "/food/add", params: { date } })} />
        <Button title="Scan" onPress={() => router.push({ pathname: "/food/scan", params: { date } })} />
        <Button title="Photo" onPress={() => router.push({ pathname: "/food/photo", params: { date } })} />
      </View>

      <ScrollView>
        {MEALS.map((m) => (
          <View key={m} style={{ paddingVertical: 8 }}>
            <Text style={{ fontWeight: "700", textTransform: "capitalize" }}>{m}</Text>
            {(diary?.byMeal[m] ?? []).length === 0 && <Text style={{ color: "#999" }}>—</Text>}
            {(diary?.byMeal[m] ?? []).map((l) => (
              <Pressable
                key={l.id}
                onLongPress={() => remove(l.id)}
                style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}
              >
                <Text>{l.grams}g</Text>
                <Text>{Math.round(l.kcal ?? 0)} kcal</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
