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

export interface InputProps extends BaseComponentProps {
  type?: 'text' | 'password' | 'number' | 'email' | 'tel' | 'url';
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  error?: string;
  size?: ComponentSize;
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
