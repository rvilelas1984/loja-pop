(() => {
 const root=document.getElementById('sharedUnitAccessBlock');if(!root)return;
 const $=id=>document.getElementById(id),names={bike:'Bike Pop',gym:'Gym Pop'};
 let revision=null,catalog=[],selected=new Map(),ready=false,saving=false,dirty=false;
 const key=r=>r.sourceUnit+':'+r.contractId;
 const say=text=>{$('sharedAccessStatus').textContent=text;};
 const mark=()=>{dirty=true;render();say('Alterações pendentes. Salve para aplicar aos alunos com contrato válido.');};
 function render(){
  const unit=$('sharedAccessUnit').value,search=$('sharedAccessSearch').value.trim().toLocaleLowerCase('pt-BR');
  const list=$('sharedAccessCatalog');list.replaceChildren();
  for(const c of catalog.filter(c=>c.unit===unit&&(!search||(c.name+' '+c.contractId).toLocaleLowerCase('pt-BR').includes(search)))){
   const label=document.createElement('label');label.className='check';label.style.cssText='display:flex;gap:10px;align-items:flex-start;padding:12px';
   const input=document.createElement('input');input.type='checkbox';input.checked=selected.has(c.unit+':'+c.contractId);input.disabled=!ready||saving;
   input.addEventListener('change',()=>{const r={sourceUnit:c.unit,contractId:String(c.contractId)};if(input.checked)selected.set(key(r),r);else selected.delete(key(r));mark();});
   const text=document.createElement('span');text.textContent=c.name+' · #'+c.contractId+(c.active?'':' · fora do catálogo ativo');
   const small=document.createElement('small');small.style.cssText='display:block;margin-top:5px;color:#68717b';small.textContent=c.activeStudents+' alunos com contrato válido';
   text.append(small);label.append(input,text);list.append(label);
  }
  if(!list.children.length)list.textContent=ready?'Nenhum contrato encontrado.':'Carregando contratos…';
  const chosen=$('sharedAccessSelected');chosen.replaceChildren();
  for(const r of selected.values()){
   const c=catalog.find(c=>c.unit===r.sourceUnit&&String(c.contractId)===r.contractId);
   const row=document.createElement('div');row.className='notice';row.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px';
   const text=document.createElement('span');text.textContent=names[r.sourceUnit]+' · '+(c?.name||'Contrato #'+r.contractId)+' → Bike + Gym';
   const remove=document.createElement('button');remove.type='button';remove.className='btn light';remove.textContent='Remover';remove.disabled=saving;
   remove.setAttribute('aria-label','Remover acesso compartilhado de '+(c?.name||r.contractId));remove.onclick=()=>{selected.delete(key(r));mark();};
   row.append(text,remove);chosen.append(row);
  }
  if(!selected.size)chosen.textContent='Nenhum contrato selecionado para acesso às duas unidades.';
  $('sharedAccessSave').disabled=!ready||saving||!dirty;$('sharedAccessReload').disabled=saving;
  $('sharedAccessSave').textContent=saving?'SALVANDO…':'SALVAR ACESSOS';
 }
 async function request(method,body){
  const r=await fetch('/api/evo-config?route=shared-unit-access',{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error==='CONFIGURACAO_ALTERADA_RECARREGUE'?'Outra alteração foi salva. Recarregue e revise sua seleção.':d.error||'Não foi possível carregar a configuração.');return d;
 }
 function accept(d){revision=d.revision;catalog=d.catalog||[];selected=new Map((d.rules||[]).map(r=>[key(r),r]));ready=true;dirty=false;}
 async function load(){ready=false;render();say('Carregando configuração e contratos…');try{accept(await request('GET'));say(selected.size+' contratos com acesso às duas unidades.');}catch(e){say(e.message);}finally{render();}}
 $('sharedAccessSave').onclick=async()=>{
  saving=true;render();try{accept(await request('PUT',{revision,rules:[...selected.values()]}));say('Salvo. O acesso será aplicado automaticamente na próxima atualização do aplicativo ou login.');}
  catch(e){say('Não foi possível salvar: '+e.message);}finally{saving=false;render();}
 };
 $('sharedAccessReload').onclick=()=>{if(!dirty||confirm('Descartar as alterações ainda não salvas e recarregar?'))load();};
 $('sharedAccessUnit').onchange=render;$('sharedAccessSearch').oninput=render;
 load();
})();
