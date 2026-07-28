/*
# Add awb_nr column to orders table

1. Purpose
- The `noon-create-shipment` edge function creates a shipment on Noon and
  receives an `awb_nr` (Air Waybill number) back, but the `orders` table has
  nowhere to store it. As a result, after fulfilling an order the AWB is lost
  and the UI cannot show a "Print Label" button.
- This migration adds a nullable `awb_nr` text column to `orders` so the
  shipment function can persist the AWB and the frontend can read it back.

2. Schema Changes
- `orders.awb_nr` (text, nullable) — the Air Waybill number returned by Noon
  when a shipment is created. Null until a shipment exists.

3. Security
- No RLS policy changes. The existing owner-scoped policies on `orders`
  already cover the new column (column-level privileges are not enabled, so
  existing row policies apply to all columns).

4. Idempotency
- Uses a DO block with `IF NOT EXISTS` so re-running is safe.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'awb_nr'
  ) THEN
    ALTER TABLE orders ADD COLUMN awb_nr text;
  END IF;
END $$;
