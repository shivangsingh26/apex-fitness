import { useEffect, useState } from "react";
import { View, Text, FlatList, Alert } from "react-native";
import { weightSeries } from "../../src/features/progress/api";

export default function History() {
  const [rows, setRows] = useState<{ date: string; weight: number }[]>([]);

  useEffect(() => {
    weightSeries().then(setRows).catch((e) => Alert.alert("Load failed", String(e)));
  }, []);

  const min = rows.length ? Math.min(...rows.map((r) => r.weight)) : 0;
  const max = rows.length ? Math.max(...rows.map((r) => r.weight)) : 1;

  return (
    <View style={{ flex: 1, padding: 16, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>Weight history</Text>
      <FlatList
        data={[...rows].reverse()}
        keyExtractor={(r) => r.date}
        ListEmptyComponent={<Text>No weigh-ins yet.</Text>}
        renderItem={({ item }) => {
          const frac = max === min ? 1 : (item.weight - min) / (max - min);
          return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
              <Text style={{ width: 88 }}>{item.date}</Text>
              <View style={{ flex: 1, height: 10, backgroundColor: "#eee", borderRadius: 5 }}>
                <View style={{ width: `${20 + frac * 80}%`, height: 10, backgroundColor: "#4a90d9", borderRadius: 5 }} />
              </View>
              <Text style={{ width: 56, textAlign: "right" }}>{item.weight.toFixed(1)}</Text>
            </View>
          );
        }}
      />
    </View>
  );
}
