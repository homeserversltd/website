import { Theme } from '../types/global';

export const createCssVariables = (theme: Theme): void => {
  const root = document.documentElement;
  
  // Set theme variables
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
};

export const globalStyles = `
  :root {
    /* Base theme variables */
    --background: #F0F0F0;
    --text: #000000;
    --primary: #A0A0A0; 
    --secondary: #03DAC6;
    --accent: #018786;
    --error: #B00020;
    --success: #00C853;
    --warning: #FF6D00;
    --border: #E0E0E0;
    
    /* Star colors */
    --star-color: #FFD700;
    --star-outline-color: inherit;
    
    /* Status colors */
    --status-up: #00C853;
    --status-down: #B00020;
    --status-partial: #FF6D00;
    --status-unknown: #757575;
    
    /* Layout variables */
    --header-height: 60px;
    --tab-bar-height: 48px;
    --content-padding: 20px;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
    background-color: var(--background);
    color: var(--text);
    line-height: 1.5;
  }

  #root {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Layout styles */
  .header {
    height: var(--header-height);
    background-color: var(--primary);
    color: white;
    display: flex;
    align-items: center;
    padding: 0 var(--content-padding);
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    justify-content: space-between;
  }

  .tab-bar {
    height: var(--tab-bar-height);
    background-color: var(--background);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    padding: 0 var(--content-padding);
    margin-top: var(--header-height);
  }

  .content {
    padding: var(--content-padding);
    flex: 1;
  }

  /* Utility classes */
  .hidden {
    display: none !important;
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Transitions */
  .fade-enter {
    opacity: 0;
  }

  .fade-enter-active {
    opacity: 1;
    transition: opacity 200ms ease-in;
  }

  .fade-exit {
    opacity: 1;
  }

  .fade-exit-active {
    opacity: 0;
    transition: opacity 200ms ease-in;
  }

  .fallback-tablet {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 2rem;
    background-color: var(--background);
    color: var(--text);
  }

  .error-container {
    max-width: 600px;
    padding: 2rem;
    border-radius: 8px;
    background-color: var(--background-alt);
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    text-align: center;
  }

  .error-container h2 {
    margin-bottom: 1rem;
    color: var(--error);
  }

  .error-details {
    margin-top: 1.5rem;
    padding: 1rem;
    background-color: var(--background);
    border-radius: 4px;
    text-align: left;
  }

  .error-details summary {
    cursor: pointer;
    color: var(--primary);
    margin-bottom: 0.5rem;
  }

  .error-details pre {
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 0.875rem;
    color: var(--error);
  }

  .action-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 2rem;
  }

  .retry-button, .logs-button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    font-weight: bold;
    transition: background-color 0.2s;
  }

  .retry-button {
    background-color: var(--primary);
    color: var(--background);
    &:hover {
      background-color: var(--primary-dark);
    }
  }

  .logs-button {
    background-color: var(--background);
    color: var(--primary);
    border: 1px solid var(--primary);
    &:hover {
      background-color: var(--background-alt);
    }
  }

  /* Status indicators container */
  .status-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    height: 100%;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 4px;
    transition: all 0.2s ease;
    cursor: default;
    opacity: 0.9;
  }

  .status-indicator:hover {
    opacity: 1;
  }

  .status-indicator i {
    font-size: 0.875rem;
    color: white;
  }

  .status-indicator.up {
    background-color: var(--status-up);
  }

  .status-indicator.down {
    background-color: var(--status-down);
  }

  .status-indicator.partial {
    background-color: var(--status-partial);
  }

  .status-indicator.unknown {
    background-color: var(--status-unknown);
  }

  .indicator-name {
    color: white;
    font-weight: 500;
  }

  /* Star button styles */
  .star-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    margin-left: 8px;
    transition: color 0.2s ease;
  }

  .star-button.fas {
    color: var(--star-color);
  }

  .star-button.far {
    color: var(--star-outline-color);
  }

  .star-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

// Theme variables
export const lightTheme = {
  // ... existing light theme variables ...
  starColor: '#FFD700', // Gold
  starOutlineColor: 'inherit',
};

export const darkTheme = {
  // ... existing dark theme variables ...
  starColor: '#FFC107', // Amber
  starOutlineColor: 'inherit',
};