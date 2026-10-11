-- Additive metadata on the existing checkout. External Fitcoins are never copied/debited.
ALTER TABLE club_pix_orders ADD COLUMN original_cents INTEGER;
ALTER TABLE club_pix_orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE club_pix_orders ADD COLUMN currency_id INTEGER REFERENCES club_currencies(id);
ALTER TABLE club_pix_orders ADD COLUMN currency_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE club_pix_orders ADD COLUMN currency_rate_micros INTEGER;
ALTER TABLE club_pix_orders ADD COLUMN payment_mode TEXT;
ALTER TABLE club_pix_orders ADD COLUMN item_name TEXT;
ALTER TABLE club_pix_orders ADD COLUMN reservation_state TEXT NOT NULL DEFAULT 'none';
ALTER TABLE club_pix_orders ADD COLUMN choice_expires_at TEXT;
CREATE INDEX IF NOT EXISTS club_pix_currency_holds ON club_pix_orders(member_id,unit,currency_id,reservation_state);
CREATE TRIGGER club_pix_choice_hold BEFORE INSERT ON club_pix_orders WHEN NEW.reservation_state='held' BEGIN
 SELECT RAISE(ABORT,'MOEDA_EXTERNA_DEBITO_INDISPONIVEL') WHERE NEW.currency_quantity>0 AND NOT EXISTS(SELECT 1 FROM club_currencies WHERE id=NEW.currency_id AND source='local');
 SELECT RAISE(ABORT,'SALDO_RESERVADO_OU_INSUFICIENTE') WHERE NEW.currency_quantity>0 AND COALESCE((SELECT balance FROM club_currency_wallets WHERE member_id=NEW.member_id AND unit=NEW.unit AND currency_id=NEW.currency_id),0)<NEW.currency_quantity+COALESCE((SELECT SUM(currency_quantity) FROM club_pix_orders WHERE member_id=NEW.member_id AND unit=NEW.unit AND currency_id=NEW.currency_id AND reservation_state='held' AND (choice_expires_at IS NULL OR datetime(choice_expires_at)>datetime('now'))),0);
 SELECT RAISE(ABORT,'ESTOQUE_RESERVADO_OU_INSUFICIENTE') WHERE NEW.item_type='product' AND COALESCE((SELECT CAST(json_extract(j.value,'$.stock') AS INTEGER) FROM app_content a,json_each(a.content_json,'$.products') j WHERE a.content_key='club-pop' AND CAST(json_extract(j.value,'$.id') AS TEXT)=NEW.item_id AND COALESCE(json_extract(j.value,'$.unit'),'bike')=NEW.unit),0)<= (SELECT COUNT(*) FROM club_pix_orders WHERE item_type='product' AND item_id=NEW.item_id AND unit=NEW.unit AND reservation_state='held' AND (choice_expires_at IS NULL OR datetime(choice_expires_at)>datetime('now')));
END;
-- Every local debit path honors checkout holds, including existing admin redemptions.
CREATE TRIGGER club_pix_protect_currency_holds BEFORE INSERT ON club_currency_transactions WHEN NEW.amount<0 BEGIN
 SELECT RAISE(ABORT,'SALDO_RESERVADO_NO_CHECKOUT') WHERE (SELECT balance+NEW.amount FROM club_currency_wallets WHERE id=NEW.wallet_id)<COALESCE((SELECT SUM(currency_quantity) FROM club_pix_orders WHERE member_id=NEW.member_id AND unit=NEW.unit AND currency_id=NEW.currency_id AND reservation_state='held' AND (choice_expires_at IS NULL OR datetime(choice_expires_at)>datetime('now'))),0);
