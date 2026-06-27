import { useCallback, useState } from "react";
import { View, Text, Button, FlatList, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { listWorkouts, startWorkout, WorkoutSummary } from "../../src/features/workouts/api";

export default function Workouts() {
  const [rows, setRows] = useState<WorkoutSummary[]>([]);

  useFocusEffect(
    useCallback(() => {
      listWorkouts().then(setRows).catch((e) => Alert.alert("Load failed", String(e)));
    }, [])
  );

  async function start() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const w = await startWorkout(today);
      router.push(`/workout/${w.id}`);
    } catch (e) {
      Alert.alert("Could not start", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Button title="Start workout" onPress={start} />
      <FlatList
        data={rows}
        keyExtractor={(w) => w.id}
        ListEmptyComponent={<Text>No workouts yet.</Text>}
        renderItem={({ item }) => (
          <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ fontWeight: "600" }}>{item.date}</Text>
            <Text>
              {item.exerciseCount} exercises · volume {Math.round(item.totalVolume)} kg
            </Text>
          </View>
        )}
      />
    </View>
  );
}
