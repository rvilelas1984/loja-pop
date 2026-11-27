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
   class_date TEXT,class_time TEXT,playlist_name TEXT,artists TEXT,evo_session_id TEXT,notes TEXT,created_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_themed_classes_month ON pm_themed_classes(month)'),
  // Public link: guests (identified by CPF + birth date, or "to identify"), one vote per CPF per month, short tokens, rate limits.
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_guests(id INTEGER PRIMARY KEY AUTOINCREMENT,cpf_hash TEXT NOT NULL UNIQUE,cpf_last4 TEXT,name TEXT,phone TEXT,first_name TEXT,
   member_id INTEGER,evo_bike_id TEXT,evo_gym_id TEXT,status TEXT NOT NULL DEFAULT 'pending',linked_at TEXT,linked_by TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_guests_status ON pm_guests(status)'),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_vote_keys(month TEXT NOT NULL,cpf_hash TEXT NOT NULL,member_ref INTEGER NOT NULL,PRIMARY KEY(month,cpf_hash))`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_link_tokens(token_hash TEXT PRIMARY KEY,guest_id INTEGER NOT NULL,expires_at TEXT NOT NULL,confirmed INTEGER NOT NULL DEFAULT 0)`),
  db.prepare(`CREATE TABLE IF NOT EXISTS pm_link_attempts(k TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  db.prepare('CREATE INDEX IF NOT EXISTS pm_link_attempts_k ON pm_link_attempts(k,created_at)'),
 ]);
 const columns=await rows(db.prepare('PRAGMA table_info(pm_themed_classes)'));
 if(!columns.some(c=>c.name==='playlist_name')){
  try{await db.prepare('ALTER TABLE pm_themed_classes ADD COLUMN playlist_name TEXT').run()}
  catch(err){if(!String(err).includes('duplicate column name'))throw err}
 }
 // Votes saved before the identity keys existed get their key (CPF of the member) once.
 await db.prepare('INSERT OR IGNORE INTO pm_vote_keys(month,cpf_hash,member_ref) SELECT v.month,m.cpf_hash,v.member_id FROM pm_votes v JOIN members m ON m.id=v.member_id WHERE NOT EXISTS(SELECT 1 FROM pm_vote_keys k WHERE k.month=v.month AND k.member_ref=v.member_id)').run().catch(()=>{});
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
export async function themedForMember(db,refs,now=Date.now()){
 refs=Array.isArray(refs)?refs:[refs];
 const today=new Date(now-3*3600e3).toISOString().slice(0,10),since=prevMonth(prevMonth(spMonth(now)));
 const mine=await rows(db.prepare(`SELECT vr.rhythm_id,vr.teacher_name,COALESCE(a.name,s.name) artist FROM pm_votes v JOIN pm_vote_rhythms vr ON vr.vote_id=v.id
  LEFT JOIN pm_vote_artists va ON va.vote_id=v.id AND va.rhythm_id=vr.rhythm_id LEFT JOIN pm_artists a ON a.id=va.artist_id LEFT JOIN pm_suggestions s ON s.id=va.suggestion_id
  WHERE v.member_id IN (${refs.map(()=>'?').join(',')}) AND v.month>=?`).bind(...refs,since));
 if(!mine.length)return [];
 const classes=await rows(db.prepare(`SELECT t.id,t.class_name,t.class_date,t.class_time,COALESCE((SELECT s.instructor_name FROM evo_attendance_sessions s WHERE s.unit='bike' AND (CAST(s.id_activity_session AS TEXT)=t.evo_session_id OR (t.evo_session_id IS NULL AND s.activity_date=t.class_date AND substr(s.start_time,1,5)=t.class_time)) AND trim(coalesce(s.instructor_name,''))<>'' LIMIT 1),t.teacher_name) teacher_name,t.rhythm_id,t.artists,r.name rhythm,r.emoji FROM pm_themed_classes t LEFT JOIN pm_rhythms r ON r.id=t.rhythm_id
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
 return rows(db.prepare(`SELECT t.id,t.class_name,t.class_date,t.class_time,COALESCE((SELECT s.instructor_name FROM evo_attendance_sessions s WHERE s.unit='bike' AND (CAST(s.id_activity_session AS TEXT)=t.evo_session_id OR (t.evo_session_id IS NULL AND s.activity_date=t.class_date AND substr(s.start_time,1,5)=t.class_time)) AND trim(coalesce(s.instructor_name,''))<>'' LIMIT 1),t.teacher_name) teacher,t.artists,t.evo_session_id,r.name rhythm,r.emoji FROM pm_themed_classes t
  LEFT JOIN pm_rhythms r ON r.id=t.rhythm_id WHERE t.class_date BETWEEN ? AND ? ORDER BY t.class_date,t.class_time LIMIT 40`).bind(today,until));
}

// "Playlists especiais" card: every upcoming themed class, flagged when it answers this student's request.
async function themedPayload(db,refs,now){
 const [mine,up]=await Promise.all([themedForMember(db,refs,now),upcomingThemed(db,now)]);const ids=new Set(mine.map(t=>t.id));
 return {themed:mine,upcoming_themed:up.map(t=>({...t,mine:ids.has(t.id)}))};
}

// ---------- Student ----------
// member is the authenticated member (validated session); activeUnits comes from the official contract rules.
// A person can vote through the Club Pop app (member_id>0) or the public link (member_id = -guest.id).
// refs = every vote owner that is this person; pm_vote_keys (UNIQUE month+cpf_hash) blocks a second vote atomically.
async function memberRefs(db,member){
 const g=await rows(db.prepare("SELECT id FROM pm_guests WHERE status!='discarded' AND (member_id=? OR cpf_hash=?)").bind(member.id,member.cpf_hash||'-'));
 return [member.id,...g.map(x=>-x.id)];
}
async function guestRefs(db,guest){
 const refs=[-guest.id];
 if(guest.member_id)refs.push(guest.member_id);
 const m=await db.prepare('SELECT id FROM members WHERE cpf_hash=?').bind(guest.cpf_hash).first();if(m&&!refs.includes(m.id))refs.push(m.id);
 const sib=await rows(db.prepare("SELECT id FROM pm_guests WHERE id!=? AND status!='discarded' AND ((member_id IS NOT NULL AND member_id=?) OR (evo_bike_id IS NOT NULL AND evo_bike_id=?) OR (evo_gym_id IS NOT NULL AND evo_gym_id=?))").bind(guest.id,guest.member_id||-1,guest.evo_bike_id||'-',guest.evo_gym_id||'-'));
 for(const x of sib)refs.push(-x.id);
 return refs;
}
const inRefs=refs=>refs.map(()=>'?').join(',');
async function voteOf(db,month,refs,keys=[]){
 const v=await db.prepare(`SELECT id,month,member_id,created_at,recovered_from FROM pm_votes WHERE month=? AND member_id IN (${inRefs(refs)}) ORDER BY id LIMIT 1`).bind(month,...refs).first();
 if(v||!keys.length)return v;
 const k=await db.prepare(`SELECT member_ref FROM pm_vote_keys WHERE month=? AND cpf_hash IN (${inRefs(keys)}) LIMIT 1`).bind(month,...keys).first();
 return k?await db.prepare('SELECT id,month,member_id,created_at,recovered_from FROM pm_votes WHERE month=? AND member_id=?').bind(month,k.member_ref).first():null;
}

async function buildPlan(db,b,now){
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
 return plan;
}
// One atomic batch: identity keys (UNIQUE month+cpf_hash), the vote row (UNIQUE month+owner) and every detail row, or nothing.
async function saveVote(db,month,owner,keys,plan,recovered,extra=[]){
 const st=[db.prepare('INSERT OR IGNORE INTO pm_campaigns(month) VALUES(?)').bind(month),...extra,
  ...[...new Set(keys.filter(Boolean))].map(k=>db.prepare('INSERT INTO pm_vote_keys(month,cpf_hash,member_ref) VALUES(?,?,?)').bind(month,k,owner)),
  db.prepare('INSERT INTO pm_votes(month,member_id,recovered_from) VALUES(?,?,?)').bind(month,owner,recovered)];
 const V='(SELECT id FROM pm_votes WHERE month=? AND member_id=?)';
 for(const {r,ids,sug,teacher} of plan){
  st.push(db.prepare(`INSERT INTO pm_vote_rhythms(vote_id,rhythm_id,teacher_name) VALUES(${V},?,?)`).bind(month,owner,r.id,teacher));
  for(const id of ids)st.push(db.prepare(`INSERT INTO pm_vote_artists(vote_id,rhythm_id,artist_id) VALUES(${V},?,?)`).bind(month,owner,r.id,id));
  for(const [k,name] of sug){
   st.push(db.prepare('INSERT OR IGNORE INTO pm_suggestions(name,name_key,rhythm_id,first_month) VALUES(?,?,?,?)').bind(name,k,r.id,month));
   st.push(db.prepare(`INSERT INTO pm_vote_artists(vote_id,rhythm_id,suggestion_id) VALUES(${V},?,(SELECT id FROM pm_suggestions WHERE name_key=? AND rhythm_id=?))`).bind(month,owner,r.id,k,r.id));
  }
 }
 try{await db.batch(st)}catch(e){if(/UNIQUE/i.test(String(e?.message||e)))fail('JA_RESPONDEU_ESTE_MES',409);throw e}
 const saved=await db.prepare('SELECT id,created_at FROM pm_votes WHERE month=? AND member_id=?').bind(month,owner).first();
 return {month,voted_at:saved?.created_at,choices:await voteDetail(db,saved.id)};
}
async function formData(db,month,refs,now,withPrevious){
 const [rhythms,teachers]=await Promise.all([catalog(db),officialTeachers(db,now)]);
 let previous=null;
 if(withPrevious){const pv=await db.prepare(`SELECT id,month FROM pm_votes WHERE member_id IN (${inRefs(refs)}) AND month<? ORDER BY month DESC LIMIT 1`).bind(...refs,month).first();
  if(pv)previous={month:pv.month,choices:await voteDetail(db,pv.id)}}
 return {ok:true,month,rhythms,teachers,max_artists:MAX_ARTISTS,previous};
}

export async function studentPopMusic(request,db,url,json,{member,activeUnits,now=Date.now()}){
 await ensurePopMusic(db);
 const eligible=activeUnits.includes('bike');
 const month=spMonth(now),start=await firstMonth(db),open=month>=start;
 const action=url.searchParams.get('action')||'status';
 if(!eligible)return json({ok:false,error:'EXCLUSIVO_ALUNOS_BIKE_POP'},403);
 const refs=await memberRefs(db,member),keys=member.cpf_hash?[member.cpf_hash]:[];
 const vote=await voteOf(db,month,refs,keys);
 if(request.method==='GET'&&action==='status'){
  const prev=vote?null:await db.prepare(`SELECT month FROM pm_votes WHERE member_id IN (${inRefs(refs)}) AND month<? ORDER BY month DESC LIMIT 1`).bind(...refs,month).first();
  return json({ok:true,month,open,opens:open?null:start,voted:!!vote,voted_at:vote?.created_at||null,next_month:nextMonth(month),previous_month:prev?.month||null,...await themedPayload(db,refs,now)});
 }
 if(request.method==='GET'&&action==='mine'){
  const m=validMonth(url.searchParams.get('month'))?url.searchParams.get('month'):month;
  const v=m===month?vote:await voteOf(db,m,refs,keys);
  const history=await rows(db.prepare(`SELECT DISTINCT month FROM pm_votes WHERE member_id IN (${inRefs(refs)}) ORDER BY month DESC LIMIT 24`).bind(...refs));
  return json({ok:true,month:m,voted:!!v,voted_at:v?.created_at||null,choices:v?await voteDetail(db,v.id):[],history:history.map(h=>h.month),themed:await themedForMember(db,refs,now)});
 }
 if(request.method==='GET'&&action==='form'){
  if(!open)return json({ok:false,error:'PESQUISA_AINDA_NAO_ABERTA',opens:start},409);
  if(vote)return json({ok:false,error:'JA_RESPONDEU_ESTE_MES'},409);
  return json(await formData(db,month,refs,now,url.searchParams.get('previous')==='1'));
 }
 if(request.method==='POST'&&action==='submit'){
  if(!open)fail('PESQUISA_AINDA_NAO_ABERTA',409);
  if(vote)fail('JA_RESPONDEU_ESTE_MES',409);
  let b={};try{b=await request.json()}catch{}
  const plan=await buildPlan(db,b,now);
  const recovered=validMonth(b.recovered_from)&&b.recovered_from<month?b.recovered_from:null;
  return json({ok:true,...await saveVote(db,month,member.id,keys,plan,recovered)});
 }
 fail('ACAO_INVALIDA');
}

// ---------- Public link (WhatsApp) ----------
// Identity = CPF + birth date (the same check as the first access). The student's name is only shown when both match.
// Not found: the person still answers with name + WhatsApp, as a vote "to identify" that the admin links later.
export const validCpf=c=>{c=String(c||'').replace(/\D/g,'');if(!/^\d{11}$/.test(c)||/^(\d)\1{10}$/.test(c))return false;
 const dv=n=>{let s=0;for(let i=0;i<n;i++)s+=Number(c[i])*(n+1-i);const r=(s*10)%11;return r===10?0:r};return dv(9)===Number(c[9])&&dv(10)===Number(c[10])};
const sha=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v))))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function linkGuest(db,request){
 const t=clean(request.headers.get('x-pm-token'),80);if(t.length<20)fail('IDENTIFIQUE_SE',401);
 const g=await db.prepare("SELECT g.*,k.confirmed FROM pm_link_tokens k JOIN pm_guests g ON g.id=k.guest_id WHERE k.token_hash=? AND k.expires_at>datetime('now') AND g.status!='discarded'").bind(await sha(t)).first();
 if(!g)fail('IDENTIFIQUE_SE',401);return g;
}
export async function publicPopMusic(request,db,url,json,{ip='',findPerson,now=Date.now()}){
 await ensurePopMusic(db);
 const month=spMonth(now),start=await firstMonth(db),open=month>=start;
 const action=url.searchParams.get('action')||'status';
 if(request.method==='GET'&&action==='status')return json({ok:true,month,open,opens:open?null:start});
 if(request.method==='POST'&&action==='identify'){
  if(!open)fail('PESQUISA_AINDA_NAO_ABERTA',409);
  let b={};try{b=await request.json()}catch{}
  const cpf=String(b.cpf||'').replace(/\D/g,''),birth=String(b.birth_date||'');
  if(!validCpf(cpf))fail('CPF_INVALIDO');if(!/^\d{4}-\d{2}-\d{2}$/.test(birth))fail('DATA_DE_NASCIMENTO_INVALIDA');
  const ipKey='ip:'+await sha('pm:'+ip),cpfHash=await sha(cpf),cpfKey='cpf:'+cpfHash;
  // Rate limits: 15 identifications per network and 5 per CPF per hour (no CPF/birth-date guessing).
  const lim=await db.prepare("SELECT SUM(k=?) ipn,SUM(k=?) cpfn FROM pm_link_attempts WHERE created_at>datetime('now','-1 hour')").bind(ipKey,cpfKey).first();
  if(Number(lim?.ipn||0)>=15||Number(lim?.cpfn||0)>=5)fail('MUITAS_TENTATIVAS_TENTE_MAIS_TARDE',429);
  await db.batch([db.prepare('INSERT INTO pm_link_attempts(k) VALUES(?)').bind(ipKey),db.prepare('INSERT INTO pm_link_attempts(k) VALUES(?)').bind(cpfKey),
   db.prepare("DELETE FROM pm_link_attempts WHERE created_at<datetime('now','-1 day')")]);
  const found=findPerson?await findPerson(cpf,birth):null;
  // A known student's CPF with the wrong birth date is refused: nobody can vote (or block the vote) in someone else's name.
  if(found?.mismatch)fail('DADOS_NAO_CONFEREM',403);
  const person=found;
  if(person&&!person.activeUnits.includes('bike'))fail('EXCLUSIVO_ALUNOS_BIKE_POP',403);
  let g=await db.prepare('SELECT * FROM pm_guests WHERE cpf_hash=?').bind(cpfHash).first();
  if(!g){await db.prepare("INSERT OR IGNORE INTO pm_guests(cpf_hash,cpf_last4,status) VALUES(?,?,'pending')").bind(cpfHash,cpf.slice(-4)).run();g=await db.prepare('SELECT * FROM pm_guests WHERE cpf_hash=?').bind(cpfHash).first()}
  if(person)await db.prepare("UPDATE pm_guests SET status='identified',member_id=?,evo_bike_id=?,evo_gym_id=?,first_name=?,linked_at=COALESCE(linked_at,CURRENT_TIMESTAMP),linked_by=COALESCE(linked_by,'cpf+nascimento') WHERE id=?")
   .bind(person.memberId||null,person.bikeId||null,person.gymId||null,clean(person.first,40)||null,g.id).run();
  else if(g.status==='discarded')await db.prepare("UPDATE pm_guests SET status='pending' WHERE id=?").bind(g.id).run();
  g=await db.prepare('SELECT * FROM pm_guests WHERE id=?').bind(g.id).first();
  const token=[...crypto.getRandomValues(new Uint8Array(24))].map(x=>x.toString(16).padStart(2,'0')).join('');
  await db.prepare("INSERT INTO pm_link_tokens(token_hash,guest_id,expires_at,confirmed) VALUES(?,?,datetime('now','+3 hours'),?)").bind(await sha(token),g.id,person?1:0).run();
  const vote=await voteOf(db,month,await guestRefs(db,g),[cpfHash]);
  // Choices are shown only to the confirmed person (CPF + birth date) or to the guest who cast that vote.
  const own=!!vote&&(person?true:vote.member_id===-g.id&&g.linked_by!=='cpf+nascimento');
  return json({ok:true,token,month,matched:!!person,first_name:person?g.first_name:null,voted:!!vote,
   choices:own?await voteDetail(db,vote.id):[],voted_at:own?vote.created_at:null,needs_contact:!person&&!(g.name&&g.phone)});
 }
 const g=await linkGuest(db,request),refs=await guestRefs(db,g);
 const vote=await voteOf(db,month,refs,[g.cpf_hash]);
 if(request.method==='GET'&&action==='form'){
  if(!open)fail('PESQUISA_AINDA_NAO_ABERTA',409);if(vote)fail('JA_RESPONDEU_ESTE_MES',409);
  return json(await formData(db,month,refs,now,url.searchParams.get('previous')==='1'));
 }
 if(request.method==='GET'&&action==='mine'){const own=!!vote&&(g.confirmed?true:vote.member_id===-g.id&&g.linked_by!=='cpf+nascimento');return json({ok:true,month,voted:!!vote,voted_at:own?vote.created_at:null,choices:own?await voteDetail(db,vote.id):[],themed:g.confirmed?await themedForMember(db,refs,now):[]})}
 if(request.method==='POST'&&action==='submit'){
  if(!open)fail('PESQUISA_AINDA_NAO_ABERTA',409);if(vote)fail('JA_RESPONDEU_ESTE_MES',409);
  let b={};try{b=await request.json()}catch{}
  const extra=[];
  if(!g.confirmed&&g.linked_by==='cpf+nascimento')fail('IDENTIFIQUE_SE',401);
  if(!g.confirmed&&!(g.status==='identified')){const name=clean(b.name,80),phone=String(b.phone||'').replace(/\D/g,'');
   if(name.length<3)fail('INFORME_SEU_NOME');if(!/^\d{10,11}$/.test(phone))fail('WHATSAPP_INVALIDO');
   extra.push(db.prepare('UPDATE pm_guests SET name=?,phone=? WHERE id=?').bind(name,phone,g.id))}
  const plan=await buildPlan(db,b,now);
  const m=g.member_id?await db.prepare('SELECT cpf_hash FROM members WHERE id=?').bind(g.member_id).first():null;
  return json({ok:true,...await saveVote(db,month,-g.id,[g.cpf_hash,m?.cpf_hash],plan,null,extra)});
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
 if(f.identified)where.push("(v.member_id>0 OR EXISTS(SELECT 1 FROM pm_guests g WHERE g.id=-v.member_id AND g.status='identified'))");
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
  db.prepare(`SELECT COUNT(*) n,SUM(CASE WHEN v.member_id<0 AND EXISTS(SELECT 1 FROM pm_guests g WHERE g.id=-v.member_id AND g.status='pending') THEN 1 ELSE 0 END) pending,
   SUM(CASE WHEN v.member_id<0 THEN 1 ELSE 0 END) via_link FROM pm_votes v WHERE ${where}`).bind(...args).first(),
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
 return {month:f.month,filtered:!!(f.rhythm||f.artist||f.teacher||f.identified),participants:p,to_identify:Number(participants?.pending||0),via_link:Number(participants?.via_link||0),eligible,participation_pct:eligible?Math.round(p*1000/eligible)/10:null,
  artists_voted:art.length,rhythms_selected:rh.length,rhythms:rh,artists:art,artists_by_rhythm:artByR,teachers_by_rhythm:teachByR,artists_by_teacher:artByTeacher,suggestions:newSugg,history};
}

// Themed classes vs regular classes (same teacher, same month) using the official attendance already synced in D1.
async function themedClasses(db,month,range=null){
 const list=await rows(db.prepare(`SELECT t.*,r.name rhythm,s.attendance_count attendance,s.status evo_status,s.activity_name evo_activity,s.instructor_name evo_teacher FROM pm_themed_classes t LEFT JOIN pm_rhythms r ON r.id=t.rhythm_id
  LEFT JOIN evo_attendance_sessions s ON s.unit='bike' AND CAST(s.id_activity_session AS TEXT)=t.evo_session_id WHERE ${range?'t.class_date BETWEEN ? AND ?':'t.month=?'} ORDER BY t.class_date,t.class_time,t.id`).bind(...(range||[month])));
 // Classes planned ahead have no official EVO class yet (EVO sync brings the next days only): link automatically by date + time + teacher once it appears.
 for(const t of list.filter(x=>!x.evo_session_id&&x.class_date&&x.class_time)){
  const s=await db.prepare(`SELECT CAST(id_activity_session AS TEXT) id,attendance_count,status,instructor_name FROM evo_attendance_sessions WHERE unit='bike' AND activity_date=? AND substr(start_time,1,5)=?
   ORDER BY CASE WHEN instructor_name=? THEN 0 ELSE 1 END LIMIT 1`).bind(t.class_date,t.class_time,t.teacher_name).first();
  if(s){await db.prepare('UPDATE pm_themed_classes SET evo_session_id=? WHERE id=? AND evo_session_id IS NULL').bind(s.id,t.id).run();t.evo_session_id=s.id;t.attendance=s.attendance_count;t.evo_status=s.status;t.evo_teacher=s.instructor_name;t.auto_linked=1}
 }
 // Only classes that already happened count (a future class has 0 present and would distort the average).
 for(const t of list)if(t.evo_status!=='done')t.attendance=null;
 const linked=list.filter(t=>t.evo_session_id&&t.attendance!=null);
 let comparison=null;
 if(linked.length){
  const ids=linked.map(t=>t.evo_session_id),teachersL=[...new Set(linked.map(t=>t.teacher_name))];
  const reg=await db.prepare(`SELECT AVG(attendance_count) avg,COUNT(*) n FROM evo_attendance_sessions WHERE unit='bike' AND substr(activity_date,1,7)=? AND instructor_name IN (${teachersL.map(()=>'?').join(',')})
   AND CAST(id_activity_session AS TEXT) NOT IN (${ids.map(()=>'?').join(',')}) AND attendance_count IS NOT NULL AND status='done'`).bind(month,...teachersL,...ids).first();
  if(Number(reg?.n))comparison={themed_avg:Math.round(linked.reduce((s,t)=>s+Number(t.attendance||0),0)/linked.length*10)/10,themed_classes:linked.length,regular_avg:Math.round(Number(reg.avg)*10)/10,regular_classes:Number(reg.n)};
 }
 for(const t of list)t.teacher_changed=!!(t.evo_teacher&&String(t.evo_teacher).trim()&&t.evo_teacher!==t.teacher_name);
 return {list,comparison};
}

export async function adminPopMusic(request,db,url,json,{role='admin',user='',searchPeople=null}={}){
 await ensurePopMusic(db);
 const p=url.searchParams,action=p.get('action')||'overview',month=validMonth(p.get('month'))?p.get('month'):spMonth();
 if(request.method==='GET'){
  if(action==='overview'){
   const months=await rows(db.prepare('SELECT month FROM pm_votes GROUP BY month UNION SELECT month FROM pm_campaigns ORDER BY 1 DESC LIMIT 24'));
   return json({ok:true,first_month:await firstMonth(db),current_month:spMonth(),months:months.map(m=>m.month),teachers:await officialTeachers(db)});
  }
  if(action==='rankings')return json({ok:true,...await rankings(db,{month,rhythm:Number(p.get('rhythm'))||0,artist:Number(p.get('artist'))||0,teacher:clean(p.get('teacher'),80),identified:p.get('identified')==='1'})});
  if(action==='guests'){
   const list=await rows(db.prepare(`SELECT g.id,g.name,g.phone,g.cpf_last4,g.first_name,g.status,g.member_id,g.evo_bike_id,g.evo_gym_id,g.linked_by,g.created_at,
    (SELECT group_concat(v.month) FROM pm_votes v WHERE v.member_id=-g.id) months FROM pm_guests g WHERE EXISTS(SELECT 1 FROM pm_votes v WHERE v.member_id=-g.id) OR g.status='pending' AND g.name IS NOT NULL
    ORDER BY g.status='pending' DESC,g.created_at DESC LIMIT 300`));
   return json({ok:true,guests:list.map(g=>({...g,phone:g.phone?String(g.phone).replace(/^(\d{2})(\d+)(\d{4})$/,'($1) $2-$3'):null}))});
  }
  if(action==='people'){if(!searchPeople)fail('BUSCA_INDISPONIVEL',501);return json({ok:true,people:await searchPeople(clean(p.get('q'),60))})}
  if(action==='catalog'){
   const rhythms=await rows(db.prepare('SELECT id,slug,name,emoji,sort,active FROM pm_rhythms ORDER BY sort,name'));
   const artists=await rows(db.prepare(`SELECT a.id,a.name,a.active,a.origin,(SELECT group_concat(rhythm_id) FROM pm_artist_rhythms WHERE artist_id=a.id) rhythm_ids,
    (SELECT COUNT(*) FROM pm_vote_artists va WHERE va.artist_id=a.id) votes FROM pm_artists a ORDER BY a.name COLLATE NOCASE`));
   const suggestions=await rows(db.prepare(`SELECT s.id,s.name,s.status,s.first_month,s.rhythm_id,r.name rhythm,(SELECT COUNT(*) FROM pm_vote_artists va WHERE va.suggestion_id=s.id) votes
    FROM pm_suggestions s JOIN pm_rhythms r ON r.id=s.rhythm_id ORDER BY s.status='pending' DESC,votes DESC,s.name`));
   return json({ok:true,rhythms,artists:artists.map(a=>({...a,rhythm_ids:String(a.rhythm_ids||'').split(',').filter(Boolean).map(Number)})),suggestions});
  }
  // Optional day / week / month range (from-to) for the list and the story image.
  const from=/^\d{4}-\d{2}-\d{2}$/.test(p.get('from')||'')?p.get('from'):null,to=/^\d{4}-\d{2}-\d{2}$/.test(p.get('to')||'')?p.get('to'):null;
  if(action==='themed')return json({ok:true,month,...await themedClasses(db,month,from&&to&&from<=to?[from,to]:null),sessions:await rows(db.prepare(`SELECT CAST(id_activity_session AS TEXT) id,activity_date date,start_time time,activity_name name,instructor_name teacher,attendance_count attendance
   FROM evo_attendance_sessions WHERE unit='bike' AND activity_date BETWEEN date('now','-3 hours') AND date('now','-3 hours','+60 days')
   ORDER BY activity_date,start_time LIMIT 400`))}); // only today onwards: themed classes are planned, never registered after the fact
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
 if(op==='themed_add'||op==='themed_update'){
  const m=validMonth(b.month)?b.month:fail('MES_INVALIDO');const teacher=clean(b.teacher,80),name=clean(b.class_name,80);if(!teacher)fail('PROFESSOR_OBRIGATORIO');if(!name)fail('NOME_DA_AULA_OBRIGATORIO');
  const date=/^\d{4}-\d{2}-\d{2}$/.test(String(b.class_date||''))?b.class_date:null,time=/^\d{2}:\d{2}$/.test(String(b.class_time||''))?b.class_time:null;
  const fields=[m,Number(b.rhythm_id)||null,teacher,name,date,time,clean(b.artists,300)||null,clean(b.evo_session_id,20)||null,clean(b.notes,300)||null,clean(b.playlist_name,80)||null];
  if(op==='themed_update'){
   const saved=await db.prepare('UPDATE pm_themed_classes SET month=?,rhythm_id=?,teacher_name=?,class_name=?,class_date=?,class_time=?,artists=?,evo_session_id=?,notes=?,playlist_name=? WHERE id=?').bind(...fields,Number(b.id)).run();
   if(!saved.meta?.changes)fail('AULA_NAO_ENCONTRADA',404);
   return json({ok:true,id:Number(b.id)});
  }
  const r=await db.prepare('INSERT INTO pm_themed_classes(month,rhythm_id,teacher_name,class_name,class_date,class_time,artists,evo_session_id,notes,playlist_name,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
   .bind(...fields,clean(user,80)||null).run();
  const rid=Number(b.rhythm_id)||0,since=prevMonth(prevMonth(m));
  const notified=rid?Number((await db.prepare('SELECT COUNT(DISTINCT v.member_id) n FROM pm_votes v JOIN pm_vote_rhythms vr ON vr.vote_id=v.id WHERE vr.rhythm_id=? AND v.month BETWEEN ? AND ?').bind(rid,since,m).first())?.n||0):0;
  return json({ok:true,id:Number(r.meta?.last_row_id),notified});
 }
 if(op==='guest_link'){
  // Link a "to identify" vote to the student found by the admin. Same person voting twice in a month: keep the first answer.
  const g=await db.prepare('SELECT * FROM pm_guests WHERE id=?').bind(Number(b.guest_id)).first();if(!g)fail('VOTO_NAO_ENCONTRADO',404);
  const bike=clean(b.evo_bike_id,20)||null,gym=clean(b.evo_gym_id,20)||null,mid=Number(b.member_id)||null;if(!bike&&!gym&&!mid)fail('ESCOLHA_O_ALUNO');
  await db.prepare("UPDATE pm_guests SET status='identified',member_id=COALESCE(?,member_id),evo_bike_id=COALESCE(?,evo_bike_id),evo_gym_id=COALESCE(?,evo_gym_id),first_name=COALESCE(?,first_name),linked_at=CURRENT_TIMESTAMP,linked_by=? WHERE id=?")
   .bind(mid,bike,gym,clean(b.first_name,40)||null,clean(user,80)||'admin',g.id).run();
  const g2=await db.prepare('SELECT * FROM pm_guests WHERE id=?').bind(g.id).first(),refs=await guestRefs(db,g2);
  const dup=await rows(db.prepare(`SELECT month,GROUP_CONCAT(id) ids FROM (SELECT id,month FROM pm_votes WHERE member_id IN (${inRefs(refs)}) ORDER BY id) GROUP BY month HAVING COUNT(*)>1`).bind(...refs));
  let removed=0;
  for(const d of dup){const drop=String(d.ids).split(',').slice(1).map(Number);removed+=drop.length;
   await db.batch(drop.flatMap(id=>[db.prepare('DELETE FROM pm_vote_artists WHERE vote_id=?').bind(id),db.prepare('DELETE FROM pm_vote_rhythms WHERE vote_id=?').bind(id),
    db.prepare('DELETE FROM pm_vote_keys WHERE month=? AND member_ref=(SELECT member_id FROM pm_votes WHERE id=?)').bind(d.month,id),db.prepare('DELETE FROM pm_votes WHERE id=?').bind(id)]))}
  // From now on the member's own CPF is also blocked in the months this person voted through the link.
  if(mid){const m=await db.prepare('SELECT cpf_hash FROM members WHERE id=?').bind(mid).first();
   if(m?.cpf_hash)await db.prepare(`INSERT OR IGNORE INTO pm_vote_keys(month,cpf_hash,member_ref) SELECT month,?,member_id FROM pm_votes WHERE member_id IN (${inRefs(refs)})`).bind(m.cpf_hash,...refs).run()}
  return json({ok:true,duplicates_removed:removed});
 }
 if(op==='guest_discard'){
  const g=await db.prepare('SELECT id FROM pm_guests WHERE id=?').bind(Number(b.guest_id)).first();if(!g)fail('VOTO_NAO_ENCONTRADO',404);
  const votes=await rows(db.prepare('SELECT id,month FROM pm_votes WHERE member_id=?').bind(-g.id));
  await db.batch([...votes.flatMap(v=>[db.prepare('DELETE FROM pm_vote_artists WHERE vote_id=?').bind(v.id),db.prepare('DELETE FROM pm_vote_rhythms WHERE vote_id=?').bind(v.id)]),
   db.prepare('DELETE FROM pm_vote_keys WHERE member_ref=?').bind(-g.id),db.prepare('DELETE FROM pm_votes WHERE member_id=?').bind(-g.id),
   db.prepare("UPDATE pm_guests SET status='discarded' WHERE id=?").bind(g.id),db.prepare('DELETE FROM pm_link_tokens WHERE guest_id=?').bind(g.id)]);
  return json({ok:true,removed:votes.length});
 }
 if(op==='themed_link'){await db.prepare('UPDATE pm_themed_classes SET evo_session_id=? WHERE id=?').bind(clean(b.evo_session_id,20)||null,Number(b.id)).run();return json({ok:true})}
 if(op==='themed_teacher_sync'){
  // Teacher replaced in EVO: bring the themed class record in line with the official class.
  const t=await db.prepare(`SELECT t.id,s.instructor_name evo FROM pm_themed_classes t JOIN evo_attendance_sessions s ON s.unit='bike' AND CAST(s.id_activity_session AS TEXT)=t.evo_session_id WHERE t.id=?`).bind(Number(b.id)).first();
  if(!t?.evo)fail('AULA_OFICIAL_NAO_VINCULADA',409);await db.prepare('UPDATE pm_themed_classes SET teacher_name=? WHERE id=?').bind(t.evo,t.id).run();return json({ok:true,teacher:t.evo});
 }
 if(op==='themed_delete'){await db.prepare('DELETE FROM pm_themed_classes WHERE id=?').bind(Number(b.id)).run();return json({ok:true})}
 fail('OPERACAO_INVALIDA');
}
