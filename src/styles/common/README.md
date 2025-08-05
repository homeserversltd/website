# Common Styles Refactoring

## Purpose

This directory (`src/styles/common/`) is dedicated to centralizing common CSS styles used across the HomeServer application. The primary goal of this refactoring effort is to:

1.  **Achieve UI Cohesion:** Ensure that common UI elements (like modals, buttons, forms, status indicators, etc.) have a consistent look and feel throughout the application.
2.  **Reduce Code Duplication:** Eliminate redundant CSS rules scattered across multiple component-specific stylesheets.
3.  **Improve Maintainability:** Make it easier to update and manage global styles. Changes to a common element (e.g., the primary button style) can be made in one place and reflected everywhere.
4.  **Enhance Developer Experience:** Provide a clear "single source of truth" for common styling patterns, simplifying development and reducing the cognitive load of managing disparate styles.

## Method

The refactoring process involves:

1.  **Identifying Common Patterns:** Analyzing existing component stylesheets (e.g., `indicators.css`, modal-specific CSS files) to find frequently repeated styling patterns for elements like buttons, modal structures, input fields, layout utilities, etc.
2.  **Extracting to Common Files:** Moving these identified common styles into dedicated files within this `common/` directory. Files should be named logically (e.g., `_buttons.css`, `_modals.css`, `_forms.css`). The underscore prefix is a convention often used for partial files that are meant to be imported.
3.  **Updating Component Stylesheets:** Modifying the original component-specific stylesheets to remove the duplicated rules and instead rely on the newly centralized common styles.
4.  **Ensuring Global Availability:** Making sure that the common CSS files are loaded by the application, typically by importing them into a global stylesheet (like `src/styles/global.css`) or an equivalent main entry point for styles.

## Current Status & Next Steps

This is an ongoing refactoring task.

*   **Done:** The first step has been taken by creating `_buttons.css` in this directory, which centralizes the common styles for `.primary-button` and `.secondary-button`.
*   **Next:** Continue identifying other common patterns. Good candidates for the next steps include:
    *   Base modal styles (container, header, content areas).
    *   Form element styles (inputs, labels, select dropdowns).
    *   Common layout utilities (e.g., flexbox/grid helpers if needed beyond what a framework might provide).
    *   Consistent status message styling (e.g., for success, error, warning messages).

By systematically centralizing these styles, we aim for a more robust, maintainable, and visually consistent frontend codebase. 