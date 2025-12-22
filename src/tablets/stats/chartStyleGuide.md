# CHARTER STYLING GUIDELINES (CPU STAT CHART REFERENCE)

## AXIS STYLING
- **Axis labels:** Use `--hiddenTabText` for stroke color
- **Axis lines:** Inherits label stroke color
- **Tick formatting:**
  - Left Y-axis: Percentage with 0 decimal places
  - Right Y-axis: Temperature with °C suffix
  - X-axis: MM:SS time format

## LINE STYLING
- **CPU Usage line:** `--secondary` color variable
- **Temperature line:** `--accent` color variable
- **Line width:** Default Recharts thickness (2px)
- **No data points:** (dot=false)

## GRID LINES
- **Color:** `--border` variable
- **Opacity:** 0.8
- **Dash pattern:** 3px solid, 3px gap (strokeDasharray="3 3")

## TOOLTIPS
- **Background:** `--hiddenTabBackground`
- **Border:** 1px solid `--border`
- **Text color:** `--text`
- **Label formatting:**
  - CPU: X.X% with one decimal
  - Temp: X.X°C with one decimal
- **Item layout:** Flexbox with 8px gap between elements

## LEGEND
- **Colors:** Inherits from line stroke colors
- **Text:** Uses Recharts default typography
- **Position:** Automatic based on chart space

## CHART CONTAINER
- **Background:** Inherits parent container's background
- **Responsive:** 100% width with 200px height
- **Padding:** Handled by parent stat-element class

## BEST PRACTICES
1. Always use theme variables (`--`) instead of hardcoded colors
2. Maintain 0.8 opacity for grid lines for better hierarchy
3. Use `!important` override for Recharts inline styles
4. Keep decimal consistency: 0 for axes, 1 for tooltips
5. Align time formats across all charts (MM:SS)
6. Maintain 8px padding for tooltip containers
7. Use same border radius (4px) for all chart elements

This establishes a pattern where hiddenTab variables are used for secondary information (axes, grids) while primary/accent colors highlight the actual data lines. Text contrast is maintained through the `--text` variable.