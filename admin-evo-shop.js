import {pendingReasons,receiptFor} from './lib/evo-shop-import.mjs';
import {workbookFor,readReturn} from './lib/evo-shop-xlsx.mjs';
const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),brl=n=>n==null?'—':(Number(n||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const unit=()=>window.cpAdminScope?.get?.()||'club';
const modes={pix:'Pix',coins:'Fitcoins',mixed:'Misto'},labels={confirmed:'Concluída EVO',exported:'Aguardando devolutiva',rejected:'Rejeitada EVO',review:'Conferir retorno EVO'};
let data=null,loadedUnit='',loading=0,busy=false,filter='pending',limit=50;
const settings=()=>({branchCode:$('cpEvoBranch').value.trim(),receipts:{pix:$('cpEvoReceiptPix').value,coins:$('cpEvoReceiptCoins').value,mixed:$('cpEvoReceiptMixed').value}});
async function api(method='GET',body,selectedUnit=unit()) {
 const r=await fetch('/api/evo-config?route=shop-sales-import&unit='+encodeURIComponent(selectedUnit),{method,headers:{'Content-Type':'application/json'},cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
 const d=await r.json().catch(()=>({error:'Resposta inválida do servidor'}));if(!r.ok||!d.ok)throw Error(d.error||'Consulta indisponível');return d;
}
function message(text,error=false){$('cpEvoExportInfo').textContent=text;$('cpEvoExportInfo').style.color=error?'#a12626':''}
function table(heads,rows){return '<div class="cp-evo-scroll" tabindex="0"><table><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(rows.length?'':'<p>Nenhum registro neste filtro.</p>')}
function status(o,cfg){return labels[o.importStatus]||(o.fiscalRegisteredAt||o.autoSaleId||o.autoSaleState==='confirmed'?'Já registrada':pendingReasons(o,cfg).length?'Pendente':'Pronta para envio')}
function render(){
 if(!data||loadedUnit!==unit())return;
 const cfg=settings(),all=data.orders.filter(o=>['product','service'].includes(o.itemType)),type=$('cpEvoType').value,pay=$('cpEvoPayment').value,imp=$('cpEvoImport').value;
 const shown=all.filter(o=>(!type||o.itemType===type)&&(!pay||o.status===pay)&&(!imp||o.importStatus===imp||(imp==='none'&&!o.importStatus)));
 $('cpEvoRows').innerHTML=table(['Pedido','Tipo','Produto / serviço oficial EVO','Aluno','CPF','Data original','Valor original','Desconto (R$)','Fitcoins','Pago no Pix','Forma de pagamento','Status da compra','Situação EVO'],shown.slice(0,limit).map(o=>[o.id,o.itemType==='service'?'Serviço':'Produto',o.officialName||o.storedItemName||o.itemName||'Pendente',o.memberName||'Pendente',o.cpf||'Pendente',o.saleDate,brl(o.originalCents),brl(o.discountCents),o.currencyQuantity,brl(o.status==='approved'&&o.pixVerified?o.amountCents:0)+(o.status==='refunded'?' (estornado)':''),modes[o.paymentMode]||o.paymentMode,o.status+(o.isTest?' · teste':''),status(o,cfg)]));
 const ready=all.filter(o=>!pendingReasons(o,cfg).length),done=all.filter(o=>o.importStatus==='confirmed'),pending=all.filter(o=>o.importStatus==='rejected'||(!['confirmed','exported'].includes(o.importStatus)&&pendingReasons(o,cfg).length>0&&o.amountCents>0)),sum=a=>a.reduce((n,o)=>n+Number(o.amountCents||0),0);
 $('cpEvoKpis').innerHTML=[['Prontos para EVO',ready],['Pendentes',pending],['Total do arquivo',ready.slice(0,100)],['Concluídos EVO',done]].map(([label,a])=>'<div class="card"><small>'+label+'</small><h3>'+a.length+'</h3><strong>'+brl(sum(a))+'</strong></div>').join('');
 const preview=filter==='ready'?ready:filter==='pending'?pending:filter==='zero'?all.filter(o=>o.amountCents===0):filter==='nonzero'?all.filter(o=>o.amountCents>0):filter==='done'?done:all;
 $('cpEvoExportRows').innerHTML=table(['ID filial','Aluno','CPF','Data da venda','Valor','Produto / serviço','Recebimento','Pedido','Status','Pendência / retorno EVO'],preview.slice(0,limit).map(o=>[cfg.branchCode||'Pendente',o.memberName||'Pendente',o.cpf||'Pendente',o.saleDate,brl(o.amountCents),o.officialName||'Vínculo EVO pendente',receiptFor(o,cfg)||'Pendente',o.id,status(o,cfg),[...pendingReasons(o,cfg),o.returnLog].filter(Boolean).join(' · ')]));
 $('cpEvoMore').hidden=shown.length<=limit&&preview.length<=limit;$('cpEvoCounts').textContent=shown.length+' compras · '+preview.length+' registros no filtro da prévia';
 $('cpEvoExport').disabled=busy||!ready.length;
 $('cpEvoFilters').querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.filter===filter);b.setAttribute('aria-pressed',String(b.dataset.filter===filter))});
}
function renderBatches(){
 const batches=data.batches||[],old=$('cpEvoBatch').value;
 $('cpEvoBatch').innerHTML='<option value="">Selecione o lote exportado</option>'+batches.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.created_at+' · '+b.id.slice(0,8)+' · '+b.state+' · '+(b.snapshot?.length||0)+' vendas')+'</option>').join('');
 if(batches.some(b=>b.id===old))$('cpEvoBatch').value=old;
 $('cpEvoHistory').innerHTML=table(['Lote','Criado em','Vendas','Valor','Situação','Conferido em'],batches.map(b=>[b.id,b.created_at,b.snapshot?.length||0,brl((b.snapshot||[]).reduce((n,x)=>n+Math.round(Number(x.row.VALOR)*100),0)),b.state,b.reviewed_at||'Aguardando devolutiva']));
}
async function load(){
 const u=unit(),seq=++loading;data=null;loadedUnit='';$('cpEvoExport').disabled=true;$('cpEvoRows').textContent='Carregando vendas...';$('cpEvoExportRows').textContent='';$('cpEvoKpis').innerHTML='';$('cpEvoBatch').innerHTML='';$('cpEvoHistory').innerHTML='';
 if(!['bike','gym'].includes(u)){$('cpEvoRows').textContent='Selecione Bike Pop ou Gym Pop no seletor de unidade.';return}
 try{const d=await api('GET',undefined,u);if(seq!==loading||u!==unit())return;data=d;loadedUnit=u;limit=50;
 $('cpEvoBranch').value=d.settings.branchCode;for(const [mode,id] of [['pix','Pix'],['coins','Coins'],['mixed','Mixed']])$('cpEvoReceipt'+id).value=d.settings.receipts[mode]??'';
 render();renderBatches();message('Dados carregados do D1. Exportar cria um lote; a confirmação depende da devolutiva EVO.');
 }catch(e){if(seq!==loading)return;$('cpEvoRows').textContent='Não foi possível carregar: '+e.message;message(e.message,true)}
}
async function action(fn){if(busy)return;busy=true;const u=unit();$('cpUnifiedEvo').querySelectorAll('[data-write]').forEach(b=>b.disabled=true);try{await fn(u)}catch(e){message(e.message,true);cpNotify('error','Vendas para EVO',e.message)}finally{busy=false;$('cpUnifiedEvo').querySelectorAll('[data-write]').forEach(b=>b.disabled=false);render()}}
function download(batch,u){if(!window.XLSX)throw Error('Biblioteca XLSX indisponível. Atualize a página.');XLSX.writeFile(workbookFor(XLSX,batch.snapshot),'clubpop-vendas-evo-'+u+'-'+batch.batchId+'.xlsx')}
$('cpEvoSave').onclick=()=>action(async u=>{await api('POST',{action:'settings',settings:settings()},u);await load();message('Configuração salva para '+(u==='bike'?'Bike Pop':'Gym Pop')+'.')});
$('cpEvoExport').onclick=()=>action(async u=>{
 if(!window.XLSX)throw Error('Biblioteca XLSX indisponível. Atualize a página.');
 if(loadedUnit!==u||!data)throw Error('Aguarde o carregamento da unidade.');
 const cfg=settings(),ready=data.orders.filter(o=>['product','service'].includes(o.itemType)&&!pendingReasons(o,cfg).length).slice(0,100);
 if(!ready.length)throw Error('Nenhuma venda elegível.');
 await api('POST',{action:'settings',settings:cfg},u);
 const batch=await api('POST',{action:'export',orderIds:ready.map(o=>o.id)},u);
 try{download(batch,u)}finally{await load();if(unit()===u)$('cpEvoBatch').value=batch.batchId}
 message('Lote '+batch.batchId+' salvo no D1: '+batch.snapshot.length+' vendas. Se o download falhar, use Baixar lote original.');
});
$('cpEvoDownload').onclick=()=>{try{const b=data?.batches.find(x=>x.id===$('cpEvoBatch').value);if(!b)throw Error('Selecione um lote.');download({batchId:b.id,snapshot:b.snapshot},loadedUnit)}catch(e){message(e.message,true)}};
$('cpEvoReturn').onclick=()=>action(async u=>{
 const file=$('cpEvoFile').files?.[0],batchId=$('cpEvoBatch').value;if(!file||!batchId)throw Error('Selecione o lote e a planilha devolvida.');if(file.size>10*1024*1024)throw Error('Arquivo acima de 10 MB.');
 const entries=readReturn(XLSX,await file.arrayBuffer()),r=await api('POST',{action:'return',batchId,entries},u);
 await load();message(r.changed+' vendas atualizadas; '+r.unmatched+' linhas sem correspondência. As rejeições aparecem na prévia e as confirmações não serão exportadas novamente.');
});
$('cpEvoFilters').onclick=e=>{const b=e.target.closest('[data-filter]');if(b){filter=b.dataset.filter;limit=50;render()}};
$('cpEvoMore').onclick=()=>{limit+=50;render()};$('cpEvoReload').onclick=load;
for(const id of ['cpEvoType','cpEvoPayment','cpEvoImport','cpEvoBranch','cpEvoReceiptPix','cpEvoReceiptCoins','cpEvoReceiptMixed'])$(id).addEventListener('input',render);
document.addEventListener('change',e=>{if(e.target.closest('[data-cp-unit],#cp-unit-select'))load()});
window.cpEvoRender=()=>{if(loadedUnit!==unit())load();else render()};
window.cpEvoPrepare=window.cpEvoRender;
load();
