import { useState } from "react";
import { View, Text, TextInput, Button, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { logBody, logSteps } from "../../src/features/progress/api";

function numOrUndef(s: string): number | undefined {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

export default function ProgressLog() {
  const [weight, setWeight] = useState("");
  const [bf, setBf] = useState("");
  const [waist, setWaist] = useState("");
  const [chest, setChest] = useState("");
  const [arm, setArm] = useState("");
  const [hip, setHip] = useState("");
  const [thigh, setThigh] = useState("");
  const [steps, setSteps] = useState("");

  async function save() {
    const weightKg = numOrUndef(weight);
    if (weightKg == null) return Alert.alert("Weight required");
    const date = new Date().toISOString().slice(0, 10);
    try {
      await logBody(date, {
        weightKg,
        bfPct: numOrUndef(bf),
        waist: numOrUndef(waist),
        chest: numOrUndef(chest),
        arm: numOrUndef(arm),
        hip: numOrUndef(hip),
        thigh: numOrUndef(thigh),
      });
      const s = numOrUndef(steps);
      if (s != null) await logSteps(date, s);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  const field = (label: string, v: string, set: (s: string) => void) => (
    <View style={{ gap: 4 }}>
      <Text style={{ color: "#666" }}>{label}</Text>
      <TextInput value={v} onChangeText={set} keyboardType="numeric"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Log progress</Text>
      {field("Weight kg (required)", weight, setWeight)}
      {field("Body fat %", bf, setBf)}
      {field("Waist cm", waist, setWaist)}
      {field("Chest cm", chest, setChest)}
      {field("Arm cm", arm, setArm)}
      {field("Hip cm", hip, setHip)}
      {field("Thigh cm", thigh, setThigh)}
      {field("Steps today", steps, setSteps)}
      <Button title="Save" onPress={save} />
    </ScrollView>
  );
}
