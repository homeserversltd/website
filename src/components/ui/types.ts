// Common UI Component Types

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'success';
export type ButtonSize = 'small' | 'medium' | 'large';
export type ComponentSize = 'small' | 'medium' | 'large';

export interface BaseComponentProps {
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface ButtonProps extends BaseComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export interface ToggleProps extends BaseComponentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: ComponentSize;
  'aria-label'?: string;
}

export interface TabProps extends BaseComponentProps {
  active?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  // Visibility state
  visible?: boolean;
  onVisibilityToggle?: (e: React.MouseEvent) => void;
  // Starred state
  starred?: boolean;
  onStarClick?: (e: React.MouseEvent) => void;
  // Admin mode
  adminMode?: boolean;
  adminOnly?: boolean;
}

export interface TabGroupProps {
  children: React.ReactNode;
  className?: string;
}

export type InputVariant = 'default' | 'display';

export interface InputProps extends BaseComponentProps {
  type?: 'text' | 'password' | 'number' | 'email' | 'tel' | 'url';
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  size?: ComponentSize;
  variant?: InputVariant;
  name?: string;
  id?: string;
  required?: boolean;
}

export interface CardProps extends BaseComponentProps {
  variant?: 'default' | 'clickable' | 'active' | 'inactive' | 'error';
  header?: React.ReactNode;
  footer?: React.ReactNode;
  onClick?: () => void;
  children: React.ReactNode;
}

export interface BadgeProps extends BaseComponentProps {
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';
  size?: ComponentSize;
  children: React.ReactNode;
}

export interface VisibilityToggleProps extends BaseComponentProps {
  visible: boolean;
  onChange: (visible: boolean) => void;
  size?: ComponentSize;
  'aria-label'?: string;
}

export interface PlusButtonProps extends BaseComponentProps {
  onClick?: () => void;
  size?: ComponentSize;
  variant?: 'default' | 'primary' | 'secondary';
  'aria-label'?: string;
}

export interface CheckboxProps extends BaseComponentProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: ComponentSize;
  'aria-label'?: string;
}

export interface EditableFieldProps extends BaseComponentProps {
  value: string;
  onSave: (value: string) => Promise<void> | void;
  placeholder?: string;
  size?: ComponentSize;
  showIcon?: boolean;
  'aria-label'?: string;
}

export interface CalendarProps extends BaseComponentProps {
  frequency: 'weekly' | 'monthly';
  value: string; // Format: "YYYY-MM-DD" for monthly, day name string for weekly
  onChange: (value: string) => void;
  size?: ComponentSize;
  'aria-label'?: string;
}

export interface TimePickerProps extends BaseComponentProps {
  value: string; // Format: "HH:MM" (24-hour format)
  onChange: (time: string) => void;
  size?: ComponentSize;
  'aria-label'?: string;
}

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface SelectProps extends BaseComponentProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  size?: ComponentSize;
  name?: string;
  id?: string;
  required?: boolean;
}

export type BadgeVariant = 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info';

export interface RowInfoTileProps extends BaseComponentProps {
  // Selection
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  showCheckbox?: boolean;
  
  // Visual elements
  icon?: React.ReactNode | string; // Emoji string or React node
  title: string;
  subtitle?: string;
  
  // Badges
  badges?: Array<{
    label: string;
    variant?: BadgeVariant;
  }>;
  
  // Metadata (flexible content)
  metadata?: React.ReactNode;
  
  // Actions
  actions?: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  
  // Interaction
  onClick?: () => void;
  onDoubleClick?: () => void;
  
  // Styling
  variant?: 'default' | 'selected' | 'active' | 'error';
}

export interface SliderProps extends BaseComponentProps {
  min?: number;
  max?: number;
  value: number;
  onChange: (value: number) => void;
  onRelease?: (value: number) => void;
  step?: number;
  leftLabel?: string;
  rightLabel?: string;
  size?: ComponentSize;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export type TextBoxVariant = 'plain' | 'log' | 'code' | 'terminal';

export interface TextBoxProps extends BaseComponentProps {
  variant?: TextBoxVariant;
  size?: ComponentSize;
  value?: string;
  header?: React.ReactNode;
  actions?: React.ReactNode;
  monospace?: boolean;
  scrollable?: boolean;
  autoScroll?: boolean;
  maxHeight?: string;
  placeholder?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

export interface BreadcrumbsProps extends BaseComponentProps {
  items: BreadcrumbItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
  separator?: string;
}

export interface IconButtonProps extends BaseComponentProps {
  icon: import('@fortawesome/fontawesome-svg-core').IconDefinition;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  size?: ComponentSize;
  variant?: 'default' | 'primary' | 'secondary';
  shape?: 'square' | 'circle';
  type?: 'button' | 'submit' | 'reset';
  'aria-label': string;
}

export interface FileInputProps extends BaseComponentProps {
  onChange: (files: FileList | null) => void;
  multiple?: boolean;
  accept?: string;
  label?: string;
  disabled?: boolean;
  buttonText?: string;
  displayText?: string;
  size?: ComponentSize;
  'aria-label'?: string;
}

export type ProgressBarVariant = 'default' | 'memory' | 'swap' | 'process' | 'disk';

export interface ProgressBarProps extends BaseComponentProps {
  value: number; // 0-100
  variant?: ProgressBarVariant;
  size?: ComponentSize;
  showPercentage?: boolean;
  label?: string;
  leftLabel?: string;
  rightLabel?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface TableColumnSizing {
  minWidth?: string;
  width?: string;
}

export interface TableProps extends BaseComponentProps {
  headers?: React.ReactNode[];
  rows: React.ReactNode[][];
  responsive?: boolean;
  columnSizing?: TableColumnSizing[];
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export type CollapsibleVariant = 'default' | 'card' | 'minimal';

export interface CollapsibleProps extends BaseComponentProps {
  title?: string;
  defaultCollapsed?: boolean;
  headerContent?: React.ReactNode;
  variant?: CollapsibleVariant;
  size?: ComponentSize;
  onToggle?: (expanded: boolean) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}
