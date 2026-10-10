# Mercado Pago Pix - release gate

This branch is NOT ready for production. No deployment or D1 migration has been executed.

## Required server configuration
- MERCADOPAGO_ACCESS_TOKEN_TEST: Cloudflare secret
- MERCADOPAGO_WEBHOOK_SECRET_TEST: Cloudflare secret from Mercado Pago notification configuration
- CLUB_PIX_TEST_ENABLED: set to true only in a controlled sandbox after applying D1 migration

## Implemented
- Authenticated catalog preview and draft creation, server-side price validation
- Sandbox Orders API call with idempotency key
- Read-only order list and provider reconciliation
- Signed webhook trigger, provider re-fetch, order and amount matching
- No fulfillment, stock decrement or Fitcoins debit

## Blockers to production
- Verify exact Orders API request/response and webhook signature manifest against sandbox
- Build atomic D1 Fitcoins ledger and transaction-safe fulfillment with retry
- Implement mixed Fitcoins+Pix quote and reservation against authoritative balance
- Build student QR and copy-and-paste UI and ensure test/prod isolation
- Run migrations, automated integration tests and real sandbox payment tests

Do not enable checkout or mark payments fulfilled until all blockers are resolved.
