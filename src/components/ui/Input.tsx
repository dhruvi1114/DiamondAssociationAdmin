import { forwardRef, useId } from 'react';
import { Input as AntInput, type InputProps as AntInputProps, type InputRef } from 'antd';
import type { TextAreaProps } from 'antd/es/input/TextArea';
import Field from './Field';

export interface InputProps extends Omit<AntInputProps, 'status'> {
  label: string;
  hint?: string;
  /** Guidance in a mark beside the label rather than standing under the field. */
  help?: string;
  error?: string;
}

/**
 * Text input with its label, hint and error bound together.
 *
 * `forwardRef` matters: react-hook-form registers by ref, and a control that
 * swallows the ref silently never participates in validation.
 */
export const Input = forwardRef<InputRef, InputProps>(
  ({ label, hint, help, error, required, id, ...rest }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <Field
        label={label}
        htmlFor={inputId}
        hint={hint}
        help={help}
        error={error}
        required={required}
      >
        <AntInput
          {...rest}
          id={inputId}
          ref={ref}
          status={error ? 'error' : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
        />
      </Field>
    );
  },
);

Input.displayName = 'Input';

export interface TextareaProps extends Omit<TextAreaProps, 'status'> {
  label: string;
  hint?: string;
  error?: string;
}

export const Textarea = ({ label, hint, help, error, required, id, ...rest }: TextareaProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
        label={label}
        htmlFor={inputId}
        hint={hint}
        help={help}
        error={error}
        required={required}
      >
      <AntInput.TextArea
        {...rest}
        id={inputId}
        status={error ? 'error' : undefined}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
};

export const PasswordInput = ({ label, hint, help, error, required, id, ...rest }: InputProps) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field
        label={label}
        htmlFor={inputId}
        hint={hint}
        help={help}
        error={error}
        required={required}
      >
      <AntInput.Password
        {...rest}
        id={inputId}
        status={error ? 'error' : undefined}
        aria-invalid={Boolean(error)}
      />
    </Field>
  );
};

export default Input;
