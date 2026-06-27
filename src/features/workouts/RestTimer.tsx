import { useEffect, useRef, useState } from "react";
import { View, Text, Button } from "react-native";

export default function RestTimer({ seconds = 90, onDone }: { seconds?: number; onDone?: () => void }) {
  const [remaining, setRemaining] = useState(seconds);
  const [running, setRunning] = useState(true);
  const fired = useRef(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (remaining === 0 && !fired.current) {
      fired.current = true;
      onDone?.();
    }
  }, [remaining, onDone]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "600", width: 56 }}>{remaining}s</Text>
      <Button title={running ? "Pause" : "Resume"} onPress={() => setRunning((v) => !v)} />
      <Button title="-15" onPress={() => setRemaining((r) => Math.max(0, r - 15))} />
      <Button title="+15" onPress={() => setRemaining((r) => r + 15)} />
      <Button
        title="Skip"
        onPress={() => {
          fired.current = true;
          setRemaining(0);
          setRunning(false);
          onDone?.();
        }}
      />
    </View>
  );
}
