let generation=0;
const host=document.createElement('details');host.className='contract-card';host.style.margin='16px 0';
host.innerHTML='<summary style="cursor:pointer;font-weight:700">Histórico de aulas realizadas</summary><p data-history-status role="status"></p><div data-history-items></div><button type="button" data-history-more hidden>Ver mais</button>';
document.getElementById('contractBlock')?.after(host);
let unit='',offset=0;
const status=host.querySelector('[data-history-status]'),items=host.querySelector('[data-history-items]'),more=host.querySelector('button');
async function load(reset=false){
 const current=document.documentElement.dataset.clubUnit||'bike';
 if(reset||unit!==current){unit=current;offset=0;items.replaceChildren();generation++;}
 const version=generation;more.disabled=true;status.textContent='Carregando histórico…';
 try{
  const token=sessionStorage.getItem('clubpop_token');if(!token)throw Error('Entre na sua conta para consultar.');
  const response=await fetch('/api/auth?route=attendance-history&unit='+encodeURIComponent(unit)+'&offset='+offset,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const data=await response.json();if(version!==generation)return;
  if(!response.ok||!data.ok)throw Error('Não foi possível carregar o histórico.');
  status.textContent=(unit==='gym'?'Gym Pop':'Bike Pop')+' · '+data.total+' aulas com registro detalhado';
  for(const row of data.items){const p=document.createElement('p');p.textContent=row.attendance_date.split('-').reverse().join('/')+' · '+(row.start_time||'')+' · '+(row.activity_name||'Aula');items.append(p);}
  offset+=data.items.length;more.hidden=!data.hasMore;
 }catch(error){if(version===generation){status.textContent=error.message;more.hidden=false;more.textContent='Tentar novamente';}}
 finally{if(version===generation)more.disabled=false;}
}
host.addEventListener('toggle',()=>{if(host.open&&!items.children.length)load(true)});
more.addEventListener('click',()=>load());
new MutationObserver(()=>{generation++;items.replaceChildren();offset=0;more.hidden=true;if(host.open)load(true)}).observe(document.documentElement,{attributes:true,attributeFilter:['data-club-unit']});
