import { InputNumber, type InputNumberProps } from 'antd';

/**
 * A number field that can only be typed into in ways that produce a number.
 *
 * AntD's `InputNumber` accepts `min`, but only enforces it on blur — until then
 * the field will happily hold `-`, `--`, `1e5` or an empty minus sign, and the
 * person typing gets no signal that the value is being thrown away. This
 * refuses the keystrokes instead, so the field never shows a value it will not
 * keep.
 *
 * What is blocked follows from the props, not from a guess:
 *
 *  - `-` unless `min` is below zero. A field bounded at 0 has no use for a sign.
 *  - `.` and `,` unless `precision` allows a fraction. "Display order 1.5" is
 *    not a thing.
 *  - `e`, `E`, `+` always. Exponent notation in an admin form is a typo.
 *
 * Paste is left to AntD's blur clamp: a pasted `-5` lands as `min`. Blocking it
 * outright would also block pasting a legitimate `250` copied from elsewhere.
 *
 * The steppers are off. They are two 12px targets that move a value by one, on
 * fields where the useful edits are "type 40" — and they crowd a field that is
 * usually laid out two-to-a-row.
 *
 * It fills its column by default. AntD gives `.ant-input-number` a fixed 90px,
 * which left every number field in the app noticeably narrower than the text
 * field beside it — and a `w-full` class could not fix it reliably, since both
 * are single-class rules and which one wins comes down to stylesheet injection
 * order. An inline width settles it. Pass `style={{ width: … }}` to opt out.
 */
export type NumberInputProps = Omit<InputNumberProps<number>, 'controls' | 'stringMode'>;

export const NumberInput = ({
  min = 0,
  precision,
  onKeyDown,
  style,
  ...rest
}: NumberInputProps) => {
  const allowsSign = typeof min === 'number' ? min < 0 : true;
  const allowsFraction = precision === undefined || precision > 0;

  return (
    <InputNumber<number>
      {...rest}
      min={min}
      precision={precision}
      controls={false}
      style={{ width: '100%', ...style }}
      onKeyDown={(event) => {
        const blocked = ['e', 'E', '+'];

        if (!allowsSign) blocked.push('-');
        if (!allowsFraction) blocked.push('.', ',');

        if (blocked.includes(event.key)) event.preventDefault();

        onKeyDown?.(event);
      }}
    />
  );
};

export default NumberInput;
