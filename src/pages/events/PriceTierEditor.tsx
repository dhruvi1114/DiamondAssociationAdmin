import { Trash2 } from 'lucide-react';
import { DatePicker, Form, Input } from 'antd';
import { Button, FieldLabel, NumberInput } from '@/components/ui';
import { overlappingRows, type TierValue } from '@/pages/events/priceTiers';

/**
 * The price table on the event form.
 *
 * One row per date window, two prices per row. This is the shape the association
 * actually sells in — cheaper if you book early, dearer as the date approaches —
 * and it cannot be expressed as a single fee field.
 *
 * Two rules the editor exists to make visible:
 *
 *  - **Every event needs at least one row.** A free event is a row priced at
 *    zero, not an event with no row. An event with no price has no answer to
 *    "what does this cost", and publishing it would put a Register button on a
 *    page that cannot name a figure.
 *  - **Windows must not overlap.** The database refuses overlapping windows
 *    outright, so the error is caught here and shown against the offending row
 *    rather than arriving as a database error the form cannot place.
 */

export const PriceTierEditor = () => (
  <Form.List
    name="price_tiers"
    initialValue={[{ name: 'Standard' }]}
    rules={[
      {
        validator: async (_rule, tiers: TierValue[]) => {
          if (!tiers || tiers.length === 0) {
            throw new Error('Add at least one price. A free event is a price of 0.');
          }

          if (overlappingRows(tiers).size > 0) {
            throw new Error('Two prices cover the same dates. Windows must not overlap.');
          }
        },
      },
    ]}
  >
    {(fields, { add, remove }, { errors }) => (
      <div className="flex flex-col gap-3">
        <FieldLabel
          label="Pricing"
          help="One row per date window. The price a delegate pays is the row covering the day they book — not the day they pay. A free event is a single row priced at 0."
        />

        {fields.map((field) => (
          <div key={field.key} className="flex items-start gap-3">
            <Form.Item
              name={[field.name, 'name']}
              className="min-w-0 flex-1"
              rules={[{ required: true, message: 'Name this price' }]}
            >
              <Input placeholder="Early bird" />
            </Form.Item>

            <Form.Item
              name={[field.name, 'range']}
              className="min-w-0 flex-[1.4]"
              rules={[{ required: true, message: 'Pick the dates this price applies' }]}
            >
              <DatePicker.RangePicker className="w-full" format="DD MMM YYYY" allowClear={false} />
            </Form.Item>

            <Form.Item
              name={[field.name, 'member_price']}
              className="w-28 min-w-0"
              rules={[{ required: true, message: 'Required' }]}
            >
              <NumberInput min={0} precision={2} prefix="₹" placeholder="Member" />
            </Form.Item>

            <Form.Item
              name={[field.name, 'non_member_price']}
              className="w-28 min-w-0"
              rules={[{ required: true, message: 'Required' }]}
            >
              <NumberInput min={0} precision={2} prefix="₹" placeholder="Guest" />
            </Form.Item>

            {/*
              The last row keeps no remove button. Removing it would leave the
              event with no price at all, and the form would reject the save with
              an error the operator has to read to understand — better that the
              control simply is not there.
            */}
            <Button
              variant="ghost"
              icon={<Trash2 size={15} />}
              aria-label="Remove this price"
              disabled={fields.length === 1}
              disabledReason={
                fields.length === 1
                  ? 'An event needs at least one price. Use 0 if it is free.'
                  : undefined
              }
              onClick={() => remove(field.name)}
            />
          </div>
        ))}

        <div>
          <Button
            variant="secondary"
            onClick={() =>
              add({
                // Start the new window the day after the last one ends, so the
                // common case — consecutive windows — needs no date editing at
                // all, and cannot accidentally overlap.
                name: '',
                range: null,
              })
            }
          >
            Add another price
          </Button>
        </div>

        <Form.ErrorList errors={errors} />
      </div>
    )}
  </Form.List>
);
