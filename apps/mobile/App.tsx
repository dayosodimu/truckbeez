import { StatusBar, StyleSheet, View } from 'react-native';
import { RoutePlannerScreen } from './src/screens/RoutePlannerScreen';
import { colors } from './src/theme';

export default function App() {
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <RoutePlannerScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  // Safe-area handling (react-native-safe-area-context) comes with navigation in a later story.
  root: { flex: 1, paddingTop: 48, backgroundColor: colors.background },
});
