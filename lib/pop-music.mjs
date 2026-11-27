// Pop Music Experience: monthly music survey for active Bike Pop students.
// A student picks rhythms, 1-5 artists per rhythm (catalog or own suggestion) and one official Bike Pop teacher
// per rhythm. One final answer per student per month (UNIQUE(month,member_id), written in one D1 batch).
// Admin "Playlists": rankings from real answers, catalog management, suggestions review and themed classes log.
import {readAccessSettings,activeContractWhere} from './unit-access.mjs';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status})};
const rows=async q=>(await q.all()).results||[];
const clean=(v,max)=>String(v??'').replace(/[\u0000-\u001f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
export const nameKey=v=>clean(v,80).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const MAX_ARTISTS=5,DEFAULT_FIRST_MONTH='2026-12';
export const ADMIN_PAGE='/admin-playlists.html';

// São Paulo has no DST since 2019: UTC-3.
export function spMonth(now=Date.now()){const d=new Date(now-3*3600e3);return d.toISOString().slice(0,7)}
export function prevMonth(m){let [y,mm]=m.split('-').map(Number);mm-=1;if(!mm){mm=12;y-=1}return y+'-'+String(mm).padStart(2,'0')}
const nextMonth=m=>{let [y,mm]=m.split('-').map(Number);mm+=1;if(mm>12){mm=1;y+=1}return y+'-'+String(mm).padStart(2,'0')};
const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m||''));

const SEED=[
 ['pop','Pop Internacional','🎤',['Dua Lipa','Taylor Swift','The Weeknd','Lady Gaga','Bruno Mars','Beyoncé','Rihanna','Ariana Grande','Sabrina Carpenter','Billie Eilish','Ed Sheeran','Harry Styles','Katy Perry','Justin Bieber','Miley Cyrus','Olivia Rodrigo','Doja Cat','Coldplay','Imagine Dragons','Charli XCX']],
 ['pop-br','Pop Nacional','💖',['Anitta','Luísa Sonza','Ludmilla','Pabllo Vittar','IZA','Gloria Groove','Lexa','Jão','Marina Sena','Pedro Sampaio','Vitor Kley','Manu Gavassi']],
 ['funk','Funk','🔊',['MC Kevinho','Pedro Sampaio','Ludmilla','Anitta','MC Livinho','Kevin O Chris','MC Ryan SP','Dennis DJ','MC Hariel','Pocah','MC Daniel','Lexa']],
 ['sertanejo','Sertanejo','🤠',['Henrique & Juliano','Jorge & Mateus','Gusttavo Lima','Marília Mendonça','Maiara & Maraisa','Zé Neto & Cristiano','Ana Castela','Simone Mendes','Luan Santana','Matheus & Kauan','Israel & Rodolffo','Wesley Safadão']],
 ['eletronica','Eletrônica','🎧',['Alok','David Guetta','Calvin Harris','Avicii','Martin Garrix','Tiësto','Vintage Culture','Kygo','Marshmello','The Chainsmokers','Swedish House Mafia','Fred again..','Bhaskar','Dubdogz']],
 ['rock','Rock','🎸',['Queen','Foo Fighters','Linkin Park','AC/DC','Bon Jovi',"Guns N' Roses",'Red Hot Chili Peppers','Arctic Monkeys','The Killers','Imagine Dragons','Legião Urbana','Capital Inicial','Charlie Brown Jr.','Skank']],
 ['hip-hop','Hip Hop & Rap','🎙️',['Eminem','Drake','Kendrick Lamar','Travis Scott','Post Malone','Snoop Dogg','50 Cent','Matuê',"Racionais MC's",'Emicida','Filipe Ret','L7nnon','Orochi','Djonga']],
 ['latino','Latino & Reggaeton','💃',['Bad Bunny','J Balvin','Shakira','Daddy Yankee','Karol G','Maluma','Ozuna','Rosalía','Enrique Iglesias','Pitbull','Nicky Jam','Luis Fonsi']],
 ['pagode','Pagode & Samba','🥁',['Thiaguinho','Péricles','Ferrugem','Sorriso Maroto','Menos É Mais','Grupo Revelação','Turma do Pagode','Dilsinho','Mumuzinho','Belo','Zeca Pagodinho','Exaltasamba','Xande de Pilares']],
 ['axe','Axé','☀️',['Ivete Sangalo','Claudia Leitte','Bell Marques','Léo Santana','Daniela Mercury','Harmonia do Samba','Chiclete com Banana','Psirico','Parangolé','Durval Lelys','É o Tchan']],
 ['flashback','Flashback 80s & 90s','📼',['Michael Jackson','Madonna','Whitney Houston','Backstreet Boys','Spice Girls','Britney Spears','a-ha','Cyndi Lauper','Bee Gees','ABBA','Earth, Wind & Fire','Prince','Tina Turner','Eurythmics','Ace of Base']],
 ['forro','Forró & Piseiro','🪗',['Wesley Safadão','Xand Avião','João Gomes','Vitor Fernandes','Barões da Pisadinha','Zé Vaqueiro','Calcinha Preta','Mano Walter','Tarcísio do Acordeon','Nattan','Raí Saia Rodada','Luiz Gonzaga']],
 ['k-pop','K-Pop','✨',['BTS','BLACKPINK','Stray Kids','TWICE','NewJeans','SEVENTEEN','aespa','ATEEZ','LE SSERAFIM','ITZY','Jungkook','Jennie']],
 ['mpb','MPB','🌿',['Caetano Veloso','Gilberto Gil','Djavan','Marisa Monte','Seu Jorge','Tim Maia','Jorge Ben Jor','Lulu Santos','Anavitória','Tiago Iorc','Vanessa da Mata','Ana Carolina','Gal Costa','Elis Regina']],
];

