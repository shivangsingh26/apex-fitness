import { useEffect, useState } from "react";
import { View, Text, TextInput, Button, FlatList, Alert } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { addSet, workoutDetail, WorkoutSetRow } from "../../src/features/workouts/api";
import RestTimer from "../../src/features/workouts/RestTimer";

export default function ActiveWorkout() {
  const { id, pickedExerciseId, pickedExerciseName } = useLocalSearchParams<{
    id: string;
    pickedExerciseId?: string;
    pickedExerciseName?: string;
  }>();
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [exerciseName, setExerciseName] = useState<string>("");
  const [reps, setReps] = useState("5");
  const [weight, setWeight] = useState("100");
  const [rpe, setRpe] = useState("");
  const [sets, setSets] = useState<WorkoutSetRow[]>([]);
  const [showTimer, setShowTimer] = useState(false);

  useEffect(() => {
    if (pickedExerciseId) {
      setExerciseId(pickedExerciseId);
      setExerciseName(pickedExerciseName ?? "");
    }
  }, [pickedExerciseId, pickedExerciseName]);

  useEffect(() => {
    workoutDetail(id).then((d) => setSets(d.sets)).catch(() => {});
  }, [id]);

  async function save() {
    if (!exerciseId) return Alert.alert("Pick an exercise first");
    try {
      const setNo = sets.filter((s) => s.exercise_id === exerciseId).length + 1;
      const row = await addSet(id, exerciseId, setNo, Number(reps), Number(weight), rpe ? Number(rpe) : null);
      setSets((prev) => [...prev, row]);
      setShowTimer(true);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, gap: 10 }}>
      <Button
        title={exerciseName ? `Exercise: ${exerciseName} (change)` : "Pick exercise"}
        onPress={() => router.push({ pathname: "/workout/exercise-picker", params: { workoutId: id } })}
      />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="kg"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
        <TextInput value={reps} onChangeText={setReps} keyboardType="numeric" placeholder="reps"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
        <TextInput value={rpe} onChangeText={setRpe} keyboardType="numeric" placeholder="RPE"
          style={{ borderWidth: 1, padding: 10, borderRadius: 8, flex: 1 }} />
      </View>
      <Button title="Save set" onPress={save} />
      {showTimer && <RestTimer seconds={90} onDone={() => setShowTimer(false)} />}
      <FlatList
        data={sets}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <View style={{ flexDirection: "row", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: "#eee" }}>
            <Text style={{ flex: 1 }}>
              #{item.set_no}  {item.weight_kg}kg × {item.reps}
            </Text>
            <Text>1RM {item.est_1rm ? Math.round(item.est_1rm) : "-"}</Text>
            {item.is_weight_pr && <Text style={{ color: "green" }}>🏋️ PR</Text>}
            {item.is_1rm_pr && <Text style={{ color: "orange" }}>💪 1RM</Text>}
          </View>
        )}
      />
      <Button title="Finish" onPress={() => router.replace("/(tabs)/workouts")} />
    </View>
  );
}
