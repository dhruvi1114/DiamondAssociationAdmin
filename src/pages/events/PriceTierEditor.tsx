import { Plus, Trash2 } from 'lucide-react';
import { DatePicker, Form, Input, Tooltip } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { Button, FieldLabel, NumberInput } from '@/components/ui';
import { isFilledTier, overlappingRows, type TierValue } from '@/pages/events/priceTiers';

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

export const PriceTierEditor = () => {
  const form = Form.useFormInstance();

  return (
    <Form.List
      name="price_tiers"
      /*
      Three rows, named, because that is the shape the association actually
      sells in — cheaper if you book early, dearer as the date approaches. An
      empty editor makes every admin invent the same three names, and half of
      them would invent two.

      Only the names are pre-filled. Dates and amounts stay blank: a default
      price is a price somebody publishes without reading.
    */
      initialValue={[{ name: 'Early bird' }, { name: 'Regular' }, { name: 'Late' }]}
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
          {/*
            The action sits on the heading row, right-aligned. At the foot of the
            list it collided with the section below and read as if it belonged to
            that one; beside the label it is plainly this section's control, and
            it stays put as rows are added.
          */}
          <div className="flex items-center justify-between">
            <FieldLabel
              label="Pricing"
              help="One row per date window. The price a delegate pays is the row covering the day they book — not the day they pay. A free event is a single row priced at 0."
            />

            {/*
              An icon, matching the bin on each row — add a window, remove a
              window.

              `secondary`, not `ghost`: a ghost button is borderless until the
              pointer is over it, so on a form full of outlined inputs it read as
              a decorative glyph rather than a control. The label survives for
              screen readers and on hover.
            */}
            <Tooltip title="Add another price">
              <Button
                variant="secondary"
                icon={<Plus size={16} strokeWidth={1.75} />}
                aria-label="Add another price"
                onClick={() => add({ name: '', range: null })}
              />
            </Tooltip>
          </div>

          {fields.map((field) => (
            <div key={field.key} className="flex items-start gap-3">
              <Form.Item
                name={[field.name, 'name']}
                className="mb-0 min-w-0 flex-1"
                rules={[
                  {
                    validator: async (_rule, value) => {
                      const row = (form.getFieldValue('price_tiers') ?? [])[field.name];

                      // Silent on a row nobody has touched; the list-level rule
                      // above is what catches a half-filled one.
                      if (!isFilledTier(row) || value !== undefined) return;

                      throw new Error('Name this price');
                    },
                  },
                ]}
              >
                <Input placeholder="Early bird" />
              </Form.Item>

              <Form.Item
                name={[field.name, 'range']}
                className="mb-0 min-w-0 flex-[1.4]"
                rules={[
                  {
                    validator: async (_rule, value) => {
                      const row = (form.getFieldValue('price_tiers') ?? [])[field.name];

                      // Silent on a row nobody has touched; the list-level rule
                      // above is what catches a half-filled one.
                      if (!isFilledTier(row) || value !== undefined) return;

                      throw new Error('Pick the dates this price applies');
                    },
                  },
                ]}
              >
                <DatePicker.RangePicker
                  className="w-full"
                  format="DD MMM YYYY"
                  allowClear={false}
                  /*
                  A price window cannot start in the past — nobody can book at a
                  price that expired before the event existed — and cannot cover a
                  day another row already covers, which the database refuses
                  outright. Greying those days out is what stops the refusal
                  arriving as an error after Save.
                */
                  disabledDate={(current) => {
                    if (!current) return false;
                    if (current < dayjs().startOf('day')) return true;

                    /*
                      Nothing past the day registration closes.

                      A tier decides the price at the moment somebody books, so a
                      window that opens after the last day anybody can book is a
                      rate nobody can ever be charged. Bounding this at the event's
                      END date — which it used to — let an operator fill in a
                      "Late" row covering the event days themselves and see it
                      accepted, priced, and then never once applied.

                      Left blank, registration closes when the event starts, so
                      that is the fallback bound. The event's own end date never
                      enters into it.
                    */
                    const closes =
                      (form.getFieldValue('registration_closes_at') as Dayjs | undefined) ??
                      (form.getFieldValue('dates')?.[0] as Dayjs | undefined);

                    if (closes && current > closes.endOf('day')) return true;

                    const tiers = (form.getFieldValue('price_tiers') ?? []) as TierValue[];

                    return tiers.some((tier, i) => {
                      if (i === field.name || !tier?.range?.[0] || !tier?.range?.[1]) return false;

                      return (
                        !current.isBefore(tier.range[0], 'day') &&
                        !current.isAfter(tier.range[1], 'day')
                      );
                    });
                  }}
                />
              </Form.Item>

              <Form.Item
                name={[field.name, 'member_price']}
                className="mb-0 w-28 min-w-0"
                rules={[
                  {
                    validator: async (_rule, value) => {
                      const row = (form.getFieldValue('price_tiers') ?? [])[field.name];

                      // Silent on a row nobody has touched; the list-level rule
                      // above is what catches a half-filled one.
                      if (!isFilledTier(row) || value !== undefined) return;

                      throw new Error('Required');
                    },
                  },
                ]}
              >
                <NumberInput min={0} precision={2} prefix="₹" placeholder="Member" />
              </Form.Item>

              <Form.Item
                name={[field.name, 'non_member_price']}
                className="mb-0 w-28 min-w-0"
                rules={[
                  {
                    validator: async (_rule, value) => {
                      const row = (form.getFieldValue('price_tiers') ?? [])[field.name];

                      // Silent on a row nobody has touched; the list-level rule
                      // above is what catches a half-filled one.
                      if (!isFilledTier(row) || value !== undefined) return;

                      throw new Error('Required');
                    },
                  },
                ]}
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

          <Form.ErrorList errors={errors} />
        </div>
      )}
    </Form.List>
  );
};
