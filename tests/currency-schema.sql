CREATE TABLE members (   id INTEGER PRIMARY KEY AUTOINCREMENT,   evo_member_id INTEGER UNIQUE,   gym_client_id TEXT UNIQUE,   cpf_hash TEXT NOT NULL UNIQUE,   cpf_last4 TEXT,   first_name TEXT,   last_name TEXT,   email TEXT,   birth_date TEXT,   pin_hash TEXT,   pin_salt TEXT,   pin_created_at TEXT,   status TEXT NOT NULL DEFAULT 'ACTIVE',   failed_login_attempts INTEGER NOT NULL DEFAULT 0,   locked_until TEXT,   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,   updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP );
CREATE TABLE redemptions (     id INTEGER PRIMARY KEY AUTOINCREMENT,     member_id INTEGER NOT NULL,     redemption_type TEXT NOT NULL,     reference_id TEXT,     fitcoins INTEGER NOT NULL DEFAULT 0,     status TEXT NOT NULL DEFAULT 'PENDING',     requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,     approved_at TEXT,     completed_at TEXT,     cancelled_at TEXT, source_type TEXT, source_id TEXT, title TEXT, details TEXT, cash_amount REAL NOT NULL DEFAULT 0, unit TEXT, dedupe_key TEXT, handled_by TEXT, handled_at TEXT, cancel_reason TEXT,     FOREIGN KEY (member_id) REFERENCES members(id) );
CREATE TABLE evo_students (unit TEXT NOT NULL, evo_member_id TEXT NOT NULL, display_name TEXT NOT NULL, membership_status TEXT NOT NULL, fitcoins REAL, is_current INTEGER NOT NULL, last_run TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(unit,evo_member_id));
CREATE TABLE evo_member_contracts (
 unit TEXT NOT NULL,
 evo_member_id TEXT NOT NULL,
 contract_key TEXT NOT NULL,
 id_membership TEXT,
 id_member_membership TEXT,
 category_id TEXT,
 membership_name TEXT,
 membership_status TEXT,
 start_date TEXT,
 end_date TEXT,
 cancel_date TEXT,
 sale_date TEXT,
 is_additional INTEGER,
 raw_json TEXT NOT NULL,
 source_run_id TEXT,
 synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(unit,evo_member_id,contract_key)
);
CREATE TABLE evo_member_attendance (unit TEXT NOT NULL,evo_member_id TEXT NOT NULL,attendance_key TEXT NOT NULL,attendance_date TEXT NOT NULL,start_time TEXT,activity_name TEXT,id_activity_session TEXT,raw_json TEXT NOT NULL,synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,evo_member_id,attendance_key));
CREATE TABLE app_content(content_key TEXT PRIMARY KEY,content_json TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE club_currencies (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, symbol TEXT NOT NULL, brl_value REAL NOT NULL DEFAULT 0 CHECK(brl_value>=0), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')), source TEXT NOT NULL DEFAULT 'local' CHECK(source IN ('local','external')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE club_currency_units (currency_id INTEGER NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), PRIMARY KEY(currency_id,unit), FOREIGN KEY(currency_id) REFERENCES club_currencies(id));
CREATE TABLE club_currency_wallets (id INTEGER PRIMARY KEY AUTOINCREMENT, member_id INTEGER NOT NULL, currency_id INTEGER NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')), balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(member_id,currency_id,unit), FOREIGN KEY(member_id) REFERENCES members(id), FOREIGN KEY(currency_id) REFERENCES club_currencies(id));
CREATE TABLE club_currency_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, wallet_id INTEGER NOT NULL, member_id INTEGER NOT NULL, currency_id INTEGER NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')), amount INTEGER NOT NULL CHECK(amount<>0), kind TEXT NOT NULL CHECK(kind IN ('reward','redeem','adjust','reverse')), origin TEXT NOT NULL, source_ref TEXT, dedupe_key TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(wallet_id) REFERENCES club_currency_wallets(id));
CREATE TABLE club_currency_reward_rules (id INTEGER PRIMARY KEY AUTOINCREMENT, currency_id INTEGER NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('bike','gym','club')), rule_type TEXT NOT NULL CHECK(rule_type IN ('daily_attendance','weekly_attendance')), target_count INTEGER NOT NULL DEFAULT 1 CHECK(target_count>=1), reward_amount INTEGER NOT NULL CHECK(reward_amount>0), enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(currency_id,unit,rule_type,target_count), FOREIGN KEY(currency_id) REFERENCES club_currencies(id));
