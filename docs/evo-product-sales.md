# EVO product sale after checkout

Only newly saved EVO product checkouts are enrolled. No backfill or resubmission of historical sales. The snapshot fixes the unit, EVO member/product IDs, quantity (the current checkout sells one item), original price, discount, Fitcoins and Pix amount before payment.

The existing Mercado Pago reconciliation and Fitcoins debit are unchanged. After approval the Worker invokes the separate sales adapter. The existing scheduled handler recovers approved snapshots, with at most four automatic checks and ten minutes between checks. It never collects another Pix or moves Fitcoins.

## Contract evidence (2026-10-15)

- Official schema: https://evo-integracao.w12app.com.br/swagger/v1/swagger.json
- https://api.abcevo.com/create-a-new-sale-32242756e0 documents `idProduct`, `productValue`, `productAmount`, `memberData.idMember`, `sessionId`, `totalInstallments` and payment 13 (bank transfer), 5 (zero value).
- Already received external Pix is recorded as a bank transfer (13), not a new EVO Pix gateway charge. No card/paymentData is fabricated.
- The API has no separate original-price or Fitcoins-discount input. These are retained in D1; `productValue` carries the final amount. For the requested example: original 350 cents, discount 156 cents / 12 Fitcoins, final 194 cents.
- Controlled requests using invalid member AND invalid product returned HTTP 400 domain validation errors. The authenticated product read confirmed product 26841 at R$3.50 and stock 54.
- A read-only session lookup returned HTTP 200 `{idVenda:0,idCliente:0,clienteContratos:[]}`. This differs from OpenAPI's integer schema; both response contracts are supported.
- No successful real sale was created during implementation. Real paid-purchase validation of receipt, discount presentation and stock is still required. A proposed probe with a real product and invalid member was blocked by automatic approval review and was not retried.

## Idempotency / recovery

`order_id` and `session_id` are unique; `(unit,evo_sale_id)` is unique. A conditional D1 update claims the POST before calling EVO. A timeout, 5xx, malformed response, interrupted process or missing sale ID never resets the claim. Recovery reads `/api/v1/sales/by-session-id`, then `/api/v2/sales/{id}`. It does not re-POST an uncertain result, including a zero session lookup.

Documented validation/auth rejections may be retried explicitly by an admin, after another session lookup. The existing `/api/redemption?route=admin` proxy forwards to `/admin/checkout-redemptions`; use its existing checkout action routing with body `{"redemptionId":"checkout:<order-id>","action":"evo_sale_retry"}`. Unit and admin checks apply. The operation never invokes the Pix/debit paths.

D1 stores the request, response, sale ID, errors, stock before/after and verification. `confirmed` requires matching member/product/quantity/net amount, received receivables and observed stock decrease. `verify_pending` with an ID never repeats the POST. Stock is changed by EVO itself; the Worker only reads and refreshes the catalog cache. Stock difference is supporting evidence, not a unique inventory ledger attribution under concurrent sales.

## Deployment and tests

Apply `migrations/20261015_evo_product_sales.sql` before deploying the Worker. It creates only the new table and index. GitHub Actions publishes the Worker on the main push.

Run:
```
node --test evo-product-sales.test.mjs tests/evo-product-sale-checkout.test.mjs tests/checkout-debit-ack.test.mjs tests/checkout-manual-confirm.test.mjs tests/checkout-confirmation.test.mjs
```
Tests use SQLite and mocked providers, including the actual Worker signed-webhook flow, concurrency, timeout recovery, declined authorization, payment eligibility and no historical backfill. Existing `tests/checkout.test.mjs` already fails at line 49 on the unchanged baseline because it uses the Pix route for an all-coins order; this unrelated stale test was not changed.
