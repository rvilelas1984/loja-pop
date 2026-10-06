const ALLOWED_ORIGINS = new Set([
  "https://loja-pop-green.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
]);

export default {
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
        return json({ok:true,unit,period:{start,end:today},population:{current:total,linked:linkedMembers},attendance:{coveredMembers,missingMembers:missing,rows:Number(attendanceRows?.n||0),estimatedRequests:missing,endpoint:"/api/v2/activities/member/sessions"},alreadyAvailable:{profile:true,contracts:true,contractDates:true,categories:true,fitcoins:true,lastAccess:true,aggregators:true},calculatedLocally:{attendanceCount:true,distinctDays:true,favoriteTime:true,favoriteActivity:true},evoRequestsMade:0,note:"Diagnóstico somente D1. Nenhuma requisição EVO foi executada."});
      }

      if (url.pathname === "/admin/evo-attendance-member" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase();
        const idMember=String(url.searchParams.get("idMember")||"").replace(/\D/g,"");
        const start=String(url.searchParams.get("start")||""),end=String(url.searchParams.get("end")||"");
        if(unit!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO"},423);
        if(!idMember||!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||start>end)return json({ok:false,error:"PARAMETROS_INVALIDOS"},400);
        const q=await env.DB.prepare("SELECT id_activity_session AS idActivitySession, attendance_date AS date, start_time AS startTime, activity_name AS activity FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,start_time,id_activity_session").bind(unit,idMember,start,end).all();
        return json({ok:true,unit,idMember,start,end,total:(q.results||[]).length,rows:q.results||[]});
      }

      if(url.pathname==="/admin/evo-attendance-import-queue" && request.method==="POST"){
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));if(b.unit!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO"},423);
        if(!Array.isArray(b.sessions)||b.sessions.length>100||b.sessions.some(s=>!s||!/^\d+$/.test(String(s.id))||!/^\d{4}-\d{2}-\d{2}$/.test(String(s.date))))return json({ok:false,error:"SESSOES_INVALIDAS"},400);
        const stm=b.sessions.map(s=>env.DB.prepare("INSERT INTO evo_attendance_import_queue(unit,id_activity_session,activity_date,status) VALUES('bike',?,?,'pending') ON CONFLICT(unit,id_activity_session) DO NOTHING").bind(String(s.id),s.date));
        if(stm.length)await env.DB.batch(stm);return json({ok:true,received:b.sessions.length});
      }

      // Incremental Bike attendance: D1 session ledger + idempotent class attendance ingest.
      if (url.pathname === "/admin/evo-attendance-import-queue" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase(),start=String(url.searchParams.get("start")||""),end=String(url.searchParams.get("end")||"");
        if(unit!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO"},423);if(!/^\d{4}-\d{2}$/.test(start)||!/^\d{4}-\d{2}$/.test(end)||start>end)return json({ok:false,error:"PERIODO_INVALIDO"},400);
        const from=start+"-01",[y,m]=end.split("-").map(Number),to=new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
        const q=await env.DB.prepare("SELECT id_activity_session id,activity_date date,status FROM evo_attendance_import_queue WHERE unit='bike' AND activity_date BETWEEN ? AND ? ORDER BY activity_date,id_activity_session").bind(from,to).all();
        return json({ok:true,sessions:(q.results||[]).map(x=>({id:String(x.id),date:x.date,status:x.status}))});
      }
      if (url.pathname === "/admin/evo-attendance-sessions" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));if(String(b.unit||"bike")!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO"},423);
        const ids=Array.isArray(b.sessionIds)?b.sessionIds.map(String).filter(x=>/^\d+$/.test(x)).slice(0,100):[];
        if(!ids.length)return json({ok:true,processed:[]});
        const q=await env.DB.prepare("SELECT id_activity_session FROM evo_attendance_sessions WHERE unit='bike' AND status='done' AND id_activity_session IN ("+ids.map(()=>"?").join(",")+")").bind(...ids).all();
        return json({ok:true,processed:(q.results||[]).map(x=>String(x.id_activity_session))});
      }
      if (url.pathname === "/admin/evo-attendance-ingest-class" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({}));if(String(b.unit||"bike")!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO"},423);
        const sid=String(b.sessionId||""),date=String(b.date||"").slice(0,10),rows=Array.isArray(b.rows)?b.rows:[];if(!/^\d+$/.test(sid)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||rows.length>100)return json({ok:false,error:"LOTE_PRESENCAS_INVALIDO"},400);
        const prior=await env.DB.prepare("SELECT status FROM evo_attendance_sessions WHERE unit='bike' AND id_activity_session=?").bind(sid).first();if(prior?.status==="done"){await env.DB.prepare("UPDATE evo_attendance_import_queue SET status='done',last_error=NULL WHERE unit='bike' AND id_activity_session=?").bind(sid).run();return json({ok:true,alreadyProcessed:true,saved:0});}
        const stm=[];for(const x of rows){const id=String(x.id||"");if(!/^\d+$/.test(id)||String(x.idActivitySession)!==sid||String(x.date).slice(0,10)!==date)continue;stm.push(env.DB.prepare("INSERT OR REPLACE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES('bike',?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(id,sid,date,x.startTime||null,x.activity||null,sid,JSON.stringify(x)))}
        if(stm.length)for(let i=0;i<stm.length;i+=40)await env.DB.batch(stm.slice(i,i+40));
        await env.DB.prepare("INSERT INTO evo_attendance_sessions(unit,id_activity_session,activity_date,start_time,activity_name,status,attendance_count,synced_at) VALUES('bike',?,?,?,?, 'done',?,CURRENT_TIMESTAMP) ON CONFLICT(unit,id_activity_session) DO UPDATE SET activity_date=excluded.activity_date,start_time=excluded.start_time,activity_name=excluded.activity_name,status='done',attendance_count=excluded.attendance_count,synced_at=CURRENT_TIMESTAMP").bind(sid,date,b.startTime||null,b.activity||null,stm.length).run();
        await env.DB.prepare("UPDATE evo_attendance_import_queue SET status='done',attempts=attempts+1,last_error=NULL WHERE unit='bike' AND id_activity_session=?").bind(sid).run();
        return json({ok:true,alreadyProcessed:false,saved:stm.length});
      }

      if (url.pathname === "/admin/evo-test-presence" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),unit=String(b.unit||"bike").toLowerCase(),id=String(b.id||"").trim(),rows=Array.isArray(b.rows)?b.rows:[];if(unit!=="bike")return json({ok:false,error:"TESTE_GYM_BLOQUEADO"},423);if(!/^[0-9]+$/.test(id))return json({ok:false,error:"ID_CLIENTE_INVALIDO"},400);
        const start=String(b.period?.dateStart||"").slice(0,10),end=String(b.period?.dateEnd||"").slice(0,10);await env.DB.prepare("DELETE FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ?").bind(unit,id,start,end).run();
        const stm=[];for(const [i,x] of rows.entries()){const date=String(x.date||"").slice(0,10);if(!date)continue;const sid=x.idActivitySession??null,key=sid!=null?String(sid):date+"|"+String(x.startTime||"")+"|"+String(x.activity||"")+"|"+i;stm.push(env.DB.prepare("INSERT OR REPLACE INTO evo_member_attendance(unit,evo_member_id,attendance_key,attendance_date,start_time,activity_name,id_activity_session,raw_json,synced_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,id,key,date,x.startTime||null,x.activity||null,sid==null?null:String(sid),JSON.stringify(x)))}if(stm.length)await env.DB.batch(stm);
        const q=await env.DB.prepare("SELECT attendance_date,start_time,activity_name FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,start_time").bind(unit,id,start,end).all(),saved=q.results||[],times={},acts={},days=new Set();for(const x of saved){days.add(x.attendance_date);if(x.start_time)times[x.start_time]=(times[x.start_time]||0)+1;if(x.activity_name)acts[x.activity_name]=(acts[x.activity_name]||0)+1}const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
        return json({ok:true,saved:saved.length,summary:{attendanceCount:saved.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),consistency:days.size+" dia(s) com presença"}});
      }

      // Visualização administrativa de um cliente já salvo no D1. Zero chamadas EVO.
      if (url.pathname === "/admin/evo-test-client" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike",id=String(url.searchParams.get("id")||"").trim();
        if(unit!=="bike")return json({ok:false,error:"TESTE_GYM_BLOQUEADO"},423);
        if(!/^[0-9]+$/.test(id))return json({ok:false,error:"ID_CLIENTE_INVALIDO"},400);
        const m=await env.DB.prepare("SELECT evo_member_id,is_current,personal_json,contacts_json,address_json,access_json,financial_json,integrations_json,memberships_json,metadata_json,raw_json,source_run_id,evo_updated_at,synced_at FROM evo_member_master WHERE unit=? AND evo_member_id=? LIMIT 1").bind(unit,id).first();
        if(!m)return json({ok:false,error:"CLIENTE_AINDA_NAO_SALVO_NA_NOVA_BASE",hint:"Execute SINCRONIZAR DADOS EVO uma vez para preencher a tabela completa."},404);
        const contracts=await env.DB.prepare("SELECT contract_key,id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json,synced_at FROM evo_member_contracts WHERE unit=? AND evo_member_id=? ORDER BY COALESCE(start_date,'') DESC,contract_key DESC").bind(unit,id).all();
        const requestedMonth=String(url.searchParams.get("month")||""),month=/^[0-9]{4}-[0-9]{2}$/.test(requestedMonth)?requestedMonth:new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit"}).format(new Date()).slice(0,7),att=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session AS idActivitySession FROM evo_member_attendance WHERE unit=? AND evo_member_id=? AND substr(attendance_date,1,7)=? ORDER BY attendance_date,start_time,id_activity_session").bind(unit,id,month).all(),ar=att.results||[],times={},acts={},days=new Set();for(const x of ar){days.add(x.attendance_date);if(x.start_time)times[x.start_time]=(times[x.start_time]||0)+1;if(x.activity_name)acts[x.activity_name]=(acts[x.activity_name]||0)+1}const top=o=>Object.entries(o).sort((a,b)=>b[1]-a[1])[0]?.[0]||null,attendanceSummary={attendanceCount:ar.length,distinctDays:days.size,favoriteTime:top(times),favoriteActivity:top(acts),consistency:ar.length?days.size+" dia(s) com presença":null};
        const parse=v=>{try{return JSON.parse(v)}catch{return v}};
        return json({ok:true,unit,evoRequestsMade:0,memberId:id,isCurrent:Boolean(m.is_current),syncedAt:m.synced_at,evoUpdatedAt:m.evo_updated_at,sourceRunId:m.source_run_id,attendanceMonth:month,attendanceRows:ar,categories:{personal:parse(m.personal_json),contacts:parse(m.contacts_json),address:parse(m.address_json),access:parse(m.access_json),financial:parse(m.financial_json),integrations:parse(m.integrations_json),memberships:parse(m.memberships_json),metadata:parse(m.metadata_json)},contracts:(contracts.results||[]).map(x=>({...x,raw:parse(x.raw_json),raw_json:undefined})),attendanceSummary,raw:parse(m.raw_json)});
      }

      // Usuários internos do Club Pop: e-mail + PIN + permissões. D1 é a fonte persistente.
      if (url.pathname === "/staff/login" && request.method === "POST") {
        const b=await request.json().catch(()=>({})),email=String(b.email||"").trim().toLowerCase(),pin=String(b.pin||"").trim();
        if(!email||!/^\d{4,8}$/.test(pin))return json({ok:false,error:"CREDENCIAIS_INVALIDAS"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS staff_users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,pin_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'reception',units_json TEXT NOT NULL DEFAULT '[\"bike\"]',permissions_json TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const u=await env.DB.prepare("SELECT id,name,email,pin_hash,role,units_json,permissions_json,enabled FROM staff_users WHERE lower(email)=? LIMIT 1").bind(email).first();
        if(!u||!u.enabled)return json({ok:false,error:"ACESSO_NEGADO"},401);
        const enc=new TextEncoder(),hex=a=>Array.from(new Uint8Array(a)).map(x=>x.toString(16).padStart(2,"0")).join(""),pb=async(p,s,it=120000)=>hex(await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(s),iterations:it},await crypto.subtle.importKey("raw",enc.encode(p),"PBKDF2",false,["deriveBits"]),256));
        let valid=false;if(String(u.pin_hash).startsWith("pbkdf2$")){const [,it,salt,hash]=String(u.pin_hash).split("$");valid=await pb(pin,salt,Number(it))===hash}else{const legacy=hex(await crypto.subtle.digest("SHA-256",enc.encode(pin)));valid=legacy===u.pin_hash;if(valid){const salt=crypto.randomUUID().replaceAll("-",""),hash=await pb(pin,salt);await env.DB.prepare("UPDATE staff_users SET pin_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind("pbkdf2$120000$"+salt+"$"+hash,u.id).run()}}
        if(!valid)return json({ok:false,error:"PIN_INVALIDO"},401);
        const parse=v=>{try{return JSON.parse(v||"[]")}catch{return []}};
        return json({ok:true,user:{id:u.id,name:u.name,email:u.email,role:u.role,units:parse(u.units_json),permissions:parse(u.permissions_json)}});
      }
      if (url.pathname === "/admin/staff-users" && ["GET","POST","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS staff_users (id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,pin_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'reception',units_json TEXT NOT NULL DEFAULT '[\"bike\"]',permissions_json TEXT NOT NULL DEFAULT '[]',enabled INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const parse=v=>{try{return JSON.parse(v||"[]")}catch{return []}},safe=u=>({id:u.id,name:u.name,email:u.email,role:u.role,units:parse(u.units_json),permissions:parse(u.permissions_json),enabled:Boolean(u.enabled),createdAt:u.created_at,updatedAt:u.updated_at});
        if(request.method==="GET"){const q=await env.DB.prepare("SELECT id,name,email,role,units_json,permissions_json,enabled,created_at,updated_at FROM staff_users ORDER BY enabled DESC,name").all();return json({ok:true,users:(q.results||[]).map(safe)});}
        const b=await request.json().catch(()=>({})),name=String(b.name||"").trim(),email=String(b.email||"").trim().toLowerCase(),pin=String(b.pin||"").trim(),role=b.role==="admin"?"admin":"reception",units=Array.isArray(b.units)?b.units.filter(x=>["bike","gym","club"].includes(x)):["bike"],permissions=Array.isArray(b.permissions)?b.permissions.map(String):[];
        if(!name||!/^\\S+@\\S+\\.\\S+$/.test(email))return json({ok:false,error:"DADOS_INVALIDOS"},400);
        let hash=null;if(pin){if(!/^\d{4,8}$/.test(pin))return json({ok:false,error:"PIN_DEVE_TER_4_A_8_DIGITOS"},400);const enc=new TextEncoder(),salt=crypto.randomUUID().replaceAll("-",""),key=await crypto.subtle.importKey("raw",enc.encode(pin),"PBKDF2",false,["deriveBits"]),bits=await crypto.subtle.deriveBits({name:"PBKDF2",hash:"SHA-256",salt:enc.encode(salt),iterations:120000},key,256),hx=Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,"0")).join("");hash="pbkdf2$120000$"+salt+"$"+hx;}
        if(request.method==="POST"){if(!hash)return json({ok:false,error:"PIN_OBRIGATORIO"},400);try{const q=await env.DB.prepare("INSERT INTO staff_users(name,email,pin_hash,role,units_json,permissions_json,enabled) VALUES(?,?,?,?,?,?,1) RETURNING id").bind(name,email,hash,role,JSON.stringify(units),JSON.stringify(permissions)).first();return json({ok:true,id:q?.id});}catch(e){return json({ok:false,error:String(e.message||e).includes("UNIQUE")?"EMAIL_JA_CADASTRADO":"FALHA_AO_SALVAR"},409)}}
        const id=Number(b.id);if(!Number.isInteger(id)||id<1)return json({ok:false,error:"USUARIO_INVALIDO"},400);const enabled=b.enabled===false?0:1;
        if(hash)await env.DB.prepare("UPDATE staff_users SET name=?,email=?,pin_hash=?,role=?,units_json=?,permissions_json=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,email,hash,role,JSON.stringify(units),JSON.stringify(permissions),enabled,id).run();
        else await env.DB.prepare("UPDATE staff_users SET name=?,email=?,role=?,units_json=?,permissions_json=?,enabled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,email,role,JSON.stringify(units),JSON.stringify(permissions),enabled,id).run();
        return json({ok:true,id});
      }

      // Horários operacionais persistidos no D1. Consultar/salvar não chama a EVO.
      if (url.pathname === "/admin/evo-sync-schedules" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_sync_schedules(unit TEXT NOT NULL,kind TEXT NOT NULL,times_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(unit,kind))").run();if(request.method==="PUT"){const q=await request.json().catch(()=>({})),kind=["student","attendance"].includes(String(q.kind))?String(q.kind):"",times=Array.isArray(q.times)?[...new Set(q.times.map(String).filter(x=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(x)))].sort():[];if(!kind||times.length>12)return json({ok:false,error:"HORARIOS_INVALIDOS"},400);await env.DB.prepare("INSERT INTO evo_sync_schedules(unit,kind,times_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,kind) DO UPDATE SET times_json=excluded.times_json,updated_at=CURRENT_TIMESTAMP").bind(unit,kind,JSON.stringify(times)).run();}const rr=await env.DB.prepare("SELECT kind,times_json FROM evo_sync_schedules WHERE unit=?").bind(unit).all(),out={student:[],attendance:[]};for(const x of rr.results||[]){try{out[x.kind]=JSON.parse(x.times_json||"[]")}catch{}}return json({ok:true,unit,...out});
      }
      if (url.pathname === "/admin/evo-sync-summary" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike",month=new Date().toISOString().slice(0,7),aa=await env.DB.prepare("SELECT COUNT(*) n,MAX(synced_at) lastAt FROM evo_member_attendance WHERE unit=? AND substr(attendance_date,1,7)=?").bind(unit,month).first(),ss=await env.DB.prepare("SELECT COUNT(*) n,MAX(synced_at) lastAt FROM evo_attendance_sessions WHERE unit=? AND substr(activity_date,1,7)=? AND status='done'").bind(unit,month).first(),pp=await env.DB.prepare("SELECT COUNT(*) n FROM evo_attendance_sessions WHERE unit=? AND substr(activity_date,1,7)=? AND status<>'done'").bind(unit,month).first();return json({ok:true,unit,month,attendanceMonth:Number(aa?.n||0),sessionsMonth:Number(ss?.n||0),pending:Number(pp?.n||0),lastAttendanceAt:aa?.lastAt||ss?.lastAt||null});
      }

      // Configuração da sincronização econômica por unidade. Não executa EVO ao consultar/salvar.
      if (url.pathname === "/admin/evo-sync-config" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        if(request.method==="PUT"){const b=await request.json().catch(()=>({})),tm=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(b.syncTime||""))?String(b.syncTime):null;if(!tm)return json({ok:false,error:"HORARIO_INVALIDO"},400);await env.DB.prepare("INSERT INTO evo_sync_config(unit,sync_time,enabled,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET sync_time=excluded.sync_time,updated_at=CURRENT_TIMESTAMP").bind(unit,tm).run();}
        const c=await env.DB.prepare("SELECT unit,sync_time,enabled,last_sync_at,last_sync_status,last_sync_requests FROM evo_sync_config WHERE unit=?").bind(unit).first();
        return json({ok:true,config:c||{unit,sync_time:unit==="gym"?"04:30":"04:00",enabled:1,last_sync_at:null,last_sync_status:null,last_sync_requests:0}});
      }

      // Consulta administrativa do consumo real de requisições EVO.
      if (url.pathname === "/admin/evo-requests" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        const days=Math.max(1,Math.min(60,Number(url.searchParams.get("days")||14)));
        const daily=await env.DB.prepare("SELECT date(datetime(created_at, '-3 hours')) AS day, COUNT(*) AS total, SUM(CASE WHEN ok=1 THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN ok=0 THEN 1 ELSE 0 END) AS errors FROM evo_request_log WHERE unit=? AND datetime(created_at) >= datetime('now', ?) GROUP BY day ORDER BY day DESC").bind(unit,"-"+days+" days").all();
        const purposes=await env.DB.prepare("SELECT purpose,COUNT(*) AS total FROM evo_request_log WHERE unit=? AND date(datetime(created_at, '-3 hours'))=date(datetime('now', '-3 hours')) GROUP BY purpose ORDER BY total DESC").bind(unit).all();
        const recent=await env.DB.prepare("SELECT id,purpose,method,endpoint,status,ok,created_at AS createdAt FROM evo_request_log WHERE unit=? ORDER BY id DESC LIMIT 100").bind(unit).all();
        return json({ok:true,unit,limit:100,daily:daily.results||[],purposes:purposes.results||[],recent:recent.results||[]});
      }

      // Configuração genérica da Tela de Check-in por unidade + atividade.
      if (url.pathname === "/admin/checkin-layouts" && ["GET","PUT"].includes(request.method)) {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40);
        if(request.method==="GET"){const r=await env.DB.prepare("SELECT unit,activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson,updated_at AS updatedAt FROM checkin_layouts WHERE unit=? ORDER BY activity_name").bind(unit).all();return json({ok:true,unit,items:(r.results||[]).map(x=>({...x,rows:JSON.parse(x.rowsJson||"[]")}))});}
        const b=await readJson(request),activityId=String(b.activityId||"").trim().slice(0,120),activityName=String(b.activityName||"").trim().slice(0,160),capacity=Number(b.capacity),rows=Array.isArray(b.rows)?b.rows.map(Number):[];
        if(!activityId||!activityName||!Number.isInteger(capacity)||capacity<1||capacity>200||!rows.length||rows.some(x=>!Number.isInteger(x)||x<1||x>50)||rows.reduce((a,b)=>a+b,0)!==capacity)return json({ok:false,error:"LAYOUT_INVALIDO"},400);
        await env.DB.prepare("INSERT INTO checkin_layouts(unit,activity_id,activity_name,capacity,rows_json,updated_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,activity_id) DO UPDATE SET activity_name=excluded.activity_name,capacity=excluded.capacity,rows_json=excluded.rows_json,updated_at=CURRENT_TIMESTAMP").bind(unit,activityId,activityName,capacity,JSON.stringify(rows)).run();
        return json({ok:true,unit,activityId,activityName,capacity,rows});
      }
      if (url.pathname === "/checkin-layout" && request.method === "GET") {
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40),activityId=String(url.searchParams.get("activityId")||""),activityName=String(url.searchParams.get("activityName")||"");
        let x=null;if(activityId)x=await env.DB.prepare("SELECT activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson FROM checkin_layouts WHERE unit=? AND activity_id=? LIMIT 1").bind(unit,activityId).first();
        if(!x&&activityName)x=await env.DB.prepare("SELECT activity_id AS activityId,activity_name AS activityName,capacity,rows_json AS rowsJson FROM checkin_layouts WHERE unit=? AND lower(activity_name)=lower(?) LIMIT 1").bind(unit,activityName).first();
        return json({ok:true,unit,layout:x?{activityId:x.activityId,activityName:x.activityName,capacity:Number(x.capacity),rows:JSON.parse(x.rowsJson||"[]")}:null});
      }

      
      if (url.pathname === "/admin/evo-vip-checkpoint" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const x=await request.json().catch(()=>({}));if(String(x.unit||"bike")!=="bike")return json({ok:false,error:"DIAGNOSTICO_GYM_BLOQUEADO"},423);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_vip_diagnostic_checkpoint (unit TEXT PRIMARY KEY, next_skip INTEGER NOT NULL DEFAULT 0, contracts INTEGER NOT NULL DEFAULT 0, requests INTEGER NOT NULL DEFAULT 0, vip_json TEXT NOT NULL DEFAULT '[]', details_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        if(x.action==="load"){const q=await env.DB.prepare("SELECT next_skip,contracts,requests,vip_json,details_json,updated_at FROM evo_vip_diagnostic_checkpoint WHERE unit='bike'").first();return json({ok:true,checkpoint:q||null});}
        if(x.action==="reset"){await env.DB.prepare("DELETE FROM evo_vip_diagnostic_checkpoint WHERE unit='bike'").run();return json({ok:true,reset:true});}
        if(x.action!=="save")return json({ok:false,error:"ACAO_INVALIDA"},400);
        const ids=[...new Set((Array.isArray(x.vipIds)?x.vipIds:[]).map(Number).filter(Number.isInteger))],details=Array.isArray(x.details)?x.details.slice(-200):[];
        await env.DB.prepare("INSERT INTO evo_vip_diagnostic_checkpoint(unit,next_skip,contracts,requests,vip_json,details_json,updated_at) VALUES('bike',?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=excluded.next_skip,contracts=excluded.contracts,requests=excluded.requests,vip_json=excluded.vip_json,details_json=excluded.details_json,updated_at=CURRENT_TIMESTAMP").bind(Number(x.nextSkip||0),Number(x.contracts||0),Number(x.requests||0),JSON.stringify(ids),JSON.stringify(details)).run();
        return json({ok:true,saved:true,nextSkip:Number(x.nextSkip||0),contracts:Number(x.contracts||0),vipCount:ids.length});
      }

      if (url.pathname === "/admin/evo-current-job" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const result=await currentStudentJob(env,await request.json());return json(result,result.status||200);
      }

      if (url.pathname === "/admin/evo-contracts-checkpoint" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"").toLowerCase();if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_checkpoint(unit TEXT PRIMARY KEY,next_skip INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const q=await env.DB.prepare("SELECT next_skip,updated_at FROM evo_contract_sync_checkpoint WHERE unit=?").bind(unit).first();
        return json({ok:true,unit,nextSkip:Number(q?.next_skip||0),updatedAt:q?.updated_at||null});
      }

      if (url.pathname === "/admin/evo-contracts-ingest" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const b=await request.json().catch(()=>({})),rawUnit=String(b.unit||"").toLowerCase();if(!["bike","gym"].includes(rawUnit))return json({ok:false,error:"UNIDADE_INVALIDA"},400);const unit=rawUnit,rows=Array.isArray(b.rows)?b.rows:[];
        if(rows.length>100)return json({ok:false,error:"LOTE_CONTRATOS_INVALIDO"},400);
        await env.DB.prepare("CREATE TABLE IF NOT EXISTS evo_contract_sync_checkpoint(unit TEXT PRIMARY KEY,next_skip INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();
        const stm=[];for(const x of rows){const mid=String(x.idMember||""),mm=String(x.idMemberMembership??x.idMembershipMember??x.id??""),im=String(x.idMembership??"");if(!/^\d+$/.test(mid))continue;const key=mm&&mm!=="undefined"&&mm!=="null"?mm:[im,x.startDate||x.startDateMembership||"",x.endDate||x.endDateMembership||""].join(":");stm.push(env.DB.prepare("INSERT INTO evo_member_contracts(unit,evo_member_id,contract_key,id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json,source_run_id,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id,contract_key) DO UPDATE SET id_membership=excluded.id_membership,id_member_membership=excluded.id_member_membership,category_id=excluded.category_id,membership_name=excluded.membership_name,membership_status=excluded.membership_status,start_date=excluded.start_date,end_date=excluded.end_date,cancel_date=excluded.cancel_date,sale_date=excluded.sale_date,is_additional=excluded.is_additional,raw_json=excluded.raw_json,synced_at=CURRENT_TIMESTAMP").bind(unit,mid,key,im||null,mm||null,String(x.idCategoryMembership??x.idMembershipCategory??"" )||null,String(x.nameMembership??x.membershipName??x.name??"").slice(0,200)||null,String(x.statusMemberMembership??x.status??"active"),x.startDate??x.startDateMembership??null,x.endDate??x.endDateMembership??null,x.cancelDate??x.cancellationDate??null,x.saleDate??null,x.isAdditional?1:0,JSON.stringify(x),null))}
        if(stm.length)await env.DB.batch(stm);
        const nextSkip=Math.max(Number(b.nextSkip)||0,Number(b.skip)||0);await env.DB.prepare("INSERT INTO evo_contract_sync_checkpoint(unit,next_skip,updated_at) VALUES(?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=excluded.next_skip,updated_at=CURRENT_TIMESTAMP").bind(unit,nextSkip).run();
        if(b.done){
          // Contratos complementam a classificação operacional sem apagar as fontes já homologadas do cadastro.
          // Somente alunos presentes no espelho atual recebem categorias derivadas de contrato.
          await env.DB.batch([
            env.DB.prepare("INSERT OR REPLACE INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,c.evo_member_id,'aggregator','gympass','active_contract_category' FROM evo_member_contracts c JOIN evo_students s ON s.unit=c.unit AND s.evo_member_id=c.evo_member_id AND s.is_current=1 WHERE c.unit=? AND c.category_id='4' AND lower(COALESCE(c.membership_status,''))='active'").bind(unit,unit),
            env.DB.prepare("INSERT OR REPLACE INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,c.evo_member_id,'aggregator','totalpass','active_contract_category' FROM evo_member_contracts c JOIN evo_students s ON s.unit=c.unit AND s.evo_member_id=c.evo_member_id AND s.is_current=1 WHERE c.unit=? AND c.category_id='5' AND lower(COALESCE(c.membership_status,''))='active'").bind(unit,unit),
            env.DB.prepare("INSERT INTO evo_sync_config(unit,last_sync_at,last_sync_status,updated_at) VALUES(?,CURRENT_TIMESTAMP,'contracts_ok',CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='contracts_ok',updated_at=CURRENT_TIMESTAMP").bind(unit)
          ]);
        }
        const q=await env.DB.prepare("SELECT COUNT(*) contracts,COUNT(DISTINCT evo_member_id) members,COUNT(DISTINCT CASE WHEN category_id IN ('4','5') THEN evo_member_id END) aggregators FROM evo_member_contracts WHERE unit=? AND lower(COALESCE(membership_status,''))='active'").bind(unit).first();
        return json({ok:true,unit,saved:stm.length,summary:{contracts:Number(q?.contracts||0),members:Number(q?.members||0),aggregators:Number(q?.aggregators||0)}});
      }

      // Espelho administrativo de alunos EVO: leitura exclusiva do D1, sem chamada à EVO.
      if (url.pathname === "/admin/evo-students" && request.method === "GET") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase()==="gym"?"gym":"bike";
        return json(await currentStudentsView(env,unit));
        const q=await env.DB.prepare(`SELECT
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND json_extract(payload_json,'$.member.gympassId') IS NULL AND json_extract(payload_json,'$.member.codeTotalpass') IS NULL THEN 1 ELSE 0 END) active,
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND (json_extract(payload_json,'$.member.gympassId') IS NOT NULL OR json_extract(payload_json,'$.member.codeTotalpass') IS NOT NULL) THEN 1 ELSE 0 END) aggregators,
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND json_extract(payload_json,'$.member.gympassId') IS NOT NULL THEN 1 ELSE 0 END) gympass,
          SUM(CASE WHEN json_extract(payload_json,'$.member.status')='Active' AND json_extract(payload_json,'$.member.codeTotalpass') IS NOT NULL THEN 1 ELSE 0 END) totalpass,
          SUM(CASE WHEN lower(COALESCE(json_extract(payload_json,'$.member.status'),'')) LIKE '%suspend%' THEN 1 ELSE 0 END) suspended,
          SUM(CASE WHEN lower(COALESCE(json_extract(payload_json,'$.member.membershipStatus'),'')) LIKE '%vip%' THEN 1 ELSE 0 END) vip,
          COUNT(*) total, MAX(updated_at) updatedAt FROM evo_member_cache WHERE unit=?`).bind(unit).first();
        const cfg=await env.DB.prepare("SELECT last_sync_at,last_sync_requests FROM evo_sync_config WHERE unit=?").bind(unit).first();
        const lg=await env.DB.prepare("SELECT added,changed,removed,requests,details,datetime(created_at,'-3 hours') createdAt FROM evo_student_sync_log WHERE unit=? ORDER BY id DESC LIMIT 20").bind(unit).all();
        return json({ok:true,unit,counts:{active:Number(q?.active||0),aggregators:Number(q?.aggregators||0),gympass:Number(q?.gympass||0),totalpass:Number(q?.totalpass||0),suspended:Number(q?.suspended||0),vip:Number(q?.vip||0),total:Number(q?.total||0)},lastSyncAt:cfg?.last_sync_at||q?.updatedAt||null,lastRequests:Number(cfg?.last_sync_requests||0),logs:lg.results||[],source:"d1"});
      }


      if (url.pathname === "/admin/evo-students-ingest" && request.method === "POST") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||""; if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}}),vd=await vr.json().catch(()=>({})); if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const x=await request.json().catch(()=>({})),unit=String(x.unit||"bike").toLowerCase()==="gym"?"gym":"bike"; if(unit!=="bike")return json({ok:false,error:"SYNC_GYM_BLOQUEADO_EM_VALIDACAO"},423);
        const members=Array.isArray(x.members)?x.members:[],reqs=Number(x.requests||0),reset=x.reset===true,done=x.done===true,nextSkip=Number(x.nextSkip||0);
        if(reset){await env.DB.prepare("DELETE FROM evo_student_sync_stage WHERE unit=?").bind(unit).run();await env.DB.prepare("DELETE FROM evo_student_sync_state WHERE unit=?").bind(unit).run();}
        const statements=[];for(const m of members){const id=String(m.idMember||m.id||"");if(!id)continue;const minimal={member:{idMember:Number(id),firstName:m.firstName||m.registerName||"",lastName:m.lastName||m.registerLastName||"",status:m.status||null,accessBlocked:m.accessBlocked??null,membershipStatus:m.membershipStatus||null,gympassId:m.gympassId||null,codeTotalpass:m.codeTotalpass||null,contractName:m.contractName||"",contractType:m.contractType||"",idContractType:m.idContractType??null,idMembership:m.idMembership??null,idMembershipCategory:m.idMembershipCategory??null,membershipCategoryName:m.membershipCategoryName||"",contractStart:m.contractStart||"",contractEnd:m.contractEnd||""},fitcoins:m.totalFitCoins??null};statements.push(env.DB.prepare("INSERT INTO evo_student_sync_stage(unit,evo_member_id,payload_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET payload_json=excluded.payload_json,updated_at=CURRENT_TIMESTAMP").bind(unit,id,JSON.stringify(minimal)));}for(let i=0;i<statements.length;i+=50)await env.DB.batch(statements.slice(i,i+50));
        const os=await env.DB.prepare("SELECT links_processed,requests FROM evo_student_sync_state WHERE unit=?").bind(unit).first(),linksProcessed=(reset?0:Number(os?.links_processed||0))+Number(x.batchLinks??members.length),totalRequests=(reset?0:Number(os?.requests||0))+reqs;await env.DB.prepare("INSERT INTO evo_student_sync_state(unit,next_skip,links_processed,requests,started_at,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET next_skip=excluded.next_skip,links_processed=excluded.links_processed,requests=excluded.requests,updated_at=CURRENT_TIMESTAMP").bind(unit,nextSkip,linksProcessed,totalRequests).run();
        const staged=await env.DB.prepare("SELECT COUNT(*) n FROM evo_student_sync_stage WHERE unit=?").bind(unit).first();if(!done)return json({ok:true,unit,staged:Number(staged?.n||0),linksProcessed,requests:totalRequests,nextSkip,done:false});
        const before=await env.DB.prepare("SELECT evo_member_id,payload_json FROM evo_member_cache WHERE unit=?").bind(unit).all(),stage=await env.DB.prepare("SELECT evo_member_id,payload_json FROM evo_student_sync_stage WHERE unit=?").bind(unit).all(),prev=new Map((before.results||[]).map(r=>[String(r.evo_member_id),r.payload_json])),fresh=new Map((stage.results||[]).map(r=>[String(r.evo_member_id),r.payload_json]));let added=0,changed=0,removed=0;for(const [id,p] of fresh){if(!prev.has(id))added++;else if(prev.get(id)!==p)changed++;}for(const id of prev.keys())if(!fresh.has(id))removed++;
        await env.DB.prepare("DELETE FROM evo_member_cache WHERE unit=?").bind(unit).run();const promote=[];for(const [id,p] of fresh)promote.push(env.DB.prepare("INSERT INTO evo_member_cache(unit,evo_member_id,payload_json,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP)").bind(unit,id,p));for(let i=0;i<promote.length;i+=50)await env.DB.batch(promote.slice(i,i+50));
        await env.DB.prepare("INSERT INTO evo_student_sync_log(unit,added,changed,removed,requests,details) VALUES(?,?,?,?,?,?)").bind(unit,added,changed,removed,totalRequests,JSON.stringify({received:fresh.size,linksProcessed})).run();await env.DB.prepare("INSERT INTO evo_sync_config(unit,last_sync_at,last_sync_status,last_sync_requests) VALUES(?,CURRENT_TIMESTAMP,'ok',?) ON CONFLICT(unit) DO UPDATE SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='ok',last_sync_requests=excluded.last_sync_requests").bind(unit,totalRequests).run();await env.DB.prepare("DELETE FROM evo_student_sync_stage WHERE unit=?").bind(unit).run();await env.DB.prepare("DELETE FROM evo_student_sync_state WHERE unit=?").bind(unit).run();return json({ok:true,unit,saved:fresh.size,added,changed,removed,requests:totalRequests,linksProcessed,done:true});
      }

// =====================================================
      // HEALTH CHECK
      // =====================================================

      if (request.method === "GET" && url.pathname === "/") {
        return json({
          ok: true,
          service: "CLUB POP API",
          version: "1.0.0",
        });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        const db = await env.DB.prepare(
          "SELECT COUNT(*) AS total FROM members"
        ).first();

        return json({
          ok: true,
          service: "CLUB POP API",
          database: "connected",
          members: Number(db?.total || 0),
        });
      }

      // =====================================================
      // PRIMEIRO ACESSO - VALIDAR DADOS NA EVO
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/first-access"
      ) {
        const body = await readJson(request);

        const cpf = normalizeCpf(body.cpf);
        const email = normalizeEmail(body.email);
        const birthDate = normalizeDate(body.birthDate);

        if (!validCpfShape(cpf)) {
          return json({ ok: false, error: "CPF_INVALIDO" }, 400);
        }

        if (!email || !birthDate) {
          return json(
            { ok: false, error: "DADOS_INCOMPLETOS" },
            400
          );
        }

        const cpfHash = await sha256(cpf);

        const existing = await env.DB.prepare(`
          SELECT id, pin_hash
          FROM members
          WHERE cpf_hash = ?
          LIMIT 1
        `).bind(cpfHash).first();

        if (existing?.pin_hash) {
          return json({
            ok: false,
            error: "CONTA_JA_CRIADA",
            hasAccount: true,
          }, 409);
        }

        const evoMember = await findEvoMember(env, cpf);

        if (!evoMember) {
          await audit(env, "SYSTEM", null, "FIRST_ACCESS_MEMBER_NOT_FOUND");
          return json({
            ok: false,
            error: "DADOS_NAO_CONFEREM",
          }, 401);
        }

        const evoEmail = normalizeEmail(
          evoMember.email ||
          evoMember.emailAddress ||
          evoMember.mail ||
          ""
        );

        const evoBirth = normalizeDate(
          evoMember.birthDate ||
          evoMember.dateBirth ||
          evoMember.birthdate ||
          evoMember.birthday ||
          ""
        );

        if (evoEmail !== email || evoBirth !== birthDate) {
          await audit(
            env,
            "MEMBER",
            String(evoMember.idMember || ""),
            "FIRST_ACCESS_DATA_MISMATCH"
          );

          return json({
            ok: false,
            error: "DADOS_NAO_CONFEREM",
          }, 401);
        }

        const challenge = randomToken(32);
        const challengeHash = await sha256(challenge);
        const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        const firstName =
          evoMember.firstName ||
          evoMember.name ||
          "";

        const lastName =
          evoMember.lastName ||
          "";

        const evoId = Number(evoMember.idMember);

        const target = existing || await env.DB.prepare("SELECT id FROM members WHERE evo_member_id = ? LIMIT 1").bind(evoId).first();
        if (target?.id) {
          await env.DB.prepare(`
            UPDATE members
            SET evo_member_id = ?,
                cpf_hash = ?,
                cpf_last4 = ?,
                first_name = ?,
                last_name = ?,
                email = ?,
                birth_date = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            evoId,
            cpfHash,
            cpf.slice(-4),
            firstName,
            lastName,
            email,
            birthDate,
            target.id
          ).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO members (
              evo_member_id,
              cpf_hash,
              cpf_last4,
              first_name,
              last_name,
              email,
              birth_date
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            evoId,
            cpfHash,
            cpf.slice(-4),
            firstName,
            lastName,
            email,
            birthDate
          ).run();
        }

        const member = await env.DB.prepare(`
          SELECT id
          FROM members
          WHERE cpf_hash = ?
          LIMIT 1
        `).bind(cpfHash).first();

        // Reutilizamos auth_sessions para o desafio temporário.
        await env.DB.prepare(`
          INSERT INTO auth_sessions (
            member_id,
            token_hash,
            expires_at
          )
          VALUES (?, ?, ?)
        `).bind(
          member.id,
          challengeHash,
          expires
        ).run();

        await audit(
          env,
          "MEMBER",
          String(member.id),
          "FIRST_ACCESS_VALIDATED"
        );

        return json({
          ok: true,
          validated: true,
          challenge,
          expiresIn: 600,
          member: {
            firstName,
          },
        });
      }

      // =====================================================
      // CRIAR PIN
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/create-pin"
      ) {
        const body = await readJson(request);

        const challenge = String(body.challenge || "");
        const pin = String(body.pin || "");

        if (!/^\d{6}$/.test(pin)) {
          return json({
            ok: false,
            error: "PIN_DEVE_TER_6_NUMEROS",
          }, 400);
        }

        const challengeHash = await sha256(challenge);

        const session = await env.DB.prepare(`
          SELECT
            s.id,
            s.member_id,
            s.expires_at,
            s.revoked_at,
            m.pin_hash
          FROM auth_sessions s
          JOIN members m ON m.id = s.member_id
          WHERE s.token_hash = ?
          LIMIT 1
        `).bind(challengeHash).first();

        if (
          !session ||
          session.revoked_at ||
          new Date(session.expires_at).getTime() < Date.now()
        ) {
          return json({
            ok: false,
            error: "VALIDACAO_EXPIRADA",
          }, 401);
        }

        if (session.pin_hash) {
          return json({
            ok: false,
            error: "PIN_JA_CRIADO",
          }, 409);
        }

        const salt = randomToken(16);
        const pinHash = await hashPin(pin, salt);

        await env.DB.prepare(`
          UPDATE members
          SET pin_hash = ?,
              pin_salt = ?,
              pin_created_at = CURRENT_TIMESTAMP,
              failed_login_attempts = 0,
              locked_until = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          pinHash,
          salt,
          session.member_id
        ).run();

        await env.DB.prepare(`
          UPDATE auth_sessions
          SET revoked_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(session.id).run();

        const auth = await createSession(env, session.member_id);

        await audit(
          env,
          "MEMBER",
          String(session.member_id),
          "PIN_CREATED"
        );

        return json({
          ok: true,
          accountCreated: true,
          token: auth.token,
          expiresAt: auth.expiresAt,
        });
      }

      // =====================================================
      // LOGIN CPF + PIN
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/login"
      ) {
        const body = await readJson(request);

        const cpf = normalizeCpf(body.cpf);
        const pin = String(body.pin || "");

        if (!validCpfShape(cpf) || !/^\d{6}$/.test(pin)) {
          return json({
            ok: false,
            error: "CREDENCIAIS_INVALIDAS",
          }, 401);
        }

        const cpfHash = await sha256(cpf);

        const member = await env.DB.prepare(`
          SELECT *
          FROM members
          WHERE cpf_hash = ?
          LIMIT 1
        `).bind(cpfHash).first();

        if (!member?.pin_hash || !member?.pin_salt) {
          return json({
            ok: false,
            error: "PRIMEIRO_ACESSO_NECESSARIO",
          }, 401);
        }

        if (
          member.locked_until &&
          new Date(member.locked_until).getTime() > Date.now()
        ) {
          return json({
            ok: false,
            error: "ACESSO_TEMPORARIAMENTE_BLOQUEADO",
            lockedUntil: member.locked_until,
          }, 423);
        }

        const candidate = await hashPin(pin, member.pin_salt);

        if (!safeEqual(candidate, member.pin_hash)) {
          const attempts =
            Number(member.failed_login_attempts || 0) + 1;

          if (attempts >= 5) {
            const lockedUntil =
              new Date(Date.now() + 15 * 60 * 1000).toISOString();

            await env.DB.prepare(`
              UPDATE members
              SET failed_login_attempts = 0,
                  locked_until = ?,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(
              lockedUntil,
              member.id
            ).run();

            await audit(
              env,
              "MEMBER",
              String(member.id),
              "LOGIN_TEMPORARILY_LOCKED"
            );

            return json({
              ok: false,
              error: "ACESSO_TEMPORARIAMENTE_BLOQUEADO",
              lockedUntil,
            }, 423);
          }

          await env.DB.prepare(`
            UPDATE members
            SET failed_login_attempts = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            attempts,
            member.id
          ).run();

          return json({
            ok: false,
            error: "CREDENCIAIS_INVALIDAS",
            attemptsRemaining: 5 - attempts,
          }, 401);
        }

        await env.DB.prepare(`
          UPDATE members
          SET failed_login_attempts = 0,
              locked_until = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(member.id).run();

        const auth = await createSession(env, member.id);

        await audit(
          env,
          "MEMBER",
          String(member.id),
          "LOGIN_SUCCESS"
        );

        return json({
          ok: true,
          token: auth.token,
          expiresAt: auth.expiresAt,
          member: publicMember(member),
        });
      }

      // =====================================================
      // USUÁRIO LOGADO
      // =====================================================

      if (
        request.method === "GET" &&
        url.pathname === "/auth/me"
      ) {
        const member = await authenticatedMember(request, env);

        if (!member) {
          return json({
            ok: false,
            error: "NAO_AUTORIZADO",
          }, 401);
        }

        return json({
          ok: true,
          member: publicMember(member),
        });
      }

      // =====================================================
      // ADMIN - CONSULTAR / VINCULAR GYM POP
      // =====================================================
      if (request.method === "POST" && url.pathname === "/admin/member-gym-link") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const body=await readJson(request),cpf=normalizeCpf(body.cpf),action=String(body.action||"status");
        if(!validCpfShape(cpf))return json({ok:false,error:"CPF_INVALIDO"},400);
        const cpfHash=await sha256(cpf);
        const member=await env.DB.prepare("SELECT id,evo_member_id,gym_client_id,first_name,last_name,email,status FROM members WHERE cpf_hash=? LIMIT 1").bind(cpfHash).first();
        if(!member)return json({ok:false,error:"ALUNO_CLUB_POP_NAO_ENCONTRADO"},404);
        const base={id:member.id,name:[member.first_name,member.last_name].filter(Boolean).join(" "),email:member.email||null,bikeMemberId:member.evo_member_id||null,gymMemberId:member.gym_client_id||null,bikeLinked:!!member.evo_member_id,gymLinked:!!member.gym_client_id};
        if(action==="status")return json({ok:true,member:base});
        if(action!=="link")return json({ok:false,error:"ACAO_INVALIDA"},400);
        if(member.gym_client_id)return json({ok:true,alreadyLinked:true,linked:true,member:base});
        const gymMember=await findGymEvoMember(env,cpf);
        if(!gymMember?.idMember)return json({ok:false,error:"GYM_CADASTRO_NAO_ENCONTRADO",member:base},404);
        const gymId=Number(gymMember.idMember);
        if(!Number.isFinite(gymId))return json({ok:false,error:"GYM_ID_INVALIDO"},502);
        const collision=await env.DB.prepare("SELECT id FROM members WHERE gym_client_id=? AND id<>? LIMIT 1").bind(gymId,member.id).first();
        if(collision)return json({ok:false,error:"GYM_JA_VINCULADO_A_OUTRA_CONTA"},409);
        await env.DB.prepare("UPDATE members SET gym_client_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(gymId,member.id).run();
        await audit(env,"ADMIN",String(member.id),"GYM_LINKED_BY_ADMIN","GYM_LINK",String(gymId));
        return json({ok:true,linked:true,member:{...base,gymMemberId:gymId,gymLinked:true}});
      }

      // =====================================================
      // VINCULAR GYM POP
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/member/link-gym"
      ) {
        const member = await authenticatedMember(request, env);

        if (!member) {
          return json({ ok: false, error: "NAO_AUTORIZADO" }, 401);
        }

        const body = await readJson(request);
        const cpf = normalizeCpf(body.cpf);

        if (!validCpfShape(cpf)) {
          return json({ ok: false, error: "CPF_INVALIDO" }, 400);
        }

        const cpfHash = await sha256(cpf);
        if (!safeEqual(cpfHash, String(member.cpf_hash || ""))) {
          await audit(env, "MEMBER", String(member.id), "GYM_LINK_CPF_MISMATCH", "GYM_LINK");
          return json({ ok: false, error: "DADOS_NAO_CONFEREM" }, 401);
        }

        const gymMember = await findGymEvoMember(env, cpf);
        if (!gymMember?.idMember) {
          await audit(env, "MEMBER", String(member.id), "GYM_MEMBER_NOT_FOUND", "GYM_LINK");
          return json({ ok: false, error: "GYM_CADASTRO_NAO_ENCONTRADO" }, 404);
        }

        const gymId = Number(gymMember.idMember);
        if (!Number.isFinite(gymId)) {
          return json({ ok: false, error: "GYM_ID_INVALIDO" }, 502);
        }

        const collision = await env.DB.prepare(`
          SELECT id FROM members
          WHERE gym_client_id = ? AND id <> ?
          LIMIT 1
        `).bind(gymId, member.id).first();

        if (collision) {
          await audit(env, "MEMBER", String(member.id), "GYM_LINK_CONFLICT", "GYM_LINK", String(gymId));
          return json({ ok: false, error: "GYM_JA_VINCULADO" }, 409);
        }

        await env.DB.prepare(`
          UPDATE members
          SET gym_client_id = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(gymId, member.id).run();

        await audit(env, "MEMBER", String(member.id), "GYM_LINKED", "GYM_LINK", String(gymId));

        return json({ ok: true, linked: true, gymMemberId: gymId });
      }


      // =====================================================
      // ADMIN - CONFIGURACAO EVO POR UNIDADE (FASE 0)
      // =====================================================
      if ((request.method === "GET" || request.method === "PUT" || request.method === "POST") && url.pathname === "/admin/evo-config") {
        const ck=request.headers.get("x-clubpop-admin-cookie")||"";
        if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});
        const vd=await vr.json().catch(()=>({}));
        if(!vr.ok||vd.role!=="admin")return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const unit=String(url.searchParams.get("unit")||"bike").toLowerCase().replace(/[^a-z0-9_-]/g,"").slice(0,40); if(!["bike","gym"].includes(unit))return json({ok:false,error:"UNIDADE_EVO_NAO_SUPORTADA"},400);
        if(request.method==="GET"){
          const row=await env.DB.prepare("SELECT unit,dns,token,expires_at,enabled,updated_at FROM evo_unit_config WHERE unit=? LIMIT 1").bind(unit).first();
          return json({ok:true,unit,configured:!!(row?.dns&&row?.token),dns:row?.dns||"",expiresAt:row?.expires_at||"",hasToken:!!row?.token,enabled:row?!!row.enabled:false,updatedAt:row?.updated_at||null});
        }
        if(request.method==="PUT"){
          const b=await readJson(request),dns=String(b.dns||"").trim(),expiresAt=String(b.expiresAt||"").trim(),token=String(b.token||"").trim();
          if(!dns||!expiresAt)return json({ok:false,error:"DNS_E_VALIDADE_OBRIGATORIOS"},400);
          if(!validEvoExpiry(expiresAt))return json({ok:false,error:"EVO_VALIDADE_INVALIDA"},400);
          const old=await env.DB.prepare("SELECT token FROM evo_unit_config WHERE unit=? LIMIT 1").bind(unit).first();
          const finalToken=token||String(old?.token||"");
          if(!finalToken)return json({ok:false,error:"TOKEN_OBRIGATORIO"},400);
          await env.DB.prepare("INSERT INTO evo_unit_config(unit,dns,token,expires_at,enabled,updated_at) VALUES(?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(unit) DO UPDATE SET dns=excluded.dns,token=excluded.token,expires_at=excluded.expires_at,enabled=1,updated_at=CURRENT_TIMESTAMP").bind(unit,dns,finalToken,expiresAt).run();
          return json({ok:true,unit,configured:true,dns,expiresAt,hasToken:true,enabled:true});
        }
        if(request.method==="POST"){
          const row=await getEvoConfig(env,unit);
          const auth="Basic "+btoa(String(row.dns)+":"+String(row.token));
          const date=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()); const er=await fetch("https://evo-integracao-api.w12app.com.br/api/v1/activities/schedule?date="+encodeURIComponent(date)+"&showFullWeek=false&take=1",{headers:{Authorization:auth,Accept:"application/json"}});
          if(!er.ok)return json({ok:false,error:"EVO_CREDENCIAIS_RECUSADAS",status:er.status},er.status);
          const ed=await er.json().catch(()=>[]),items=Array.isArray(ed)?ed:(ed?.items||ed?.data||[]);
          return json({ok:true,status:"connected",unit,count:items.length,message:"Conexao EVO confirmada diretamente pela configuracao da unidade, sem cache."});
        }
      }

      // =====================================================
      // LOGOUT
      // =====================================================

      if (
        request.method === "POST" &&
        url.pathname === "/auth/logout"
      ) {
        const token = bearer(request);

        if (token) {
          const tokenHash = await sha256(token);

          await env.DB.prepare(`
            UPDATE auth_sessions
            SET revoked_at = CURRENT_TIMESTAMP
            WHERE token_hash = ?
              AND revoked_at IS NULL
          `).bind(tokenHash).run();
        }

        return json({
          ok: true,
        });
      }


      // =====================================================
      // PROMOTION NUMBERS + MISSION REDEMPTIONS
      // =====================================================
      
if(url.pathname==="/promotion-numbers/admin/sync-batch"&&request.method==="POST"){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||""),skip=Math.max(0,Number(body.skip||0)),promo=await clubContentItem("promotion",key);if(!promo||promo.status!=="Ativo"||promo.promotionType!=="lucky_number"||!promo.luckyNumber?.enabled)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);const accepted=new Set((promo.eligibility?.acceptedContracts||[]).map(String));if((promo.eligibility?.mode||"any")!=="active_contract"||!accepted.size)return json({ok:false,error:"PROMOCAO_SEM_CONTRATOS_ELEGIVEIS"},400);const cfg=await getEvoConfig(env,"bike"),auth="Basic "+btoa(cfg.dns+":"+cfg.token),take=25,ep="https://evo-integracao-api.w12app.com.br/api/v3/membermembership?take="+take+"&skip="+skip+"&statusMemberMembership=1&showAggregators=true&showVips=true",er=await fetch(ep,{headers:{Authorization:auth,Accept:"application/json"}});if(!er.ok)return json({ok:false,error:"EVO_CONTRATOS_HTTP_"+er.status},502);const ed=await er.json(),items=Array.isArray(ed)?ed:(ed.items||ed.data||ed.lista||ed.list||[]),eligible=[...new Map(items.filter(x=>Number(x.statusMemberMembership||1)===1&&accepted.has(String(x.idMembership))).filter(x=>Number(x.idMember)>0).map(x=>[String(x.idMember),x])).values()];let participating=0,generated=0,attendance=0,errors=[];for(const x of eligible){try{const evoId=Number(x.idMember);let member=await env.DB.prepare("SELECT * FROM members WHERE evo_member_id=? LIMIT 1").bind(evoId).first();if(!member){const parts=String(x.name||"Aluno").trim().split(/\s+/),first=parts.shift()||"Aluno",last=parts.join(" ");await env.DB.prepare("INSERT INTO members(evo_member_id,cpf_hash,first_name,last_name,status) VALUES(?,?,?,?,'ACTIVE')").bind(evoId,"evo-placeholder:"+evoId,first,last).run();member=await env.DB.prepare("SELECT * FROM members WHERE evo_member_id=? LIMIT 1").bind(evoId).first()}await evoAttendance(env,evoId,promo.start,promo.end,member.id);const ac=Number((await env.DB.prepare("SELECT COUNT(*) n FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ?").bind(member.id,promo.unit||"bike",promo.start,promo.end).first())?.n||0);attendance+=ac;if(ac<1)continue;participating++;const before=Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN promotions pr ON pr.id=l.promotion_id WHERE pr.slug=? AND pp.member_id=? AND l.status='ACTIVE'").bind(key,member.id).first())?.n||0);await syncLuckyMember(env,member,promo);const after=Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN promotions pr ON pr.id=l.promotion_id WHERE pr.slug=? AND pp.member_id=? AND l.status='ACTIVE'").bind(key,member.id).first())?.n||0);generated+=Math.max(0,after-before)}catch(e){errors.push({idMember:x.idMember,error:String(e.message||e).slice(0,160)})}}const nextSkip=items.length===take?skip+take:null;if(nextSkip==null){await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_sync_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,unit TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,participating INTEGER NOT NULL DEFAULT 0,attendance INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();const t=body.totals||{};await env.DB.prepare("INSERT INTO promotion_sync_runs(promotion_slug,unit,processed,eligible,participating,attendance,generated,errors) VALUES(?,?,?,?,?,?,?,?)").bind(key,promo.unit||"bike",Number(t.processed||0)+items.length,Number(t.eligible||0)+eligible.length,Number(t.participating||0)+participating,Number(t.attendance||0)+attendance,Number(t.generated||0)+generated,Number(t.errors||0)+errors.length).run()}return json({ok:true,promotion:{id:key,name:promo.name},batch:{skip,processed:items.length,eligible:eligible.length,participating,attendance,generated,errors},nextSkip,done:nextSkip==null})}

if(url.pathname==="/promotion-numbers/admin/generate-batch"&&request.method==="POST"){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||"");await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_number_update_state(promotion_slug TEXT PRIMARY KEY,unit TEXT NOT NULL DEFAULT 'bike',next_skip INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'IN_PROGRESS',checked INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,with_attendance INTEGER NOT NULL DEFAULT 0,participants_updated INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_number_update_log(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,unit TEXT NOT NULL DEFAULT 'bike',mode TEXT NOT NULL DEFAULT 'FULL',status TEXT NOT NULL,checked INTEGER NOT NULL DEFAULT 0,eligible INTEGER NOT NULL DEFAULT 0,with_attendance INTEGER NOT NULL DEFAULT 0,participants_updated INTEGER NOT NULL DEFAULT 0,generated INTEGER NOT NULL DEFAULT 0,errors INTEGER NOT NULL DEFAULT 0,checkpoint INTEGER NOT NULL DEFAULT 0,evo_member_id TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_number_update_errors(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,evo_member_id TEXT,student_name TEXT,error TEXT NOT NULL,checkpoint INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();try{await env.DB.prepare("ALTER TABLE promotion_number_update_errors ADD COLUMN status TEXT NOT NULL DEFAULT 'PENDING'").run()}catch{}try{await env.DB.prepare("ALTER TABLE promotion_number_update_errors ADD COLUMN resolution_note TEXT").run()}catch{}try{await env.DB.prepare("ALTER TABLE promotion_number_update_errors ADD COLUMN resolved_at TEXT").run()}catch{}const totalBase=Number((await env.DB.prepare("SELECT COUNT(*) n FROM evo_students WHERE unit='bike' AND is_current=1").first())?.n||0);if(body.action==="status"){const state=await env.DB.prepare("SELECT * FROM promotion_number_update_state WHERE promotion_slug=?").bind(key).first(),logs=await env.DB.prepare("SELECT * FROM promotion_number_update_log WHERE promotion_slug=? ORDER BY id DESC LIMIT 5").bind(key).all(),er=await env.DB.prepare("SELECT id,evo_member_id,student_name,error,checkpoint,created_at,status,resolution_note,resolved_at FROM promotion_number_update_errors WHERE promotion_slug=? ORDER BY CASE WHEN status='PENDING' THEN 0 ELSE 1 END,id DESC LIMIT 50").bind(key).all();return json({ok:true,source:"d1",evoRequestsMade:0,totalBase,state:state||null,logs:logs.results||[],exceptions:er.results||[]})}if(body.action==="ignore-error"){const errorId=Number(body.errorId||0),note=String(body.reason||"Analisado e ignorado pelo administrador").trim().slice(0,240);if(!errorId)return json({ok:false,error:"ERRO_INVALIDO"},400);const row=await env.DB.prepare("SELECT id FROM promotion_number_update_errors WHERE id=? AND promotion_slug=?").bind(errorId,key).first();if(!row)return json({ok:false,error:"ERRO_NAO_ENCONTRADO"},404);await env.DB.prepare("UPDATE promotion_number_update_errors SET status='IGNORED',resolution_note=?,resolved_at=CURRENT_TIMESTAMP WHERE id=? AND promotion_slug=?").bind(note,errorId,key).run();return json({ok:true,errorId,status:"IGNORED"})}const state=await env.DB.prepare("SELECT * FROM promotion_number_update_state WHERE promotion_slug=?").bind(key).first(),singleId=String(body.evoMemberId||"").trim(),isSingle=body.action==="single"&&singleId,skip=isSingle?0:Math.max(0,body.skip==null?Number(state?.next_skip||0):Number(body.skip||0)),take=isSingle?1:Math.max(1,Math.min(10,Number(body.take||10))),promo=await clubContentItem("promotion",key);if(!promo||promo.status!=="Ativo"||promo.promotionType!=="lucky_number"||!promo.luckyNumber?.enabled)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);if((promo.unit||"bike")!=="bike")return json({ok:false,error:"ATUALIZACAO_GYM_BLOQUEADA"},423);const accepted=new Set((promo.eligibility?.acceptedContracts||[]).map(String)),mode=promo.eligibility?.mode||"any",today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo"}).format(new Date());const rr=isSingle?await env.DB.prepare("SELECT es.evo_member_id,es.display_name,m.id member_id FROM evo_students es LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=es.evo_member_id WHERE es.unit='bike' AND es.is_current=1 AND es.evo_member_id=? LIMIT 1").bind(singleId).all():await env.DB.prepare("SELECT es.evo_member_id,es.display_name,m.id member_id FROM evo_students es LEFT JOIN members m ON CAST(m.evo_member_id AS TEXT)=es.evo_member_id WHERE es.unit='bike' AND es.is_current=1 ORDER BY CAST(es.evo_member_id AS INTEGER) LIMIT ? OFFSET ?").bind(take,skip).all(),rows=rr.results||[];if(isSingle&&!rows.length)return json({ok:false,error:"ALUNO_NAO_ENCONTRADO_NA_BASE_ATUAL"},404);let checked=0,eligible=0,withAttendance=0,participantsUpdated=0,existingNumbers=0,generated=0,finalNumbers=0,errors=[];for(const x of rows){checked++;try{let member=x.member_id?await env.DB.prepare("SELECT * FROM members WHERE id=?").bind(x.member_id).first():null;if(!member){const parts=String(x.display_name||"Aluno").trim().split(/\s+/),first=parts.shift()||"Aluno",last=parts.join(" ");await env.DB.prepare("INSERT OR IGNORE INTO members(evo_member_id,cpf_hash,first_name,last_name,status) VALUES(?,?,?,?,'ACTIVE')").bind(Number(x.evo_member_id),"evo-placeholder:"+x.evo_member_id,first,last).run();member=await env.DB.prepare("SELECT * FROM members WHERE evo_member_id=? LIMIT 1").bind(Number(x.evo_member_id)).first()}let ok=mode==="any";if(!ok&&mode==="active_contract"){const manual=await env.DB.prepare("SELECT id FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? AND status='APPROVED' ORDER BY id DESC LIMIT 1").bind(key,member.id).first();if(manual)ok=true;else{const cr=await env.DB.prepare("SELECT id_membership,end_date,cancel_date FROM evo_member_contracts WHERE unit='bike' AND evo_member_id=?").bind(String(x.evo_member_id)).all();ok=(cr.results||[]).some(c=>accepted.has(String(c.id_membership))&&(!c.cancel_date||String(c.cancel_date).slice(0,10)>=today)&&(!c.end_date||String(c.end_date).slice(0,10)>=today))}}if(!ok)continue;eligible++;const ar=await env.DB.prepare("SELECT attendance_date,start_time,activity_name,id_activity_session FROM evo_member_attendance WHERE unit='bike' AND evo_member_id=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date,start_time,id_activity_session").bind(String(x.evo_member_id),promo.start,promo.end).all(),atts=ar.results||[];if(!atts.length)continue;withAttendance++;for(const a of atts){const keyA=["bike",member.id,a.attendance_date,a.id_activity_session||a.activity_name||"attendance"].join(":");await env.DB.prepare("INSERT OR IGNORE INTO attendance_history(member_id,evo_member_id,unit,attendance_key,attendance_date,activity_id,activity_name,raw_json) VALUES(?,?,?,?,?,?,?,?)").bind(member.id,member.evo_member_id,"bike",keyA,a.attendance_date,null,a.activity_name||null,JSON.stringify(a)).run()}const dp=await ensurePromotion(env,promo);const oldPt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),before=oldPt?Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE'").bind(dp.id,oldPt.id).first())?.n||0):0;existingNumbers+=before;await syncLuckyMember(env,member,promo);const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),after=Number((await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE'").bind(dp.id,pt.id).first())?.n||0),added=Math.max(0,after-before);if(added)participantsUpdated++;generated+=added;finalNumbers+=after}catch(e){errors.push({idMember:x.evo_member_id,error:String(e.message||e).slice(0,160)})}}for(const er of errors){const src=rows.find(r=>String(r.evo_member_id)===String(er.idMember));await env.DB.prepare("INSERT INTO promotion_number_update_errors(promotion_slug,evo_member_id,student_name,error,checkpoint,status) VALUES(?,?,?,?,?,'PENDING')").bind(key,String(er.idMember||""),String(src?.display_name||""),String(er.error||"Erro não identificado"),skip+checked).run()}const nextSkip=isSingle?null:(rows.length===take?skip+take:null);if(isSingle){await env.DB.prepare("INSERT INTO promotion_number_update_log(promotion_slug,unit,mode,status,checked,eligible,with_attendance,participants_updated,generated,errors,checkpoint,evo_member_id) VALUES(?,'bike','SINGLE','COMPLETE',?,?,?,?,?,?,0,?)").bind(key,checked,eligible,withAttendance,participantsUpdated,generated,errors.length,singleId).run()}else{const prev=state&&state.status==="IN_PROGRESS"?state:null,tc=Number(prev?.checked||0)+checked,te=Number(prev?.eligible||0)+eligible,tw=Number(prev?.with_attendance||0)+withAttendance,tp=Number(prev?.participants_updated||0)+participantsUpdated,tg=Number(prev?.generated||0)+generated,terr=Number(prev?.errors||0)+errors.length,cp=nextSkip==null?skip+rows.length:nextSkip,st=nextSkip==null?"COMPLETE":"IN_PROGRESS";await env.DB.prepare("INSERT INTO promotion_number_update_state(promotion_slug,unit,next_skip,status,checked,eligible,with_attendance,participants_updated,generated,errors,started_at,updated_at) VALUES(?,'bike',?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT(promotion_slug) DO UPDATE SET next_skip=excluded.next_skip,status=excluded.status,checked=excluded.checked,eligible=excluded.eligible,with_attendance=excluded.with_attendance,participants_updated=excluded.participants_updated,generated=excluded.generated,errors=excluded.errors,updated_at=CURRENT_TIMESTAMP").bind(key,st==="COMPLETE"?0:cp,st,tc,te,tw,tp,tg,terr).run();if(st==="COMPLETE"){await env.DB.prepare("INSERT INTO promotion_number_update_log(promotion_slug,unit,mode,status,checked,eligible,with_attendance,participants_updated,generated,errors,checkpoint) VALUES(?,'bike','FULL','COMPLETE',?,?,?,?,?,?,0)").bind(key,tc,te,tw,tp,tg,terr).run()}}const progress=isSingle?null:await env.DB.prepare("SELECT * FROM promotion_number_update_state WHERE promotion_slug=?").bind(key).first();return json({ok:true,source:"d1",evoRequestsMade:0,totalBase,promotion:{id:key,name:promo.name},batch:{skip,checked,eligible,withAttendance,participantsUpdated,existingNumbers,generated,finalNumbers,errors},progress:progress||null,nextSkip,done:nextSkip==null})}

if(url.pathname==="/promotion-review/request"&&request.method==="POST"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||"");const promo=await clubContentItem("promotion",key);if(!promo)return json({ok:false,error:"PROMOCAO_NAO_ENCONTRADA"},404);await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_review_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,member_id INTEGER NOT NULL,evo_member_id INTEGER,status TEXT NOT NULL DEFAULT 'PENDING',eligibility_snapshot TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();const old=await env.DB.prepare("SELECT id,status,created_at FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? AND status='PENDING' ORDER BY id DESC LIMIT 1").bind(key,member.id).first();if(old)return json({ok:true,duplicate:true,request:old});const snap=JSON.stringify({memberships:member.memberships||[],requestedAt:new Date().toISOString()});await env.DB.prepare("INSERT INTO promotion_review_requests(promotion_slug,member_id,evo_member_id,status,eligibility_snapshot) VALUES(?,?,?,'PENDING',?)").bind(key,member.id,member.evo_member_id,snap).run();const row=await env.DB.prepare("SELECT id,status,created_at FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? ORDER BY id DESC LIMIT 1").bind(key,member.id).first();return json({ok:true,duplicate:false,request:row})}
if(url.pathname==="/promotion-review/status"&&request.method==="GET"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const key=String(url.searchParams.get("promotion")||"");const row=await env.DB.prepare("SELECT id,status,created_at,updated_at FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? ORDER BY id DESC LIMIT 1").bind(key,member.id).first();return json({ok:true,status:row?.status||null,request:row||null})}
if(url.pathname.startsWith("/promotion-review/admin/")){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);await env.DB.prepare("CREATE TABLE IF NOT EXISTS promotion_review_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,promotion_slug TEXT NOT NULL,member_id INTEGER NOT NULL,evo_member_id INTEGER,status TEXT NOT NULL DEFAULT 'PENDING',eligibility_snapshot TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)").run();if(url.pathname==="/promotion-review/admin/list"&&request.method==="GET"){const rr=await env.DB.prepare("SELECT r.id,r.promotion_slug,r.evo_member_id,r.status,r.created_at,r.updated_at,m.first_name,m.last_name FROM promotion_review_requests r JOIN members m ON m.id=r.member_id ORDER BY CASE WHEN r.status='PENDING' THEN 0 ELSE 1 END,r.id DESC").all();const requests=[];for(const x of rr.results||[]){const p=await clubContentItem("promotion",x.promotion_slug);requests.push({id:x.id,promotionSlug:x.promotion_slug,promotionName:p?.name||x.promotion_slug,evoMemberId:x.evo_member_id,status:x.status,createdAt:x.created_at,updatedAt:x.updated_at,studentName:[x.first_name,x.last_name].filter(Boolean).join(" ")})}return json({ok:true,requests})}if(url.pathname==="/promotion-review/admin/update"&&request.method==="POST"){const b=await readJson(request),id=Number(b.id),status=String(b.status||"");if(!id||!["APPROVED","REJECTED","REVERTED"].includes(status))return json({ok:false,error:"DADOS_INVALIDOS"},400);await env.DB.prepare("UPDATE promotion_review_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();return json({ok:true,id,status})}return json({ok:false,error:"ROTA_NAO_ENCONTRADA"},404)}

if(url.pathname.startsWith("/promotion-numbers/admin/")&&request.method==="GET"){const ck=request.headers.get("x-clubpop-admin-cookie")||"";if(!ck)return json({ok:false,error:"NAO_AUTORIZADO"},401);const vr=await fetch("https://loja-pop-green.vercel.app/api/admin-auth?route=me",{headers:{Cookie:ck,Accept:"application/json"}});if(!vr.ok)return json({ok:false,error:"NAO_AUTORIZADO"},401);const key=String(url.searchParams.get("promotion")||"");let promo=await clubContentItem("promotion",key);if(!promo){const existing=await env.DB.prepare("SELECT * FROM promotions WHERE slug=? LIMIT 1").bind(key).first();if(!existing)return json({ok:false,error:"PROMOCAO_NAO_ENCONTRADA"},404);let rules={};try{rules=JSON.parse(existing.rules_json||"{}")||{}}catch{}promo={id:key,name:existing.name,status:existing.status==="ACTIVE"?"Ativo":"Inativo",start:existing.start_at,end:existing.end_at,unit:"bike",promotionType:"lucky_number",numbersPerAttendance:+(rules.numbersPerAttendance||1),luckyNumber:{...rules,enabled:true}}}const dbp=await ensurePromotion(env,promo);if(url.pathname==="/promotion-numbers/admin/list"){const period=String(url.searchParams.get("period")||""),q=String(url.searchParams.get("q")||"").trim().toLowerCase();let sql="SELECT l.code,l.origin,l.issued_at,l.reference_month,l.status,m.first_name,m.last_name,m.evo_member_id,0 attendance_count,CASE WHEN l.origin='BONUS' THEN 1 ELSE 0 END bonus_count FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id WHERE l.promotion_id=? AND l.status='ACTIVE'",args=[dbp.id];if(period){sql+=" AND l.reference_month=?";args.push(period)}sql+=" ORDER BY l.reference_month,l.id";const rr=await env.DB.prepare(sql).bind(...args).all();let numbers=(rr.results||[]).map(x=>({code:x.code,origin:x.origin,issuedAt:x.issued_at,referenceMonth:x.reference_month,status:x.status,studentName:[x.first_name,x.last_name].filter(Boolean).join(" "),memberId:x.evo_member_id,attendanceCount:+(x.attendance_count||0),bonusCount:+(x.bonus_count||0)}));if(q)numbers=numbers.filter(x=>String(x.code).toLowerCase().includes(q)||String(x.studentName).toLowerCase().includes(q));return json({ok:true,promotion:{id:key,name:promo.name,status:promo.status,start:promo.start,end:promo.end},total:numbers.length,participants:new Set(numbers.map(x=>String(x.memberId))).size,periods:[...new Set(numbers.map(x=>x.referenceMonth).filter(Boolean))].sort(),numbers})}if(url.pathname==="/promotion-numbers/admin/winner"){const lucky=String(url.searchParams.get("code")||"").trim();if(!lucky)return json({ok:false,error:"NUMERO_OBRIGATORIO"},400);const row=await env.DB.prepare("SELECT l.code,l.reference_month,l.status,l.origin,m.first_name,m.last_name,m.evo_member_id,pa.occurred_at,ah.activity_name,ah.raw_json FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id LEFT JOIN promotion_attendance pa ON pa.id=l.attendance_id LEFT JOIN attendance_history ah ON ah.attendance_key=pa.source_ref WHERE l.promotion_id=? AND l.code=? AND l.status='ACTIVE' LIMIT 1").bind(dbp.id,lucky).first();if(!row)return json({ok:true,found:false});let raw={};try{raw=JSON.parse(row.raw_json||"{}")}catch{}const luckyDay=row.occurred_at?{date:String(row.occurred_at).slice(0,10).split("-").reverse().join("/"),time:String(raw.startTime||String(row.occurred_at).slice(11,16)||"").slice(0,5)||null,activity:row.activity_name||raw.activitieName||raw.activityName||null}:null;return json({ok:true,found:true,number:{code:row.code,referenceMonth:row.reference_month,status:row.status,origin:row.origin},student:{name:[row.first_name,row.last_name].filter(Boolean).join(" "),memberId:row.evo_member_id},luckyDay})}if(url.pathname==="/promotion-numbers/admin/export"){const ended=promo.status!=="Ativo"||String(promo.end||"")<new Date().toISOString().slice(0,10);if(!ended)return json({ok:false,error:"PROMOCAO_AINDA_ATIVA"},409);const rr=await env.DB.prepare("SELECT l.code,l.reference_month,l.issued_at,m.first_name,m.last_name,m.evo_member_id FROM lucky_numbers l JOIN promotion_participants pp ON pp.id=l.participant_id JOIN members m ON m.id=pp.member_id WHERE l.promotion_id=? AND l.status='ACTIVE' ORDER BY l.reference_month,l.id").bind(dbp.id).all(),esc=v=>'"'+String(v??'').replaceAll('"','""')+'"',lines=[["numero","aluno","evo_member_id","periodo","emitido_em"],...(rr.results||[]).map(x=>[x.code,[x.first_name,x.last_name].filter(Boolean).join(" "),x.evo_member_id,x.reference_month,x.issued_at])],csv=lines.map(a=>a.map(esc).join(';')).join('\n');return new Response(csv,{status:200,headers:{...cors,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=numeros-da-sorte.csv","Cache-Control":"no-store"}})}}
if(url.pathname==="/promotion-numbers/mine"&&request.method==="GET"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const key=String(url.searchParams.get("promotion")||""),promo=await clubContentItem("promotion",key);let dbp;if(promo){dbp=await ensurePromotion(env,promo)}else{dbp=await env.DB.prepare("SELECT * FROM promotions WHERE slug=? LIMIT 1").bind(key).first();if(!dbp)return json({ok:false,error:"PROMOCAO_NAO_ENCONTRADA"},404)}const rules=(()=>{try{return JSON.parse(dbp.rules_json||"{}")||{}}catch{return {}}})(),effectivePromo=promo||{id:key,name:dbp.name,start:dbp.start_at,end:dbp.end_at,unit:"bike",numbersPerAttendance:+(rules.numbersPerAttendance||1),luckyNumber:rules},part=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=? LIMIT 1").bind(dbp.id,member.id).first(),cfg=effectivePromo.luckyNumber||{},per=+(cfg.numbersPerAttendance||effectivePromo.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=[...(cfg.milestones||[])].sort((x,y)=>x.attendance-y.attendance),ar=await env.DB.prepare("SELECT attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date>=? AND attendance_date<=? ORDER BY attendance_date").bind(member.id,effectivePromo.unit||"bike",effectivePromo.start,effectivePromo.end).all(),counts={};for(const x of(ar.results||[])){const m=String(x.attendance_date).slice(0,7);counts[m]=(counts[m]||0)+1}const cr=part?await env.DB.prepare("SELECT code,origin,issued_at,reference_month,status FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY reference_month,id").bind(dbp.id,part.id).all():{results:[]},codes=cr.results||[],by={};for(const x of codes)(by[x.reference_month]??=[]).push(x);const now=new Date().toISOString().slice(0,7),months=Object.keys(counts).sort().map(month=>{const attendance=counts[month],base=attendance*per,bonuses=goals.filter(g=>attendance>=+g.attendance).map(g=>({attendance:+g.attendance,bonus:+g.bonus}));let entitled=base+bonuses.reduce((z,g)=>z+g.bonus,0);if(max>0)entitled=Math.min(entitled,max);const next=goals.find(g=>attendance<+g.attendance);return{month,status:month===now?"current":"closed",attendance,perAttendance:per,base,bonuses,entitled,nextMilestone:next?{attendance:+next.attendance,bonus:+next.bonus,missing:+next.attendance-attendance}:null,codes:by[month]||[]}});return json({ok:true,promotion:{id:key,name:effectivePromo.name},attendance:(ar.results||[]).length,total:codes.length,codes,months})}
if(url.pathname==="/promotion-numbers/sync-v2"&&request.method==="POST"){return luckyV2(request,env)}
if(url.pathname==="/promotion-numbers/sync"&&request.method==="POST"){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const body=await readJson(request),key=String(body.promotionId||""),promo=await clubContentItem("promotion",key);if(!promo||promo.status!=="Ativo"||promo.promotionType!=="lucky_number"||!promo.luckyNumber?.enabled)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);if(!(await promotionEligible(env,member,promo)))return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},403);await evoAttendance(env,member.evo_member_id,promo.start,promo.end,member.id);const dbp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dbp.id,member.id).run();const part=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=? LIMIT 1").bind(dbp.id,member.id).first(),cfg=promo.luckyNumber||{},per=+(cfg.numbersPerAttendance||promo.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=[...(cfg.milestones||[])].sort((x,y)=>x.attendance-y.attendance),ar=await env.DB.prepare("SELECT attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date>=? AND attendance_date<=? ORDER BY attendance_date").bind(member.id,promo.unit||"bike",promo.start,promo.end).all(),counts={};for(const x of(ar.results||[])){const m=String(x.attendance_date).slice(0,7);counts[m]=(counts[m]||0)+1}const desired={};for(const[m,n]of Object.entries(counts)){let d=n*per;for(const g of goals)if(n>=+g.attendance)d+=+g.bonus;if(max>0)d=Math.min(d,max);desired[m]=d}const old=await env.DB.prepare("SELECT id,code,reference_month FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY id").bind(dbp.id,part.id).all(),pool=[...(old.results||[])],used=new Set(),prefix=promo.unit==="gym"?"G":"B";for(const[month,want]of Object.entries(desired).sort()){const same=pool.filter(x=>x.reference_month===month&&!used.has(x.id));same.slice(0,want).forEach(x=>used.add(x.id));let need=Math.max(0,want-same.length);for(const x of pool.filter(x=>!used.has(x.id)).slice(0,need)){const suffix=String(x.code).split("-").pop();await env.DB.prepare("UPDATE lucky_numbers SET reference_month=?,code=? WHERE id=?").bind(month,prefix+"-"+month.replace("-","")+"-"+suffix,x.id).run();used.add(x.id);need--}while(need>0){const code=prefix+"-"+month.replace("-","")+"-"+randomToken(4).toUpperCase();try{await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dbp.id,part.id,code,month,promo.unit||"bike","SYNC").run();need--}catch{}}}for(const x of pool)if(!used.has(x.id))await env.DB.prepare("UPDATE lucky_numbers SET status='INVALIDATED' WHERE id=?").bind(x.id).run();const cr=await env.DB.prepare("SELECT code,origin,issued_at,reference_month,status FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY reference_month,id").bind(dbp.id,part.id).all(),codes=cr.results||[],by={};for(const x of codes)(by[x.reference_month]??=[]).push(x);const now=new Date().toISOString().slice(0,7),months=Object.keys(counts).sort().map(month=>{const attendance=counts[month],base=attendance*per,bonuses=goals.filter(g=>attendance>=+g.attendance).map(g=>({attendance:+g.attendance,bonus:+g.bonus}));let entitled=base+bonuses.reduce((z,g)=>z+g.bonus,0);if(max>0)entitled=Math.min(entitled,max);const next=goals.find(g=>attendance<+g.attendance);return{month,status:month===now?"current":"closed",attendance,perAttendance:per,base,bonuses,entitled,nextMilestone:next?{attendance:+next.attendance,bonus:+next.bonus,missing:+next.attendance-attendance}:null,codes:by[month]||[]}});return json({ok:true,promotion:{id:key,name:promo.name},attendance:(ar.results||[]).length,total:codes.length,codes,months})}
if (url.pathname === "/mission-redemptions/mine" && request.method === "GET") {
        const member=await authenticatedMember(request,env); if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const mission=String(url.searchParams.get("mission")||"");
        const rs=await env.DB.prepare("SELECT id,source_id,title,status,requested_at FROM redemptions WHERE member_id=? AND source_type='MISSION' AND reference_id=? ORDER BY id DESC").bind(member.id,mission).all();
        return json({ok:true,redemptions:rs.results||[]});
      }

      if (url.pathname === "/mission-redemptions/claim" && request.method === "POST") {
        const member=await authenticatedMember(request,env); if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);
        const body=await readJson(request),missionKey=String(body.missionId||""),goalKey=String(body.goalId||"");
        const mission=await clubContentItem("mission",missionKey); if(!mission)return json({ok:false,error:"MISSAO_NAO_ENCONTRADA"},404);
        const goal=(mission.goals||[]).find(x=>String(x.id)===goalKey); if(!goal)return json({ok:false,error:"META_NAO_ENCONTRADA"},404);
        const progress=await missionProgressValue(env,member,mission); if(progress<Number(goal.value||0))return json({ok:false,error:"META_AINDA_NAO_ATINGIDA",progress},409);
        const period=mission.period==="month"?String(mission.start||new Date().toISOString()).slice(0,7):String(mission.start||"")+"_"+String(mission.end||"");
        const dedupe="MISSION:"+member.id+":"+missionKey+":"+period;
        const old=await env.DB.prepare("SELECT id,title,status FROM redemptions WHERE dedupe_key=? LIMIT 1").bind(dedupe).first();
        if(old)return json({ok:true,alreadyClaimed:true,redemption:old});
        await env.DB.prepare("INSERT INTO redemptions(member_id,redemption_type,reference_id,status,source_type,source_id,title,details,unit,dedupe_key) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(member.id,goal.rewardType||"mission",missionKey,"PENDING","MISSION",goalKey,goal.rewardName||"Recompensa",mission.name||"",mission.unit||"bike",dedupe).run();
        const red=await env.DB.prepare("SELECT * FROM redemptions WHERE dedupe_key=? LIMIT 1").bind(dedupe).first();
        const voucher="M"+String(red.id).padStart(6,"0")+"-"+randomToken(2).toUpperCase();
        await env.DB.prepare("INSERT INTO vouchers(member_id,code,type,description,status,redemption_id,source_type,source_id,title,metadata_json) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(member.id,voucher,goal.rewardType||"mission",goal.rewardName||"Recompensa","ACTIVE",red.id,"MISSION",goalKey,goal.rewardName||"Recompensa",JSON.stringify({missionId:missionKey,goalId:goalKey})).run();
        return json({ok:true,claimed:true,redemption:{id:red.id,title:red.title,status:red.status},voucher});
      }

      return json({
        ok: false,
        error: "ROTA_NAO_ENCONTRADA",
      }, 404);

    } catch (error) {
      if (error instanceof EvoConfigError) {
        return new Response(JSON.stringify({ok:false,error:error.code,stage:"evo-config",unit:"bike"}), {
          status:503, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","x-evo-config-error":"1",
          "Access-Control-Allow-Origin":ALLOWED_ORIGINS.has(request.headers.get("Origin"))?request.headers.get("Origin"):"https://loja-pop-green.vercel.app","Vary":"Origin"}
        });
      }
      console.error("CLUB POP API ERROR", error);

      return new Response(JSON.stringify({
        ok: false,
        error: "ERRO_INTERNO",
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }
  },
};

// =========================================================
// CLUB POP CAMPAIGNS / MISSIONS
// =========================================================
async function clubContent(){
  return {promotions:[{id:"promo-1790872798501",unit:"bike",status:"Ativo",name:"Iphone sorteio",start:"2026-09-01",end:"2026-10-31",promotionType:"lucky_number",numbersPerAttendance:1,reset:"monthly",luckyNumber:{enabled:true,numbersPerAttendance:1,reset:"monthly",maxNumbers:27,milestones:[{attendance:8,bonus:5},{attendance:12,bonus:10}]},dashboardText:"",rules:"",bannerUrl:"",requirements:[{unit:"bike",activityId:"*",activity:"Qualquer atividade",quantity:1}],eligibility:{mode:"active_contract",acceptedContracts:["78686","78687","78852"]}}],missionList:[]};
}
async function clubContentItem(type,id){
  const c=await clubContent(); const list=type==="promotion"?(c.promotions||[]):(c.missionList||[]);
  return list.find(x=>String(x.id)===String(id))||null;
}
async function ensurePromotion(env,p){
  const slug=String(p.id),rules=JSON.stringify(p.luckyNumber||{});
  await env.DB.prepare("INSERT INTO promotions(slug,name,description,start_at,end_at,status,rules_json,banner_url) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,description=excluded.description,start_at=excluded.start_at,end_at=excluded.end_at,status=excluded.status,rules_json=excluded.rules_json,banner_url=excluded.banner_url,updated_at=CURRENT_TIMESTAMP").bind(slug,p.name||slug,p.dashboardText||"",p.start||"2000-01-01",p.end||"2099-12-31",p.status==="Ativo"?"ACTIVE":"INACTIVE",rules,p.bannerUrl||null).run();
  return await env.DB.prepare("SELECT * FROM promotions WHERE slug=? LIMIT 1").bind(slug).first();
}
async function evoProfile(env,id){
  const cfg=await getEvoConfig(env,"bike"),auth=btoa(cfg.dns+":"+cfg.token),r=await fetch("https://evo-integracao-api.w12app.com.br/api/v2/members/"+encodeURIComponent(id)+"?showMemberships=true",{headers:{Authorization:"Basic "+auth,Accept:"application/json"}});
  if(!r.ok)throw new Error("EVO_PROFILE_"+r.status);const d=await r.json();return Array.isArray(d)?d[0]:d;
}
async function promotionEligible(env,member,p){
  if((p.eligibility?.mode||"any")==="any")return true;const manual=await env.DB.prepare("SELECT id FROM promotion_review_requests WHERE promotion_slug=? AND member_id=? AND status='APPROVED' ORDER BY id DESC LIMIT 1").bind(String(p.id),member.id).first();if(manual)return true;const profile=await evoProfile(env,member.evo_member_id),today=new Date().toISOString().slice(0,10),accepted=(p.eligibility?.acceptedContracts||[]).map(String);
  return (profile?.memberships||[]).some(x=>accepted.includes(String(x.idMembership))&&!x.cancelDate&&(!x.endDate||String(x.endDate).slice(0,10)>=today));
}
async function evoAttendance(env,id,start,end,memberId=null){
  const startDate=String(start||"2026-01-01").slice(0,10),endDate=String(end||new Date().toISOString().slice(0,10)).slice(0,10);
  // EVO is the source of truth: always reconcile this range.
  const cfg=await getEvoConfig(env,"bike"),auth=btoa(cfg.dns+":"+cfg.token),qs=new URLSearchParams({idMember:String(id),dateStart:startDate+"T00:00:00",dateEnd:endDate+"T23:59:59",skip:"0",take:"200"});
  const r=await fetch("https://evo-integracao-api.w12app.com.br/api/v2/activities/member/sessions?"+qs,{headers:{Authorization:"Basic "+auth,Accept:"application/json"}});
  if(!r.ok)throw new Error("EVO_ATTENDANCE_"+r.status);
  const d=await r.json(),a=(Array.isArray(d)?d:(d.items||d.data||[])).filter(x=>x?.presenca===true&&x?.isFinalized===true);
  if(memberId){
    await env.DB.prepare("DELETE FROM attendance_history WHERE member_id=? AND unit='bike' AND attendance_date>=? AND attendance_date<=?").bind(memberId,startDate,endDate).run();
    for(const x of a){
      const date=String(x.date||x.dateStart||x.startDate||x.dateTime||"").slice(0,10);if(!date)continue;
      const session=String(x.idMemberSession||x.idSession||x.idActivitySession||x.id||"");
      const activity=String(x.idActivity||x.activityId||"");
      const key=["bike",memberId,date,session||activity||String(x.nameActivity||x.activityName||"attendance")].join(":");
      await env.DB.prepare("INSERT OR IGNORE INTO attendance_history(member_id,evo_member_id,unit,attendance_key,attendance_date,activity_id,activity_name,raw_json) VALUES(?,?,?,?,?,?,?,?)").bind(memberId,id,"bike",key,date,activity||null,x.nameActivity||x.activityName||x.name||null,JSON.stringify(x)).run();
    }
    await env.DB.prepare("INSERT OR REPLACE INTO attendance_sync_ranges(member_id,unit,start_date,end_date,synced_at) VALUES(?,'bike',?,?,CURRENT_TIMESTAMP)").bind(memberId,startDate,endDate).run();
  }
  return a;
}
async function missionProgressValue(env,member,m){
  const a=await evoAttendance(env,member.evo_member_id,m.start,m.end,member.id);if(m.type!=="consistency")return a.length;
  const need=Number(m.requirements?.[0]?.quantity||1),weeks={};for(const x of a){const k=String(x.date||x.dateStart||"").slice(0,10);if(!k)continue;const d=new Date(k+"T12:00:00"),dow=(d.getDay()+6)%7,mo=new Date(d);mo.setDate(d.getDate()-dow);const wk=mo.toISOString().slice(0,10);(weeks[wk]??=new Set()).add(k)}return Object.values(weeks).filter(s=>s.size>=need).length;
}

// =========================================================
// EVO
// =========================================================

async function findEvoMember(env, cpf) {
  const cfg = await getEvoConfig(env, "bike");
  const auth = btoa(`${cfg.dns}:${cfg.token}`);

  const basicUrl =
    `https://evo-integracao.w12app.com.br/api/v1/members/basic?document=${encodeURIComponent(cpf)}`;

  const basicResponse = await fetch(basicUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!basicResponse.ok) {
    throw new Error(`EVO_BASIC_${basicResponse.status}`);
  }

  const basicData = await basicResponse.json();

  const basicMember = Array.isArray(basicData)
    ? basicData[0]
    : basicData;

  if (!basicMember?.idMember) {
    return null;
  }

  const profileUrl =
    `https://evo-integracao.w12app.com.br/api/v2/members/${basicMember.idMember}`;

  const profileResponse = await fetch(profileUrl, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
  });

  if (!profileResponse.ok) {
    throw new Error(`EVO_PROFILE_${profileResponse.status}`);
  }

  const profileData = await profileResponse.json();

  const profile = Array.isArray(profileData)
    ? profileData[0]
    : profileData;

  return {
    ...basicMember,
    ...(profile || {}),
  };
}


async function findGymEvoMember(env, cpf) {
  if (!env.GYM_EVO_DNS || !env.GYM_EVO_TOKEN) {
    throw new Error("GYM_EVO_CREDENTIALS_MISSING");
  }

  const auth = btoa(`${env.GYM_EVO_DNS}:${env.GYM_EVO_TOKEN}`);
  const basicUrl =
    `https://evo-integracao.w12app.com.br/api/v1/members/basic?document=${encodeURIComponent(cpf)}`;

  const basicResponse = await fetch(basicUrl, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });

  if (!basicResponse.ok) {
    throw new Error(`GYM_EVO_BASIC_${basicResponse.status}`);
  }

  const basicData = await basicResponse.json();
  const basicMember = Array.isArray(basicData) ? basicData[0] : basicData;
  if (!basicMember?.idMember) return null;

  const profileResponse = await fetch(
    `https://evo-integracao.w12app.com.br/api/v2/members/${basicMember.idMember}`,
    { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } }
  );

  if (!profileResponse.ok) {
    throw new Error(`GYM_EVO_PROFILE_${profileResponse.status}`);
  }

  const profileData = await profileResponse.json();
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  return { ...basicMember, ...(profile || {}) };
}


