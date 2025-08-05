import { useStore } from '../store';
import { ThemeName, Theme } from '../types/global';

/**
 * Hook for managing theme state and operations
 * @returns Object containing theme state and methods to update it
 */
export const useTheme = () => {
  const store = useStore((state) => ({
    theme: state.theme,
    themeData: state.themeData,
    availableThemes: state.availableThemes,
    isLoadingThemes: state.isLoadingThemes,
    setTheme: state.setTheme,
    toggleTheme: state.toggleTheme,
    loadThemes: state.loadThemes,
  }));

  /**
   * Changes the current theme
   * @param themeName - Name of the theme to switch to
   */
  const switchTheme = (themeName: string) => {
    store.setTheme(themeName);
  };

  /**
   * Cycles to the next available theme
   */
  const cycleTheme = () => {
    store.toggleTheme();
  };

  /**
   * Loads available themes from the server
   * Falls back to default light theme if loading fails
   */
  const refreshThemes = async () => {
    await store.loadThemes();
  };

  /**
   * Gets the current theme's color value for a specific property
   * @param property - The theme property to get the color for
   * @returns The color value as a hex string
   */
  const getThemeColor = (property: keyof Theme): string => {
    return store.themeData[property];
  };

  /**
   * Checks if a theme name exists in available themes
   * @param themeName - Name of the theme to check
   * @returns boolean indicating if the theme exists
   */
  const isThemeAvailable = (themeName: string): boolean => {
    return themeName in store.availableThemes;
  };

  return {
    // Current theme state
    currentTheme: store.theme as ThemeName,
    themeData: store.themeData,
    availableThemes: store.availableThemes,
    isLoadingThemes: store.isLoadingThemes,

    // Theme operations
    switchTheme,
    cycleTheme,
    refreshThemes,
    getThemeColor,
    isThemeAvailable,
  };
}; 