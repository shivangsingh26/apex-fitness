import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../src/lib/session";
import { getProfile } from "../src/features/profile/api";

export default function Index() {
  const { session, loading } = useSession();
  const [profileComplete, setProfileComplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session) return;
    getProfile().then((p) => setProfileComplete(!!(p && p.sex && p.birthdate && p.height_cm)));
  }, [session]);

  if (loading) return <Text>Loading…</Text>;
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (profileComplete === null) return <Text>Loading…</Text>;
  if (!profileComplete) return <Redirect href="/(onboarding)/profile" />;
  return <Redirect href="/(tabs)/dashboard" />;
}
