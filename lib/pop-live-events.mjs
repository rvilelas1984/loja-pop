// Pop Live events and special classes: created in the admin "Central Pop Live", listed on the Pop Live dash.
// Free events reserve a spot at once; paid events reuse the store's Pix checkout (club_pix_orders + Mercado Pago):
// the ticket order is an ordinary Pix order of item_type 'pop_live_event', and the ticket is confirmed when the
// order is reconciled as approved. Capacity counts confirmed tickets and Pix charges still open (30 min).
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const rows=async q=>(await q.all()).results||[];
const text=(v,max)=>String(v??'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export const EVENT_ITEM='pop_live_event';
const PENDING_MIN=30;

export async function ensureEventTables(db){
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_events(id INTEGER PRIMARY KEY AUTOINCREMENT,unit TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'event',
   name TEXT NOT NULL,description TEXT,starts_at TEXT NOT NULL,location TEXT,capacity INTEGER NOT NULL DEFAULT 0,price_cents INTEGER NOT NULL DEFAULT 0,
   status TEXT NOT NULL DEFAULT 'draft',sales_open INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pop_live_event_tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,event_id INTEGER NOT NULL,member_id INTEGER NOT NULL,
   status TEXT NOT NULL,order_id TEXT,amount_cents INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
   UNIQUE(event_id,member_id))`),
  db.prepare('CREATE INDEX IF NOT EXISTS pop_live_event_tickets_event ON pop_live_event_tickets(event_id,status)')
 ]);
}

// Validates the admin form. Price in reais ("49,90"), capacity 0 = unlimited.
export function eventInput(b){
 const unit=String(b.unit||'');if(!['bike','gym'].includes(unit))fail('UNIDADE_INVALIDA');
 const kind=['event','special_class'].includes(b.kind)?b.kind:'event';
 const name=text(b.name,120);if(name.length<3)fail('NOME_OBRIGATORIO');
 const date=String(b.date||''),time=String(b.time||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z')))fail('DATA_INVALIDA');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))fail('HORARIO_INVALIDO');
 const capacity=Number(b.capacity??0);if(!Number.isInteger(capacity)||capacity<0||capacity>5000)fail('VAGAS_INVALIDAS');
 const paid=b.paid===true||b.paid==='true';
 const price=paid?Math.round(Number(String(b.price??'').replace(',','.'))*100):0;
 if(paid&&!(price>=100&&price<=500000))fail('VALOR_INVALIDO');
 const status=['draft','published','cancelled'].includes(b.status)?b.status:'draft';
 return {unit,kind,name,description:text(b.description,600),starts_at:date+' '+time,location:text(b.location,120),capacity,price_cents:price,status,sales_open:b.sales_open===false?0:1};
}

const counts=`(SELECT COUNT(*) FROM pop_live_event_tickets t WHERE t.event_id=e.id AND (t.status IN ('confirmed','paid') OR (t.status='pending' AND datetime(t.created_at)>datetime('now','-${PENDING_MIN} minutes')))) taken`;

export async function adminEvents(request,db,url,json){
 await ensureEventTables(db);
 const id=Number(url.searchParams.get('id')||0);
 if(request.method==='GET'){
  if(id){
   const event=await db.prepare(`SELECT e.*,${counts} FROM pop_live_events e WHERE e.id=?`).bind(id).first();if(!event)fail('EVENTO_NAO_ENCONTRADO',404);
   const tickets=await rows(db.prepare(`SELECT t.id,t.status,t.amount_cents,t.order_id,t.created_at,m.first_name,m.last_name,m.cpf_last4,
     CASE WHEN m.evo_member_id IS NULL AND m.gym_client_id IS NULL THEN 1 ELSE 0 END visitor FROM pop_live_event_tickets t LEFT JOIN members m ON m.id=t.member_id
     WHERE t.event_id=? ORDER BY t.created_at`).bind(id));
   return json({ok:true,event,tickets});
  }
  const events=await rows(db.prepare(`SELECT e.*,${counts} FROM pop_live_events e WHERE e.status!='cancelled' OR e.starts_at>=datetime('now','-3 hours','-30 days') ORDER BY e.starts_at DESC LIMIT 100`));
  return json({ok:true,events});
 }
 let b={};try{b=await request.json()}catch{}
 if(request.method==='POST'){
  const e=eventInput(b);
  const r=await db.prepare('INSERT INTO pop_live_events(unit,kind,name,description,starts_at,location,capacity,price_cents,status,sales_open) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .bind(e.unit,e.kind,e.name,e.description,e.starts_at,e.location,e.capacity,e.price_cents,e.status,e.sales_open).run();
  return json({ok:true,id:Number(r.meta?.last_row_id)});
 }
 if(request.method==='PUT'){
  if(!id)fail('EVENTO_INVALIDO');const e=eventInput(b);
  const old=await db.prepare('SELECT price_cents,(SELECT COUNT(*) FROM pop_live_event_tickets WHERE event_id=? AND status IN (\'paid\',\'pending\')) sold FROM pop_live_events WHERE id=?').bind(id,id).first();
  if(!old)fail('EVENTO_NAO_ENCONTRADO',404);
  if(Number(old.sold)>0&&Number(old.price_cents)!==e.price_cents)fail('VALOR_NAO_PODE_MUDAR_COM_INGRESSOS_VENDIDOS',409);
  await db.prepare('UPDATE pop_live_events SET unit=?,kind=?,name=?,description=?,starts_at=?,location=?,capacity=?,price_cents=?,status=?,sales_open=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
   .bind(e.unit,e.kind,e.name,e.description,e.starts_at,e.location,e.capacity,e.price_cents,e.status,e.sales_open,id).run();
  return json({ok:true,id});
 }
 fail('METODO_INVALIDO',405);
}

// Upcoming published events for the dash, with this member's ticket.
export async function studentEvents(db,memberId){
 await ensureEventTables(db);
 const list=await rows(db.prepare(`SELECT e.id,e.unit,e.kind,e.name,e.description,e.starts_at,e.location,e.capacity,e.price_cents,e.sales_open,${counts},
   (SELECT t.status FROM pop_live_event_tickets t WHERE t.event_id=e.id AND t.member_id=?) my_status,(SELECT t.order_id FROM pop_live_event_tickets t WHERE t.event_id=e.id AND t.member_id=?) my_order
   FROM pop_live_events e WHERE e.status='published' AND e.starts_at>=datetime('now','-3 hours','-2 hours') ORDER BY e.starts_at LIMIT 12`).bind(memberId,memberId));
 return list.map(e=>({...e,left:e.capacity?Math.max(0,e.capacity-Number(e.taken)):null}));
}

// Free: confirmed at once. Paid: a Pix order (status 'created') the store checkout charges; the ticket stays pending.
export async function takeTicket(db,member,eventId){
 await ensureEventTables(db);
 const e=await db.prepare(`SELECT e.*,${counts} FROM pop_live_events e WHERE e.id=? AND e.status='published'`).bind(eventId).first();
 if(!e)fail('EVENTO_NAO_ENCONTRADO',404);
 if(!Number(e.sales_open))fail('INSCRICOES_ENCERRADAS',409);
 if(Date.parse(e.starts_at.replace(' ','T')+':00-03:00')<Date.now())fail('EVENTO_JA_COMECOU',409);
 const mine=await db.prepare('SELECT * FROM pop_live_event_tickets WHERE event_id=? AND member_id=?').bind(eventId,member.id).first();
 if(mine&&['confirmed','paid'].includes(mine.status))return {status:mine.status,already:true};
 const openPending=mine&&mine.status==='pending'&&mine.order_id;
 if(!openPending&&e.capacity&&Number(e.taken)>=e.capacity)fail('ESGOTADO',409);
 if(!e.price_cents){
  await db.prepare(`INSERT INTO pop_live_event_tickets(event_id,member_id,status) VALUES(?,?,'confirmed')
   ON CONFLICT(event_id,member_id) DO UPDATE SET status='confirmed',order_id=NULL,updated_at=CURRENT_TIMESTAMP`).bind(eventId,member.id).run();
  return {status:'confirmed'};
 }
 if(openPending){
  const o=await db.prepare("SELECT id,status FROM club_pix_orders WHERE id=? AND member_id=?").bind(mine.order_id,member.id).first();
  if(o&&['created','creating','pending'].includes(o.status))return {status:'pending',orderId:o.id,amountCents:e.price_cents};
 }
 const orderId=crypto.randomUUID();
 await db.batch([
  db.prepare("INSERT INTO club_pix_orders(id,member_id,unit,item_type,item_id,amount_cents,status,idempotency_key) VALUES(?,?,?,?,?,?,'created',?)").bind(orderId,member.id,e.unit,EVENT_ITEM,String(e.id),e.price_cents,crypto.randomUUID()),
  db.prepare(`INSERT INTO pop_live_event_tickets(event_id,member_id,status,order_id,amount_cents) VALUES(?,?,'pending',?,?)
   ON CONFLICT(event_id,member_id) DO UPDATE SET status='pending',order_id=excluded.order_id,amount_cents=excluded.amount_cents,created_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).bind(eventId,member.id,orderId,e.price_cents)
 ]);
 return {status:'pending',orderId,amountCents:e.price_cents};
}

// Called by the Pix checkout before charging: the event is still on sale at the same price.
export async function eventOrderValid(db,order){
 await ensureEventTables(db);
 const e=await db.prepare("SELECT status,sales_open,price_cents,starts_at FROM pop_live_events WHERE id=?").bind(Number(order.item_id)).first();
 if(!e||e.status!=='published'||!Number(e.sales_open))return 'ITEM_INDISPONIVEL';
 if(Number(e.price_cents)!==Number(order.amount_cents))return 'PRECO_ALTERADO';
 return '';
}

// Called by the Pix reconciliation: the paid order confirms the ticket; a failed one releases the spot.
export async function eventOrderSettled(db,order,status){
 await ensureEventTables(db);
 if(status==='approved')await db.prepare("UPDATE pop_live_event_tickets SET status='paid',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status!='paid'").bind(order.id).run();
 else if(['cancelled','expired','rejected'].includes(status))await db.prepare("UPDATE pop_live_event_tickets SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='pending'").bind(order.id).run();
}
