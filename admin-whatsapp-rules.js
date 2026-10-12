(function(){
"use strict";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const instances=new WeakMap();
window.cpWhatsappRules={
 mount(host,initial=[],config={}){
  if(!host)return;
  let state=instances.get(host);
  if(!state){state={rules:[],flows:[],busy:false};instances.set(host,state)}
  state.rules=Array.isArray(initial)?initial.map(r=>({...r})):[];
  const render=()=>{
   host.innerHTML='<div style="'+(config.embedded?'':'border:1px solid #cbdce6;border-radius:16px;padding:18px;margin:18px 0;background:#f6fbff;')+'color:#152b3a"><h3 style="margin:0 0 6px">'+(config.embedded?'Configurar mensagens':'💬 Disparos WhatsApp')+'</h3><p style="font-size:12px;margin:0 0 12px;color:#526675">Regras independentes das recompensas. Configure quantos marcos desejar. Os envios automáticos ainda não estão ativados nesta etapa.</p><div data-rules></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button type="button" data-add>+ Adicionar disparo</button><button type="button" data-flows>Consultar fluxos ChatPro</button></div><small data-info style="display:block;margin-top:10px;color:#526675">'+(state.flows.length?state.flows.length+" fluxos disponíveis":"Fluxos carregados sob demanda")+'</small></div>';
   const list=host.querySelector("[data-rules]");
   state.rules.forEach((r,i)=>{
    const div=document.createElement("div");div.style.cssText="border:1px solid #d9e4ed;background:white;border-radius:12px;padding:12px;margin-top:10px";
    const opts=(config.targets?config.targets.map(t=>[t.event,t.label]):[["presence","Quantidade de presenças"],["week_completed","Semana concluída"],["week_failed","Semana não concluída (após encerramento)"],["challenge_progress","Progresso do desafio"],["challenge_completed","Desafio concluído"],["challenge_failed","Desafio não concluído (após prazo)"],["lucky_numbers","Quantidade de números da sorte"],["promotion_progress","Progresso da promoção"]]).map(([v,n])=>'<option value="'+v+'" '+(r.event===v?"selected":"")+'>'+n+'</option>').join("");
    const flows='<option value="">Selecione um fluxo</option>'+state.flows.map(f=>'<option value="'+esc(f.id)+'" '+(String(r.flowId)===String(f.id)?"selected":"")+'>'+esc(f.name)+' (ID '+esc(f.id)+')</option>').join("");
    div.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px"><label style="font-size:12px">Quando disparar<select data-key="event" style="width:100%;padding:9px">'+opts+'</select></label><label style="font-size:12px">Ao atingir / semana nº<input data-key="threshold" type="number" min="1" step="1" value="'+esc(r.threshold||1)+'" style="width:100%;padding:9px"></label><label style="font-size:12px">Fluxo ChatPro<select data-key="flowId" style="width:100%;padding:9px">'+flows+'</select></label><label style="font-size:12px">ID manual do fluxo<input data-key="flowManual" inputmode="numeric" placeholder="Opcional" value="'+esc(r.flowId||"")+'" style="width:100%;padding:9px"></label></div><label style="font-size:12px;display:inline-flex;gap:8px;align-items:center;margin-top:12px"><input type="checkbox" data-key="enabled" '+(r.enabled?"checked":"")+'>Regra habilitada (após ativação do motor)</label><button type="button" data-remove style="margin-left:12px">Remover</button>';
    div.querySelectorAll("[data-key]").forEach(el=>{el.addEventListener("change",()=>{const k=el.dataset.key;r[k]=k==="threshold"?Number(el.value):k==="enabled"?el.checked:el.value;if(k==="flowManual"&&el.value)r.flowId=el.value;if(k==="flowId")r.flowManual=el.value})});
    div.querySelector("[data-remove]").onclick=()=>{state.rules.splice(i,1);render()};list.append(div);
   });
   host.querySelector("[data-add]").onclick=()=>{state.rules.push({event:config.targets?.[0]?.event||"presence",threshold:1,flowId:"",enabled:false});render()};
   host.querySelector("[data-flows]").onclick=async()=>{
    const info=host.querySelector("[data-info]");info.textContent="Consultando ChatPro...";
    try{const response=await fetch("/api/promo-numbers?route=whatsapp",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"flows"})});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||"Falha na consulta");const raw=data.flows;const list=Array.isArray(raw)?raw:Array.isArray(raw?.results)?raw.results:Array.isArray(raw?.data)?raw.data:Array.isArray(raw?.flows)?raw.flows:[];state.flows=list.map(f=>({id:f.id??f.flow_id,name:f.name??f.title??f.label??"Fluxo"})).filter(f=>f.id!=null);render()}catch(e){info.textContent="Falha: "+e.message}
   };
  };
  render();
 },
 get(host){const rows=instances.get(host)?.rules||[];return rows.map(r=>({event:String(r.event||"presence"),threshold:Number(r.threshold)||1,flowId:String(r.flowId||r.flowManual||""),enabled:!!r.enabled})).filter(r=>r.flowId)}
};
})();