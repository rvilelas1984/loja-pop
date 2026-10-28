// Reuse the exact ranking used by the Hall. Baselines are internal audit records,
// never historical awards or automation triggers. No attendance or stars are written.
import {rankingBase as bike} from './admin-bike-ranking.mjs';
import {rankingBase as gym} from './admin-gym-ranking.mjs';
import {milestones} from './hall-conquests.mjs';
const stateAction='_cp.conquest.baseline';
const checkpointAction='_cp.conquest.checkpoint';
export function conquestStatements(db,{unit,evoId,stars,previous}){
 const entity=JSON.stringify([unit,String(evoId)]),condition=previous==null?
 "NOT EXISTS(SELECT 1 FROM audit_log WHERE action=? AND entity_type='conquest_state' AND entity_id=?)":
 "(SELECT json_extract(metadata_json,'$.stars') FROM audit_log WHERE action=? AND entity_type='conquest_state' AND entity_id=? ORDER BY id DESC LIMIT 1)=?";
 const args=[stateAction,entity,...(previous==null?[]:[previous])];
 const stm=[];
 if(previous!=null&&stars>previous){
  for(const [i,[label,target]] of milestones.entries())if(previous<target&&stars>=target){
   const kinds=['medal',...((i+1)%4===0?['trophy']:[])];
   for(const kind of kinds){const key=`cp.conquest.${kind}.earned`,award=JSON.stringify([unit,String(evoId),target,kind]);
    stm.push(db.prepare(`INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json,created_at) SELECT 'SYSTEM',NULL,?,'conquest',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${condition} AND NOT EXISTS(SELECT 1 FROM audit_log WHERE action=? AND entity_type='conquest' AND entity_id=?)`).bind(key,award,JSON.stringify({unit,evo_member_id:String(evoId),target,stars,previous_stars:previous,label,kind,occurred_at:null,time_basis:'detection'}),...args,key,award));
   }
  }
 }
 stm.push(db.prepare(`INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json,created_at) SELECT 'SYSTEM',NULL,?,'conquest_state',?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${condition}`).bind(stateAction,entity,JSON.stringify({unit,evo_member_id:String(evoId),stars}),...args));
 return stm;
}
export async function captureConquestEvents(db){
 const enabled=await db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_cp_events_identity'").first();if(!enabled)return {enabled:false};
 const checkpoint=await db.prepare("SELECT metadata_json FROM audit_log WHERE action=? ORDER BY id DESC LIMIT 1").bind(checkpointAction).first();
 const after=checkpoint?Number(JSON.parse(checkpoint.metadata_json).after)||0:0;
 const top=Number((await db.prepare('SELECT COALESCE(MAX(id),0) id FROM audit_log').first())?.id||0);
 if(checkpoint){const changed=await db.prepare("SELECT id FROM audit_log WHERE id>? AND (action LIKE 'cp.evo_member_attendance.%' OR action LIKE 'cp.members.%' OR action LIKE 'cp.bike_evo_historical_baseline.%' OR action LIKE 'cp.evo_member_identity_aliases.%' OR action='MANUAL_STARS_UPDATE') LIMIT 1").bind(after).first();if(!changed)return {changed:0};}
 let changed=0;let pending=[];
 for(const [unit,base] of [['bike',bike],['gym',gym]]){
  const rows=(await db.prepare(base+'SELECT evo_member_id,stars FROM totals WHERE stars>=0').all()).results||[];
  const states=(await db.prepare("SELECT a.entity_id,json_extract(a.metadata_json,'$.stars') stars FROM audit_log a WHERE a.id IN (SELECT MAX(id) FROM audit_log WHERE action=? AND json_extract(metadata_json,'$.unit')=? GROUP BY entity_id)").bind(stateAction,unit).all()).results||[];
  const known=new Map(states.map(s=>[s.entity_id,Number(s.stars)]));
  for(const row of rows){const stars=Number(row.stars),entity=JSON.stringify([unit,String(row.evo_member_id)]),previous=known.get(entity);if(previous===stars)continue;
   if(changed>=200){if(pending.length)await db.batch(pending);return {changed,initializing:true};}
   pending.push(...conquestStatements(db,{unit,evoId:row.evo_member_id,stars,previous}));changed++;
   if(pending.length>=40){await db.batch(pending);pending=[];}
  }
 }
 if(pending.length)await db.batch(pending);
 await db.prepare("INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json) VALUES('SYSTEM',NULL,?,'conquest_state','scan',?)").bind(checkpointAction,JSON.stringify({after:top})).run();
 return {changed};
}
