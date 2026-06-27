import { useState } from "react";
import { View, Text, Button, ActivityIndicator, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { estimateFromImage } from "../../src/features/food/visionApi";

export default function Photo() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [busy, setBusy] = useState(false);

  async function handle(uri: string) {
    setBusy(true);
    try {
      const manip = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1024 } }], {
        base64: true,
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      const items = await estimateFromImage(manip.base64 ?? "");
      if (items.length === 0) {
        Alert.alert("No foods detected", "Try another photo or add manually.");
        return;
      }
      router.replace({
        pathname: "/food/photo-review",
        params: { date, uri: manip.uri, items: JSON.stringify(items) },
      });
    } catch (e) {
      Alert.alert("Estimate failed", e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert("Camera permission needed");
    const res = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!res.canceled) handle(res.assets[0].uri);
  }

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!res.canceled) handle(res.assets[0].uri);
  }

  if (busy) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
        <ActivityIndicator size="large" />
        <Text>Estimating…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Snap your meal</Text>
      <Button title="Take photo" onPress={takePhoto} />
      <Button title="Pick from library" onPress={pickPhoto} />
      <Button title="Cancel" onPress={() => router.back()} />
    </View>
  );
}
