// Pop Live events: the event (one or both units, start and end), its schedule of activities (★ main activities
// may run more than once in the day) and its ticket types (combos). A ticket gives one right to a main activity
// (optional), a balance of extra activities (or all of them) and gifts such as a T-shirt. Students buy tickets
// (free, or Pix through the store checkout: club_pix_orders item_type 'pop_live_ticket') and book activities with
// their balance. Rules: the extra balance never books a main activity; each ticket books its main activity once;
// no overlapping times; seats per activity; a Pix being paid holds the chosen seat for 30 minutes.
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const rows=async q=>(await q.all()).results||[];
const text=(v,max)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export const EVENT_ITEM='pop_live_event';   // first version: one price per event (kept for orders already created)
export const TICKET_ITEM='pop_live_ticket'; // ticket type purchase
const HOLD_MIN=30,LEAVE_BEFORE_MIN=120;
const PAID=`('paid','confirmed')`;
const holdSql=`(p.status IN ${PAID} OR (p.status='pending' AND datetime(p.created_at)>datetime('now','-${HOLD_MIN} minutes')))`;
const nameOf=a=>a?(a.name||a.activity_type):'';
const hhmm=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||''));
const SHIRT=/camis/i;

let ready=false;
export async function ensureEventTables(db){
 if(ready)return;
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_events(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'event',
   name TEXT NOT NULL,description TEXT,starts_at TEXT NOT NULL,location TEXT,capacity INTEGER NOT NULL DEFAULT 0,price_cents INTEGER NOT NULL DEFAULT 0,
   status TEXT NOT NULL DEFAULT 'draft',sales_open INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_event_tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
   status TEXT NOT NULL,order_id TEXT,amount_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(event_id,member_id))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_event_activities(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,unit TEXT NOT NULL,
   starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,activity_type TEXT NOT NULL,name TEXT,seats INTEGER NOT NULL,is_main INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_event_ticket_types(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,name TEXT NOT NULL,price_cents INTEGER NOT NULL DEFAULT 0,
   main_name TEXT NOT NULL DEFAULT '',extra_credits INTEGER NOT NULL DEFAULT 0,gifts TEXT NOT NULL DEFAULT '',stock INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_event_purchases(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,ticket_type_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
   status TEXT NOT NULL,order_id TEXT,amount_cents INTEGER NOT NULL DEFAULT 0,shirt_size TEXT,want_activity_id INTEGER,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_event_enrollments(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,activity_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
   kind TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(activity_id,member_id))`),
  db.prepare('CREATE INDEX IF NOT EXISTS pop_live_event_purchases_member ON pop_live_event_purchases(event_id,member_id,status)'),
  db.prepare('CREATE INDEX IF NOT EXISTS pop_live_event_enrollments_member ON pop_live_event_enrollments(event_id,member_id)')
 ]);
 try{await db.prepare('ALTER TABLE pop_live_events ADD COLUMN ends_at TEXT').run()}catch{}
 ready=true;
}

// ---------- Admin ----------
export function eventInput(b){
 const unit=String(b.unit||'');if(!['bike','gym','both'].includes(unit))fail('UNIDADE_INVALIDA');
 const kind=['event','special_class'].includes(b.kind)?b.kind:'event';
 const name=text(b.name,120);if(name.length<3)fail('NOME_OBRIGATORIO');
 const date=String(b.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))fail('DATA_INVALIDA');
 const time=String(b.time||''),end=String(b.end_time||'');
 if(!hhmm(time))fail('HORARIO_INVALIDO');if(end&&(!hhmm(end)||end<=time))fail('HORARIO_FIM_INVALIDO');
 const status=['draft','published','cancelled'].includes(b.status)?b.status:'draft';
 return {unit,kind,name,description:text(b.description,600),starts_at:date+' '+time,ends_at:end?date+' '+end:null,location:text(b.location,120),status,sales_open:b.sales_open===false||b.sales_open==='false'?0:1};
}
function activityInput(b,event){
 const s=String(b.start||''),e=String(b.end||'');if(!hhmm(s)||!hhmm(e)||e<=s)fail('HORARIO_INVALIDO');
 const unit=event.unit==='both'?String(b.unit||''):event.unit;if(!['bike','gym'].includes(unit))fail('UNIDADE_INVALIDA');
 const type=text(b.activity_type,60);if(type.length<3)fail('ATIVIDADE_OBRIGATORIA');
 const seats=Number(b.seats);if(!Number.isInteger(seats)||seats<1||seats>500)fail('VAGAS_INVALIDAS');
 return {unit,starts_at:s,ends_at:e,activity_type:type,name:text(b.name,80),seats,is_main:b.is_main===true||b.is_main==='true'?1:0};
}
function ticketInput(b){
 const name=text(b.name,80);if(name.length<3)fail('NOME_DO_INGRESSO_OBRIGATORIO');
 const price=Math.round(Number(String(b.price??'0').replace(',','.'))*100);if(!(price===0||(price>=100&&price<=500000)))fail('VALOR_INVALIDO');
 const credits=Number(b.extra_credits??0);if(!Number.isInteger(credits)||credits<-1||credits>20)fail('SALDO_INVALIDO');
 const stock=Number(b.stock??0);if(!Number.isInteger(stock)||stock<0||stock>10000)fail('QUANTIDADE_INVALIDA');
 const main=text(b.main_name,80);if(!main&&credits===0)fail('INGRESSO_SEM_ATIVIDADES');
 return {name,price_cents:price,main_name:main,extra_credits:credits,gifts:String(b.gifts||'').split(',').map(x=>text(x,60)).filter(Boolean).slice(0,6).join(', '),stock};
}
const soldSql=`(SELECT COUNT(*) FROM pop_live_event_purchases p WHERE p.ticket_type_id=t.id AND ${holdSql})`;
const takenSql=`((SELECT COUNT(*) FROM pop_live_event_enrollments n WHERE n.activity_id=a.id)+(SELECT COUNT(*) FROM pop_live_event_purchases p WHERE p.want_activity_id=a.id AND p.status='pending' AND datetime(p.created_at)>datetime('now','-${HOLD_MIN} minutes')))`;

export async function adminEvents(request,db,url,json){
 await ensureEventTables(db);
 const id=Number(url.searchParams.get('id')||0);
 if(request.method==='GET'){
  if(id){
   const event=await db.prepare('SELECT * FROM pop_live_events WHERE id=?').bind(id).first();if(!event)fail('EVENTO_NAO_ENCONTRADO',404);
   const activities=await rows(db.prepare(`SELECT a.*,${takenSql} taken FROM pop_live_event_activities a WHERE a.event_id=? ORDER BY a.starts_at,a.unit,a.id`).bind(id));
   const tickets=await rows(db.prepare(`SELECT t.*,${soldSql} sold FROM pop_live_event_ticket_types t WHERE t.event_id=? ORDER BY t.price_cents,t.id`).bind(id));
   const purchases=await rows(db.prepare(`SELECT p.id,p.status,p.amount_cents,p.shirt_size,p.created_at,t.name ticket,m.first_name,m.last_name,m.cpf_last4,
     CASE WHEN m.evo_member_id IS NULL AND m.gym_client_id IS NULL THEN 1 ELSE 0 END visitor FROM pop_live_event_purchases p JOIN pop_live_event_ticket_types t ON t.id=p.ticket_type_id
     LEFT JOIN members m ON m.id=p.member_id WHERE p.event_id=? AND p.status!='cancelled' ORDER BY p.created_at`).bind(id));
   const enrollments=await rows(db.prepare(`SELECT n.activity_id,n.kind,m.first_name,m.last_name FROM pop_live_event_enrollments n LEFT JOIN members m ON m.id=n.member_id WHERE n.event_id=? ORDER BY n.created_at`).bind(id));
   return json({ok:true,event,activities,tickets,purchases,enrollments});
  }
  const events=await rows(db.prepare(`SELECT e.*,(SELECT COUNT(*) FROM pop_live_event_purchases p WHERE p.event_id=e.id AND p.status IN ${PAID}) sold,
    (SELECT COUNT(*) FROM pop_live_event_activities a WHERE a.event_id=e.id) activities,(SELECT COUNT(*) FROM pop_live_event_ticket_types t WHERE t.event_id=e.id AND t.active=1) ticket_types
    FROM pop_live_events e WHERE e.status!='cancelled' OR e.starts_at>=datetime('now','-3 hours','-30 days') ORDER BY e.starts_at DESC LIMIT 100`));
  return json({ok:true,events});
 }
 let b={};try{b=await request.json()}catch{}
 if(request.method==='POST'&&!id){
  const e=eventInput(b);
  const r=await db.prepare('INSERT INTO pop_live_events(unit,kind,name,description,starts_at,ends_at,location,capacity,price_cents,status,sales_open) VALUES(?,?,?,?,?,?,?,0,0,?,?)')
   .bind(e.unit,e.kind,e.name,e.description,e.starts_at,e.ends_at,e.location,e.status,e.sales_open).run();
  return json({ok:true,id:Number(r.meta?.last_row_id)});
 }
 if(!id)fail('EVENTO_INVALIDO');
 const event=await db.prepare('SELECT * FROM pop_live_events WHERE id=?').bind(id).first();if(!event)fail('EVENTO_NAO_ENCONTRADO',404);
 if(request.method==='PUT'){
  const e=eventInput(b);
  await db.prepare('UPDATE pop_live_events SET unit=?,kind=?,name=?,description=?,starts_at=?,ends_at=?,location=?,status=?,sales_open=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
   .bind(e.unit,e.kind,e.name,e.description,e.starts_at,e.ends_at,e.location,e.status,e.sales_open,id).run();
  return json({ok:true,id});
 }
 if(request.method!=='POST')fail('METODO_INVALIDO',405);
 const op=String(b.op||'');
 if(op==='activity_add'){const a=activityInput(b,event);const r=await db.prepare('INSERT INTO pop_live_event_activities(event_id,unit,starts_at,ends_at,activity_type,name,seats,is_main) VALUES(?,?,?,?,?,?,?,?)').bind(id,a.unit,a.starts_at,a.ends_at,a.activity_type,a.name,a.seats,a.is_main).run();return json({ok:true,activity_id:Number(r.meta?.last_row_id)})}
 if(op==='activity_seats'){const aid=Number(b.activity_id),seats=Number(b.seats);if(!Number.isInteger(seats)||seats<1||seats>500)fail('VAGAS_INVALIDAS');await db.prepare('UPDATE pop_live_event_activities SET seats=? WHERE id=? AND event_id=?').bind(seats,aid,id).run();return json({ok:true})}
 if(op==='activity_delete'){const aid=Number(b.activity_id);const used=await db.prepare('SELECT COUNT(*) n FROM pop_live_event_enrollments WHERE activity_id=?').bind(aid).first();if(Number(used?.n))fail('ATIVIDADE_COM_INSCRITOS',409);await db.prepare('DELETE FROM pop_live_event_activities WHERE id=? AND event_id=?').bind(aid,id).run();return json({ok:true})}
 if(op==='ticket_add'){const t=ticketInput(b);const r=await db.prepare('INSERT INTO pop_live_event_ticket_types(event_id,name,price_cents,main_name,extra_credits,gifts,stock) VALUES(?,?,?,?,?,?,?)').bind(id,t.name,t.price_cents,t.main_name,t.extra_credits,t.gifts,t.stock).run();return json({ok:true,ticket_type_id:Number(r.meta?.last_row_id)})}
 if(op==='ticket_active'){await db.prepare('UPDATE pop_live_event_ticket_types SET active=? WHERE id=? AND event_id=?').bind(b.active?1:0,Number(b.ticket_type_id),id).run();return json({ok:true})}
 if(op==='ticket_delete'){const tid=Number(b.ticket_type_id);const used=await db.prepare('SELECT COUNT(*) n FROM pop_live_event_purchases WHERE ticket_type_id=? AND status!=\'cancelled\'').bind(tid).first();if(Number(used?.n))fail('INGRESSO_JA_VENDIDO_DESATIVE',409);await db.prepare('DELETE FROM pop_live_event_ticket_types WHERE id=? AND event_id=?').bind(tid,id).run();return json({ok:true})}
 fail('OPERACAO_INVALIDA');
}

// ---------- Student ----------
async function balance(db,eventId,memberId){
 const bought=await rows(db.prepare(`SELECT p.id,p.status,p.shirt_size,t.name,t.main_name,t.extra_credits,t.gifts FROM pop_live_event_purchases p JOIN pop_live_event_ticket_types t ON t.id=p.ticket_type_id
   WHERE p.event_id=? AND p.member_id=? AND p.status IN ${PAID} ORDER BY p.id`).bind(eventId,memberId));
 const mine=await rows(db.prepare(`SELECT n.activity_id,n.kind,a.starts_at,a.ends_at,a.activity_type,a.name,a.is_main FROM pop_live_event_enrollments n JOIN pop_live_event_activities a ON a.id=n.activity_id WHERE n.event_id=? AND n.member_id=?`).bind(eventId,memberId));
 const mains={};for(const t of bought)if(t.main_name){mains[t.main_name]=mains[t.main_name]||{rights:0,used:0};mains[t.main_name].rights++}
 for(const m of mine)if(m.kind==='main'){const k=nameOf(m);mains[k]=mains[k]||{rights:0,used:0};mains[k].used++}
 const unlimited=bought.some(t=>Number(t.extra_credits)===-1),total=bought.reduce((x,t)=>x+Math.max(0,Number(t.extra_credits)),0),used=mine.filter(m=>m.kind==='extra').length;
 return {bought,mine,mains,extras:{unlimited,total,used,left:unlimited?null:Math.max(0,total-used)}};
}
function canUse(bal,a){
 if(a.is_main){const m=bal.mains[nameOf(a)];return m&&m.rights-m.used>0?'main':''}
 return bal.extras.unlimited||bal.extras.left>0?'extra':'';
}
export async function studentEvents(db,memberId){
 await ensureEventTables(db);
 return rows(db.prepare(`SELECT e.id,e.unit,e.kind,e.name,e.description,e.starts_at,e.ends_at,e.location,e.sales_open,
   (SELECT MIN(t.price_cents) FROM pop_live_event_ticket_types t WHERE t.event_id=e.id AND t.active=1) from_cents,
   (SELECT COUNT(*) FROM pop_live_event_purchases p WHERE p.event_id=e.id AND p.member_id=? AND p.status IN ${PAID}) my_tickets
   FROM pop_live_events e WHERE e.status='published' AND COALESCE(e.ends_at,e.starts_at)>=datetime('now','-3 hours') ORDER BY e.starts_at LIMIT 12`).bind(memberId));
}
async function eventDetail(db,eventId,memberId){
 const event=await db.prepare(`SELECT id,unit,kind,name,description,starts_at,ends_at,location,sales_open,status FROM pop_live_events WHERE id=? AND status='published'`).bind(eventId).first();
 if(!event)fail('EVENTO_NAO_ENCONTRADO',404);
 const activities=await rows(db.prepare(`SELECT a.id,a.unit,a.starts_at,a.ends_at,a.activity_type,a.name,a.seats,a.is_main,${takenSql} taken FROM pop_live_event_activities a WHERE a.event_id=? ORDER BY a.starts_at,a.unit,a.id`).bind(eventId));
 const tickets=await rows(db.prepare(`SELECT t.id,t.name,t.price_cents,t.main_name,t.extra_credits,t.gifts,t.stock,${soldSql} sold FROM pop_live_event_ticket_types t WHERE t.event_id=? AND t.active=1 ORDER BY t.price_cents,t.id`).bind(eventId));
 const bal=await balance(db,eventId,memberId);
 const pending=await db.prepare(`SELECT p.id,p.order_id,p.amount_cents,t.name FROM pop_live_event_purchases p JOIN pop_live_event_ticket_types t ON t.id=p.ticket_type_id WHERE p.event_id=? AND p.member_id=? AND p.status='pending' AND datetime(p.created_at)>datetime('now','-${HOLD_MIN} minutes') ORDER BY p.id DESC LIMIT 1`).bind(eventId,memberId).first();
 const mineIds=new Set(bal.mine.map(m=>m.activity_id));
 return {event,activities:activities.map(a=>({...a,taken:Number(a.taken),left:Math.max(0,a.seats-Number(a.taken)),mine:mineIds.has(a.id),can:canUse(bal,a)})),
  tickets:tickets.map(t=>({...t,sold:Number(t.sold),out:!!(t.stock&&Number(t.sold)>=t.stock),shirt:SHIRT.test(t.gifts)})),
  balance:{tickets:bal.bought.map(t=>({name:t.name,gifts:t.gifts,shirt_size:t.shirt_size})),mains:bal.mains,extras:bal.extras},pending};
}
const minutesTo=(date,hm)=>(Date.parse(date+'T'+hm+':00-03:00')-Date.now())/60000;
async function enroll(db,member,eventId,activityId,{fromPurchase=false}={}){
 const a=await db.prepare(`SELECT a.*,${takenSql} taken,e.starts_at ev_start,e.status ev_status FROM pop_live_event_activities a JOIN pop_live_events e ON e.id=a.event_id WHERE a.id=? AND a.event_id=?`).bind(activityId,eventId).first();
 if(!a||a.ev_status!=='published')fail('ATIVIDADE_NAO_ENCONTRADA',404);
 const day=String(a.ev_start).slice(0,10);
 if(minutesTo(day,a.starts_at)<0)fail('ATIVIDADE_JA_COMECOU',409);
 const bal=await balance(db,eventId,member.id);
 if(bal.mine.some(m=>m.activity_id===a.id))return {status:'enrolled',already:true};
 const clash=bal.mine.find(m=>m.starts_at<a.ends_at&&a.starts_at<m.ends_at);if(clash)fail('HORARIO_CONFLITA:'+nameOf(clash),409);
 const held=fromPurchase?1:0;if(Number(a.taken)-held>=a.seats)fail('ESGOTADO',409);
 const kind=canUse(bal,a);if(!kind)fail(a.is_main?'SEM_DIREITO_ATIVIDADE_PRINCIPAL':'SEM_SALDO',409);
 await db.prepare('INSERT INTO pop_live_event_enrollments(event_id,activity_id,member_id,kind) VALUES(?,?,?,?)').bind(eventId,a.id,member.id,kind).run();
 return {status:'enrolled',kind,activity:nameOf(a)};
}
async function autoEnroll(db,member,purchase){
 const joined=[];const tt=await db.prepare('SELECT main_name FROM pop_live_event_ticket_types WHERE id=?').bind(purchase.ticket_type_id).first();
 if(purchase.want_activity_id){try{const r=await enroll(db,member,purchase.event_id,purchase.want_activity_id,{fromPurchase:false});if(!r.already)joined.push(r.activity)}catch{}}
 if(tt?.main_name){
  const bal=await balance(db,purchase.event_id,member.id),m=bal.mains[tt.main_name];
  if(m&&m.rights-m.used>0){const sessions=await rows(db.prepare(`SELECT a.id,a.seats,${takenSql} taken FROM pop_live_event_activities a WHERE a.event_id=? AND a.is_main=1 AND COALESCE(NULLIF(a.name,''),a.activity_type)=?`).bind(purchase.event_id,tt.main_name));
   const open=sessions.filter(s=>Number(s.taken)<s.seats);if(sessions.length===1&&open.length===1){try{const r=await enroll(db,member,purchase.event_id,open[0].id);if(!r.already)joined.push(r.activity)}catch{}}}
 }
 return joined;
}
export async function studentEventRoute(db,member,action,method,url,body){
 await ensureEventTables(db);
 if(action==='events'&&method==='GET')return {events:await studentEvents(db,member.id)};
 const eventId=Number(url.searchParams.get('event_id')||body?.event_id||0);if(!Number.isSafeInteger(eventId)||eventId<1)fail('EVENTO_INVALIDO');
 if(action==='event'&&method==='GET')return eventDetail(db,eventId,member.id);
 if(method!=='POST')fail('METODO_INVALIDO',405);
 if(action==='enroll')return enroll(db,member,eventId,Number(body.activity_id));
 if(action==='leave'){
  const a=await db.prepare('SELECT a.starts_at,e.starts_at ev_start FROM pop_live_event_activities a JOIN pop_live_events e ON e.id=a.event_id WHERE a.id=? AND a.event_id=?').bind(Number(body.activity_id),eventId).first();
  if(!a)fail('ATIVIDADE_NAO_ENCONTRADA',404);
  if(minutesTo(String(a.ev_start).slice(0,10),a.starts_at)<LEAVE_BEFORE_MIN)fail('SAIDA_ATE_2H_ANTES',409);
  await db.prepare('DELETE FROM pop_live_event_enrollments WHERE activity_id=? AND member_id=?').bind(Number(body.activity_id),member.id).run();
  return {status:'left'};
 }
 if(action==='buy'){
  const t=await db.prepare(`SELECT t.*,${soldSql} sold,e.status ev_status,e.sales_open,e.unit ev_unit,e.starts_at ev_start,e.ends_at ev_end FROM pop_live_event_ticket_types t JOIN pop_live_events e ON e.id=t.event_id WHERE t.id=? AND t.event_id=? AND t.active=1`).bind(Number(body.ticket_type_id),eventId).first();
  if(!t||t.ev_status!=='published')fail('INGRESSO_INDISPONIVEL',404);
  if(!Number(t.sales_open))fail('INSCRICOES_ENCERRADAS',409);
  if(Date.parse(String(t.ev_end||t.ev_start).replace(' ','T')+':00-03:00')<Date.now())fail('EVENTO_ENCERRADO',409);
  if(t.stock&&Number(t.sold)>=t.stock)fail('ESGOTADO',409);
  const size=String(body.shirt_size||'');if(SHIRT.test(t.gifts)&&!['PP','P','M','G','GG','XG'].includes(size))fail('ESCOLHA_O_TAMANHO_DA_CAMISETA');
  let want=Number(body.activity_id)||null;
  if(want){const a=await db.prepare(`SELECT a.*,${takenSql} taken FROM pop_live_event_activities a WHERE a.id=? AND a.event_id=?`).bind(want,eventId).first();
   if(!a)want=null;else{if(Number(a.taken)>=a.seats)fail('ESGOTADO',409);if(a.is_main?t.main_name!==nameOf(a):Number(t.extra_credits)===0)fail('INGRESSO_NAO_DA_ACESSO_A_ATIVIDADE',409)}}
  if(!t.price_cents){
   const r=await db.prepare("INSERT INTO pop_live_event_purchases(event_id,ticket_type_id,member_id,status,amount_cents,shirt_size,want_activity_id) VALUES(?,?,?,'confirmed',0,?,?)").bind(eventId,t.id,member.id,size||null,want).run();
   const p={id:Number(r.meta?.last_row_id),event_id:eventId,ticket_type_id:t.id,want_activity_id:want};
   await db.prepare('UPDATE pop_live_event_purchases SET want_activity_id=NULL WHERE id=?').bind(p.id).run();
   return {status:'confirmed',joined:await autoEnroll(db,member,p)};
  }
  const unit=t.ev_unit==='both'?(body.unit==='gym'?'gym':'bike'):t.ev_unit;
  const orderId=crypto.randomUUID();
  const r=await db.prepare("INSERT INTO pop_live_event_purchases(event_id,ticket_type_id,member_id,status,order_id,amount_cents,shirt_size,want_activity_id) VALUES(?,?,?,'pending',?,?,?,?)").bind(eventId,t.id,member.id,orderId,t.price_cents,size||null,want).run();
  await db.prepare("INSERT INTO club_pix_orders(id,member_id,unit,item_type,item_id,amount_cents,status,idempotency_key) VALUES(?,?,?,?,?,?,'created',?)").bind(orderId,member.id,unit,TICKET_ITEM,String(r.meta?.last_row_id),t.price_cents,crypto.randomUUID()).run();
  return {status:'pending',orderId,amountCents:t.price_cents};
 }
 fail('ACAO_INVALIDA');
}

// ---------- Pix (store checkout hooks) ----------
export async function eventOrderValid(db,order){
 await ensureEventTables(db);
 if(order.item_type===TICKET_ITEM){
  const p=await db.prepare(`SELECT p.status,p.amount_cents,t.price_cents,t.active,e.status ev_status,e.sales_open FROM pop_live_event_purchases p JOIN pop_live_event_ticket_types t ON t.id=p.ticket_type_id JOIN pop_live_events e ON e.id=p.event_id WHERE p.id=? AND p.order_id=?`).bind(Number(order.item_id),order.id).first();
  if(!p||p.status!=='pending'||!Number(p.active)||p.ev_status!=='published'||!Number(p.sales_open))return 'ITEM_INDISPONIVEL';
  if(Number(p.price_cents)!==Number(order.amount_cents))return 'PRECO_ALTERADO';
  return '';
 }
 const e=await db.prepare("SELECT status,sales_open,price_cents FROM pop_live_events WHERE id=?").bind(Number(order.item_id)).first();
 if(!e||e.status!=='published'||!Number(e.sales_open))return 'ITEM_INDISPONIVEL';
 if(Number(e.price_cents)!==Number(order.amount_cents))return 'PRECO_ALTERADO';
 return '';
}
export async function eventOrderSettled(db,order,status){
 await ensureEventTables(db);
 if(order.item_type===TICKET_ITEM){
  const p=await db.prepare('SELECT * FROM pop_live_event_purchases WHERE id=? AND order_id=?').bind(Number(order.item_id),order.id).first();if(!p)return [];
  if(status==='approved'){
   const r=await db.prepare("UPDATE pop_live_event_purchases SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(p.id).run();
   if(!Number(r.meta?.changes))return [];
   const joined=await autoEnroll(db,{id:p.member_id},p);
   await db.prepare('UPDATE pop_live_event_purchases SET want_activity_id=NULL WHERE id=?').bind(p.id).run();
   return joined;
  }
  if(['cancelled','expired','rejected'].includes(status))await db.prepare("UPDATE pop_live_event_purchases SET status='cancelled',want_activity_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'").bind(p.id).run();
  return [];
 }
 if(status==='approved')await db.prepare("UPDATE pop_live_event_tickets SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status!='paid'").bind(order.id).run();
 else if(['cancelled','expired','rejected'].includes(status))await db.prepare("UPDATE pop_live_event_tickets SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='pending'").bind(order.id).run();
 return [];
}
