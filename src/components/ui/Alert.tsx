import { Alert as AntAlert, type AlertProps as AntAlertProps } from 'antd';

export type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends Omit<AntAlertProps, 'type'> {
  variant?: AlertVariant;
}

const TYPE_MAP: Record<AlertVariant, AntAlertProps['type']> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'error',
};

/**
 * Banner for a message that belongs to the page rather than to an event.
 * Use a Toast for "that worked"; use an Alert for "this record needs attention",
 * which must survive a re-render and be readable after the fact.
 */
export const Alert = ({ variant = 'info', ...rest }: AlertProps) => (
  <AntAlert showIcon type={TYPE_MAP[variant]} {...rest} />
);

export default Alert;
