/* Club Pop | Missões da Comunidade: criação, prévia e convites */
(()=>{
const $=(s,r=document)=>r.querySelector(s), esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const unit=()=>localStorage.getItem("clubpop_active_unit")==="gym"?"gym":"bike";
const names={total_classes:"Total de aulas",distinct_days:"Dias diferentes",weekly_consistency:"Constância semanal",modality_classes:"Aulas por modalidade"};
const labels={private:"Pessoal",friends:"Entre amigos",public:"Pública"};
const api=async(action,body,params={})=>{const qs=new URLSearchParams({action,unit:unit(),...params});const r=await fetch("/api/community-challenges?"+qs,{method:body?"POST":"GET",headers:{"Authorization":"Bearer "+sessionStorage.getItem("clubpop_token"),"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||"Não foi possível concluir");return d};
const style=document.createElement("style");style.textContent=`
#communitySection{margin:12px 0 28px;font-family:inherit}
#communitySection .communityTop{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px}
#communitySection .communityTop h2{font-size:22px;margin:0;color:#13243b;letter-spacing:-.5px}
#communitySection .communityHint{color:#4b6d82;font-size:13px;margin:0 0 18px}
.communityBtn{border:0;background:#152239;color:white;padding:13px 17px;border-radius:15px;font-size:13px;font-weight:800;cursor:pointer}
.communityGrid{display:grid;gap:14px}
.communityCard{position:relative;overflow:hidden;border-radius:23px;padding:21px;color:#fff;background:linear-gradient(135deg,#332060,#6840b7 68%,#9b60df);box-shadow:0 8px 24px #2d22642b}
.communityCard.friends{background:linear-gradient(135deg,#123e59,#087d9e 75%,#1bb3bf)}
.communityCard.private{background:linear-gradient(135deg,#23324d,#45627c)}
.communityCard:before{content:"✦";position:absolute;right:14px;top:2px;font-size:90px;color:#ffffff13}
.communityTag{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;background:#ffffff2b;border:1px solid #ffffff30;border-radius:99px;font-size:10px;font-weight:800;letter-spacing:.6px}
.communityCard h3{font-size:23px;line-height:1.15;margin:14px 0 8px;color:#fff}
.communityCard p{color:#ffffffd6;font-size:13px;margin:6px 0}
.communityMeta{display:flex;gap:8px;flex-wrap:wrap;margin:15px 0}
.communityMeta span{background:#ffffff20;border-radius:10px;padding:7px 10px;font-size:11px}
.communityCard button{width:100%;background:#fff;color:#2e2960;border:0;border-radius:12px;padding:12px;font-weight:800;margin-top:8px}
.communityProgress{height:8px;background:#ffffff40;border-radius:20px;overflow:hidden;margin-top:12px}
.communityProgress i{display:block;height:100%;background:#fff;border-radius:20px}
#communityCreate,#communityDetails{border:0;padding:0;width:min(94vw,510px);max-height:92dvh;border-radius:26px;background:#f6f8fc;color:#1b2940;box-shadow:0 20px 70px #0006;overflow:auto}
#communityCreate::backdrop,#communityDetails::backdrop{background:#081427b8;backdrop-filter:blur(3px)}
.communityModalHead{padding:24px 22px 16px;background:#fff}
.communityModalHead h2{margin:0 0 5px;font-size:24px}
.communityModalHead p{margin:0;color:#64748b;font-size:13px}
.communityFormBody{padding:18px 20px;display:grid;gap:16px}
.communityFormBody label{display:grid;gap:7px;font-size:13px;font-weight:750;color:#334155}
.communityFormBody input,.communityFormBody select,.communityFormBody textarea{box-sizing:border-box;width:100%;border:1px solid #d8e0ec;background:#fff;border-radius:13px;padding:13px;font:inherit;font-size:15px;color:#1e293b;outline-color:#12a7dc}
.communityTypeRow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.communityTypeRow label{display:block;cursor:pointer}
.communityTypeRow input{position:absolute;opacity:0;width:1px}
.communityTypeRow span{display:block;text-align:center;padding:13px 6px;border-radius:13px;background:white;border:2px solid #e2e8f0;font-size:12px;font-weight:800}
.communityTypeRow input:checked+span{border-color:#07a9d7;background:#e5faff;color:#067a9f}
.communityPreview{border-radius:20px;padding:18px;color:#fff;background:linear-gradient(135deg,#243b72,#6e3dc4)}
.communityPreview.friends{background:linear-gradient(135deg,#164e65,#0d98b2)}
.communityPreview.private{background:linear-gradient(135deg,#24334a,#536783)}
.communityPreview strong{display:block;font-size:20px;margin:12px 0 6px}
.communityPreview small{color:#ffffffdb}
.communityActions{display:flex;gap:10px;padding:0 20px 22px}
.communityActions button{flex:1;border:0;border-radius:14px;padding:15px;font-weight:800}
.communityActions .primary{background:#06a6d8;color:white;flex:2}
.communityFriendResult{display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid #e2e8f0;font-size:13px}
.communityFriendResult button{border:0;background:#dcf5ff;border-radius:10px;padding:8px 10px;color:#036d96;font-weight:800}
.communityMessage{font-size:12px;color:#b42318;min-height:16px}
@media(max-width:380px){#communitySection .communityTop h2{font-size:19px}.communityBtn{padding:11px}}
`;document.head.append(style);
const metricPreview=metric=>names[metric]||metric;
let dialog,detail,friendList=[];
function preview(){const f=$("#communityForm");if(!f)return;const v=Object.fromEntries(new FormData(f));const el=$("#communityPreview");el.className="communityPreview "+v.visibility;el.innerHTML='<span class="communityTag">✦ '+esc(labels[v.visibility])+'</span><strong>'+esc(v.title.trim()||"Minha nova missão")+'</strong><small>'+esc(v.description.trim()||"Um novo desafio começa aqui!")+'</small><div class="communityMeta"><span>🎯 '+esc(v.target||"12")+' · '+esc(metricPreview(v.metric))+'</span>'+(v.end_at?'<span>📅 Até '+esc(v.end_at.split("-").reverse().join("/"))+'</span>':"")+'</div>';$("#communityModality").hidden=v.metric!=="modality_classes";$("#communityFriendBox").hidden=v.visibility!=="friends"}
function makeModal(){dialog=document.createElement("dialog");dialog.id="communityCreate";dialog.innerHTML=`
<div class="communityModalHead"><h2>✨ Crie sua missão</h2><p>Escolha o desafio, personalize e veja como ele ficará.</p></div>
<form id="communityForm">
<div class="communityFormBody">
<div class="communityTypeRow">
<label><input type="radio" name="visibility" value="private"><span>💪 Pessoal</span></label>
<label><input type="radio" name="visibility" value="friends" checked><span>👥 Amigos</span></label>
<label><input type="radio" name="visibility" value="public"><span>🌎 Pública</span></label>
</div>
<label>Nome da missão<input name="title" required minlength="3" maxlength="90" placeholder="Ex.: Juntos até o topo"></label>
<label>Qual é o objetivo?<select name="metric"><option value="total_classes">Total de aulas</option><option value="distinct_days">Dias diferentes</option><option value="weekly_consistency">Constância semanal</option><option value="modality_classes">Aulas por modalidade</option></select></label>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label>Meta<input name="target" type="number" min="1" max="365" value="12" required></label><label>Termina em<input name="end_at" type="date" required></label></div>
<label id="communityModality" hidden>Modalidade<input name="modality" maxlength="80" placeholder="Ex.: RitBox"></label>
<label>Mensagem para os participantes<textarea name="description" rows="2" maxlength="500" placeholder="Vamos superar nossos limites juntos!"></textarea></label>
<div id="communityFriendBox"><label>Convidar amigos<input id="communityFriendSearch" autocomplete="off" placeholder="Busque pelo nome do aluno (mín. 3 letras)"></label><div id="communityFriendResults"></div><div id="communitySelected"></div><small>O amigo receberá um convite e só entrará quando aceitar.</small></div>
<div><div style="font-size:12px;font-weight:800;margin-bottom:8px;color:#64748b">PRÉVIA DA SUA MISSÃO</div><div id="communityPreview" class="communityPreview"></div></div>
<div class="communityMessage" id="communityError" role="alert"></div>
</div>
<div class="communityActions"><button type="button" id="communityClose">Voltar</button><button type="submit" class="primary" id="communitySubmit">Criar missão ✨</button></div>
</form>`;document.body.append(dialog);
const f=$("#communityForm");f.addEventListener("input",preview);f.addEventListener("change",preview);$("#communityClose").onclick=()=>dialog.close();
let searchSerial=0;$("#communityFriendSearch").addEventListener("input",async e=>{const q=e.target.value.trim(),serial=++searchSerial,root=$("#communityFriendResults");root.textContent="";if(q.length<3)return;try{const d=await api("friends",null,{q});if(serial!==searchSerial)return;root.innerHTML=d.friends.length?d.friends.map(p=>'<div class="communityFriendResult"><span>'+esc(p.name)+'</span><button type="button" data-pick="'+p.id+'">Convidar +</button></div>').join(""):'<small>Nenhum aluno encontrado.</small>';root.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>{const p=d.friends.find(x=>String(x.id)===b.dataset.pick);if(p&&!friendList.some(x=>x.id===p.id))friendList.push(p);renderSelected();root.textContent="";$("#communityFriendSearch").value=""})}catch(err){root.textContent=err.message}});
function renderSelected(){const root=$("#communitySelected");root.innerHTML=friendList.map(p=>'<div class="communityFriendResult"><span>✓ '+esc(p.name)+'</span><button type="button" data-remove="'+p.id+'">Remover</button></div>').join("");root.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{friendList=friendList.filter(x=>String(x.id)!==b.dataset.remove);renderSelected()})}
f.onsubmit=async e=>{e.preventDefault();const v=Object.fromEntries(new FormData(f));if(v.visibility==="friends"&&!friendList.length){$("#communityError").textContent="Selecione pelo menos um amigo.";return}const btn=$("#communitySubmit");btn.disabled=true;btn.textContent="Criando missão...";$("#communityError").textContent="";try{const d=await api("create",{...v,target:Number(v.target),end_at:new Date(v.end_at+"T23:59:59").toISOString()});if(v.visibility==="friends"){const errors=[];for(const p of friendList){try{await api("invite",{id:d.id,memberId:p.id})}catch(err){errors.push(p.name)}}if(errors.length)$("#communityError").textContent="Missão criada, mas alguns convites falharam: "+errors.join(", ")}dialog.close();await load()}catch(err){$("#communityError").textContent=err.message}finally{btn.disabled=false;btn.textContent="Criar missão ✨"}};
preview()}
function showDetail(d){detail?.remove();detail=document.createElement("dialog");detail.id="communityDetails";const c=d.challenge;const ranking=d.ranking||[];detail.innerHTML='<div class="communityModalHead"><h2>'+esc(c.title)+'</h2><p>'+esc(metricPreview(c.metric))+' · Meta '+Number(c.target)+'</p></div><div class="communityFormBody"><div class="communityPreview '+esc(c.visibility)+'"><span class="communityTag">🏆 SEU DESEMPENHO</span><strong>'+Number(d.myProgress)+' / '+Number(c.target)+'</strong><div class="communityProgress"><i style="width:'+Math.min(100,Math.round(100*Number(d.myProgress)/Number(c.target)))+'%"></i></div></div><h3 style="margin:0">Ranking dos participantes</h3>'+(ranking.length?ranking.map((p,i)=>'<div class="communityFriendResult"><span>'+(i+1)+'. '+esc(p.name)+'</span><b>'+Number(p.progress)+' / '+Number(c.target)+'</b></div>').join(""):'<p>Os participantes aparecerão aqui.</p>')+'</div><div class="communityActions"><button class="primary" id="communityDone">Fechar</button></div>';document.body.append(detail);$("#communityDone").onclick=()=>{detail.close();detail.remove()};detail.showModal()}
async function load(){const root=$("#communityCards");if(!root)return;root.innerHTML="<p class=communityHint>Carregando missões...</p>";try{const d=await api("list");root.innerHTML=d.challenges.length?d.challenges.map(c=>{const mine=c.my_status==="accepted",invited=c.my_status==="invited";return '<article class="communityCard '+esc(c.visibility)+'"><span class="communityTag">'+(c.visibility==="friends"?"👥":c.visibility==="public"?"🌎":"💪")+' '+esc(labels[c.visibility])+'</span><h3>'+esc(c.title)+'</h3><p>'+esc(c.description||"Um novo desafio para você!")+'</p><div class="communityMeta"><span>🎯 '+Number(c.target)+' '+esc(metricPreview(c.metric))+'</span><span>👤 '+Number(c.participants)+' participantes</span></div><p>Por '+esc(c.creator_name)+'</p>'+(invited?'<button data-accept="'+esc(c.id)+'">✓ Aceitar convite</button><button data-decline="'+esc(c.id)+'">Recusar</button>':mine?'<button data-detail="'+esc(c.id)+'">Ver progresso e ranking →</button>':c.visibility==="public"?'<button data-join="'+esc(c.id)+'">Participar desta missão →</button>':'')+'</article>'}).join(""):'<p class="communityHint">Ainda não há missões. Que tal criar a primeira?</p>';root.querySelectorAll("[data-detail]").forEach(b=>b.onclick=async()=>{try{showDetail(await api("detail",null,{id:b.dataset.detail}))}catch(err){alert(err.message)}});root.querySelectorAll("[data-join]").forEach(b=>b.onclick=async()=>{try{await api("join",{id:b.dataset.join});await load()}catch(err){alert(err.message)}});for(const [attr,accept] of [["data-accept",true],["data-decline",false]])root.querySelectorAll("["+attr+"]").forEach(b=>b.onclick=async()=>{try{await api("respond",{id:b.getAttribute(attr),accept});await load()}catch(err){alert(err.message)}})}catch(err){root.innerHTML='<p class="communityHint">Não foi possível carregar as missões: '+esc(err.message)+'</p>'}}
document.addEventListener("DOMContentLoaded",()=>{const pane=$("#missionsPane");if(!pane)return;const section=document.createElement("section");section.id="communitySection";section.innerHTML='<div class="communityTop"><h2>Missões da Comunidade</h2><button class="communityBtn" id="communityNew">+ Nova missão</button></div><p class="communityHint">Crie seu desafio ou entre na missão de um amigo.</p><div class="communityGrid" id="communityCards"></div>';pane.insertBefore(section,pane.firstChild);makeModal();$("#communityNew").onclick=()=>{friendList=[];$("#communityForm").reset();$("#communitySelected").textContent="";$("#communityFriendResults").textContent="";$("#communityError").textContent="";preview();dialog.showModal()};load();document.addEventListener("click",e=>{if(e.target.closest("[data-unit]"))setTimeout(load,250)})});
})();