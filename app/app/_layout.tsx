import "react-native-get-random-values";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AccountProvider } from "../src/account";
import { DeskProvider } from "../src/data";

export default function Root() {
  return (
    <SafeAreaProvider>
      <AccountProvider>
        <DeskProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </DeskProvider>
      </AccountProvider>
    </SafeAreaProvider>
  );
}
