const trigger=document.getElementById('attendanceCount')?.closest('.stat');
if(trigger){
 const host=document.createElement('dialog');host.id='attendanceHistoryDialog';
 host.setAttribute('aria-labelledby','attendanceHistoryTitle');
 host.innerHTML='<div class="attendance-history-head"><h2 id="attendanceHistoryTitle">Histórico de aulas realizadas</h2><button type="button" data-history-close aria-label="Fechar histórico">Fechar</button></div><p data-history-status role="status"></p><div data-history-items></div><button type="button" data-history-more hidden>Ver mais</button>';
 const style=document.createElement('style');style.textContent=`
 #attendanceHistoryDialog{box-sizing:border-box;width:calc(100% - 32px);max-width:480px;max-height:80dvh;padding:22px;border:0;border-radius:24px;background:#fff;color:#17212b;box-shadow:0 20px 60px #0004;overflow:auto}
 #attendanceHistoryDialog::backdrop{background:#0008}
 #attendanceHistoryDialog .attendance-history-head{display:flex;align-items:flex-start;gap:14px;justify-content:space-between}
 #attendanceHistoryDialog h2{margin:0;font-size:21px;line-height:1.25}
 #attendanceHistoryDialog button{font:inherit;font-weight:700;padding:10px 14px;border:0;border-radius:12px;background:#eaf8fe;color:#086f99;cursor:pointer}
 #attendanceHistoryDialog [data-history-items] p{padding:12px 0;margin:0;border-bottom:1px solid #e5e9ee;line-height:1.5}
 #attendanceHistoryDialog [data-history-more]{margin-top:16px}
 #attendanceHistoryDialog button[hidden]{display:none}
 #attendanceCountCard{cursor:pointer}
 #attendanceCountCard:focus-visible{outline:3px solid #078fcb;outline-offset:4px}
 `;
 document.head.append(style);document.body.append(host);
 trigger.id='attendanceCountCard';trigger.setAttribute('role','button');trigger.tabIndex=0;
 trigger.setAttribute('aria-label','Ver histórico de aulas realizadas');
 trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-controls',host.id);
 let generation=0,unit='',offset=0,loading=false;
 const status=host.querySelector('[data-history-status]'),items=host.querySelector('[data-history-items]'),more=host.querySelector('[data-history-more]');
 async function load(reset=false){
  if(!host.open||loading&&!reset)return;
  const current=document.documentElement.dataset.clubUnit||'bike';
  if(reset||unit!==current){unit=current;offset=0;items.replaceChildren();generation++;more.hidden=true;}
  const version=generation;loading=true;more.disabled=true;more.textContent='Ver mais';status.textContent='Carregando histórico…';
  try{
   const token=sessionStorage.getItem('clubpop_token');if(!token)throw Error('Entre na sua conta para consultar.');
   const response=await fetch('/api/auth?route=attendance-history&unit='+encodeURIComponent(unit)+'&offset='+offset,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
   const data=await response.json();if(version!==generation||!host.open)return;
   if(!response.ok||!data.ok)throw Error('Não foi possível carregar o histórico.');
   status.textContent=(unit==='gym'?'Gym Pop':'Bike Pop')+' · '+data.total+' aulas com registro detalhado';
   for(const row of data.items){const p=document.createElement('p');p.textContent=String(row.attendance_date||'').slice(0,10).split('-').reverse().join('/')+' · '+(row.start_time||'')+' · '+(row.activity_name||'Aula');items.append(p);}
   offset+=data.items.length;more.hidden=!data.hasMore;
  }catch(error){if(version===generation&&host.open){status.textContent=error.message;more.hidden=false;more.textContent='Tentar novamente';}}
  finally{if(version===generation){loading=false;more.disabled=false;}}
 }
 function open(){if(host.open)return;host.showModal();load(true);}
 trigger.addEventListener('click',open);
 trigger.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
 host.querySelector('[data-history-close]').addEventListener('click',()=>host.close());
 host.addEventListener('click',event=>{if(event.target===host){const r=host.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)host.close();}});
 host.addEventListener('close',()=>{generation++;loading=false;items.replaceChildren();trigger.focus();});
 more.addEventListener('click',()=>load());
 new MutationObserver(()=>{const next=document.documentElement.dataset.clubUnit||'bike';if(next!==unit){generation++;loading=false;items.replaceChildren();offset=0;more.hidden=true;if(host.open)host.close();}}).observe(document.documentElement,{attributes:true,attributeFilter:['data-club-unit']});
}
