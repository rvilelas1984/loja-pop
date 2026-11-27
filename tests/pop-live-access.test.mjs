// Pop Live open to everyone: visitor account (signup), Pop Live-only session, student entering through Pop Live,
// first access telling "not found" apart, and the Pop Live dash data.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../club-pop-worker.mjs';

const sql=new DatabaseSync(':memory:');
sql.exec(readFileSync('tests/currency-schema.sql','utf8'));
sql.exec(`CREATE TABLE IF NOT EXISTS auth_sessions(id INTEGER PRIMARY KEY AUTOINCREMENT,member_id INTEGER,token_hash TEXT,expires_at TEXT,revoked_at TEXT);
CREATE TABLE IF NOT EXISTS audit_log(id INTEGER PRIMARY KEY,actor_type TEXT,actor_id TEXT,action TEXT,entity_type TEXT,entity_id TEXT,metadata_json TEXT,created_at TEXT);
CREATE TABLE IF NOT EXISTS club_settings(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS evo_contract_catalog(tenant_key TEXT,unit TEXT,evo_contract_id TEXT,contract_name TEXT,is_active INTEGER);
CREATE TABLE IF NOT EXISTS evo_member_contracts(unit TEXT,evo_member_id TEXT,id_membership TEXT,membership_name TEXT,membership_status TEXT,start_date TEXT,end_date TEXT,cancel_date TEXT);
CREATE TABLE IF NOT EXISTS evo_member_master(unit TEXT,evo_member_id TEXT,personal_json TEXT,contacts_json TEXT,raw_json TEXT,is_current INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS gym_member_links(member_id INTEGER,gym_client_id TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS evo_attendance_sessions(unit TEXT,id_activity_session TEXT,activity_date TEXT,start_time TEXT,activity_name TEXT,instructor_name TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS checkin_reservation_snapshots(unit TEXT,session_id TEXT,activity_date TEXT,evo_member_id TEXT,member_name TEXT,checked_in INTEGER,removed INTEGER,status TEXT,slot_number INTEGER);
CREATE TABLE IF NOT EXISTS pop_fit_profile(member_id INTEGER PRIMARY KEY,height REAL,initial_weight REAL,updated_at TEXT);
CREATE TABLE IF NOT EXISTS pop_fit_entries(member_id INTEGER,weight REAL,updated_at TEXT);
CREATE TABLE pop_live_sessions(id INTEGER PRIMARY KEY,source TEXT,source_class_id TEXT,unit TEXT,class_name TEXT,starts_at TEXT,teacher_name TEXT,duration_minutes INTEGER DEFAULT 60,goal_type TEXT,goal_value REAL,goal_zone INTEGER,status TEXT DEFAULT 'planned',updated_at TEXT);
CREATE TABLE pop_live_devices(id INTEGER PRIMARY KEY,reference_number TEXT,display_name TEXT,ble_identifier TEXT,active INTEGER,device_type TEXT,unit_bike INTEGER,unit_gym INTEGER);
CREATE TABLE pop_live_session_devices(session_id INTEGER,device_id INTEGER,member_id TEXT,connected_at TEXT,PRIMARY KEY(session_id,device_id));`);
for(const f of ['migrations/20261104_pop_live_operation.sql','migrations/20261105_pop_live_member_performance.sql','migrations/20261105_pop_live_health_overrides.sql','migrations/20261126_pop_live_games.sql'])sql.exec(readFileSync(f,'utf8'));
const stmt=(text,args=[])=>({bind:(...v)=>stmt(text,v),first:async()=>sql.prepare(text).get(...args)||null,all:async()=>({results:sql.prepare(text).all(...args)}),run:async()=>{const r=sql.prepare(text).run(...args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}}}});
const DB={prepare:t=>stmt(t),batch:async list=>{const out=[];for(const s of list)out.push(await s.run());return out}};
const env={DB};
const call=async(path,body,token)=>{const r=await worker.fetch(new Request('https://worker'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});return {status:r.status,body:await r.json().catch(()=>({}))}};

// A student (Bike Pop, active contract) and an upcoming class.
sql.exec(`INSERT INTO evo_contract_catalog VALUES('club-pop','bike','10','Plano Bike',1);
INSERT INTO evo_member_contracts(unit,evo_member_id,contract_key,id_membership,membership_name,membership_status,start_date,end_date,cancel_date,raw_json) VALUES('bike','100','k1','10','Plano Bike','active','2020-01-01','2099-01-01',NULL,'{}');
INSERT INTO evo_member_master(unit,evo_member_id,personal_json,raw_json) VALUES('bike','100','{"firstName":"Ana","lastName":"Aluna","document":"52998224725","email":"ana@exemplo.com","birthDate":"1990-01-01"}','{}');
INSERT INTO evo_attendance_sessions VALUES('gym','555',date('now','-3 hours','+1 day'),'18:00:00','Funcional Pop','Prof. Léo','scheduled');
INSERT INTO pop_live_game_events(name,event_date,location) VALUES('Bike Pop Games 1ª Edição',date('now','-3 hours','+10 days'),'Bike Pop');`);

