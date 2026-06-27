import { useState } from "react";
import { View, TextInput, Button, Text, Alert } from "react-native";
import { router } from "expo-router";
import { validateGoal } from "../../src/features/profile/validation";
import { saveGoal } from "../../src/features/profile/api";

export default function GoalStep() {
  const [startWeightKg, setStart] = useState("85");
  const [targetWeightKg, setTarget] = useState("75");
  const [targetBfPct, setBf] = useState("12");
  const [targetDate, setDate] = useState("2026-12-01");
  const [errors, setErrors] = useState<string[]>([]);

  async function finish() {
    const input = {
      startWeightKg: Number(startWeightKg),
      targetWeightKg: Number(targetWeightKg),
      targetBfPct: Number(targetBfPct),
      targetDate,
    };
    const errs = validateGoal(input);
    setErrors(errs);
    if (errs.length) return;
    try {
      await saveGoal(input);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Your goal</Text>
      <TextInput value={startWeightKg} onChangeText={setStart} keyboardType="numeric" placeholder="start weight kg"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={targetWeightKg} onChangeText={setTarget} keyboardType="numeric" placeholder="target weight kg"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={targetBfPct} onChangeText={setBf} keyboardType="numeric" placeholder="target body-fat %"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={targetDate} onChangeText={setDate} placeholder="target date YYYY-MM-DD"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      {errors.map((e) => <Text key={e} style={{ color: "red" }}>{e}</Text>)}
      <Button title="Finish setup" onPress={finish} />
    </View>
  );
}
