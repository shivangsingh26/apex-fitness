import { useState } from "react";
import { View, TextInput, Button, Text, Alert } from "react-native";
import { router } from "expo-router";
import { supabase } from "../../src/lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit(mode: "in" | "up") {
    const { error } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) return Alert.alert("Auth error", error.message);
    router.replace("/");
  }

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 28, fontWeight: "700" }}>Apex</Text>
      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={{ borderWidth: 1, padding: 10, borderRadius: 8 }}
      />
      <Button title="Sign in" onPress={() => submit("in")} />
      <Button title="Create account" onPress={() => submit("up")} />
    </View>
  );
}