const visitor={name:'Marina Alves',cpf:'11144477735',birthDate:'1994-04-12',sex:'f',phone:'11955550123',email:'marina@exemplo.com',pin:'258036',terms:true};
// Validation and the student guard.
assert.equal((await call('/auth/pop-live-signup',{...visitor,cpf:'11111111111'})).body.error,'CPF_INVALIDO');
assert.equal((await call('/auth/pop-live-signup',{...visitor,terms:false})).body.error,'ACEITE_OS_TERMOS');
assert.equal((await call('/auth/pop-live-signup',{...visitor,cpf:'52998224725'})).body.error,'ALUNO_ENCONTRADO_USE_PRIMEIRO_ACESSO');
// First access through Pop Live tells "not found" apart, so the app can offer the signup.
assert.equal((await call('/auth/first-access',{cpf:visitor.cpf,email:visitor.email,birthDate:visitor.birthDate,app:'live'})).body.error,'NAO_ENCONTRADO');
assert.equal((await call('/auth/first-access',{cpf:visitor.cpf,email:visitor.email,birthDate:visitor.birthDate})).body.error,'DADOS_NAO_CONFEREM');

// Visitor account: Pop Live session.
const s=await call('/auth/pop-live-signup',visitor);assert.equal(s.status,200,JSON.stringify(s.body));assert.equal(s.body.member.scope,'live');
const vt=s.body.token;
assert.equal((await call('/auth/pop-live-signup',visitor)).body.error,'CONTA_JA_CRIADA');
const me=await call('/auth/me',null,vt);assert.equal(me.status,200);assert.equal(me.body.member.scope,'live');assert.equal(me.body.member.firstName,'Marina');
// Only Pop Live and Pop Fit: Club routes refuse the visitor session.
assert.equal((await call('/member/stars?unit=bike',null,vt)).status,401);
assert.equal((await call('/member/evo-cache?unit=bike',null,vt)).status,401);
// Pop Live classes in any unit, with the cross-unit id; dash with events and Pop Fit summary.
const cl=await call('/pop-live/student?unit=gym&action=classes',null,vt);assert.equal(cl.status,200,JSON.stringify(cl.body));assert.equal(cl.body.classes[0].id,'555');
const dash=await call('/pop-live/student?unit=gym&action=dash',null,vt);assert.equal(dash.status,200);assert.equal(dash.body.visitor,true);assert.equal(dash.body.scope,'live');
assert.deepEqual(dash.body.events,[]);assert.deepEqual(dash.body.fit.week_classes,0);
const health=await call('/pop-live/student?unit=gym&action=health',null,vt);assert.equal(health.body.health.sex,'F');assert.equal(health.body.health.birth_date,'1994-04-12');

// Login: the Club Pop entry keeps the rule (no contract → refused); the Pop Live entry lets the visitor in.
assert.equal((await call('/auth/login',{cpf:visitor.cpf,pin:visitor.pin})).body.error,'CONTRATO_INATIVO');
const li=await call('/auth/login',{cpf:visitor.cpf,pin:visitor.pin,app:'live'});assert.equal(li.status,200);assert.equal(li.body.member.scope,'live');

// A student entering through Pop Live: first access + PIN, full (Club) session.
const fa=await call('/auth/first-access',{cpf:'52998224725',email:'ana@exemplo.com',birthDate:'1990-01-01',app:'live'});assert.equal(fa.status,200,JSON.stringify(fa.body));
const cp=await call('/auth/create-pin',{challenge:fa.body.challenge,pin:'147258',app:'live'});assert.equal(cp.status,200);assert.equal(cp.body.scope,'club');assert.ok(cp.body.token);
assert.equal((await call('/auth/me',null,cp.body.token)).body.member.scope,'club');
const sl=await call('/auth/login',{cpf:'52998224725',pin:'147258',app:'live'});assert.equal(sl.body.member.scope,'club');

