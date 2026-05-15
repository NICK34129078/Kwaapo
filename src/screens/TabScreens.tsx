import React from "react";
import { PlaceholderScreen } from "./PlaceholderScreen";
import { ActivityScreen } from "./ActivityScreen";

export function CreateTabScreen() {
  return (
    <PlaceholderScreen
      title="Create"
      subtitle="Capture or upload your next look."
    />
  );
}

export function ActivityTabScreen() {
  return <ActivityScreen />;
}

