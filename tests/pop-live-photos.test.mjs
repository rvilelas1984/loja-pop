import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {participantPhotos} from '../lib/pop-live-photos.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE members(id INTEGER PRIMARY KEY,evo_member_id TEXT,gym_client_id TEXT,first_name TEXT,last_name TEXT,birth_date TEXT);
CREATE TABLE club_profile_photos(member_id INTEGER PRIMARY KEY,photo_token TEXT);
INSERT INTO members VALUES(1,'101','201','First','Student','1980-01-01'),(2,'102','202','Second','Student','1981-01-01'),(843,'201',NULL,'First','Student',NULL),(844,'202',NULL,'Second','Student',NULL),(3,'103','203','No','Photo','1982-01-01');
INSERT INTO club_profile_photos VALUES(1,'11111111-1111-4111-8111-111111111111'),(2,'22222222-2222-4222-8222-222222222222');`);
let queries=0;
const db={prepare(q){let args=[];return {bind(...a){args=a;return this},async all(){queries++;return {results:sql.prepare(q).all(...args)}}}}};
const photo=async(unit,ids)=>participantPhotos(db,unit,ids.map(id=>({member_id:String(id),kcal:42,zones:[1,2,3,4,5]})),'https://api.test');
for(const [unit,ids] of [['gym',[201,202]],['bike',[101,102]],['gym',[800000000843,800000000844]],['bike',[800000000001,800000000002]]]){
 const rows=await photo(unit,ids);assert.ok(rows[0].photoUrl.endsWith('11111111-1111-4111-8111-111111111111'));assert.ok(rows[1].photoUrl.endsWith('22222222-2222-4222-8222-222222222222'));assert.equal(rows[0].kcal,42);assert.deepEqual(rows[0].zones,[1,2,3,4,5]);
}
assert.equal((await photo('gym',[203]))[0].photoUrl,null);
assert.equal((await photo('gym',[900000000001]))[0].photoUrl,null);
sql.exec("UPDATE club_profile_photos SET photo_token='33333333-3333-4333-8333-333333333333' WHERE member_id=1");
assert.ok((await photo('gym',[201]))[0].photoUrl.endsWith('33333333-3333-4333-8333-333333333333'));
sql.exec("DELETE FROM club_profile_photos WHERE member_id=1");assert.equal((await photo('gym',[201]))[0].photoUrl,null);
// A conflicting identity must not borrow another person's photograph.
sql.exec("UPDATE members SET birth_date='1990-01-01' WHERE id=844");assert.equal((await photo('gym',[800000000844]))[0].photoUrl,null);
// Ambiguous unit mapping fails closed.
sql.exec("INSERT INTO members VALUES(4,'104','202','Other','Student','1999-01-01')");assert.equal((await photo('gym',[202]))[0].photoUrl,null);
const before=queries;await photo('gym',Array.from({length:34},(_,i)=>1000+i));assert.equal(queries-before,1);
assert.equal(sql.prepare('SELECT count(*) n FROM club_profile_photos').get().n,1);
sql.exec('DROP TABLE club_profile_photos');assert.equal((await photo('gym',[201]))[0].photoUrl,null);
console.log('PASS: unit IDs, canonical profile, secondary IDs, missing/deleted/changed photos, ambiguity, read-only batching and metrics preservation');