// ===== Events and tickets (admin "Central Pop Live" + dash + store Pix) =====
for(const f of ['migrations/20261010_club_pix_orders.sql','migrations/20261011_checkout_choices.sql','migrations/20261011_checkout_fitcoins.sql'])sql.exec(readFileSync(f,'utf8'));
sql.exec('CREATE TABLE club_mp_credentials(unit TEXT,environment TEXT,access_token_cipher TEXT,webhook_secret_cipher TEXT)');
const keyBytes=crypto.getRandomValues(new Uint8Array(32)),aes=await crypto.subtle.importKey('raw',keyBytes,'AES-GCM',false,['encrypt']);
const cipher=async v=>{const iv=crypto.getRandomValues(new Uint8Array(12)),c=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode('bike:production')},aes,new TextEncoder().encode(v));return Buffer.from(iv).toString('base64')+'.'+Buffer.from(c).toString('base64')};
sql.prepare('INSERT INTO club_mp_credentials VALUES(?,?,?,?)').run('bike','production',await cipher('mp-token'),await cipher('mp-secret'));
env.CLUB_PIX_PRODUCTION_ENABLED='true';env.MERCADOPAGO_CONFIG_ENCRYPTION_KEY=Buffer.from(keyBytes).toString('base64');
const realFetch=globalThis.fetch,mp=new Map();let admin='admin';
globalThis.fetch=async(url,init={})=>{const u=String(url);
 if(u.includes('/api/admin-auth?route=me'))return Response.json({role:admin});
 if(u==='https://api.mercadopago.com/v1/orders'&&init.method==='POST'){const b=JSON.parse(init.body),o={id:'MP'+(mp.size+1),external_reference:b.external_reference,total_amount:b.total_amount,status:'action_required',transactions:{payments:[{status:'pending',payment_method:{id:'pix',qr_code:'000201PIX',qr_code_base64:'QR'}}]}};mp.set(o.id,o);return Response.json(o)}
 const m=u.match(/^https:\/\/api\.mercadopago\.com\/v1\/orders\/(.+)$/);if(m)return Response.json(mp.get(decodeURIComponent(m[1])));
 return realFetch(url,init)};
