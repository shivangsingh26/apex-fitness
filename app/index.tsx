import { Redirect } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../src/lib/session";

export default function Index() {
  const { session, loading } = useSession();
  if (loading) return <Text>Loading…</Text>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
