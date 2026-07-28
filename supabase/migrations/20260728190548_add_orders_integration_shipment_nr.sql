/*
# Add integration_shipment_nr column to orders table

1. Purpose
- The `noon-create-shipment` edge function generates an
  `integration_shipment_nr` when creating a shipment on Noon, but it was never
  persisted to the database. Without it, the CancelShipment API cannot be
  called because it requires this identifier.
- This migration adds a nullable `integration_shipment_nr` text column to the
  `orders` table so the shipment function can store it and the cancel shipment
  function can retrieve it.

2. Schema Changes
- `orders.integration_shipment_nr` (text, nullable) — the shipment identifier
  returned by Noon when a shipment is created. Null until a shipment exists.

3. Security
- No RLS policy changes. Existing row policies on `orders` cover the new column.

4. Idempotency
- Uses a DO block with `IF NOT EXISTS` so re-running is safe.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'orders'
      AND column_name = 'integration_shipment_nr'
  ) THEN
    ALTER TABLE orders ADD COLUMN integration_shipment_nr text;
  END IF;
END $$;
