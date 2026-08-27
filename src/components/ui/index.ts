/**
 * UI primitives (design-system.md §2). Same API as `customer/src/components/ui`
 * so a component ports between the two apps by copy, not by rewrite.
 *
 * Rule: no raw hex outside `src/theme/tokens.ts`. Everything here styles through
 * Tailwind utilities that resolve to CSS variables, or through the AntD theme.
 */
export { default as Alert } from './Alert';
export { default as Badge } from './Badge';
export { default as Breadcrumbs } from './Breadcrumbs';
export { default as Button } from './Button';
export { default as Card } from './Card';
export { default as CommandPalette } from './CommandPalette';
export { default as DateCell } from './DateCell';
export { default as Dialog } from './Dialog';
export { default as ConfirmDialog } from './ConfirmDialog';
export { default as Drawer } from './Drawer';
export { default as EmptyState } from './EmptyState';
export { default as ErrorState } from './ErrorState';
export { default as Field } from './Field';
export { default as FilterDropdown, FilterGroup } from './FilterDropdown';
export { default as Highlight } from './Highlight';
export { default as ImageUpload } from './ImageUpload';
export { default as FieldLabel } from './FieldLabel';
export { default as Input, Textarea, PasswordInput } from './Input';
export { default as MoneyText } from './MoneyText';
export { default as NotAvailable } from './NotAvailable';
export { default as NumberInput } from './NumberInput';
export { default as PermissionGate } from './PermissionGate';
export { default as RichTextEditor } from './RichTextEditor';
export { default as SearchInput } from './SearchInput';
export { default as Segmented } from './Segmented';
export { default as Select, FormSelect, InlineSelect, MultiSelect } from './Select';
export { default as Skeleton } from './Skeleton';
export { default as StackedCell } from './StackedCell';
export { default as StatusChip } from './StatusChip';
export { default as Stepper } from './Stepper';
export { default as StatusDot } from './StatusDot';
export { default as TagList } from './TagList';
export { default as DataTable } from './Table';
export { default as TextCell } from './TextCell';
export { default as Tabs } from './Tabs';
export { ToastHost, toast } from './Toast';

export type { AlertProps, AlertVariant } from './Alert';
export type { Crumb, BreadcrumbsProps } from './Breadcrumbs';
export type { ButtonProps, ButtonVariant } from './Button';
export type { CardProps } from './Card';
export type { RichTextEditorProps } from './RichTextEditor';
export type { CommandItem, CommandPaletteProps } from './CommandPalette';
export type { DateCellProps } from './DateCell';
export type { DialogProps } from './Dialog';
export type { DrawerProps } from './Drawer';
export type { EmptyStateProps } from './EmptyState';
export type { ErrorStateProps } from './ErrorState';
export type { FieldProps } from './Field';
export type { FilterDropdownProps, FilterGroupProps } from './FilterDropdown';
export type { FieldLabelProps } from './FieldLabel';
export type { ImageUploadProps } from './ImageUpload';
export type { InputProps, TextareaProps } from './Input';
export type { MoneyTextProps } from './MoneyText';
export type { PermissionGateProps } from './PermissionGate';
export type { Step, StepState, StepperProps } from './Stepper';
export type { SelectProps, FormSelectProps, FormSelectOption, MultiSelectProps } from './Select';
export type { SegmentedProps, SegmentedOption } from './Segmented';
export type { SkeletonProps, SkeletonVariant } from './Skeleton';
export type { StatusChipProps } from './StatusChip';
export type { StatusDotProps } from './StatusDot';
export type { DataTableProps, TableSort } from './Table';
export type { TextCellProps } from './TextCell';
export type { TabsProps } from './Tabs';
export type { ToastAction, ToastOptions, ToastVariant } from './Toast';
export { PageHeader, type PageHeaderProps } from './PageHeader';
export { default as FormDrawer, type FormDrawerProps } from './FormDrawer';
export { default as RowActions, type RowAction } from './RowActions';
