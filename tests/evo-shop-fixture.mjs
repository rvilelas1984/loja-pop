import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function fixture(){
 const sql=new DatabaseSync(':memory:');sql.exec(`
 CREATE TABLE members(id INTEGER PRIMARY KEY,evo_member_id TEXT,gym_client_id TEXT,first_name TEXT,last_name TEXT);
 CREATE TABLE evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT,raw_json TEXT);
 CREATE TABLE club_pix_orders(id TEXT PRIMARY KEY,unit TEXT,item_type TEXT,item_id TEXT,member_id INTEGER,external_member_id TEXT,status TEXT,amount_cents INTEGER,original_cents INTEGER,discount_cents INTEGER,currency_quantity INTEGER,payment_mode TEXT,item_name TEXT,external_state TEXT,created_at TEXT,updated_at TEXT,provider_order_id TEXT,external_before INTEGER);
 CREATE TABLE club_pix_provider_events(order_id TEXT,provider_order_id TEXT,amount_cents INTEGER,provider_status TEXT);
 CREATE TABLE club_pix_fulfillment(order_id TEXT,delivery_state TEXT);
 CREATE TABLE club_fiscal_sale_entries(order_id TEXT,registered_at TEXT,registered_by TEXT);
 CREATE TABLE club_evo_product_sales(order_id TEXT,product_id TEXT,state TEXT,evo_sale_id INTEGER);
 CREATE TABLE app_content(content_key TEXT,content_json TEXT);
 CREATE TABLE evo_product_catalog(tenant_key TEXT,unit TEXT,evo_product_id TEXT,name TEXT);
 CREATE TABLE evo_service_catalog(unit TEXT,evo_service_id TEXT,service_name TEXT);
 CREATE TABLE aggregator_branch_defaults(unit TEXT,branch_code TEXT);
 INSERT INTO members VALUES(1,'bike-person','gym-person','Local','Name');
 INSERT INTO evo_member_master VALUES('bike','bike-person','{"name":"Ana Bike","document":"01234567890"}','{}'),('gym','gym-person','{"name":"Ana Gym","cpf":"09876543210"}','{}');
 INSERT INTO app_content VALUES('club-pop','{"products":[{"id":"p","unit":"bike","evoProductId":"1"}],"services":[{"id":"s","unit":"gym","evoServiceId":"2"}]}');
 INSERT INTO evo_product_catalog VALUES('default','bike','1','Produto oficial');
 INSERT INTO evo_service_catalog VALUES('gym','2','Serviço oficial');
 INSERT INTO club_pix_orders VALUES('bike-order','bike','product','p',1,NULL,'approved',350,350,0,0,'pix','Nome antigo','none','2026-10-16 01:30:00','now','provider1',NULL),('gym-order','gym','service','s',1,NULL,'approved',181,350,169,13,'mixed','Serviço antigo','confirmed','2026-10-16 12:00:00','now','provider2',NULL);
 INSERT INTO club_pix_provider_events VALUES('bike-order','provider1',350,'processed'),('gym-order','provider2',181,'processed');`);
 sql.exec(readFileSync('migrations/20261016_evo_shop_import.sql','utf8'));
 const prepare=q=>({bind(...params){return statement(q,params)},...statement(q,[])});
 const statement=(q,params)=>({async first(){return sql.prepare(q).get(...params)||null},async all(){return {results:sql.prepare(q).all(...params)}},async run(){const r=sql.prepare(q).run(...params);return {meta:{changes:Number(r.changes)}}}});
 const db={prepare,async batch(stm){sql.exec('BEGIN');try{const out=[];for(const s of stm)out.push(await s.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};return {sql,db};
}