// =========================================================
// AUTENTICAÇÃO
// =========================================================

async function authenticatedMember(request, env) {
  const token = bearer(request);

  if (!token) return null;

  const tokenHash = await sha256(token);

  return await env.DB.prepare(`
    SELECT m.*
    FROM auth_sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.token_hash = ?
      AND s.revoked_at IS NULL
      AND s.expires_at > ?
      AND m.status = 'ACTIVE'
    LIMIT 1
  `).bind(
    tokenHash,
    new Date().toISOString()
  ).first();
}

async function createSession(env, memberId) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);

  const expiresAt =
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(`
    INSERT INTO auth_sessions (
      member_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?)
  `).bind(
    memberId,
    tokenHash,
    expiresAt
  ).run();

  return {
    token,
    expiresAt,
  };
}


// =========================================================
// PIN
// =========================================================

async function hashPin(pin, salt) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 100000,
    },
    key,
    256
  );

  return bytesToHex(new Uint8Array(bits));
}


// =========================================================
// UTILITÁRIOS
// =========================================================

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "");
}

function validCpfShape(cpf) {
  return /^\d{11}$/.test(cpf);
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeDate(value) {
  const raw = String(value || "").trim();

  if (!raw) return "";

  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]}-${br[1]}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return date.toISOString().slice(0, 10);
}

