const appJson = require("./app.json");

const basePlugins = appJson.expo.plugins ?? [];
const plugins = basePlugins.some(
  (entry) => entry === "expo-font" || (Array.isArray(entry) && entry[0] === "expo-font")
)
  ? basePlugins
  : [...basePlugins, "expo-font"];

/** @type {import('expo/config').ConfigContext} */
module.exports = ({ config }) => {
  const profile = process.env.EAS_BUILD_PROFILE;

  if (profile === "production") {
    const { assertProductionReleaseReady } = require("./scripts/validate-release-config.mjs");
    assertProductionReleaseReady({ requireAppIcon: true });
  }

  return {
    ...appJson.expo,
    ...config,
    plugins,
  };
};
