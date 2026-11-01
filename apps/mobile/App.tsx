import { NavigationContainer, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { FleetProvider } from "./src/fleet/FleetContext";
import { DriverDetailScreen } from "./src/screens/fleet/DriverDetailScreen";
import { FleetPlansScreen } from "./src/screens/fleet/FleetPlansScreen";
import { FleetScreen } from "./src/screens/fleet/FleetScreen";
import { JoinFleetScreen } from "./src/screens/fleet/JoinFleetScreen";
import { MapScreen } from "./src/screens/MapScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { TruckProfileProvider } from "./src/state/TruckProfileContext";
import { colors } from "./src/theme";

export type RootStack = {
  Map: undefined;
  Profile: undefined;
  Fleet: undefined;
  FleetPlans: undefined;
  JoinFleet: undefined;
  DriverDetail: { driverId: string; name: string };
};
const Stack = createNativeStackNavigator<RootStack>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.night, card: colors.night, primary: colors.amber },
};

export default function App() {
  return (
    <TruckProfileProvider>
      <FleetProvider>
        <NavigationContainer theme={navTheme}>
          <StatusBar style="light" />
          <Stack.Navigator>
            <Stack.Screen name="Map" component={MapScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Your truck" }} />
            <Stack.Screen name="Fleet" component={FleetScreen} options={{ title: "TruckBeez Fleet" }} />
            <Stack.Screen name="FleetPlans" component={FleetPlansScreen} options={{ title: "Fleet plans" }} />
            <Stack.Screen name="JoinFleet" component={JoinFleetScreen} options={{ title: "Join a fleet" }} />
            <Stack.Screen name="DriverDetail" component={DriverDetailScreen} options={({ route }) => ({ title: route.params.name })} />
          </Stack.Navigator>
        </NavigationContainer>
      </FleetProvider>
    </TruckProfileProvider>
  );
}