let ready=false;
export async function ensurePopMusic(db){
 if(ready)return;
 await db.batch([
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_rhythms(id INTEGER PRIMARY KEY AUTOINCREMENT,slug TEXT NOT NULL UNIQUE,name TEXT NOT NULL,emoji TEXT,sort INTEGER NOT NULL DEFAULT 0,
   active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_artists(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,name_key TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,
   origin TEXT NOT NULL DEFAULT 'catalog',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_artist_rhythms(artist_id INTEGER NOT NULL,rhythm_id INTEGER NOT NULL,PRIMARY KEY(artist_id,rhythm_id))`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_artist_rhythms_rhythm ON pm_artist_rhythms(rhythm_id)'),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_campaigns(month TEXT PRIMARY KEY,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,notes TEXT)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_votes(id INTEGER PRIMARY KEY AUTOINCREMENT,month TEXT NOT NULL,member_id INTEGER NOT NULL,recovered_from TEXT,
   created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(month,member_id))`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_votes_member ON pm_votes(member_id,month)'),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_vote_rhythms(vote_id INTEGER NOT NULL,rhythm_id INTEGER NOT NULL,teacher_name TEXT NOT NULL,PRIMARY KEY(vote_id,rhythm_id))`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_vote_rhythms_rhythm ON pm_vote_rhythms(rhythm_id,teacher_name)'),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_suggestions(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,name_key TEXT NOT NULL,rhythm_id INTEGER NOT NULL,first_month TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'pending',artist_id INTEGER,reviewed_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(name_key,rhythm_id))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_vote_artists(id INTEGER PRIMARY KEY AUTOINCREMENT,vote_id INTEGER NOT NULL,rhythm_id INTEGER NOT NULL,artist_id INTEGER,suggestion_id INTEGER,
   CHECK((artist_id IS NULL)<>(suggestion_id IS NULL)))`),
  db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS pm_vote_artists_uniq ON pm_vote_artists(vote_id,rhythm_id,COALESCE(artist_id,0),COALESCE(suggestion_id,0))'),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_vote_artists_artist ON pm_vote_artists(artist_id)'),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_vote_artists_suggestion ON pm_vote_artists(suggestion_id)'),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_themed_classes(id INTEGER PRIMARY KEY AUTOINCREMENT,month TEXT NOT NULL,rhythm_id INTEGER,teacher_name TEXT NOT NULL,class_name TEXT NOT NULL,
   class_date TEXT,class_time TEXT,artists TEXT,evo_session_id TEXT,notes TEXT,created_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_themed_classes_month ON pm_themed_classes(month)'),
 ]);
 const has=await db.prepare('SELECT COUNT(*) n FROM pm_rhythms').first();
 if(!Number(has?.n)){
  const st=[];SEED.forEach(([slug,name,emoji],i)=>st.push(db.prepare('INSERT OR IGNORE INTO pm_rhythms(slug,name,emoji,sort) VALUES(?,?,?,?)').bind(slug,name,emoji,i+1)));
  const seen=new Set();for(const [,,,artists] of SEED)for(const a of artists){const k=nameKey(a);if(seen.has(k))continue;seen.add(k);st.push(db.prepare('INSERT OR IGNORE INTO pm_artists(name,name_key) VALUES(?,?)').bind(a,k))}
  for(const [slug,,,artists] of SEED)for(const a of artists)st.push(db.prepare('INSERT OR IGNORE INTO pm_artist_rhythms(artist_id,rhythm_id) SELECT a.id,r.id FROM pm_artists a,pm_rhythms r WHERE a.name_key=? AND r.slug=?').bind(nameKey(a),slug));
  for(let i=0;i<st.length;i+=80)await db.batch(st.slice(i,i+80));
 }
 ready=true;
}

async function firstMonth(db){const r=await db.prepare("SELECT value FROM pm_settings WHERE key='first_month'").first();return validMonth(r?.value)?r.value:DEFAULT_FIRST_MONTH}

// Official Bike Pop teachers: instructors of the official EVO classes synced in D1 over the last 60 days.
let teacherCache={at:0,list:[]};
export async function officialTeachers(db,now=Date.now()){
 if(now-teacherCache.at<10*60e3&&teacherCache.list.length)return teacherCache.list;
 const list=(await rows(db.prepare(`SELECT instructor_name name,COUNT(*) classes FROM evo_attendance_sessions WHERE unit='bike' AND activity_date>=date('now','-60 days')
  AND trim(coalesce(instructor_name,''))<>'' GROUP BY instructor_name ORDER BY instructor_name COLLATE NOCASE`))).map(r=>clean(r.name,80)).filter(Boolean);
 teacherCache={at:now,list};return list;
}

async function catalog(db){
 const rhythms=await rows(db.prepare('SELECT id,slug,name,emoji FROM pm_rhythms WHERE active=1 ORDER BY sort,name'));
 const links=await rows(db.prepare('SELECT ar.rhythm_id,a.id,a.name FROM pm_artist_rhythms ar JOIN pm_artists a ON a.id=ar.artist_id JOIN pm_rhythms r ON r.id=ar.rhythm_id WHERE a.active=1 AND r.active=1 ORDER BY a.name COLLATE NOCASE'));
 for(const r of rhythms)r.artists=links.filter(l=>l.rhythm_id===r.id).map(l=>({id:l.id,name:l.name}));
 return rhythms;
}

async function voteDetail(db,voteId){
 const rh=await rows(db.prepare('SELECT vr.rhythm_id,vr.teacher_name teacher,r.name,r.emoji,r.active FROM pm_vote_rhythms vr JOIN pm_rhythms r ON r.id=vr.rhythm_id WHERE vr.vote_id=? ORDER BY r.sort,r.name').bind(voteId));
 const ar=await rows(db.prepare(`SELECT va.rhythm_id,va.artist_id,va.suggestion_id,COALESCE(a.name,s.name) name,COALESCE(a.active,1) active FROM pm_vote_artists va LEFT JOIN pm_artists a ON a.id=va.artist_id
  LEFT JOIN pm_suggestions s ON s.id=va.suggestion_id WHERE va.vote_id=? ORDER BY va.id`).bind(voteId));
 return rh.map(r=>({rhythm_id:r.rhythm_id,name:r.name,emoji:r.emoji,active:r.active,teacher:r.teacher,
  artists:ar.filter(a=>a.rhythm_id===r.rhythm_id).map(a=>a.artist_id?{id:a.artist_id,name:a.name,active:a.active}:{suggestion:a.name})}));
}

// Upcoming themed classes that answer a student's request (same rhythm voted in the last 3 months, or one of their artists).
export async function themedForMember(db,memberId,now=Date.now()){
 const today=new Date(now-3*3600e3).toISOString().slice(0,10),since=prevMonth(prevMonth(spMonth(now)));
 const mine=await rows(db.prepare(`SELECT vr.rhythm_id,vr.teacher_name,COALESCE(a.name,s.name) artist FROM pm_votes v JOIN pm_vote_rhythms vr ON vr.vote_id=v.id
  LEFT JOIN pm_vote_artists va ON va.vote_id=v.id AND va.rhythm_id=vr.rhythm_id LEFT JOIN pm_artists a ON a.id=va.artist_id LEFT JOIN pm_suggestions s ON s.id=va.suggestion_id
  WHERE v.member_id=? AND v.month>=?`).bind(memberId,since));
 if(!mine.length)return [];
 const classes=await rows(db.prepare(`SELECT t.id,t.class_name,t.class_date,t.class_time,t.teacher_name,t.rhythm_id,t.artists,r.name rhythm,r.emoji FROM pm_themed_classes t LEFT JOIN pm_rhythms r ON r.id=t.rhythm_id
  WHERE t.class_date>=? ORDER BY t.class_date,t.class_time LIMIT 20`).bind(today));
 const out=[];
 for(const c of classes){
  const wanted=String(c.artists||'').split(/[,;\n]/).map(nameKey).filter(Boolean);
  const artists=[...new Set(mine.filter(m=>m.artist&&wanted.includes(nameKey(m.artist))).map(m=>m.artist))];
  const byRhythm=mine.some(m=>m.rhythm_id===c.rhythm_id);
  if(!byRhythm&&!artists.length)continue;
  out.push({id:c.id,class_name:c.class_name,class_date:c.class_date,class_time:c.class_time,teacher:c.teacher_name,rhythm:c.rhythm,emoji:c.emoji,
   your_rhythm:byRhythm,your_teacher:mine.some(m=>m.rhythm_id===c.rhythm_id&&m.teacher_name===c.teacher_name),your_artists:artists});
 }
 return out.slice(0,5);
}

// Themed classes of the next 30 days (class theme is public to Bike Pop students): lets the "next class" card flag its playlist.
async function upcomingThemed(db,now=Date.now()){
 const today=new Date(now-3*3600e3).toISOString().slice(0,10),until=new Date(now-3*3600e3+30*864e5).toISOString().slice(0,10);
 return rows(db.prepare(`SELECT t.class_name,t.class_date,t.class_time,t.teacher_name teacher,t.artists,t.evo_session_id,r.name rhythm,r.emoji FROM pm_themed_classes t
  LEFT JOIN pm_rhythms r ON r.id=t.rhythm_id WHERE t.class_date BETWEEN ? AND ? ORDER BY t.class_date,t.class_time LIMIT 40`).bind(today,until));
}

// ---------- Student ----------
// member is the authenticated member (validated session); activeUnits comes from the official contract rules.
export async function studentPopMusic(request,db,url,json,{member,activeUnits,now=Date.now()}){
 await ensurePopMusic(db);
 const eligible=activeUnits.includes('bike');
 const month=spMonth(now),start=await firstMonth(db),open=month>=start;
 const action=url.searchParams.get('action')||'status';
 if(!eligible)return json({ok:false,error:'EXCLUSIVO_ALUNOS_BIKE_POP'},403);
 const vote=await db.prepare('SELECT id,created_at,recovered_from FROM pm_votes WHERE month=? AND member_id=?').bind(month,member.id).first();
 if(request.method==='GET'&&action==='status'){
  const prev=vote?null:await db.prepare('SELECT month FROM pm_votes WHERE member_id=? AND month<? ORDER BY month DESC LIMIT 1').bind(member.id,month).first();
  return json({ok:true,month,open,opens:open?null:start,voted:!!vote,voted_at:vote?.created_at||null,next_month:nextMonth(month),previous_month:prev?.month||null,themed:await themedForMember(db,member.id,now),upcoming_themed:await upcomingThemed(db,now)});
 }
 if(request.method==='GET'&&action==='mine'){
  const m=validMonth(url.searchParams.get('month'))?url.searchParams.get('month'):month;
  const v=m===month?vote:await db.prepare('SELECT id,created_at FROM pm_votes WHERE month=? AND member_id=?').bind(m,member.id).first();
  const history=await rows(db.prepare('SELECT month FROM pm_votes WHERE member_id=? ORDER BY month DESC LIMIT 24').bind(member.id));
  return json({ok:true,month:m,voted:!!v,voted_at:v?.created_at||null,choices:v?await voteDetail(db,v.id):[],history:history.map(h=>h.month),themed:await themedForMember(db,member.id,now)});
 }
 if(request.method==='GET'&&action==='form'){
  if(!open)return json({ok:false,error:'PESQUISA_AINDA_NAO_ABERTA',opens:start},409);
  if(vote)return json({ok:false,error:'JA_RESPONDEU_ESTE_MES'},409);
  const [rhythms,teachers]=await Promise.all([catalog(db),officialTeachers(db,now)]);
  let previous=null;
  if(url.searchParams.get('previous')==='1'){
   const pv=await db.prepare('SELECT id,month FROM pm_votes WHERE member_id=? AND month<? ORDER BY month DESC LIMIT 1').bind(member.id,month).first();
   if(pv)previous={month:pv.month,choices:await voteDetail(db,pv.id)};
  }
  return json({ok:true,month,rhythms,teachers,max_artists:MAX_ARTISTS,previous});
 }
 if(request.method==='POST'&&action==='submit'){
  if(!open)fail('PESQUISA_AINDA_NAO_ABERTA',409);
  if(vote)fail('JA_RESPONDEU_ESTE_MES',409);
  let b={};try{b=await request.json()}catch{}
  const picks=Array.isArray(b.rhythms)?b.rhythms:[];
  if(!picks.length)fail('ESCOLHA_AO_MENOS_UM_RITMO');
  const [rhythms,teachers]=await Promise.all([catalog(db),officialTeachers(db,now)]);
  const seenR=new Set(),plan=[];
  for(const p of picks){
   const r=rhythms.find(x=>x.id===Number(p.rhythm_id));if(!r)fail('RITMO_INVALIDO');if(seenR.has(r.id))fail('RITMO_REPETIDO');seenR.add(r.id);
   const ids=[...new Set((Array.isArray(p.artist_ids)?p.artist_ids:[]).map(Number))];
   for(const id of ids)if(!r.artists.some(a=>a.id===id))fail('ARTISTA_INVALIDO');
   const sug=[...new Map((Array.isArray(p.suggestions)?p.suggestions:[]).map(s=>clean(s,60)).filter(s=>nameKey(s).length>=2).map(s=>[nameKey(s),s])).entries()]
    .filter(([k])=>!r.artists.some(a=>nameKey(a.name)===k));
   const total=ids.length+sug.length;
   if(total<1)fail('ESCOLHA_AO_MENOS_UM_ARTISTA_POR_RITMO');if(total>MAX_ARTISTS)fail('MAXIMO_5_ARTISTAS_POR_RITMO');
   const teacher=teachers.find(t=>t===clean(p.teacher,80));if(!teacher)fail('ESCOLHA_UM_PROFESSOR_POR_RITMO');
   plan.push({r,ids,sug,teacher});
  }
  const recovered=validMonth(b.recovered_from)&&b.recovered_from<month?b.recovered_from:null;
  // One atomic batch: the vote row (UNIQUE month+member) and every detail row, or nothing.
  const st=[db.prepare('INSERT OR IGNORE INTO pm_campaigns(month) VALUES(?)').bind(month),
   db.prepare('INSERT INTO pm_votes(month,member_id,recovered_from) VALUES(?,?,?)').bind(month,member.id,recovered)];
  for(const {r,ids,sug,teacher} of plan){
   st.push(db.prepare('INSERT INTO pm_vote_rhythms(vote_id,rhythm_id,teacher_name) VALUES((SELECT id FROM pm_votes WHERE month=? AND member_id=?),?,?)').bind(month,member.id,r.id,teacher));
   for(const id of ids)st.push(db.prepare('INSERT INTO pm_vote_artists(vote_id,rhythm_id,artist_id) VALUES((SELECT id FROM pm_votes WHERE month=? AND member_id=?),?,?)').bind(month,member.id,r.id,id));
   for(const [k,name] of sug){
    st.push(db.prepare('INSERT OR IGNORE INTO pm_suggestions(name,name_key,rhythm_id,first_month) VALUES(?,?,?,?)').bind(name,k,r.id,month));
    st.push(db.prepare('INSERT INTO pm_vote_artists(vote_id,rhythm_id,suggestion_id) VALUES((SELECT id FROM pm_votes WHERE month=? AND member_id=?),?,(SELECT id FROM pm_suggestions WHERE name_key=? AND rhythm_id=?))').bind(month,member.id,r.id,k,r.id));
   }
  }
  try{await db.batch(st)}catch(e){if(/UNIQUE/i.test(String(e?.message||e)))fail('JA_RESPONDEU_ESTE_MES',409);throw e}
  const saved=await db.prepare('SELECT id,created_at FROM pm_votes WHERE month=? AND member_id=?').bind(month,member.id).first();
  return json({ok:true,month,voted_at:saved?.created_at,choices:await voteDetail(db,saved.id)});
 }
 fail('ACAO_INVALIDA');
}

// ---------- Admin ----------
// Eligible students of a month: members with an active Bike Pop contract, directly or through a shared-unit grant.
async function eligibleCount(db){
 // Same rules as the login (memberUnitAccess): direct active Bike contract, or an active Gym contract released for Bike.
 // People with both are counted once through the member link (members.evo_member_id / gym_client_id).
 let rules=[];try{rules=(await readAccessSettings(db)).rules.filter(r=>r.sourceUnit==='gym'&&r.targetUnit==='bike').map(r=>r.contractId)}catch{}
 const shared=rules.length?` UNION SELECT COALESCE('b'||m.evo_member_id,'g'||c.evo_member_id) k FROM evo_member_contracts c LEFT JOIN members m ON CAST(m.gym_client_id AS TEXT)=CAST(c.evo_member_id AS TEXT)
  WHERE c.unit='gym' AND ${activeContractWhere.replace(/\b(membership_status|start_date|end_date|cancel_date)\b/g,'c.$1')} AND CAST(c.id_membership AS TEXT) IN (${rules.map(()=>'?').join(',')})`:'';
 const r=await db.prepare(`SELECT COUNT(*) n FROM (SELECT 'b'||evo_member_id k FROM evo_member_contracts WHERE unit='bike' AND ${activeContractWhere}${shared})`).bind(...rules).first().catch(()=>null);
 return Number(r?.n||0);
}

function filterSql(f){
 const where=['v.month=?'],args=[f.month];
 if(f.rhythm){where.push('EXISTS(SELECT 1 FROM pm_vote_rhythms x WHERE x.vote_id=v.id AND x.rhythm_id=?)');args.push(f.rhythm)}
 if(f.teacher){where.push('EXISTS(SELECT 1 FROM pm_vote_rhythms x WHERE x.vote_id=v.id AND x.teacher_name=?)');args.push(f.teacher)}
 if(f.artist){where.push('EXISTS(SELECT 1 FROM pm_vote_artists x WHERE x.vote_id=v.id AND x.artist_id=?)');args.push(f.artist)}
 return {where:where.join(' AND '),args};
}

async function rankings(db,f){
 const {where,args}=filterSql(f);
 const V=`SELECT v.id FROM pm_votes v WHERE ${where}`;
 const q=(sql,...extra)=>rows(db.prepare(sql).bind(...args,...extra));
 const [participants,eligible,rh,art,artByR,teachByR,artByTeacher,newSugg,history]=await Promise.all([
  db.prepare(`SELECT COUNT(*) n FROM pm_votes v WHERE ${where}`).bind(...args).first(),
  eligibleCount(db),
  q(`SELECT r.id,r.name,r.emoji,COUNT(*) votes FROM pm_vote_rhythms vr JOIN pm_rhythms r ON r.id=vr.rhythm_id WHERE vr.vote_id IN (${V}) GROUP BY r.id ORDER BY votes DESC,r.name`),
  q(`SELECT COALESCE(a.name,s.name) name,CASE WHEN va.artist_id IS NULL THEN 1 ELSE 0 END suggested,COUNT(DISTINCT va.vote_id) votes FROM pm_vote_artists va LEFT JOIN pm_artists a ON a.id=va.artist_id
     LEFT JOIN pm_suggestions s ON s.id=va.suggestion_id WHERE va.vote_id IN (${V}) GROUP BY COALESCE('a'||va.artist_id,'s'||s.name_key) ORDER BY votes DESC,name LIMIT 50`),
  q(`SELECT r.name rhythm,COALESCE(a.name,s.name) name,COUNT(*) votes FROM pm_vote_artists va JOIN pm_rhythms r ON r.id=va.rhythm_id LEFT JOIN pm_artists a ON a.id=va.artist_id
     LEFT JOIN pm_suggestions s ON s.id=va.suggestion_id WHERE va.vote_id IN (${V}) GROUP BY r.id,COALESCE('a'||va.artist_id,'s'||va.suggestion_id) ORDER BY r.sort,votes DESC,name`),
  q(`SELECT r.name rhythm,vr.teacher_name teacher,COUNT(*) votes FROM pm_vote_rhythms vr JOIN pm_rhythms r ON r.id=vr.rhythm_id WHERE vr.vote_id IN (${V}) GROUP BY r.id,vr.teacher_name ORDER BY r.sort,votes DESC`),
  q(`SELECT vr.teacher_name teacher,r.name rhythm,COALESCE(a.name,s.name) name,COUNT(*) votes FROM pm_vote_rhythms vr JOIN pm_vote_artists va ON va.vote_id=vr.vote_id AND va.rhythm_id=vr.rhythm_id
     JOIN pm_rhythms r ON r.id=vr.rhythm_id LEFT JOIN pm_artists a ON a.id=va.artist_id LEFT JOIN pm_suggestions s ON s.id=va.suggestion_id WHERE vr.vote_id IN (${V})
     GROUP BY vr.teacher_name,r.id,COALESCE('a'||va.artist_id,'s'||va.suggestion_id) ORDER BY vr.teacher_name,votes DESC,name`),
  q(`SELECT s.id,s.name,r.name rhythm,s.status,COUNT(*) votes FROM pm_vote_artists va JOIN pm_suggestions s ON s.id=va.suggestion_id JOIN pm_rhythms r ON r.id=s.rhythm_id
     WHERE va.vote_id IN (${V}) GROUP BY s.id ORDER BY votes DESC,s.name`),
  rows(db.prepare(`SELECT v.month,COUNT(*) participants,(SELECT COUNT(DISTINCT COALESCE('a'||va.artist_id,'s'||va.suggestion_id)) FROM pm_vote_artists va JOIN pm_votes v2 ON v2.id=va.vote_id WHERE v2.month=v.month) artists,
     (SELECT COUNT(DISTINCT vr.rhythm_id) FROM pm_vote_rhythms vr JOIN pm_votes v3 ON v3.id=vr.vote_id WHERE v3.month=v.month) rhythms FROM pm_votes v GROUP BY v.month ORDER BY v.month DESC LIMIT 12`)),
 ]);
 const p=Number(participants?.n||0);
 return {month:f.month,filtered:!!(f.rhythm||f.artist||f.teacher),participants:p,eligible,participation_pct:eligible?Math.round(p*1000/eligible)/10:null,
  artists_voted:art.length,rhythms_selected:rh.length,rhythms:rh,artists:art,artists_by_rhythm:artByR,teachers_by_rhythm:teachByR,artists_by_teacher:artByTeacher,suggestions:newSugg,history};
}

// Themed classes vs regular classes (same teacher, same month) using the official attendance already synced in D1.
async function themedClasses(db,month){
 const list=await rows(db.prepare(`SELECT t.*,r.name rhythm,s.attendance_count attendance,s.activity_name evo_activity FROM pm_themed_classes t LEFT JOIN pm_rhythms r ON r.id=t.rhythm_id
  LEFT JOIN evo_attendance_sessions s ON s.unit='bike' AND CAST(s.id_activity_session AS TEXT)=t.evo_session_id WHERE t.month=? ORDER BY t.class_date,t.id`).bind(month));
 const linked=list.filter(t=>t.evo_session_id&&t.attendance!=null);
 let comparison=null;
 if(linked.length){
  const ids=linked.map(t=>t.evo_session_id),teachersL=[...new Set(linked.map(t=>t.teacher_name))];
  const reg=await db.prepare(`SELECT AVG(attendance_count) avg,COUNT(*) n FROM evo_attendance_sessions WHERE unit='bike' AND substr(activity_date,1,7)=? AND instructor_name IN (${teachersL.map(()=>'?').join(',')})
   AND CAST(id_activity_session AS TEXT) NOT IN (${ids.map(()=>'?').join(',')}) AND attendance_count IS NOT NULL`).bind(month,...teachersL,...ids).first();
  if(Number(reg?.n))comparison={themed_avg:Math.round(linked.reduce((s,t)=>s+Number(t.attendance||0),0)/linked.length*10)/10,themed_classes:linked.length,regular_avg:Math.round(Number(reg.avg)*10)/10,regular_classes:Number(reg.n)};
 }
 return {list,comparison};
}

export async function adminPopMusic(request,db,url,json,{role='admin',user=''}={}){
 await ensurePopMusic(db);
 const p=url.searchParams,action=p.get('action')||'overview',month=validMonth(p.get('month'))?p.get('month'):spMonth();
 if(request.method==='GET'){
  if(action==='overview'){
   const months=await rows(db.prepare('SELECT month FROM pm_votes GROUP BY month UNION SELECT month FROM pm_campaigns ORDER BY 1 DESC LIMIT 24'));
   return json({ok:true,first_month:await firstMonth(db),current_month:spMonth(),months:months.map(m=>m.month),teachers:await officialTeachers(db)});
  }
  if(action==='rankings')return json({ok:true,...await rankings(db,{month,rhythm:Number(p.get('rhythm'))||0,artist:Number(p.get('artist'))||0,teacher:clean(p.get('teacher'),80)})});
  if(action==='catalog'){
   const rhythms=await rows(db.prepare('SELECT id,slug,name,emoji,sort,active FROM pm_rhythms ORDER BY sort,name'));
   const artists=await rows(db.prepare(`SELECT a.id,a.name,a.active,a.origin,(SELECT group_concat(rhythm_id) FROM pm_artist_rhythms WHERE artist_id=a.id) rhythm_ids,
    (SELECT COUNT(*) FROM pm_vote_artists va WHERE va.artist_id=a.id) votes FROM pm_artists a ORDER BY a.name COLLATE NOCASE`));
   const suggestions=await rows(db.prepare(`SELECT s.id,s.name,s.status,s.first_month,s.rhythm_id,r.name rhythm,(SELECT COUNT(*) FROM pm_vote_artists va WHERE va.suggestion_id=s.id) votes
    FROM pm_suggestions s JOIN pm_rhythms r ON r.id=s.rhythm_id ORDER BY s.status='pending' DESC,votes DESC,s.name`));
   return json({ok:true,rhythms,artists:artists.map(a=>({...a,rhythm_ids:String(a.rhythm_ids||'').split(',').filter(Boolean).map(Number)})),suggestions});
  }
  if(action==='themed')return json({ok:true,month,...await themedClasses(db,month),sessions:await rows(db.prepare(`SELECT CAST(id_activity_session AS TEXT) id,activity_date date,start_time time,activity_name name,instructor_name teacher,attendance_count attendance
   FROM evo_attendance_sessions WHERE unit='bike' AND substr(activity_date,1,7)=? ORDER BY activity_date,start_time LIMIT 400`).bind(month))});
  fail('ACAO_INVALIDA');
 }
 if(request.method!=='POST')fail('METODO_INVALIDO',405);
 if(role!=='admin')fail('APENAS_ADMIN',403);
 let b={};try{b=await request.json()}catch{}
 const op=String(b.op||'');
 if(op==='settings'){if(!validMonth(b.first_month))fail('MES_INVALIDO');await db.prepare("INSERT INTO pm_settings(key,value) VALUES('first_month',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(b.first_month).run();return json({ok:true})}
 const rhythmIds=async ids=>{const list=[...new Set((Array.isArray(ids)?ids:[]).map(Number).filter(Boolean))];if(!list.length)fail('ESCOLHA_AO_MENOS_UM_RITMO');
  const ok=await rows(db.prepare(`SELECT id FROM pm_rhythms WHERE id IN (${list.map(()=>'?').join(',')})`).bind(...list));if(ok.length!==list.length)fail('RITMO_INVALIDO');return list};
 if(op==='rhythm_save'){
  const name=clean(b.name,40);if(name.length<2)fail('NOME_INVALIDO');const emoji=clean(b.emoji,8)||null;const id=Number(b.id)||0;
  if(id){await db.prepare('UPDATE pm_rhythms SET name=?,emoji=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,emoji,b.active===false?0:1,id).run();return json({ok:true,id})}
  const slug=nameKey(name).replace(/ /g,'-');if(await db.prepare('SELECT 1 FROM pm_rhythms WHERE slug=?').bind(slug).first())fail('RITMO_JA_EXISTE',409);
  const r=await db.prepare('INSERT INTO pm_rhythms(slug,name,emoji,sort) VALUES(?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM pm_rhythms))').bind(slug,name,emoji).run();return json({ok:true,id:Number(r.meta?.last_row_id)});
 }
 if(op==='artist_save'){
  const name=clean(b.name,60),k=nameKey(name);if(k.length<2)fail('NOME_INVALIDO');const ids=await rhythmIds(b.rhythm_ids);const id=Number(b.id)||0;
  const clash=await db.prepare('SELECT id FROM pm_artists WHERE name_key=?').bind(k).first();if(clash&&clash.id!==id)fail('ARTISTA_JA_EXISTE',409);
  let aid=id;
  if(id){await db.prepare('UPDATE pm_artists SET name=?,name_key=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(name,k,b.active===false?0:1,id).run()}
  else aid=Number((await db.prepare('INSERT INTO pm_artists(name,name_key) VALUES(?,?)').bind(name,k).run()).meta?.last_row_id);
  await db.batch([db.prepare('DELETE FROM pm_artist_rhythms WHERE artist_id=?').bind(aid),...ids.map(r=>db.prepare('INSERT INTO pm_artist_rhythms(artist_id,rhythm_id) VALUES(?,?)').bind(aid,r))]);
  return json({ok:true,id:aid});
 }
 if(op==='artist_active'){await db.prepare('UPDATE pm_artists SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(b.active?1:0,Number(b.id)).run();return json({ok:true})}
 if(op==='suggestion_add'){
  // Incorporate a student suggestion: create (or reuse) the artist, link it to the rhythm and keep the history (votes keep the suggestion id).
  const s=await db.prepare('SELECT * FROM pm_suggestions WHERE id=?').bind(Number(b.id)).first();if(!s)fail('SUGESTAO_NAO_ENCONTRADA',404);
  const name=clean(b.name||s.name,60),k=nameKey(name);if(k.length<2)fail('NOME_INVALIDO');
  await db.prepare("INSERT OR IGNORE INTO pm_artists(name,name_key,origin) VALUES(?,?,'suggestion')").bind(name,k).run();
  const a=await db.prepare('SELECT id FROM pm_artists WHERE name_key=?').bind(k).first();
  await db.batch([db.prepare('INSERT OR IGNORE INTO pm_artist_rhythms(artist_id,rhythm_id) VALUES(?,?)').bind(a.id,s.rhythm_id),db.prepare('UPDATE pm_artists SET active=1 WHERE id=?').bind(a.id),
   db.prepare("UPDATE pm_suggestions SET status='added',artist_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?").bind(a.id,s.id)]);
  return json({ok:true,artist_id:a.id});
 }
 if(op==='suggestion_dismiss'){await db.prepare("UPDATE pm_suggestions SET status='dismissed',reviewed_at=CURRENT_TIMESTAMP WHERE id=?").bind(Number(b.id)).run();return json({ok:true})}
 if(op==='themed_add'){
  const m=validMonth(b.month)?b.month:fail('MES_INVALIDO');const teacher=clean(b.teacher,80),name=clean(b.class_name,80);if(!teacher)fail('PROFESSOR_OBRIGATORIO');if(!name)fail('NOME_DA_AULA_OBRIGATORIO');
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.class_date||''))?b.class_date:null,time=/^\d{2}:\d{2}$/.test(String(b.class_time||''))?b.class_time:null;
  const r=await db.prepare('INSERT INTO pm_themed_classes(month,rhythm_id,teacher_name,class_name,class_date,class_time,artists,evo_session_id,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .bind(m,Number(b.rhythm_id)||null,teacher,name,date,time,clean(b.artists,300)||null,clean(b.evo_session_id,20)||null,clean(b.notes,300)||null,clean(user,80)||null).run();
  const rid=Number(b.rhythm_id)||0,since=prevMonth(prevMonth(m));
  const notified=rid?Number((await db.prepare('SELECT COUNT(DISTINCT v.member_id) n FROM pm_votes v JOIN pm_vote_rhythms vr ON vr.vote_id=v.id WHERE vr.rhythm_id=? AND v.month BETWEEN ? AND ?').bind(rid,since,m).first())?.n||0):0;
  return json({ok:true,id:Number(r.meta?.last_row_id),notified});
 }
 if(op==='themed_link'){await db.prepare('UPDATE pm_themed_classes SET evo_session_id=? WHERE id=?').bind(clean(b.evo_session_id,20)||null,Number(b.id)).run();return json({ok:true})}
 if(op==='themed_delete'){await db.prepare('DELETE FROM pm_themed_classes WHERE id=?').bind(Number(b.id)).run();return json({ok:true})}
 fail('OPERACAO_INVALIDA');
}
