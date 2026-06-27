import { useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { scanBarcode, upsertFoodFromOff, logFood, Meal } from "../../src/features/food/api";

export default function Scan() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);

  if (!permission) return <Text>Loading…</Text>;
  if (!permission.granted) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
        <Text>Camera access needed to scan barcodes.</Text>
        <Button title="Grant permission" onPress={requestPermission} />
      </View>
    );
  }

  async function onScan(code: string) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await scanBarcode(code);
      if (!data) {
        Alert.alert("Not found", "No product for this barcode.", [{ text: "OK", onPress: () => setBusy(false) }]);
        return;
      }
      const food = await upsertFoodFromOff(data);
      const grams = food.serving_g ?? 100;
      await logFood(date, "snack" as Meal, food.id, grams);
      Alert.alert("Logged", `${food.name} · ${grams}g`, [{ text: "OK", onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert("Scan failed", String(e), [{ text: "OK", onPress: () => setBusy(false) }]);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <CameraView
        style={{ flex: 1 }}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => onScan(data)}
      />
      <Button title="Cancel" onPress={() => router.back()} />
    </View>
  );
}