END;
CREATE TRIGGER club_pix_settle_choice AFTER UPDATE OF status ON club_pix_orders WHEN NEW.status='approved' AND OLD.status<>'approved' AND NEW.original_cents IS NOT NULL BEGIN
 SELECT RAISE(ABORT,'RESERVA_INVALIDA') WHERE OLD.reservation_state<>'held';
 SELECT RAISE(ABORT,'MOEDA_EXTERNA_DEBITO_INDISPONIVEL') WHERE NEW.currency_quantity>0 AND NOT EXISTS(SELECT 1 FROM club_currencies WHERE id=NEW.currency_id AND source='local');
 SELECT RAISE(ABORT,'CARTEIRA_INDISPONIVEL') WHERE NEW.currency_quantity>0 AND NOT EXISTS(SELECT 1 FROM club_currency_wallets WHERE member_id=NEW.member_id AND unit=NEW.unit AND currency_id=NEW.currency_id AND balance>=NEW.currency_quantity);
 SELECT RAISE(ABORT,'ESTOQUE_INSUFICIENTE') WHERE NEW.item_type='product' AND COALESCE((SELECT CAST(json_extract(j.value,'$.stock') AS INTEGER) FROM app_content a,json_each(a.content_json,'$.products') j WHERE a.content_key='club-pop' AND CAST(json_extract(j.value,'$.id') AS TEXT)=NEW.item_id AND COALESCE(json_extract(j.value,'$.unit'),'bike')=NEW.unit),0)<1;
 UPDATE club_pix_orders SET reservation_state='consumed' WHERE id=NEW.id;
 INSERT INTO club_currency_transactions(wallet_id,member_id,currency_id,unit,amount,kind,origin,source_ref,dedupe_key) SELECT id,member_id,currency_id,unit,-NEW.currency_quantity,'redeem','store',NEW.id,'checkout:'||NEW.id FROM club_currency_wallets WHERE member_id=NEW.member_id AND currency_id=NEW.currency_id AND unit=NEW.unit AND NEW.currency_quantity>0 AND NOT EXISTS(SELECT 1 FROM club_currency_transactions WHERE dedupe_key='checkout:'||NEW.id);
 UPDATE app_content SET content_json=json_set(content_json,(SELECT '$.products['||j.key||'].stock' FROM json_each(content_json,'$.products') j WHERE CAST(json_extract(j.value,'$.id') AS TEXT)=NEW.item_id AND COALESCE(json_extract(j.value,'$.unit'),'bike')=NEW.unit),(SELECT CAST(json_extract(j.value,'$.stock') AS INTEGER)-1 FROM json_each(content_json,'$.products') j WHERE CAST(json_extract(j.value,'$.id') AS TEXT)=NEW.item_id AND COALESCE(json_extract(j.value,'$.unit'),'bike')=NEW.unit)),updated_at=CURRENT_TIMESTAMP WHERE content_key='club-pop' AND NEW.item_type='product';
 INSERT INTO redemptions(member_id,redemption_type,reference_id,fitcoins,status,source_type,source_id,title,details,cash_amount,unit,dedupe_key) SELECT NEW.member_id,NEW.item_type,NEW.item_id,0,'PENDING','PIX',NEW.item_id,NEW.item_name,'Compra confirmada • Pedido '||NEW.id,NEW.amount_cents/100.0,NEW.unit,'pix:'||NEW.id WHERE NOT EXISTS(SELECT 1 FROM redemptions WHERE dedupe_key='pix:'||NEW.id);
 INSERT INTO club_pix_fulfillment(order_id,member_id,unit,debit_state,debit_reference,delivery_state) VALUES(NEW.id,NEW.member_id,NEW.unit,'confirmed','checkout:'||NEW.id,'ready') ON CONFLICT(order_id) DO UPDATE SET debit_state='confirmed',debit_reference=excluded.debit_reference,delivery_state='ready',updated_at=CURRENT_TIMESTAMP;
 INSERT INTO club_pix_delivery_audit(order_id,status) VALUES(NEW.id,'ready') ON CONFLICT(order_id) DO UPDATE SET status='ready';
END;
