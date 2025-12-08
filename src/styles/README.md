# Styles Directory

## Overview

This directory contains all global and shared CSS styles for the HOMESERVER application. The styles are organized into a centralized, maintainable architecture that ensures visual consistency across all tablets and premium tabs.

## Directory Structure

```
src/styles/
├── global.css          # Main global stylesheet entry point
├── global.ts           # TypeScript theme utilities
├── README.md           # This file
└── common/             # Shared/common styles
    ├── README.md       # Common styles documentation
    ├── _buttons.css    # Legacy button styles (being phased out)
    └── ui/             # UI Component Library styles
        ├── index.css   # Barrel import for all UI component styles
        ├── _button.css
        ├── _toggle.css
        ├── _tabs.css
        ├── _input.css
        ├── _select.css
        ├── _card.css
        ├── _badge.css
        ├── _checkbox.css
        ├── _visibility-toggle.css
        ├── _plus-button.css
        ├── _editable-field.css
        ├── _calendar.css
        ├── _time-picker.css
        ├── _row-info-tile.css
        ├── _slider.css
        ├── _text-box.css
        ├── _breadcrumbs.css
        ├── _icon-button.css
        ├── _file-input.css
        ├── _progress-bar.css
        ├── _table.css
        └── _collapsible.css
```

## Global Styles (`global.css`)

The main entry point for all application styles. This file:

- Imports the UI component library styles
- Defines layout CSS variables (`--header-height`, `--tab-bar-height`, etc.)
- Sets up core reset styles and base typography
- Provides utility classes (`.hidden`, `.disabled`)
- Defines core layout structure (`.app`, `#root`, `body`)

**Key Layout Variables:**
- `--header-height: 48px` - Height of the main application header
- `--tab-bar-height: 48px` - Height of the tab navigation bar
- `--content-padding: 20px` - Standard content padding
- `--admin-offset: 0px` - Offset for admin mode adjustments
- `--border-radius: 8px` - Default border radius for rounded elements

## UI Component Library (`common/ui/`)

The centralized UI component styles that power the React component library. Each component has its own CSS file following the naming convention `_component-name.css`.

### Available Components

All 24 UI components have corresponding style files:

1. **Button** (`_button.css`) - Primary, secondary, danger, warning, success variants
2. **Toggle** (`_toggle.css`) - Switch/toggle component styles
3. **Tab & TabGroup** (`_tabs.css`) - Tab navigation matching TabBar styling
4. **Input** (`_input.css`) - Form inputs with validation states
5. **Select** (`_select.css`) - Dropdown/select component
6. **Card** (`_card.css`) - Container component with variants
7. **Badge** (`_badge.css`) - Status indicator badges
8. **Checkbox** (`_checkbox.css`) - Custom checkbox component
9. **VisibilityToggle** (`_visibility-toggle.css`) - Eye/eye-slash toggle
10. **PlusButton** (`_plus-button.css`) - Plus icon button
11. **EditableField** (`_editable-field.css`) - Inline editable text
12. **Calendar** (`_calendar.css`) - Date selection component
13. **TimePicker** (`_time-picker.css`) - Time selection component
14. **RowInfoTile** (`_row-info-tile.css`) - Information tile component
15. **Slider** (`_slider.css`) - Range slider component
16. **TextBox** (`_text-box.css`) - Text display (log/code/terminal variants)
17. **Breadcrumbs** (`_breadcrumbs.css`) - Navigation breadcrumbs
18. **IconButton** (`_icon-button.css`) - Icon-only button
19. **FileInput** (`_file-input.css`) - File upload input
20. **ProgressBar** (`_progress-bar.css`) - Progress indicator
21. **Table** (`_table.css`) - Data table component
22. **Collapsible** (`_collapsible.css`) - Expandable/collapsible sections

### Import Structure

All UI component styles are automatically imported via the barrel file:

```css
/* In global.css */
@import './common/ui/index.css';
```

The `common/ui/index.css` file imports all individual component styles, ensuring they're available globally.

## Theme System Integration

All styles use CSS variables from the theme system. **Never hardcode colors** - always use theme variables.

### Available Theme Variables

**Color Variables:**
- `--background` - Main background color
- `--text` - Primary text color
- `--primary` - Primary accent color
- `--primaryHover` - Primary hover color (from theme, never same as background)
- `--secondary` - Secondary color
- `--accent` - Accent color
- `--error` - Error/danger color
- `--success` - Success state color
- `--warning` - Warning state color
- `--border` - Border color

**Status Colors:**
- `--status-up` - Service/status up indicator
- `--status-down` - Service/status down indicator
- `--status-partial` - Partial/partial status indicator
- `--status-unknown` - Unknown status indicator

**Special Colors:**
- `--hiddenTabBackground` - Background for hidden tabs
- `--hiddenTabText` - Text color for hidden tabs

### Theme Rules

1. **Always use CSS variables** - Never hardcode color values
2. **Hover states** - Must use `--primaryHover` or `color-mix()` to ensure distinction from background
3. **Never modify theme.json files** - Themes are managed separately
4. **Test with multiple themes** - Ensure components work with all available themes

## Common Styles (`common/`)

The `common/` directory contains shared styles used across multiple components or tablets. Currently includes:

- `_buttons.css` - Legacy button styles (being phased out in favor of UI component library)

See `common/README.md` for detailed information about the common styles refactoring effort.

## Usage Guidelines

### For Component Development

1. **Use UI Component Library** - Import React components from `src/components/ui/` instead of creating custom styled elements
2. **Extend with className** - Components accept `className` prop for additional styling when needed
3. **Follow size variants** - Use standard sizes (`small`, `medium`, `large`) when available
4. **Use theme variables** - Always reference CSS variables, never hardcode colors

### For Tablet/Tab Development

1. **Import global styles** - Global styles are automatically available
2. **Use UI components** - Import from `../../components/ui` (adjust path as needed)
3. **Create tablet-specific styles** - Place in `frontend/` directory of your tablet/tab
4. **Follow naming conventions** - Use descriptive class names with tablet prefix if needed

### Adding New Component Styles

1. Create `_component-name.css` in `common/ui/`
2. Use CSS variables for all colors and spacing
3. Follow existing component patterns (variants, sizes, states)
4. Import in `common/ui/index.css`
5. Document in component's TypeScript file and showcase

## Best Practices

1. **CSS Variables First** - All colors, spacing, and sizing should use CSS variables
2. **Component-Scoped Styles** - Component styles should be scoped to the component class
3. **Mobile Responsive** - Include mobile breakpoints where needed (`@media (max-width: 768px)`)
4. **Accessibility** - Include focus states, ARIA-friendly styling, keyboard navigation support
5. **Performance** - Avoid deep selectors, use efficient CSS patterns
6. **Consistency** - Follow existing patterns and naming conventions

## Related Documentation

- **Component Library**: See `docs/memories/ongoing/uiCentralizationTransition.md` for complete component documentation
- **Component Showcase**: Available in testTab at "Component Showcase" subtab
- **Theme System**: See `.cursor/rules/css.mdc` for available CSS variables
- **Common Styles**: See `common/README.md` for common styles refactoring details

## Migration Notes

The UI component library is the standard for all new development. Legacy styles in `common/_buttons.css` are being phased out as tablets migrate to the new component system.

When migrating existing tablets:
1. Replace custom button styles with `<Button>` component
2. Replace custom form elements with `<Input>`, `<Select>`, etc.
3. Remove duplicate CSS that's now in the component library
4. Test thoroughly with all themes
