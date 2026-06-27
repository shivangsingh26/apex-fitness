import { useState } from "react";
import { View, Text, Button, Image, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { uploadProgressPhoto, logProgressPhoto } from "../../src/features/progress/api";

export default function ProgressPhoto() {
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pick(fromCamera: boolean) {
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return Alert.alert("Camera permission needed");
    }
    const res = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (res.canceled) return;
    const manip = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 1080 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    setUri(manip.uri);
  }

  async function save() {
    if (!uri) return;
    setBusy(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      const path = await uploadProgressPhoto(uri);
      await logProgressPhoto(date, path);
      router.replace("/(tabs)/dashboard");
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Progress photo</Text>
      {uri && <Image source={{ uri }} style={{ width: "100%", height: 360, borderRadius: 8 }} />}
      <Button title="Take photo" onPress={() => pick(true)} />
      <Button title="Pick from library" onPress={() => pick(false)} />
      {uri && (busy ? <ActivityIndicator /> : <Button title="Save photo" onPress={save} />)}
    </View>
  );
}