const adminCall=async(path,body,method)=>{const r=await worker.fetch(new Request('https://worker'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','x-clubpop-admin-cookie':'s=1'},...(body?{body:JSON.stringify(body)}:{})}),env,{waitUntil(){}});return {status:r.status,body:await r.json().catch(()=>({}))}};
const day=new Date(Date.now()+10*864e5).toISOString().slice(0,10);
admin='reception';assert.equal((await adminCall('/admin/pop-live-events',{unit:'both',name:'Games',date:day,time:'08:00'})).status,403);admin='admin';
const ev=await adminCall('/admin/pop-live-events',{unit:'both',kind:'event',name:'Bike Pop Games 1ª Edição',date:day,time:'08:00',end_time:'14:00',status:'published'});assert.equal(ev.status,200,JSON.stringify(ev.body));
const E='/admin/pop-live-events?id='+ev.body.id,op=b=>adminCall(E,b);
assert.equal((await op({op:'activity_add',unit:'bike',start:'09:00',end:'08:00',activity_type:'Autódromo Pop',seats:12})).body.error,'HORARIO_INVALIDO');
assert.equal((await op({op:'activity_add',unit:'bike',start:'07:00',end:'07:30',activity_type:'Outra atividade',seats:12})).body.error,'NOME_DA_ATIVIDADE_OBRIGATORIO');
const A={};
A.m1=(await op({op:'activity_add',unit:'bike',start:'08:00',end:'08:45',activity_type:'Desafio de Distância',name:'Maratona Pop 5 km',seats:2,is_main:true})).body.activity_id;
A.auto=(await op({op:'activity_add',unit:'bike',start:'09:00',end:'09:45',activity_type:'Autódromo Pop',seats:12})).body.activity_id;
A.heart=(await op({op:'activity_add',unit:'gym',start:'09:00',end:'09:40',activity_type:'Batalha dos Batimentos',seats:10})).body.activity_id;
A.surv=(await op({op:'activity_add',unit:'bike',start:'10:00',end:'10:30',activity_type:'Sobrevivência',seats:1})).body.activity_id;
A.m2=(await op({op:'activity_add',unit:'bike',start:'13:00',end:'13:45',activity_type:'Desafio de Distância',name:'Maratona Pop 5 km',seats:12,is_main:true})).body.activity_id;
assert.equal((await op({op:'ticket_add',name:'Sem nada',price:'10',extra_credits:0})).body.error,'INGRESSO_SEM_ATIVIDADES');
const T={};
T.mar=(await op({op:'ticket_add',name:'Maratona',price:'49,90',main_name:'Maratona Pop 5 km',extra_credits:0})).body.ticket_type_id;
T.combo=(await op({op:'ticket_add',name:'Maratona + camiseta + 2 atividades',price:'119,90',main_name:'Maratona Pop 5 km',extra_credits:2,gifts:'Camiseta do evento',stock:30})).body.ticket_type_id;
T.free=(await op({op:'ticket_add',name:'Experimente 1 atividade',price:'0',extra_credits:1})).body.ticket_type_id;
// Student side: dash list, event detail, buying the combo from the Autódromo card.
const S=(action,body,tok=vt,q='')=>call('/pop-live/student?unit=bike&action='+action+'&event_id='+ev.body.id+q,body,tok);
let evs=(await S('events')).body.events;assert.equal(evs[0].from_cents,0);
let d=(await S('event')).body;assert.equal(d.activities.length,5);assert.equal(d.tickets.length,3);assert.equal(d.tickets.find(t=>t.id===T.combo).shirt,true);
assert.equal((await S('enroll',{activity_id:A.auto})).body.error,'SEM_SALDO','no ticket, no booking');
assert.equal((await S('buy',{ticket_type_id:T.combo,activity_id:A.auto})).body.error,'ESCOLHA_O_TAMANHO_DA_CAMISETA');
assert.equal((await S('buy',{ticket_type_id:T.mar,activity_id:A.auto})).body.error,'INGRESSO_NAO_DA_ACESSO_A_ATIVIDADE');
const tk=await S('buy',{ticket_type_id:T.combo,activity_id:A.auto,shirt_size:'M'});assert.equal(tk.body.status,'pending');assert.equal(tk.body.amountCents,11990);
const pix=await call('/checkout/pix/create',{orderId:tk.body.orderId},vt);assert.equal(pix.status,200,JSON.stringify(pix.body));assert.equal(pix.body.qrCode,'000201PIX');
const o=mp.get(pix.body.providerOrderId);o.status='processed';o.total_paid_amount=o.total_amount;o.transactions.payments[0].status='processed';
const st=await call('/checkout/pix/status?orderId='+tk.body.orderId,null,vt);assert.equal(st.body.status,'approved',JSON.stringify(st.body));assert.deepEqual(st.body.joined,['Autódromo Pop']);
d=(await S('event')).body;assert.equal(d.balance.extras.left,1);assert.deepEqual(d.balance.mains['Maratona Pop 5 km'],{rights:1,used:0});
// The main right books one Maratona; the extra balance never books the other session.
assert.equal((await S('enroll',{activity_id:A.m1})).body.kind,'main');
assert.equal((await S('enroll',{activity_id:A.m2})).body.error,'SEM_DIREITO_ATIVIDADE_PRINCIPAL');
assert.match((await S('enroll',{activity_id:A.heart})).body.error,/^HORARIO_CONFLITA:Autódromo Pop/);
assert.equal((await S('enroll',{activity_id:A.surv})).body.kind,'extra');
d=(await S('event')).body;assert.equal(d.balance.extras.left,0);assert.equal(d.activities.find(a=>a.id===A.surv).left,0);
// Sold out: the free ticket cannot take the full Sobrevivência; another student gets the second Maratona seat with a new ticket.
assert.equal((await S('buy',{ticket_type_id:T.free,activity_id:A.surv},cp.body.token)).body.error,'ESGOTADO');
const fr=await S('buy',{ticket_type_id:T.free,activity_id:A.auto},cp.body.token);assert.equal(fr.body.status,'confirmed');assert.deepEqual(fr.body.joined,['Autódromo Pop']);
// Leaving returns the right; admin sees buyers (shirt size) and bookings.
assert.equal((await S('leave',{activity_id:A.surv})).body.status,'left');assert.equal((await S('event')).body.balance.extras.left,1);
const det=(await adminCall(E)).body;assert.equal(det.purchases.find(p=>p.ticket==='Maratona + camiseta + 2 atividades').shirt_size,'M');assert.equal(det.purchases[0].visitor,1);
assert.equal(det.enrollments.filter(n=>n.activity_id===A.auto).length,2);assert.equal(det.tickets.find(t=>t.id===T.combo).sold,1);
// Equipment numbers: automatic (lowest free), chosen by the student, swapped by the admin.
let autoRows=det.enrollments.filter(n=>n.activity_id===A.auto).sort((x,y)=>x.seat_number-y.seat_number);assert.deepEqual(autoRows.map(n=>n.seat_number),[1,2]);
d=(await S('event')).body;assert.equal(d.activities.find(a=>a.id===A.auto).my_seat,1);assert.deepEqual(d.activities.find(a=>a.id===A.auto).taken_seats.sort(),[1,2]);
assert.equal((await S('enroll',{activity_id:A.surv,seat_number:5})).body.error,'NUMERO_INVALIDO','Sobrevivência has 1 seat');
const ch=await S('enroll',{activity_id:A.surv,seat_number:1});assert.equal(ch.body.seat,1);
const me1=autoRows.find(n=>n.first_name==='Marina');
await op({op:'seat_set',enrollment_id:me1.id,seat_number:2});
autoRows=(await adminCall(E)).body.enrollments.filter(n=>n.activity_id===A.auto);assert.equal(autoRows.find(n=>n.first_name==='Marina').seat_number,2);assert.equal(autoRows.find(n=>n.first_name!=='Marina').seat_number,1,'swapped');
assert.equal(autoRows.find(n=>n.first_name==='Marina').shirt_size,'M');
// Admin edits an activity (no longer main) and removes a participant.
assert.equal((await op({op:'activity_update',activity_id:A.m2,start:'13:00',end:'13:45',unit:'bike',activity_type:'Desafio de Distância',name:'Maratona Pop 5 km',seats:15,is_main:false})).status,200);
let acts=(await adminCall(E)).body.activities;assert.equal(acts.find(a=>a.id===A.m2).is_main,0);assert.equal(acts.find(a=>a.id===A.m2).seats,15);
await op({op:'enrollment_remove',enrollment_id:autoRows.find(n=>n.first_name!=='Marina').id});
assert.equal((await adminCall(E)).body.enrollments.filter(n=>n.activity_id===A.auto).length,1);
// Equipment: defaults by unit; an activity without equipment enrolls without a number.
acts=(await adminCall(E)).body.activities;assert.equal(acts.find(a=>a.id===A.auto).equipment,'spin_bike');assert.equal(acts.find(a=>a.id===A.heart).equipment,'hr_watch');
assert.equal((await S('leave',{activity_id:A.surv})).body.status,'left');
await op({op:'activity_update',activity_id:A.surv,start:'10:00',end:'10:30',unit:'bike',activity_type:'Sobrevivência',seats:1,equipment:'none'});
assert.equal((await S('event')).body.activities.find(a=>a.id===A.surv).equipment,'none');
const ne=(await S('enroll',{activity_id:A.surv,seat_number:1})).body;assert.equal(ne.status,'enrolled');assert.equal(ne.seat,null);assert.equal(ne.equipment,'none');
assert.equal((await op({op:'ticket_delete',ticket_type_id:T.combo})).body.error,'INGRESSO_JA_VENDIDO_DESATIVE');
assert.equal((await op({op:'activity_delete',activity_id:A.auto})).body.error,'ATIVIDADE_COM_INSCRITOS');
// Counter sale: find the student by CPF / Pop Live ID and sell a ticket paid at the desk.
assert.equal((await op({op:'member_find',identifier:'00000000191'})).body.error,'ALUNO_NAO_ENCONTRADO');
const fm=(await op({op:'member_find',identifier:'529.982.247-25'})).body;assert.equal(fm.members.length,1);assert.equal(fm.members[0].visitor,0);
assert.equal((await op({op:'member_find',identifier:String(800000000000+fm.members[0].id)})).body.members[0].id,fm.members[0].id);
const evA=await S('event',undefined,cp.body.token);assert.ok(evA.body.balance,JSON.stringify(evA.body));const before=evA.body.balance.tickets.length;
assert.equal((await op({op:'ticket_sell',ticket_type_id:T.combo,member_id:fm.members[0].id,payment_method:'credit'})).body.error,'ESCOLHA_O_TAMANHO_DA_CAMISETA');
assert.equal((await op({op:'ticket_sell',ticket_type_id:T.combo,member_id:fm.members[0].id,payment_method:'cheque',shirt_size:'G'})).body.error,'FORMA_DE_PAGAMENTO_INVALIDA');
assert.ok((await op({op:'ticket_sell',ticket_type_id:T.combo,member_id:fm.members[0].id,payment_method:'credit',shirt_size:'G'})).body.purchase_id);
assert.equal((await S('event',undefined,cp.body.token)).body.balance.tickets.length,before+1,'sold ticket shows in the student balance');
const sold=(await adminCall(E)).body.purchases.find(p=>p.payment_method==='credit');assert.equal(sold.amount_cents,11990);assert.equal(sold.shirt_size,'G');
// Visitor still cannot use store routes.
assert.equal((await call('/checkout/pix/draft',{unit:'bike',itemType:'product',itemId:'x'},vt)).status,401);
globalThis.fetch=realFetch;
console.log('PASS Pop Live access: visitor signup, Pop Live-only session, Club rule kept, student through Pop Live, dash data, events with schedule, main activities, ticket balance and Pix');
