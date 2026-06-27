import { useState } from "react";
import { View, TextInput, Button, Text, Alert } from "react-native";
import { router } from "expo-router";
import { validateProfile } from "../../src/features/profile/validation";
import { saveProfile } from "../../src/features/profile/api";

export default function ProfileStep() {
  const [sex, setSex] = useState("male");
  const [birthdate, setBirthdate] = useState("1995-01-01");
  const [heightCm, setHeightCm] = useState("178");
  const [activityLevel, setActivityLevel] = useState("moderate");
  const [errors, setErrors] = useState<string[]>([]);

  async function next() {
    const input = { sex, birthdate, heightCm: Number(heightCm), activityLevel };
    const errs = validateProfile(input);
    setErrors(errs);
    if (errs.length) return;
    try {
      await saveProfile(input);
      router.push("/(onboarding)/goal");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>About you</Text>
      <TextInput value={sex} onChangeText={setSex} placeholder="sex (male/female)"
        autoCapitalize="none" style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={birthdate} onChangeText={setBirthdate} placeholder="birthdate YYYY-MM-DD"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" placeholder="height cm"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      <TextInput value={activityLevel} onChangeText={setActivityLevel} placeholder="activity level"
        autoCapitalize="none" style={{ borderWidth: 1, padding: 10, borderRadius: 8 }} />
      {errors.map((e) => <Text key={e} style={{ color: "red" }}>{e}</Text>)}
      <Button title="Next" onPress={next} />
    </View>
  );
}
