import { StateCreator } from 'zustand';
import { ThemeName, Theme } from '../../types/global';
import { API_ENDPOINTS } from '../../api/endpoints';
import { api } from '../../api/client'; // Import the api client instance
import { createComponentLogger } from '../../utils/debug';

// Create component-specific logger
const logger = createComponentLogger('ThemeSlice');

// Helper to create a valid ThemeName
const asThemeName = (name: string): ThemeName => name as ThemeName;

export interface ThemeSlice {
  theme: ThemeName;
  themeData: Theme;
  availableThemes: Record<string, Theme>;
  isLoadingThemes: boolean;
  setTheme: (theme: string) => void;
  toggleTheme: () => void;
  loadThemes: () => Promise<void>;
}

type StoreWithTheme = ThemeSlice & {
  isAdmin: boolean;
  visibility: any;
  tabs: any;
};

// Default light theme as fallback
const defaultTheme: Theme = {
  background: '#FFFFFF',
  text: '#1A1A1A',
  primary: '#2563EB',
  primaryHover: '#60A5FA',
  secondary: '#10B981',
  accent: '#8B5CF6',
  error: '#EF4444',
  success: '#059669',
  warning: '#F59E0B',
  border: '#E5E7EB',
  statusUp: '#059669',
  statusDown: '#EF4444',
  statusPartial: '#F59E0B',
  statusUnknown: '#6B7280',
  hiddenTabBackground: '#F3F4F6',
  hiddenTabText: '#9CA3AF'
};

const THEME_DATA_STORAGE_KEY = 'themeData';

export const createThemeSlice: StateCreator<StoreWithTheme, [], [], ThemeSlice> = (set, get) => ({
  // Get initial theme and data from localStorage
  theme: asThemeName(localStorage.getItem('theme') || 'light'),
  themeData: JSON.parse(localStorage.getItem(THEME_DATA_STORAGE_KEY) || 'null') || defaultTheme,
  availableThemes: { light: defaultTheme },
  isLoadingThemes: false,

  loadThemes: async () => {
    try {
      set({ isLoadingThemes: true });
      
      // const response = await fetch(API_ENDPOINTS.themes.list);
      // if (!response.ok) throw new Error('Failed to load themes');
      // const themes = await response.json();
      const themes = await api.get<Record<string, any>>(API_ENDPOINTS.themes.list); // Use api.get
      
      // Validate and store themes
      const validThemes: Record<string, Theme> = {};
      Object.entries(themes).forEach(([name, theme]) => {
        if (isValidTheme(theme)) {
          validThemes[name] = theme as Theme;
        }
      });
      
      // If no valid themes, use default
      if (Object.keys(validThemes).length === 0) {
        validThemes.light = defaultTheme;
      }
      
      const currentTheme = get().theme;
      const firstTheme = asThemeName(Object.keys(validThemes)[0]);
      
      set({ 
        availableThemes: validThemes,
        // If current theme doesn't exist in new themes, switch to first available
        themeData: validThemes[currentTheme] || validThemes[firstTheme],
        theme: validThemes[currentTheme] ? currentTheme : firstTheme
      });
      
      // Update CSS variables
      document.documentElement.setAttribute('data-theme', get().theme);
      updateCssVariables(get().themeData);
      
    } catch (error) {
      logger.error('Failed to load themes:', error);
      // Fallback to default theme
      set({ 
        availableThemes: { light: defaultTheme },
        themeData: defaultTheme,
        theme: asThemeName('light')
      });
    } finally {
      set({ isLoadingThemes: false });
    }
  },

  setTheme: (themeName: string) => {
    const theme = get().availableThemes[themeName];
    if (!theme) return;
    
    const validThemeName = asThemeName(themeName);
    
    // Only store theme data, which includes all necessary information
    localStorage.setItem(THEME_DATA_STORAGE_KEY, JSON.stringify(theme));
    
    set({ 
      theme: validThemeName,
      themeData: theme
    });
    
    document.documentElement.setAttribute('data-theme', validThemeName);
    updateCssVariables(theme);
  },

  toggleTheme: () => {
    const themes = Object.keys(get().availableThemes);
    const currentIndex = themes.indexOf(get().theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    get().setTheme(nextTheme);
  },
});

// Helper to validate theme object
function isValidTheme(theme: any): theme is Theme {
  const requiredProps = [
    'background',
    'text',
    'primary',
    'secondary',
    'accent',
    'error',
    'success',
    'warning',
    'border',
    'statusUp',
    'statusDown',
    'statusPartial',
    'statusUnknown'
  ];
  
  return requiredProps.every(prop => 
    typeof theme[prop] === 'string' && /^#[0-9A-Fa-f]{6}$/.test(theme[prop])
  );
}

// Helper to update CSS variables
function updateCssVariables(theme: Theme): void {
  const root = document.documentElement;
  
  root.style.setProperty('--background', theme.background);
  root.style.setProperty('--text', theme.text);
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--secondary', theme.secondary);
  root.style.setProperty('--accent', theme.accent);
  root.style.setProperty('--error', theme.error);
  root.style.setProperty('--success', theme.success);
  root.style.setProperty('--warning', theme.warning);
  root.style.setProperty('--border', theme.border);
  
  // Status colors
  root.style.setProperty('--status-up', theme.statusUp);
  root.style.setProperty('--status-down', theme.statusDown);
  root.style.setProperty('--status-partial', theme.statusPartial);
  root.style.setProperty('--status-unknown', theme.statusUnknown);

  // Hidden tab colors
  root.style.setProperty('--hiddenTabBackground', theme.hiddenTabBackground);
  root.style.setProperty('--hiddenTabText', theme.hiddenTabText);

  // Add primaryHover to the CSS variables
  root.style.setProperty('--primaryHover', theme.primaryHover);
}

// Update initialization to only use theme data
const initializeTheme = () => {
  const themeData = JSON.parse(localStorage.getItem(THEME_DATA_STORAGE_KEY) || 'null');
  if (themeData) {
    updateCssVariables(themeData);
    // We can derive theme name from the stored theme data or fall back to light
    document.documentElement.setAttribute('data-theme', 'light'); // Default while loading
  }
};

// Run initialization immediately
initializeTheme();
