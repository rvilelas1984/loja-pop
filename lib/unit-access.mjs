import {canonicalEvoId} from './member-identity.mjs';

export const accessSettingKey='shared_unit_access';
const units=['bike','gym'];
export const activeContractWhere=`lower(trim(membership_status)) IN ('active','1')
 AND (start_date IS NULL OR start_date='' OR substr(start_date,1,10)<=date('now','-3 hours'))
 AND (end_date IS NULL OR end_date='' OR substr(end_date,1,10)>=date('now','-3 hours'))
 AND (cancel_date IS NULL OR cancel_date='' OR substr(cancel_date,1,10)>date('now','-3 hours'))`;

export function normalizeAccessRules(rules){
 if(!Array.isArray(rules)||rules.length>500)throw Error('REGRAS_INVALIDAS');
 const seen=new Set();
 return rules.map(r=>{
  const sourceUnit=r?.sourceUnit,contractId=String(r?.contractId??'').trim();
  if(!units.includes(sourceUnit)||!/^\d+$/.test(contractId)||contractId==='0')throw Error('CONTRATO_INVALIDO');
  const key=sourceUnit+':'+contractId;
  if(seen.has(key))throw Error('CONTRATO_REPETIDO');seen.add(key);
  return {sourceUnit,contractId,targetUnit:sourceUnit==='bike'?'gym':'bike'};
 }).sort((a,b)=>(a.sourceUnit+':'+a.contractId).localeCompare(b.sourceUnit+':'+b.contractId));
}

export async function readAccessSettings(db){
 const row=await db.prepare('SELECT value,updated_at FROM club_settings WHERE key=?').bind(accessSettingKey).first();
 if(!row)return {revision:null,rules:[],updatedAt:null};
 const data=JSON.parse(row.value);
 return {revision:data.revision,rules:normalizeAccessRules(data.rules),updatedAt:row.updated_at};
}

export async function accessCatalog(db){
 const rows=await db.prepare(`SELECT c.unit,c.evo_contract_id contractId,c.contract_name name,c.is_active active,
 (SELECT COUNT(DISTINCT a.evo_member_id) FROM evo_member_contracts a WHERE a.unit=c.unit
 AND a.id_membership=c.evo_contract_id AND ${activeContractWhere}) activeStudents
 FROM evo_contract_catalog c WHERE c.tenant_key='club-pop' AND c.unit IN ('bike','gym')
 ORDER BY c.unit,c.contract_name COLLATE NOCASE,c.evo_contract_id`).all();
 return rows.results||[];
}

export async function saveAccessSettings(db,body,actor){
 const rules=normalizeAccessRules(body.rules),before=await readAccessSettings(db);
 if((body.revision??null)!==before.revision)throw Error('CONFIGURACAO_ALTERADA_RECARREGUE');
 const catalog=await accessCatalog(db),known=new Set(catalog.map(c=>c.unit+':'+c.contractId));
 if(rules.some(r=>!known.has(r.sourceUnit+':'+r.contractId)))throw Error('CONTRATO_NAO_ENCONTRADO');
 const revision=crypto.randomUUID(),value=JSON.stringify({revision,rules});
 // One atomic compare-and-swap plus audit. Concurrent edits cannot overwrite each other.
 const result=await db.batch([
  db.prepare(`INSERT INTO club_settings(key,value,updated_at) SELECT ?,?,CURRENT_TIMESTAMP WHERE ? IS NULL
   OR EXISTS(SELECT 1 FROM club_settings WHERE key=? AND json_extract(value,'$.revision')=?)
   ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
   WHERE json_extract(club_settings.value,'$.revision')=?`).bind(accessSettingKey,value,before.revision,accessSettingKey,before.revision,before.revision),
  db.prepare(`INSERT INTO audit_log(actor_type,actor_id,action,entity_type,entity_id,metadata_json)
   SELECT 'ADMIN',?,'SHARED_UNIT_ACCESS_UPDATED','SYSTEM',?,? WHERE changes()>0`)
   .bind(String(actor||'admin'),accessSettingKey,JSON.stringify({before,after:{revision,rules}}))
 ]);
 if(!result[0].meta?.changes)throw Error('CONFIGURACAO_ALTERADA_RECARREGUE');
 return {revision,rules,updatedAt:new Date().toISOString()};
}

export async function memberUnitAccess(db,bikeId,gymId){
 const settings=await readAccessSettings(db),directUnits=[],grants=[];
 for(const [unit,input] of [['bike',bikeId],['gym',gymId]]){
  const id=canonicalEvoId(input);if(!/^[1-9]\d*$/.test(id))continue;
  const rows=(await db.prepare(`SELECT DISTINCT id_membership,membership_name FROM evo_member_contracts
   WHERE unit=? AND evo_member_id=? AND ${activeContractWhere}`).bind(unit,id).all()).results||[];
  if(rows.length)directUnits.push(unit);
  for(const r of settings.rules.filter(r=>r.sourceUnit===unit)){
   const contract=rows.find(c=>String(c.id_membership)===r.contractId);
   if(contract)grants.push({...r,sourceMemberId:id,contractName:contract.membership_name});
  }
 }
 return {activeUnits:units.filter(u=>directUnits.includes(u)||grants.some(g=>g.targetUnit===u)),directUnits,grants,revision:settings.revision};
}
