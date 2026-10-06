const ALLOWED_ORIGINS = new Set([
  "https://loja-pop-green.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);



async function runScheduledStudentSync(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
  const now=new Date(), parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now),get=t=>parts.find(x=>x.type===t)?.value||"";
  const hm=get("hour")+":"+get("minute"), minuteKey=get("year")+"-"+get("month")+"-"+get("day")+"T"+hm;
  const rows=(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='student'").all()).results||[];
  for(const row of rows){let times=[];try{times=JSON.parse(row.times_json||"[]")}catch{}if(!times.includes(hm))continue;const unit=row.unit==="gym"?"gym":"bike";
    const ins=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'student',?,'pending')").bind(unit,minuteKey).run();if(!ins.meta?.changes)continue;
    try{const r=await fetch("https://loja-pop-green.vercel.app/api/evo-config?route=auto-sync-students&unit="+unit,{method:"POST",headers:{"x-auto-sync-secret":String(env.AUTO_SYNC_SECRET||""),"Content-Type":"application/json"}}),d=await r.json().catch(()=>({}));await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status=?,detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='student' AND scheduled_minute=?").bind(r.ok&&d.ok?"done":"failed",JSON.stringify({http:r.status,error:d.error||null,total:d.total||null,requests:d.requests||null}).slice(0,1000),unit,minuteKey).run();}
    catch(e){await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='student' AND scheduled_minute=?").bind(String(e.message||e).slice(0,500),unit,minuteKey).run();}
  }
}


async function runScheduledAttendanceSync(env) {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedule_runs(unit TEXT NOT NULL,kind TEXT NOT NULL,scheduled_minute TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',detail TEXT,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind,scheduled_minute))").run();
  const now=new Date(), parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(now),get=t=>parts.find(x=>x.type===t)?.value||"";
  const hm=get("hour")+":"+get("minute"), date=get("year")+"-"+get("month")+"-"+get("day"), minuteKey=date+"T"+hm;
  const rows=(await env.DB.prepare("SELECT unit,times_json FROM evo_sync_schedules WHERE kind='attendance'").all()).results||[];
  for(const row of rows){let times=[];try{times=JSON.parse(row.times_json||"[]")}catch{}if(!times.includes(hm))continue;const unit=row.unit==="gym"?"gym":"bike";
    const ins=await env.DB.prepare("INSERT OR IGNORE INTO evo_sync_schedule_runs(unit,kind,scheduled_minute,status) VALUES(?,'attendance',?,'pending')").bind(unit,minuteKey).run();if(!ins.meta?.changes)continue;
    let requests=0,classesFound=0,newClasses=0,saved=0;
    try{
      const cfg=await getEvoConfig(env,unit);
      const evo=async (url,purpose)=>{requests++;const u=new URL(url),r=await fetch(u.href,{headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"}});try{await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,'GET',?,?,?)").bind(unit,purpose,u.pathname,r.status,r.ok?1:0).run()}catch{}return r};
      const sr=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?date="+encodeURIComponent(date)+"&showFullWeek=false&onlyAvailables=false&take=100","schedule");if(!sr.ok)throw new Error("EVO_GRADE_HTTP_"+sr.status);
      const raw=await sr.json(),list=Array.isArray(raw)?raw:(Array.isArray(raw?.data)?raw.data:[]),sessions=[];
      for(const s of list){const d=String(s?.activityDate||s?.date||"").slice(0,10),id=s?.idAtividadeSessao??s?.idActivitySession??s?.idActivitieSession;if(d===date&&Number(s?.status)===6&&Number.isSafeInteger(Number(id))&&Number(id)>0)sessions.push({id:String(id),date:d})}
      const unique=[...new Map(sessions.map(x=>[x.id,x])).values()];classesFound=unique.length;
      let done=new Set();if(unique.length){const ids=unique.map(x=>x.id),q=await env.DB.prepare("SELECT id_activity_session FROM evo_attendance_sessions WHERE unit=? AND status='done' AND id_activity_session IN ("+ids.map(()=>"?").join(",")+")").bind(unit,...ids).all();done=new Set((q.results||[]).map(x=>String(x.id_activity_session)))}
      const pending=unique.filter(x=>!done.has(x.id));newClasses=pending.length;
      for(const s of pending){const dr=await evo("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule/detail?idActivitySession="+encodeURIComponent(s.id),"checkin_detail");if(!dr.ok)throw new Error("EVO_DETALHE_HTTP_"+dr.status);const payload=await dr.json(),d=Array.isArray(payload)&&payload.length===1?payload[0]:payload;if(!d||String(d.idActivitySession)!==s.id||Number(d.status)!==6||!Array.isArray(d.enrollments))throw new Error("DETALHE_AULA_INVALIDO");
        const mt=String(d.startTime||"").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);if(!mt)throw new Error("HORARIO_AULA_INVALIDO");let h=Number(mt[1]);if(mt[3])h=h%12+(mt[3].toUpperCase()==="PM"?12:0);const st=String(h).padStart(2,"0")+":"+mt[2],stm=[];
        for(const e of d.enrollments){if(e.removed===true||e.status!==0||!Number.isSafeInteger(e.idMember)||e.idMember<=0)continue;const mid=String(e.idMember),x={id:mid,date,startTime:st,activity:String(d.name||"").slice(0,200),idActivitySession:s.id,presenca:true,isFinalized:true};stm.push(env.DB.prepare("INSERT OR REPLACE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,mid,s.id,date,st,x.activity,s.id,JSON.stringify(x)))}
        if(stm.length)for(let i=0;i<stm.length;i+=40)await env.DB.batch(stm.slice(i,i+40));saved+=stm.length;
        await env.DB.prepare("INSERT INTO evo_attendance_sessions(unit,id_activity_session,activity_date,start_time,activity_name,status,attendance_count,synced_at) VALUES(?,?,?,?,?, 'done',?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET activity_date=excluded.activity_date,start_time=excluded.start_time,activity_name=excluded.activity_name,status='done',attendance_count=excluded.attendance_count,synced_at=CURRENT_TIMESTAMP").bind(unit,s.id,date,st,String(d.name||"").slice(0,200),stm.length).run();
      }
      await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='done',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='attendance' AND scheduled_minute=?").bind(JSON.stringify({date,requests,classesFound,newClasses,presencesSaved:saved}).slice(0,1000),unit,minuteKey).run();
    }catch(e){await env.DB.prepare("UPDATE evo_sync_schedule_runs SET status='failed',detail=?,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND kind='attendance' AND scheduled_minute=?").bind(JSON.stringify({date,requests,classesFound,newClasses,presencesSaved:saved,error:String(e.message||e)}).slice(0,1000),unit,minuteKey).run()}
  }
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(Promise.all([runScheduledStudentSync(env),runScheduledAttendanceSync(env)])); },
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("Origin") || "";

      const cors = {
        "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin)
          ? origin
          : "https://loja-pop-green.vercel.app",
        "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const json = (data, status = 200) =>
        new Response(JSON.stringify(data), {
          status,
          headers: {
            ...cors,
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });


      // Authenticated server-to-server transport: credentials remain inside this Worker.
      if ((url.pathname === "/internal/evo-bike" || url.pathname === "/internal/evo-unit") && request.method === "POST") {
        const body = await request.text();
        if (body.length > 8192) return json({ok:false,error:"REQUISICAO_INVALIDA"},400);
        const timestamp = request.headers.get("x-evo-timestamp") || "";
        const signature = request.headers.get("x-evo-signature") || "";
        if (!/^\d+$/.test(timestamp) || Math.abs(Date.now()-Number(timestamp))>30000 || !/^[a-f0-9]{64}$/.test(signature)) return json({ok:false,error:"NAO_AUTORIZADO"},401);
        let operation; try { operation=JSON.parse(body); } catch { return json({ok:false,error:"REQUISICAO_INVALIDA"},400); }
        const target=allowedEvoTarget(operation.url,operation.method);
        if (!target) return json({ok:false,error:"OPERACAO_EVO_NAO_PERMITIDA"},400);
        const requestedUnit=url.pathname==="/internal/evo-bike"?"bike":String(operation.unit||"bike").toLowerCase();
        const cfg=await getEvoConfig(env,requestedUnit);
        const upstream=await fetch(target.href,{method:operation.method,headers:{Authorization:"Basic "+btoa(cfg.dns+":"+cfg.token),Accept:"application/json"}});
        try { const p=target.pathname.toLowerCase(), purpose=(p==="/api/v2/management/activeclients"||(p==="/api/v2/members"&&target.searchParams.get("status")==="1"))?"student_sync":p.includes("/membermembership")?"contracts":p==="/api/v1/activities"?"activities_catalog":p.includes("/activities/schedule/detail")?"checkin_detail":p.includes("/activities/schedule")?"schedule":p.includes("/fitcoins")?"fitcoins":p.includes("/member/sessions")?"attendance":p.includes("/members/")||p==="/api/v2/members"?"member_profile":"other"; await env.DB.prepare("INSERT INTO evo_request_log(unit,purpose,method,endpoint,status,ok) VALUES(?,?,?,?,?,?)").bind(requestedUnit,purpose,String(operation.method||"GET").toUpperCase(),target.pathname,upstream.status,upstream.ok?1:0).run(); } catch {}
        if (target.pathname === "/api/v2/management/activeclients") {
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
              "Cache-Control": "no-store",
            },
          });
        }
        const upstreamBody = await upstream.text();
        // Diagnóstico temporário e isolado: preserva o payload bruto já recebido na sincronização
        // para o cliente-controle 983786, sem nova chamada à EVO e sem alterar a resposta.
        if (requestedUnit === "bike" && target.pathname.toLowerCase() === "/api/v2/members" && target.searchParams.get("status") === "1" && upstream.ok) {
          try {
            const members = JSON.parse(upstreamBody);
            const sample = Array.isArray(members) ? members.find(m => String(m?.idMember) === "983786") : null;
            if (sample) {
              await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_payload_diagnostic (unit TEXT NOT NULL, evo_member_id TEXT NOT NULL, payload_json TEXT NOT NULL, captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(unit,evo_member_id))").run();
              await env.DB.prepare("INSERT INTO evo_sync_payload_diagnostic(unit,evo_member_id,payload_json,captured_at) VALUES('bike','983786',?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET payload_json=excluded.payload_json,captured_at=CURRENT_TIMESTAMP").bind(JSON.stringify(sample)).run();
            }
          } catch {}
        }
        return new Response(upstreamBody, {status: upstream.status, headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}});
      }

      // Cache de leitura do Dashboard: nunca chama a EVO.
      if (url.pathname === "/member/evo-cache" && request.method === "GET") {
        const auth=request.headers.get("Authorization")||""; if(!auth.startsWith("Bearer "))return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const tokenHash=await sha256(auth.slice(7)); const session=await env.DB.prepare("SELECT m.id,m.evo_member_id,g.gym_client_id FROM auth_sessions s JOIN members m ON m.id=s.member_id LEFT JOIN gym_member_links g ON g.member_id=m.id AND g.status='ACTIVE' WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1").bind(tokenHash).first();
        if(!session)return json({ok:false,error:"SESSAO_INVALIDA"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike", evoId=unit==="gym"?session.gym_client_id:session.evo_member_id; if(!evoId)return json({ok:false,error:"UNIDADE_NAO_VINCULADA"},404);
        if(unit==="bike"){
          const parse=v=>{try{return JSON.parse(v||"{}")}catch{return {}}};
          const cache=await env.DB.prepare("SELECT payload_json,updated_at FROM evo_member_cache WHERE unit='bike' AND evo_member_id=?").bind(String(evoId)).first();
          const master=await env.DB.prepare("SELECT personal_json,financial_json,memberships_json,synced_at FROM evo_member_master WHERE unit='bike' AND evo_member_id=?").bind(String(evoId)).first();
          const base=await env.DB.prepare("SELECT first_name,last_name FROM members WHERE id=?").bind(session.id).first();
          const data=parse(cache?.payload_json),personal=parse(master?.personal_json),financial=parse(master?.financial_json);
          data.member={idMember:evoId,firstName:personal.firstName||base?.first_name||"Aluno",lastName:personal.lastName||base?.last_name||"",branchName:"Studio Bike Pop",memberships:parse(master?.memberships_json),...(data.member||{})};
          if(!Array.isArray(data.member.memberships))data.member.memberships=[];
          const coin=[data.fitcoins,financial.totalFitCoins,financial.totalFitcoins].find(v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v)));data.fitcoins=coin===undefined?null:Number(coin);
          const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()),part=t=>parts.find(p=>p.type===t).value,month=part("year")+"-"+part("month"),today=month+"-"+part("day");
          const q=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session FROM evo_member_attendance WHERE unit='bike' AND evo_member_id=? AND substr(attendance_date,1,7)=? ORDER BY attendance_date,start_time,id_activity_session").bind(String(evoId),month).all();
          const rows=(q.results||[]).map(a=>({date:a.attendance_date,startTime:a.start_time,activity:a.activity_name,idActivitySession:a.id_activity_session,presenca:true,isFinalized:true})),times={},acts={},days=new Set();
          for(const a of rows){days.add(a.date);if(a.startTime)times[a.startTime]=(times[a.startTime]||0)+1;if(a.activity)acts[a.activity]=(acts[a.activity]||0)+1}
          const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||null,monday=new Date(today+"T00:00:00Z");monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=rows.filter(a=>a.date>=monday.toISOString().slice(0,10)&&a.date<=today);
          data.attendance={ok:true,period:{month},attendanceCount:rows.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),currentWeek:{attendanceCount:week.length,distinctDays:new Set(week.map(a=>a.date)).size},attendance:rows};
          const sync=await env.DB.prepare("SELECT sync_time,last_sync_at FROM evo_sync_config WHERE unit='bike'").first();
          return json({ok:true,unit,cached:true,source:"d1",evoRequestsMade:0,updatedAt:cache?.updated_at||master?.synced_at||null,sync:{syncTime:sync?.sync_time||null,lastSyncAt:sync?.last_sync_at||null},data});
        }
        const row=await env.DB.prepare("SELECT payload_json,updated_at FROM evo_member_cache WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,String(evoId)).first(); const sync=await env.DB.prepare("SELECT sync_time,last_sync_at FROM evo_sync_config WHERE unit=? LIMIT 1").bind(unit).first(); const syncMeta={syncTime:sync?.sync_time||null,lastSyncAt:sync?.last_sync_at||null};
        const month=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7); const ar=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session AS idActivitySession,raw_json FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND substr(attendance_date,1,7)=? ORDER BY attendance_date,start_time,id_activity_session").bind(unit,String(evoId),month).all(); const rows=ar.results||[],times={},acts={},days=new Set(); for(const a of rows){days.add(String(a.attendance_date).slice(0,10));if(a.activity_name)acts[a.activity_name]=(acts[a.activity_name]||0)+1;if(a.start_time)times[a.start_time]=(times[a.start_time]||0)+1;} const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null; const attendance={ok:true,attendanceCount:rows.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),currentWeek:{attendanceCount:0,distinctDays:0},attendance:rows}; if(!row){ const base=await env.DB.prepare("SELECT first_name,last_name FROM members WHERE id=? LIMIT 1").bind(session.id).first(); return json({ok:true,unit,cached:true,source:"d1-attendance",updatedAt:null,sync:syncMeta,data:{member:{idMember:evoId,firstName:base?.first_name||"Aluno",lastName:base?.last_name||"",branchName:unit==="gym"?"Studio Gym Pop":"Studio Bike Pop",memberships:[]},fitcoins:null,attendance}}); } let data=null;try{data=JSON.parse(row.payload_json)}catch{} data=data&&typeof data==="object"?data:{};data.attendance=attendance;return json({ok:true,unit,cached:true,source:"d1-attendance",updatedAt:row.updated_at,sync:syncMeta,data});
      }

      // Recebe um lote coletivo já obtido da EVO pelo transporte central e materializa snapshots no D1.
      if (url.pathname === "/admin/evo-sync-ingest" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase()==="gym"?"gym":"bike",members=Array.isArray(b.members)?b.members:[];
        if(!members.length)return json({ok:false,error:"LOTE_VAZIO"},400);
        const month=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7);
        const ar=await env.DB.prepare("SELECT evo_member_id,attendance_date,activity_name,raw_json FROM attendance_history WHERE unit=? AND substr(attendance_date,1,7)=?").bind(unit,month).all(),by={};
        for(const a of ar.results||[]){const k=String(a.evo_member_id);(by[k]||(by[k]=[])).push(a)}
        const statements=[];
        for(const x of members){const id=x.idMember??x.id??null;if(id==null)continue;const rows=by[String(id)]||[],times={},acts={},days=new Set();for(const a of rows){days.add(String(a.attendance_date).slice(0,10));if(a.activity_name)acts[a.activity_name]=(acts[a.activity_name]||0)+1;try{const j=JSON.parse(a.raw_json||"{}"),t=j.startTime||j.startDate;if(t)times[String(t).slice(11,16)]=(times[String(t).slice(11,16)]||0)+1}catch{}}const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
          const payload={member:x,fitcoins:Number(x.totalFitCoins??x.totalFitcoins??0),attendance:{ok:true,attendanceCount:rows.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),attendance:rows}};
          statements.push(env.DB.prepare("INSERT INTO evo_member_cache(unit,evo_member_id,payload_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(unit,String(id),JSON.stringify(payload)));
        }
        for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
        await env.DB.prepare("UPDATE evo_sync_config SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='ok',last_sync_requests=?,updated_at=CURRENT_TIMESTAMP WHERE unit=?").bind(Number(b.requests||0),unit).run();
        return json({ok:true,unit,saved:statements.length});
      }

      // Diagnóstico econômico do Dashboard: lê somente o D1 e calcula quantas chamadas de sessões ainda faltariam.
      if (url.pathname === "/admin/evo-dashboard-diagnostic" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        if(unit!=="bike")return json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"},423);
        const now=new Date(),month=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(now).slice(0,7),start=month+"-01",today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(now);
        const current=await env.DB.prepare("SELECT COUNT(*) n FROM evo_students WHERE unit=? AND is_current=1").bind(unit).first();
        const linked=await env.DB.prepare("SELECT COUNT(DISTINCT es.evo_member_id) n FROM evo_students es JOIN members m ON CAST(m.evo_member_id AS TEXT)=es.evo_member_id WHERE es.unit=? AND es.is_current=1").bind(unit).first();
        const covered=await env.DB.prepare("SELECT COUNT(DISTINCT es.evo_member_id) n FROM evo_students es JOIN members m ON CAST(m.evo_member_id AS TEXT)=es.evo_member_id JOIN attendance_sync_ranges r ON r.member_id=m.id AND r.unit=? WHERE es.unit=? AND es.is_current=1 AND r.start_date<=? AND r.end_date>=?").bind(unit,unit,start,today).first();
        const attendanceRows=await env.DB.prepare("SELECT COUNT(*) n FROM attendance_history WHERE unit=? AND attendance_date BETWEEN ? AND ?").bind(unit,start,today).first();
        const total=Number(current?.n||0),linkedMembers=Number(linked?.n||0),coveredMembers=Number(covered?.n||0),missing=Math.max(0,linkedMembers-coveredMembers);
        return json({ok:true,unit,period:{start,end:today},population:{current:total,linked:linkedMembers},attendance:{coveredMembers,missingMembers:missing,rows:Number(attendanceRows?.n||0),estimatedRequests:missing,endpoint:"/api/v2/activities/member/sessions"},alreadyAvailable:{profile:true,contra

--- TRUNCATED ---
Response was ~40,556 tokens (limit: 6,000). Use more specific queries to reduce response size.