const performanceRoot=document.getElementById("performanceHost").attachShadow({mode:"open"});
performanceRoot.innerHTML="<style>\n:root{font-family:Inter,system-ui,-apple-system,Segoe UI,sans-serif;color:#f7f6fb;background:#0d0b15}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at top,#291b42 0,#100d19 42%,#0c0b12 100%);min-height:100vh}button{font:inherit;cursor:pointer}main{max-width:880px;margin:auto;padding:24px 16px 90px}.top{display:flex;align-items:center;justify-content:space-between;gap:12px}.brand{font-size:27px;font-weight:900;letter-spacing:-1.2px}.brand b{color:#ff4da8}.chip{background:#272035;border:1px solid #49395b;border-radius:50px;padding:8px 12px;color:#d9cde7;font-size:12px}.eyebrow{font-size:11px;font-weight:800;letter-spacing:1.6px;color:#ec7dbb}.hero{margin:25px 0 16px}.hero h1{font-size:29px;margin:7px 0}.muted{color:#a79db6;font-size:13px}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0}.tab{border:1px solid #41334f;background:#201a2c;color:#c9bdd7;border-radius:12px;padding:10px 14px;font-weight:750;font-size:12px}.tab.active{background:linear-gradient(110deg,#ed369b,#8341d9);color:white;border-color:transparent}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.stat,.panel,.activity{border:1px solid #362a45;background:linear-gradient(145deg,#20192d,#15121e);border-radius:18px}.stat{padding:17px 12px}.stat strong{display:block;font-size:24px}.stat span{font-size:11px;color:#aa9db9}.section{display:flex;align-items:center;justify-content:space-between;margin:28px 0 12px}.section h2{font-size:19px;margin:0}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.filter{border:1px solid #3b304a;border-radius:10px;background:#1c1727;color:#d7cde1;padding:9px 11px;font-size:12px}.activity{padding:18px;margin-bottom:12px}.activity-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.tag{display:inline-block;background:#4b2360;color:#f4b3ed;padding:6px 9px;border-radius:7px;font-size:10px;font-weight:900;letter-spacing:.7px}.tag.gym{background:#552036;color:#ffb0c9}.tag.manual{background:#27384b;color:#a8ccef}.activity h3{margin:11px 0 4px;font-size:19px}.activity .date{color:#a99bb7;font-size:12px}.data{display:flex;gap:16px;flex-wrap:wrap;margin:17px 0;color:#d8cde2;font-size:13px}.data b{color:white}.activity-actions{display:flex;gap:8px;flex-wrap:wrap}.subtle,.primary,.outline{border-radius:11px;padding:11px 14px;font-weight:800;font-size:12px}.subtle{border:1px solid #4a3a59;color:#e1d2e9;background:#292035}.primary{background:linear-gradient(100deg,#ef3d9c,#8d45e6);border:0;color:white}.outline{border:1px solid #8e57c0;color:#eecafa;background:#2c1d3d}.performance{width:100%;margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px}.note{margin-top:14px;color:#b8a9c6;font-size:12px}.overlay{position:fixed;inset:0;background:#05040bdc;display:none;align-items:center;justify-content:center;padding:15px;z-index:10}.overlay.show{display:flex}.modal{background:#171220;border:1px solid #59406b;box-shadow:0 24px 70px #0009;border-radius:22px;width:min(100%,480px);max-height:94vh;overflow:auto}.modal-head{display:flex;justify-content:space-between;align-items:start;padding:19px 20px 13px}.modal-head h2{margin:5px 0 3px;font-size:22px}.close{border:0;border-radius:50%;background:#30253c;color:white;font-size:23px;width:34px;height:34px}.modal-body{padding:0 20px 20px}.summary{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:17px 0}.metric{border:1px solid #453451;background:#241b30;padding:13px;border-radius:12px}.metric strong{font-size:25px;display:block}.metric small{color:#b4a4c2;font-size:11px}.metric em{font-size:12px;font-style:normal;color:#e7b6f3}.zone{margin:12px 0}.zone-label{display:flex;justify-content:space-between;font-size:12px;color:#d9cce2;margin-bottom:5px}.track{height:9px;background:#33283e;border-radius:9px;overflow:hidden}.fill{height:100%;border-radius:9px}.modal-footer{display:flex;gap:9px;margin-top:20px}.modal-footer button{flex:1}.share-preview{background:linear-gradient(155deg,#321649,#181029 55%,#45184a);border:1px solid #6b4178;border-radius:17px;padding:25px 20px;text-align:center;margin-top:14px}.share-preview .big{font-size:39px;font-weight:900}.share-preview .share-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin:20px 0}.share-preview .share-grid div{background:#ffffff14;border:1px solid #ffffff22;border-radius:11px;padding:12px}.share-preview .share-grid b{display:block;font-size:22px}.share-preview .share-grid span{font-size:11px;color:#e8cce9}.hide{display:none!important}.disclaimer{font-size:11px;color:#b4a2c2;line-height:1.5;margin-top:12px}@media(max-width:500px){.hero h1{font-size:25px}.stats strong{font-size:20px}.stat{padding:14px 10px}.activity{padding:15px}.modal{max-height:96vh}.modal-body{padding:0 15px 17px}}\n:host{color:#f7f6fb;font-family:Inter,system-ui,sans-serif}.overlay{z-index:9999}</style><div class=\"overlay\" id=\"overlay\"><div class=\"modal\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"modalTitle\"><div class=\"modal-head\"><div><div class=\"eyebrow\" id=\"modalTag\"></div><h2 id=\"modalTitle\">Seu Desempenho</h2><div class=\"muted\" id=\"modalDate\"></div></div><button class=\"close\" aria-label=\"Fechar\">×</button></div><div class=\"modal-body\"><div id=\"performanceView\"><div class=\"summary\"></div><h3 style=\"font-size:15px;margin-bottom:14px\">Tempo nas zonas cardíacas</h3><div id=\"zones\"></div><div class=\"disclaimer\">Calorias e zonas cardíacas são estimativas e dependem dos dados pessoais e da qualidade da leitura do sensor.</div><div class=\"modal-footer\"><button class=\"subtle\">Fechar</button><button class=\"primary\">↗ Compartilhar desempenho</button></div></div><div id=\"shareView\" class=\"hide\"><div class=\"share-preview\" id=\"shareCard\"><div class=\"eyebrow\">POP FIT · CLUB POP</div><div style=\"font-size:24px;font-weight:900;margin-top:14px\">MEU DESEMPENHO</div><div style=\"color:#e5c9ed;margin-top:5px\" id=\"shareUnit\"></div><div class=\"big\" style=\"margin-top:15px\" id=\"shareCal\"></div><div class=\"muted\">Calorias estimadas</div><div class=\"share-grid\"></div><div style=\"font-size:12px;color:#e7d3ef\" id=\"shareDate\"></div><div style=\"margin-top:14px;font-size:11px;letter-spacing:2px;font-weight:800\">CLUB POP</div></div><p class=\"disclaimer\">Prévia de compartilhamento. A imagem é gerada localmente no navegador.</p><div class=\"modal-footer\"><button class=\"subtle\">← Voltar</button><button class=\"primary\">↗ Compartilhar imagem</button></div></div></div></div></div>";
const pf = selector => performanceRoot.querySelector(selector);
let performanceRequest=0, performanceOpener, shareFile;
function closePopPerformance(){
  performanceRequest++;
  pf('.overlay').classList.remove('show');
  document.body.style.overflow='';
  performanceOpener?.focus();
}
function performanceView(sharing){
  pf('#performanceView').classList.toggle('hide',sharing);
  pf('#shareView').classList.toggle('hide',!sharing);
  pf('#modalTitle').textContent=sharing?'Compartilhar desempenho':'Seu Desempenho';
}
const metricSpecs=[
 ['heart_rate','Calorias estimadas','calories_estimated','kcal'],
 ['heart_rate','Frequência média','hr_avg','bpm'],['heart_rate','Frequência máxima','hr_max','bpm'],
 ['cadence','Cadência média','rpm_avg','RPM'],['cadence','Cadência máxima','rpm_max','RPM'],
 ['speed','Velocidade média','speed_avg_kmh','km/h'],['speed','Velocidade máxima','speed_max_kmh','km/h'],
 ['speed','Distância','distance_km','km']
];
async function showPopPerformance(load,unitName){
  const request=++performanceRequest;
  performanceOpener=document.activeElement;
  performanceView(false);
  pf('.overlay').classList.add('show');
  document.body.style.overflow='hidden';
  pf('.close').focus();
  pf('.modal-body').hidden=true;
  pf('#modalTag').textContent='';
  pf('#modalDate').textContent='Carregando…';
  try{
    const {performance:p}=await load();
    if(request!==performanceRequest)return;
    const types=JSON.parse(p.sensor_types_json);
    const metrics=metricSpecs.filter(([type,,field])=>types.includes(type)&&Number.isFinite(p[field]))
      .map(([,label,field,unit])=>[label,p[field].toLocaleString('pt-BR',{maximumFractionDigits:1}),unit]);
    if(Number.isFinite(p.duration_seconds))metrics.push(['Duração',String(Math.round(p.duration_seconds/60)),'min']);
    const unit=unitName(p.unit);
    const date=(p.starts_at||'').replace(/^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d).*$/,'$3/$2/$1 · $4h$5');
    pf('#modalTag').textContent=unit+' · AULA MONITORADA';
    pf('#modalDate').textContent=pf('#shareDate').textContent=date;
    pf('#shareUnit').textContent=unit+' · '+(p.class_name||'Aula');
    pf('.summary').replaceChildren();pf('.share-grid').replaceChildren();
    for(const [label,value,unit] of metrics){
      const card=document.createElement('div');
      card.className='metric';
      card.innerHTML='<small></small><strong></strong>';
      card.firstChild.textContent=label;
      card.lastChild.textContent=value+' ';
      const suffix=document.createElement('em');suffix.textContent=unit;card.lastChild.append(suffix);
      pf('.summary').append(card);
      if(label==='Calorias estimadas')continue;
      const tile=document.createElement('div');tile.innerHTML='<b></b><span></span>';
      tile.firstChild.textContent=value+' '+unit;tile.lastChild.textContent=label;pf('.share-grid').append(tile);
    }
    const kcal=metrics.find(([label])=>label==='Calorias estimadas');
    pf('#shareCal').textContent=kcal?kcal[1]+' kcal':'';
    pf('#shareCal').nextElementSibling.hidden=!kcal;
    const zones=types.includes('heart_rate')?JSON.parse(p.zones_seconds_json||'null'):null;
    pf('#zones').replaceChildren();pf('#zones').previousElementSibling.hidden=!zones;
    const names=['Leve','Moderada','Aeróbica','Intensa','Máxima'],colors=['#60a5fa','#36c980','#f6c64b','#ff9549','#ef5575'];
    zones?.forEach((seconds,i)=>{
      const zone=document.createElement('div');zone.className='zone';
      zone.innerHTML='<div class="zone-label"><span></span><span></span></div><div class="track"><div class="fill"></div></div>';
      zone.querySelector('span').textContent='Zona '+(i+1)+' · '+names[i];
      zone.querySelector('span+span').textContent=Math.round(seconds/60)+' min';
      Object.assign(zone.querySelector('.fill').style,{background:colors[i],width:Math.min(100,100*seconds/Math.max(1,p.duration_seconds))+'%'});
      pf('#zones').append(zone);
    });
    pf('.modal-body').hidden=false;
    shareFile=null;
    pf('#performanceView .primary').onclick=async()=>{
      performanceView(true);
      const button=pf('#shareView .primary');button.disabled=true;
      const canvas=document.createElement('canvas');canvas.width=900;canvas.height=400+metrics.length*85;
      const ctx=canvas.getContext('2d'), gradient=ctx.createLinearGradient(0,0,900,canvas.height);
      gradient.addColorStop(0,'#321649');gradient.addColorStop(1,'#181029');ctx.fillStyle=gradient;ctx.fillRect(0,0,900,canvas.height);
      ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 48px Arial';ctx.fillText('MEU DESEMPENHO',450,100);
      ctx.font='32px Arial';ctx.fillText(pf('#shareUnit').textContent,450,170,800);
      metrics.forEach(([label,v,u],i)=>ctx.fillText(label+' · '+v+' '+u,450,260+i*85,800));
      ctx.fillText(date+' · CLUB POP',450,canvas.height-65);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(request===performanceRequest&&blob){shareFile=new File([blob],'pop-fit-desempenho.png',{type:'image/png'});button.disabled=false;}
    };
  }catch{if(request===performanceRequest)pf('#modalDate').textContent='Não foi possível carregar o desempenho.';}
}
pf('.overlay').onclick=e=>{if(e.target===pf('.overlay'))closePopPerformance()};
pf('.close').onclick=pf('#performanceView .subtle').onclick=closePopPerformance;
pf('#shareView .subtle').onclick=()=>performanceView(false);
pf('#shareView .primary').onclick=async()=>{
  if(!shareFile)return;
  if(navigator.canShare?.({files:[shareFile]})){
    try{await navigator.share({files:[shareFile],title:'Meu desempenho Pop Fit'});return;}catch(e){if(e.name==='AbortError')return;}
  }
  const url=URL.createObjectURL(shareFile),a=document.createElement('a');
  a.href=url;a.download=shareFile.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&pf('.overlay').classList.contains('show'))closePopPerformance()});
