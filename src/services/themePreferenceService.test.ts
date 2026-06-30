import { parseThemeMode } from "../services/themePreferenceService";

describe("themePreferenceService", () => {
  it("defaults invalid values to dark", () => {
    expect(parseThemeMode(null)).toBe("dark");
    expect(parseThemeMode(undefined)).toBe("dark");
    expect(parseThemeMode("")).toBe("dark");
    expect(parseThemeMode("invalid")).toBe("dark");
  });

  it("parses light mode", () => {
    expect(parseThemeMode("light")).toBe("light");
  });

  it("parses dark mode", () => {
    expect(parseThemeMode("dark")).toBe("dark");
  });
});