async function sha256(value) {
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(bytes) {
  return [...bytes]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);

  return [...array]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function bearer(request) {
  const value = request.headers.get("Authorization") || "";

  if (!value.startsWith("Bearer ")) {
    return "";
  }

  return value.slice(7).trim();
}

function safeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string" ||
    a.length !== b.length
  ) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function publicMember(member) {
  return {
    id: member.id,
    evoMemberId: member.evo_member_id,
    gymMemberId: member.gym_client_id || null,
    firstName: member.first_name || "",
    lastName: member.last_name || "",
    email: member.email || "",
    cpfLast4: member.cpf_last4 || "",
  };
}

async function audit(
  env,
  actorType,
  actorId,
  action,
  entityType = "AUTH",
  entityId = null,
  metadata = null
) {
  try {
    await env.DB.prepare(`
      INSERT INTO audit_log (
        actor_type,
        actor_id,
        action,
        entity_type,
        entity_id,
        metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      metadata ? JSON.stringify(metadata) : null
    ).run();
  } catch (error) {
    console.error("AUDIT ERROR", error);
  }
}
async function syncLuckyMember(env,member,promo){const dp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dp.id,member.id).run();const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),ah=await env.DB.prepare("SELECT attendance_key,attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date").bind(member.id,promo.unit||"bike",promo.start,promo.end).all();for(const a of ah.results||[])await env.DB.prepare("INSERT OR IGNORE INTO promotion_attendance(promotion_id,participant_id,studio,occurred_at,reference_month,source,source_ref,status) VALUES(?,?,?,?,?,'EVO',?,'VALID')").bind(dp.id,pt.id,promo.unit||"bike",a.attendance_date,String(a.attendance_date).slice(0,7),a.attendance_key).run();const cfg=promo.luckyNumber||{},per=+(cfg.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=cfg.milestones||[],initial=String(member.first_name||"X").charAt(0).toUpperCase(),prefix=(promo.unit==="gym"?"G":"B")+"-"+member.evo_member_id+"-"+initial+"-";let seq=1;const all=await env.DB.prepare("SELECT code FROM lucky_numbers WHERE promotion_id=?").bind(dp.id).all(),taken=new Set((all.results||[]).map(x=>x.code));while(taken.has(prefix+String(seq).padStart(3,"0")))seq++;const next=()=>{let x;do{x=prefix+String(seq++).padStart(3,"0")}while(taken.has(x));taken.add(x);return x},pa=await env.DB.prepare("SELECT id,reference_month FROM promotion_attendance WHERE promotion_id=? AND participant_id=? AND status='VALID' ORDER BY occurred_at,id").bind(dp.id,pt.id).all(),months={};for(const a of pa.results||[])(months[a.reference_month]??=[]).push(a);for(const[month,rows]of Object.entries(months)){let active=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND reference_month=? AND status='ACTIVE'").bind(dp.id,pt.id,month).first()).n;for(const a of rows){const n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND attendance_id=? AND status='ACTIVE'").bind(dp.id,pt.id,a.id).first()).n;for(let i=n;i<per&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,attendance_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ATTENDANCE','ACTIVE')").bind(dp.id,pt.id,a.id,next(),month,promo.unit||"bike").run()}for(const g of goals){if(rows.length<+g.attendance)continue;await env.DB.prepare("INSERT OR IGNORE INTO promotion_bonus_awards(promotion_id,participant_id,reference_month,studio,milestone,quantity,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance,+g.bonus).run();const aw=await env.DB.prepare("SELECT id,quantity FROM promotion_bonus_awards WHERE promotion_id=? AND participant_id=? AND reference_month=? AND studio=? AND milestone=?").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance).first(),n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE bonus_award_id=? AND status='ACTIVE'").bind(aw.id).first()).n;for(let i=n;i<aw.quantity&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,bonus_award_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'BONUS','ACTIVE')").bind(dp.id,pt.id,aw.id,next(),month,promo.unit||"bike").run()}}return {attendance:(ah.results||[]).length}}
async function luckyV2(request,env){const member=await authenticatedMember(request,env);if(!member)return json({ok:false,error:"NAO_AUTORIZADO"},401);const b=await readJson(request),key=String(b.promotionId||""),promo=await clubContentItem("promotion",key);if(!promo)return json({ok:false,error:"PROMOCAO_INVALIDA"},400);if(!(await promotionEligible(env,member,promo)))return json({ok:false,error:"ALUNO_NAO_ELEGIVEL"},403);await evoAttendance(env,member.evo_member_id,promo.start,promo.end,member.id);const dp=await ensurePromotion(env,promo);await env.DB.prepare("INSERT OR IGNORE INTO promotion_participants(promotion_id,member_id) VALUES(?,?)").bind(dp.id,member.id).run();const pt=await env.DB.prepare("SELECT id FROM promotion_participants WHERE promotion_id=? AND member_id=?").bind(dp.id,member.id).first(),ah=await env.DB.prepare("SELECT attendance_key,attendance_date FROM attendance_history WHERE member_id=? AND unit=? AND attendance_date BETWEEN ? AND ? ORDER BY attendance_date").bind(member.id,promo.unit||"bike",promo.start,promo.end).all();for(const a of ah.results||[])await env.DB.prepare("INSERT OR IGNORE INTO promotion_attendance(promotion_id,participant_id,studio,occurred_at,reference_month,source,source_ref,status) VALUES(?,?,?,?,?,'EVO',?,'VALID')").bind(dp.id,pt.id,promo.unit||"bike",a.attendance_date,String(a.attendance_date).slice(0,7),a.attendance_key).run();const cfg=promo.luckyNumber||{},per=+(cfg.numbersPerAttendance||1),max=+(cfg.maxNumbers||0),goals=cfg.milestones||[],initial=String(member.first_name||"X").charAt(0).toUpperCase(),prefix=(promo.unit==="gym"?"G":"B")+"-"+member.evo_member_id+"-"+initial+"-";let seq=1;const all=await env.DB.prepare("SELECT code FROM lucky_numbers WHERE promotion_id=?").bind(dp.id).all();const taken=new Set((all.results||[]).map(x=>x.code));while(taken.has(prefix+String(seq).padStart(3,"0")))seq++;const next=()=>{let x;do{x=prefix+String(seq++).padStart(3,"0")}while(taken.has(x));taken.add(x);return x};const pa=await env.DB.prepare("SELECT id,reference_month FROM promotion_attendance WHERE promotion_id=? AND participant_id=? AND status='VALID' ORDER BY occurred_at,id").bind(dp.id,pt.id).all();const months={};for(const a of pa.results||[])(months[a.reference_month]??=[]).push(a);for(const [month,rows] of Object.entries(months)){let active=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND reference_month=? AND status='ACTIVE'").bind(dp.id,pt.id,month).first()).n;for(const a of rows){const n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND attendance_id=?").bind(dp.id,pt.id,a.id).first()).n;for(let i=n;i<per&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,attendance_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'ATTENDANCE','ACTIVE')").bind(dp.id,pt.id,a.id,next(),month,promo.unit||"bike").run()}for(const g of goals){if(rows.length<+g.attendance)continue;await env.DB.prepare("INSERT OR IGNORE INTO promotion_bonus_awards(promotion_id,participant_id,reference_month,studio,milestone,quantity,status) VALUES(?,?,?,?,?,?,'ACTIVE')").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance,+g.bonus).run();const aw=await env.DB.prepare("SELECT id,quantity FROM promotion_bonus_awards WHERE promotion_id=? AND participant_id=? AND reference_month=? AND studio=? AND milestone=?").bind(dp.id,pt.id,month,promo.unit||"bike",+g.attendance).first(),n=+(await env.DB.prepare("SELECT COUNT(*) n FROM lucky_numbers WHERE bonus_award_id=?").bind(aw.id).first()).n;for(let i=n;i<aw.quantity&&(!max||active<max);i++,active++)await env.DB.prepare("INSERT INTO lucky_numbers(promotion_id,participant_id,bonus_award_id,code,reference_month,studio,origin,status) VALUES(?,?,?,?,?,?,'BONUS','ACTIVE')").bind(dp.id,pt.id,aw.id,next(),month,promo.unit||"bike").run()}}const rr=await env.DB.prepare("SELECT code,origin,issued_at,reference_month,status FROM lucky_numbers WHERE promotion_id=? AND participant_id=? AND status='ACTIVE' ORDER BY reference_month,id").bind(dp.id,pt.id).all();return json({ok:true,total:(rr.results||[]).length,codes:rr.results||[],attendance:(ah.results||[]).length})}



class EvoConfigError extends Error {
  constructor(code) { super(code); this.code=code; }
}
function validEvoExpiry(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value+"T00:00:00Z")) && new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;
}
async function getEvoConfig(env, unit="bike") {
  unit=String(unit||"bike").toLowerCase();
  if (!["bike","gym"].includes(unit)) throw new EvoConfigError("UNIDADE_EVO_NAO_SUPORTADA");
  let row;
  try { row=await env.DB.prepare("SELECT dns,token,expires_at,enabled FROM evo_unit_config WHERE unit=? LIMIT 1").bind(unit).first(); }
  catch { throw new EvoConfigError("EVO_CONFIG_INDISPONIVEL"); }
  if (!row) throw new EvoConfigError("EVO_NAO_CONFIGURADA");
  if (Number(row.enabled)!==1) throw new EvoConfigError("EVO_CONFIG_DESATIVADA");
  const dns=String(row.dns||"").trim(),token=String(row.token||"").trim();
  if (!dns || !token) throw new EvoConfigError("EVO_CONFIG_INCOMPLETA");
  const expiry=String(row.expires_at||"");
  if (!validEvoExpiry(expiry)) throw new EvoConfigError("EVO_VALIDADE_INVALIDA");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  if (expiry<today) throw new EvoConfigError("CREDENCIAL_EVO_EXPIRADA");
  return {unit,dns,token,expires_at:expiry,enabled:true};
}
function allowedEvoTarget(value, method) {
  let url; try { url=new URL(value); } catch { return null; }
  if (url.protocol!=="https:" || url.port || url.username || url.password || url.hash || !["evo-integracao.w12app.com.br","evo-integracao-api.w12app.com.br"].includes(url.hostname)) return null;
  const path=url.pathname;
  if (method==="PUT") return path==="/api/v1/members/fitcoins" ? url : null;
  if (method!=="GET") return null;
  if (path==="/api/v2/management/activeclients" || path==="/api/v2/members/active-members") return url;
  return /^\/api\/v[123]\/(?:members(?:\/\d+|\/basic|\/fitcoins)?|activities(?:\/schedule(?:\/detail)?|\/member\/sessions)?|membership(?:\/category)?|membermembership)$/.test(path) ? url : null;
}


// Current Bike students: staging is isolated from operational and historical caches.
async function currentStudentJob(env, body) {
  const unit=String(body.unit||'bike').toLowerCase()==='gym'?'gym':'bike';
  const db=env.DB;
  if(body.action==='begin') {
    await db.prepare("UPDATE evo_current_runs_v2 SET state='failed',error='SINCRONIZACAO_EXPIRADA' WHERE state='running' AND updated_at<datetime('now','-10 minutes')").run();
    const running=await db.prepare("SELECT id FROM evo_current_runs_v2 WHERE unit=? AND state='running'").bind(unit).first();
    if(running)return {status:409,ok:false,error:'SINCRONIZACAO_JA_EM_ANDAMENTO'};
    const id=crypto.randomUUID();
    await db.prepare("INSERT INTO evo_current_runs_v2(id,unit,state) VALUES(?,?,'running')").bind(id,unit).run();
    return {ok:true,runId:id,nextSkip:0};
  }
  const run=await db.prepare("SELECT * FROM evo_current_runs_v2 WHERE id=? AND unit=?").bind(String(body.runId||''),unit).first();
  if(!run||run.state!=='running')return {status:409,ok:false,error:'SINCRONIZACAO_INATIVA'};
  if(body.action==='fail') {
    await db.prepare("UPDATE evo_current_runs_v2 SET state='failed',error=?,requests=requests+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='running'").bind(String(body.error||'EVO_FALHOU').slice(0,80),Number(body.requests||0),run.id).run();
    return {ok:true};
  }
  if(body.action==='check')return {ok:true,runId:run.id,nextSkip:run.next_skip};
  const rows=body.students;
  if(body.action!=='ingest'||!Array.isArray(rows)||rows.length>25||body.skip!==run.next_skip)return {status:409,ok:false,error:'LOTE_FORA_DE_ORDEM'};
  const ids=new Set();
  for(const s of rows){
    if(!/^\d+$/.test(s.id)||ids.has(s.id)||typeof s.name!=='string'||s.name.length>200||!['Active','Suspended'].includes(s.status)||typeof s.gympass!=='boolean'||typeof s.totalpass!=='boolean'||(s.fitcoins!==null&&!Number.isFinite(s.fitcoins))||typeof s.vip!=='boolean'||!Array.isArray(s.vipMemberships)||!s.raw||typeof s.raw!=='object'||String(s.raw.idMember)!==s.id)return {status:422,ok:false,error:'LOTE_INVALIDO'};
    ids.add(s.id);
  }
  const old=(await db.prepare('SELECT evo_member_id FROM evo_current_stage_v2 WHERE run_id=?').bind(run.id).all()).results||[];
  if(old.some(s=>ids.has(s.evo_member_id)))return {status:409,ok:false,error:'PAGINACAO_DUPLICADA'};
  const report=body.skip===0?body.reportIds:JSON.parse(run.report_ids||'null');
  if(!Array.isArray(report)||report.some(id=>!/^\d+$/.test(String(id))))return {status:422,ok:false,error:'RELATORIO_ATIVOS_INVALIDO'};
  const next=run.next_skip+rows.length,requests=run.requests+Number(body.skip===0?2:1),done=rows.length<25;
  await db.batch([
    db.prepare("INSERT INTO evo_current_stage_v2(run_id,evo_member_id,payload) SELECT ?,json_extract(value,'$.id'),value FROM json_each(?)").bind(run.id,JSON.stringify(rows)),
    db.prepare("UPDATE evo_current_runs_v2 SET next_skip=?,requests=?,report_ids=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND state='running'").bind(next,requests,JSON.stringify(report),run.id),
  ]);
  // Lossless EVO snapshot + categorized projections. No extra EVO requests.
  const masterStatements=[],contractStatements=[];
  for(const s of rows){
    const m=s.raw||{}, memberships=Array.isArray(m.memberships)?m.memberships:Array.isArray(m.memberMemberships)?m.memberMemberships:Array.isArray(m.membership)?m.membership:[];
    const personal={idMember:m.idMember,firstName:m.firstName,lastName:m.lastName,registerName:m.registerName,registerLastName:m.registerLastName,usePreferredName:m.usePreferredName,registerDate:m.registerDate,document:m.document,documentId:m.documentId,maritalStatus:m.maritalStatus,gender:m.gender,birthDate:m.birthDate};
    const address={address:m.address,state:m.state,city:m.city,zipCode:m.zipCode,complement:m.complement,neighborhood:m.neighborhood,number:m.number};
    const access={membershipStatus:m.membershipStatus,status:m.status,accessBlocked:m.accessBlocked,blockedReason:m.blockedReason,accessCardNumber:m.accessCardNumber,penalized:m.penalized,lastAccessDate:m.lastAccessDate};
    const financial={totalFitCoins:m.totalFitCoins,totalFitcoins:m.totalFitcoins};
    const integrations={gympassId:m.gympassId,codeTotalpass:m.codeTotalpass,idBranch:m.idBranch,branchName:m.branchName};
    const metadata={updateDate:m.updateDate,sourceEndpoint:'/api/v2/members?status=1&showMemberships=true'};
    masterStatements.push(db.prepare("INSERT INTO evo_member_master(unit,evo_member_id,is_current,personal_json,contacts_json,address_json,access_json,financial_json,integrations_json,memberships_json,metadata_json,raw_json,source_run_id,evo_updated_at,synced_at) VALUES(?,?,1,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(unit,evo_member_id) DO UPDATE SET is_current=1,personal_json=excluded.personal_json,contacts_json=excluded.contacts_json,address_json=excluded.address_json,access_json=excluded.access_json,financial_json=excluded.financial_json,integrations_json=excluded.integrations_json,memberships_json=excluded.memberships_json,metadata_json=excluded.metadata_json,raw_json=excluded.raw_json,source_run_id=excluded.source_run_id,evo_updated_at=excluded.evo_updated_at,synced_at=CURRENT_TIMESTAMP").bind(unit,s.id,JSON.stringify(personal),JSON.stringify(Array.isArray(m.contacts)?m.contacts:[]),JSON.stringify(address),JSON.stringify(access),JSON.stringify(financial),JSON.stringify(integrations),JSON.stringify(memberships),JSON.stringify(metadata),JSON.stringify(m),run.id,m.updateDate||null));
    contractStatements.push(db.prepare("DELETE FROM evo_member_contracts WHERE unit=? AND evo_member_id=?").bind(unit,s.id));
    memberships.forEach((x,i)=>{const mm=x?.idMemberMembership??x?.idMembershipMember??null,mid=x?.idMembership??null,key=String(mm??mid??('idx-'+i));contractStatements.push(db.prepare("INSERT INTO evo_member_contracts(unit,evo_member_id,contract_key,id_membership,id_member_membership,category_id,membership_name,membership_status,start_date,end_date,cancel_date,sale_date,is_additional,raw_json,source_run_id,synced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(unit,s.id,key,mid==null?null:String(mid),mm==null?null:String(mm),x?.idCategoryMembership==null?null:String(x.idCategoryMembership),x?.name??null,x?.membershipStatus??x?.statusMemberMembership??x?.status??null,x?.startDate??null,x?.endDate??null,x?.cancelDate??null,x?.saleDate??null,x?.flAdditionalMembership?1:0,JSON.stringify(x),run.id));});
  }
  for(let i=0;i<masterStatements.length;i+=40)await db.batch(masterStatements.slice(i,i+40));
  for(let i=0;i<contractStatements.length;i+=40)await db.batch(contractStatements.slice(i,i+40));
  if(!done)return {ok:true,runId:run.id,nextSkip:next,done:false};
  const fresh=(await db.prepare('SELECT payload FROM evo_current_stage_v2 WHERE run_id=?').bind(run.id).all()).results.map(x=>JSON.parse(x.payload));
  if(!fresh.length)return {status:422,ok:false,error:'POPULACAO_VAZIA_NAO_PUBLICADA'};
  const previous=(await db.prepare("SELECT s.*,group_concat(c.category||':'||c.subtype) categories FROM evo_students s LEFT JOIN evo_student_categories c USING(unit,evo_member_id) WHERE s.unit=? AND s.is_current=1 GROUP BY s.evo_member_id").bind(unit).all()).results;
  const before=new Map(previous.map(x=>[x.evo_member_id,x])),after=new Set(fresh.map(x=>x.id));
  let added=0,changed=0;
  for(const s of fresh){const p=before.get(s.id);if(!p)added++;else if(p.display_name!==s.name||p.membership_status!==s.status||p.fitcoins!==s.fitcoins||Boolean((p.categories||'').includes('aggregator:gympass'))!==s.gympass||Boolean((p.categories||'').includes('aggregator:totalpass'))!==s.totalpass||Boolean((p.categories||'').includes('vip:found'))!==s.vip)changed++;}
  const removed=previous.filter(x=>!after.has(x.evo_member_id)).length;
  const statement=db.prepare("INSERT INTO evo_students(unit,evo_member_id,display_name,membership_status,fitcoins,is_current,last_run) SELECT ?,evo_member_id,json_extract(payload,'$.name'),json_extract(payload,'$.status'),json_extract(payload,'$.fitcoins'),1,run_id FROM evo_current_stage_v2 WHERE run_id=? ON CONFLICT(unit,evo_member_id) DO UPDATE SET display_name=excluded.display_name,membership_status=excluded.membership_status,fitcoins=COALESCE(excluded.fitcoins,evo_students.fitcoins),is_current=1,last_run=excluded.last_run,updated_at=CURRENT_TIMESTAMP").bind(unit,run.id);
  await db.batch([
    statement,
    db.prepare("UPDATE evo_students SET is_current=0,updated_at=CURRENT_TIMESTAMP WHERE unit=? AND last_run<>? AND is_current=1").bind(unit,run.id),
    db.prepare("UPDATE evo_member_master SET is_current=0 WHERE unit=? AND source_run_id<>? AND is_current=1").bind(unit,run.id),
    db.prepare("DELETE FROM evo_student_categories WHERE unit=?").bind(unit),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'aggregator','gympass','member_registration' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.gympass')=1").bind(unit,run.id),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'aggregator','totalpass','member_registration' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.totalpass')=1").bind(unit,run.id),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'suspended','','membershipStatus' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.status')='Suspended'").bind(unit,run.id),
    db.prepare("INSERT INTO evo_student_categories(unit,evo_member_id,category,subtype,source) SELECT ?,evo_member_id,'vip','found','members_current_memberships' FROM evo_current_stage_v2 WHERE run_id=? AND json_extract(payload,'$.vip')=1").bind(unit,run.id),
    db.prepare("UPDATE evo_current_runs_v2 SET state='done',added=?,changed=?,removed=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(added,changed,removed,run.id),
    db.prepare("UPDATE evo_sync_config SET last_sync_at=CURRENT_TIMESTAMP,last_sync_status='ok',last_sync_requests=?,updated_at=CURRENT_TIMESTAMP WHERE unit=?").bind(requests,unit),
    db.prepare('DELETE FROM evo_current_stage_v2 WHERE run_id=?').bind(run.id),
  ]);
  return {ok:true,runId:run.id,nextSkip:next,done:true,total:next,added,changed,removed};
}
async function currentStudentsView(env, unit='bike') {
  unit=unit==='gym'?'gym':'bike'; const db=env.DB;
  const run=await db.prepare("SELECT * FROM evo_current_runs_v2 WHERE unit=? AND state='done' ORDER BY updated_at DESC,rowid DESC LIMIT 1").bind(unit).first();
  const total=await db.prepare("SELECT COUNT(*) total,SUM(membership_status='Active') statusActive,SUM(membership_status='Suspended') suspended FROM evo_students WHERE unit=? AND is_current=1").bind(unit).first();
  const agg=await db.prepare("SELECT COUNT(DISTINCT evo_member_id) aggregators,SUM(subtype='gympass') gympass,SUM(subtype='totalpass') totalpass FROM evo_student_categories WHERE unit=? AND category='aggregator'").bind(unit).first();
  const vip=await db.prepare("SELECT COUNT(DISTINCT evo_member_id) vip FROM evo_student_categories WHERE unit=? AND category='vip' AND subtype='found'").bind(unit).first();
  const comparison=await db.prepare("WITH e AS(SELECT evo_member_id id FROM evo_students WHERE unit=? AND is_current=1),c AS(SELECT DISTINCT CAST(evo_member_id AS TEXT) id FROM members WHERE evo_member_id IS NOT NULL) SELECT (SELECT COUNT(*) FROM c) linked,(SELECT COUNT(*) FROM e JOIN c USING(id)) both,(SELECT COUNT(*) FROM e WHERE id NOT IN(SELECT id FROM c)) onlyEvo,(SELECT COUNT(*) FROM c WHERE id NOT IN(SELECT id FROM e)) onlyClub").bind(unit).first();
  const logs=(await db.prepare("SELECT added,changed,removed,requests,updated_at createdAt,'População atual filtrada; histórico preservado.' details FROM evo_current_runs_v2 WHERE state='done' AND unit=? ORDER BY updated_at DESC LIMIT 20").bind(unit).all()).results;
  let active=total?.statusActive||0; try{if(run?.report_ids)active=new Set(JSON.parse(run.report_ids)).size}catch{}
  return {ok:true,unit,source:'d1-current',counts:{active,total:total?.total||0,statusActive:total?.statusActive||0,suspended:total?.suspended||0,aggregators:agg?.aggregators||0,gympass:agg?.gympass||0,totalpass:agg?.totalpass||0,vip:vip?.vip||0},comparison,lastSyncAt:run?.updated_at||null,lastRequests:run?.requests||0,logs,note:'Ativos: relatório de contratos. Agregadores: identificadores no cadastro atual; podem se sobrepor. VIP: categoria VIP encontrada nos contratos retornados pela população atual; vigência será tratada separadamente. Sem apagar históricos.'};
}
