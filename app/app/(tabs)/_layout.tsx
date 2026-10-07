import { Tabs } from "expo-router";
import { Activity, CandlestickChart, Gauge, History, LayoutDashboard, Wallet } from "lucide-react-native";
import { c } from "../../src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTitleStyle: { fontSize: 16, fontWeight: "600", color: c.fg },
        headerShadowVisible: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <LayoutDashboard size={20} color={color} /> }} />
      <Tabs.Screen name="trade" options={{ title: "Trade", tabBarIcon: ({ color }) => <CandlestickChart size={20} color={color} /> }} />
      <Tabs.Screen name="positions" options={{ title: "Positions", tabBarIcon: ({ color }) => <Activity size={20} color={color} /> }} />
      <Tabs.Screen name="risk" options={{ title: "Risk", tabBarIcon: ({ color }) => <Gauge size={20} color={color} /> }} />
      <Tabs.Screen name="claims" options={{ title: "Claims", tabBarIcon: ({ color }) => <Wallet size={20} color={color} /> }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: ({ color }) => <History size={20} color={color} /> }} />
    </Tabs>
  );
}
