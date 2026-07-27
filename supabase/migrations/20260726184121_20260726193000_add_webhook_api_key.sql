/*
# Add webhook API key to settings

1. Purpose
- Noon's Integrator Configuration requires sellers to provide an API key
  (header name + value) that Noon will send on every outgoing webhook POST.
- The noon-webhook-receiver edge function validates incoming requests
  against this shared secret before storing the order.

2. Changes to the `settings` table
- Add `webhook_api_key` (text, nullable): the shared secret that Noon must
  send in the `x-api-key` header. Nullable so existing rows aren't broken;
  the webhook receiver rejects all deliveries until a key is set.

3. Security
- RLS is already enabled on `settings`. No policy changes — the value is
  read by the edge function using the service role key (bypasses RLS) and
  by the authenticated frontend via the existing settings SELECT policy.
*/

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS webhook_api_key text;
