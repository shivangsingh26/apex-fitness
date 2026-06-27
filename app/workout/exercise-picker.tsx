import { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, Button, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { listExercises, addCustomExercise, ExerciseRow } from "../../src/features/workouts/api";

export default function ExercisePicker() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ExerciseRow[]>([]);

  useEffect(() => {
    listExercises(query).then(setRows).catch((e) => Alert.alert("Load failed", String(e)));
  }, [query]);

  function choose(ex: ExerciseRow) {
    router.replace({
      pathname: `/workout/${workoutId}`,
      params: { pickedExerciseId: ex.id, pickedExerciseName: ex.name },
    });
  }

  async function addCustom() {
    if (!query.trim()) return;
    try {
      const ex = await addCustomExercise(query.trim(), "other", "other");
      choose(ex);
    } catch (e) {
      Alert.alert("Add failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder="Search or new exercise name"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <Button title={`Add custom "${query}"`} onPress={addCustom} />
      <FlatList
        data={rows}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => choose(item)}
            style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: "#eee" }}
          >
            <Text style={{ fontWeight: "600" }}>{item.name}</Text>
            <Text style={{ color: "#666" }}>
              {item.muscle_group}
              {item.is_custom ? " · custom" : ""}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
