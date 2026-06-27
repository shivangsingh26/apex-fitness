import { useCallback, useState } from "react";
import { View, Text, Button, Alert } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getDashboard, DashboardData } from "../../src/features/progress/api";

export default function Dashboard() {
  const [d, setD] = useState<DashboardData | null>(null);

  useFocusEffect(
    useCallback(() => {
      getDashboard().then(setD).catch((e) => Alert.alert("Load failed", String(e)));
    }, [])
  );

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "800" }}>Apex</Text>

      {!d?.goal && <Text>Set up your goal in onboarding to see progress.</Text>}

      {d?.goal && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 40, fontWeight: "800" }}>
            {d.progressPct != null ? Math.round(d.progressPct) : 0}%
          </Text>
          <Text style={{ color: "#666" }}>to goal</Text>
          <Text>
            {d.currentWeight != null ? d.currentWeight.toFixed(1) : "—"} kg now ·{" "}
            {d.kgToGo != null ? d.kgToGo.toFixed(1) : "—"} kg to {d.goal.targetWeightKg} kg
          </Text>
          <Text>{d.daysLeft ?? "—"} days left · target {d.goal.targetDate}</Text>
          {d.pace && (
            <Text style={{ color: d.pace.status === "behind" ? "red" : "green" }}>
              {d.pace.status === "on"
                ? "on pace ✅"
                : d.pace.status === "ahead"
                ? `ahead ${Math.abs(d.pace.kg).toFixed(1)} kg ✅`
                : `behind ${d.pace.kg.toFixed(1)} kg ⚠️`}
            </Text>
          )}
          <Text style={{ fontWeight: "600", marginTop: 8 }}>
            Today: ≤ {d.calorieTarget ?? "—"} kcal · ≥ {d.proteinTarget ?? "—"} g protein
          </Text>
          <Text style={{ color: "#666" }}>
            projected finish: {d.projectedFinish ?? "keep logging"}
          </Text>
        </View>
      )}

      <View style={{ gap: 8, marginTop: 12 }}>
        <Button title="Log weigh-in / measurements" onPress={() => router.push("/progress/log")} />
        <Button title="Progress photo" onPress={() => router.push("/progress/photo")} />
        <Button title="History" onPress={() => router.push("/progress/history")} />
      </View>
    </View>
  );
}
