const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.unstable_conditionNames = [
  "react-native",
  "browser",
  "require",
];

module.exports = config;
