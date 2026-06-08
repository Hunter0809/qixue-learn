import { useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import { HomeScreen } from "./screens/HomeScreen";
import { FeatureScreen } from "./screens/FeatureScreen";
import { colors } from "./styles/theme";
import type { HomeworkFeature } from "./types/domain";

export default function App() {
  const [activeFeature, setActiveFeature] = useState<HomeworkFeature | null>(null);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {activeFeature ? (
        <FeatureScreen feature={activeFeature} onBack={() => setActiveFeature(null)} />
      ) : (
        <HomeScreen onOpenFeature={setActiveFeature} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background
  }
});
