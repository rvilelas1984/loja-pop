-- Additive guards: one transaction insertion updates its wallet atomically.
CREATE INDEX IF NOT EXISTS club_currency_tx_scope ON club_currency_transactions(unit,currency_id,created_at,member_id);
CREATE TRIGGER IF NOT EXISTS club_currency_wallet_local BEFORE INSERT ON club_currency_wallets BEGIN
 SELECT RAISE(ABORT,'MOEDA_LOCAL_INDISPONIVEL') WHERE NOT EXISTS(SELECT 1 FROM club_currencies c JOIN club_currency_units u ON u.currency_id=c.id WHERE c.id=NEW.currency_id AND c.source='local' AND c.status='active' AND u.unit=NEW.unit AND u.enabled=1);
 SELECT RAISE(ABORT,'SALDO_INICIAL_INVALIDO') WHERE NEW.balance<>0;
END;
CREATE TRIGGER IF NOT EXISTS club_currency_tx_guard BEFORE INSERT ON club_currency_transactions BEGIN
 SELECT RAISE(ABORT,'QUANTIDADE_INVALIDA') WHERE typeof(NEW.amount)<>'integer' OR ABS(NEW.amount)>1000000000;
 SELECT RAISE(ABORT,'CARTEIRA_INVALIDA') WHERE NOT EXISTS(SELECT 1 FROM club_currency_wallets w JOIN club_currencies c ON c.id=w.currency_id JOIN club_currency_units u ON u.currency_id=c.id AND u.unit=w.unit WHERE w.id=NEW.wallet_id AND w.member_id=NEW.member_id AND w.currency_id=NEW.currency_id AND w.unit=NEW.unit AND c.source='local' AND c.status='active' AND u.enabled=1);
 SELECT RAISE(ABORT,'SALDO_INSUFICIENTE') WHERE (SELECT balance+NEW.amount FROM club_currency_wallets WHERE id=NEW.wallet_id)<0;
END;
CREATE TRIGGER IF NOT EXISTS club_currency_tx_apply AFTER INSERT ON club_currency_transactions BEGIN
 UPDATE club_currency_wallets SET balance=balance+NEW.amount,updated_at=CURRENT_TIMESTAMP WHERE id=NEW.wallet_id;
END;
CREATE TRIGGER IF NOT EXISTS club_currency_tx_immutable_update BEFORE UPDATE ON club_currency_transactions BEGIN SELECT RAISE(ABORT,'HISTORICO_IMUTAVEL'); END;
CREATE TRIGGER IF NOT EXISTS club_currency_tx_immutable_delete BEFORE DELETE ON club_currency_transactions BEGIN SELECT RAISE(ABORT,'HISTORICO_IMUTAVEL'); END;
CREATE TABLE IF NOT EXISTS club_currency_rule_periods(rule_id INTEGER PRIMARY KEY REFERENCES club_currency_reward_rules(id),start_date TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS club_currency_store_rules(unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')),item_type TEXT NOT NULL CHECK(item_type IN ('product','service')),item_id TEXT NOT NULL,currency_id INTEGER NOT NULL REFERENCES club_currencies(id),max_discount_percent INTEGER NOT NULL CHECK(max_discount_percent BETWEEN 1 AND 100),enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),PRIMARY KEY(unit,item_type,item_id,currency_id));
CREATE TABLE IF NOT EXISTS club_currency_orders(id TEXT PRIMARY KEY,member_id INTEGER NOT NULL REFERENCES members(id),unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')),currency_id INTEGER NOT NULL REFERENCES club_currencies(id),item_type TEXT NOT NULL CHECK(item_type IN ('product','service')),item_id TEXT NOT NULL,item_name TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>0),price_cents INTEGER NOT NULL,discount_cents INTEGER NOT NULL,cash_cents INTEGER NOT NULL CHECK(cash_cents>=0),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirming','confirmed','cancelled')),confirmation_ref TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,confirmed_at TEXT);
CREATE TABLE IF NOT EXISTS club_currency_jobs(unit TEXT PRIMARY KEY,after_member INTEGER NOT NULL DEFAULT 0,lease_until TEXT,last_completed TEXT,last_error TEXT);
