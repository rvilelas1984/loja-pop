/* Club Pop first-party page analytics; one session per visible page/tab. */
(()=>{"use strict";
const routes={"index":"dashboard","loja":"loja","missoes":"missoes","meu-hall-conquistas":"conquistas","meus-numeros":"meus-numeros","meus-vouchers":"meus-vouchers","minhas-compras":"minhas-compras","perfil":"perfil","pop-fit":"pop-fit","promocao":"promocao","promocoes":"promocoes","beneficios":"beneficios","relatar-problema":"relatar-problema","tutoriais":"tutoriais"};
const slug=location.pathname.split("/").pop().replace(/\.html$/,"")||"index",page=routes[slug];
if(!page)return;
let sessionId=crypto.randomUUID(),unit="",busy=false,lastInteraction=Date.now();
const currentUnit=()=>localStorage.getItem("clubpop_active_unit")==="gym"?"gym":"bike";
for(const name of ["pointerdown","keydown","touchstart","scroll"])document.addEventListener(name,()=>{lastInteraction=Date.now()},{passive:true});
async function ping(){
 if(busy||document.visibilityState!=="visible"||Date.now()-lastInteraction>120000)return;
 const token=sessionStorage.getItem("clubpop_token");if(!token)return;
 const nextUnit=currentUnit();if(nextUnit!==unit){unit=nextUnit;sessionId=crypto.randomUUID()}
 busy=true;
 try{await fetch("/api/auth?route=app-analytics",{method:"POST",headers:{"content-type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({sessionId,unit,page}),cache:"no-store",keepalive:true})}catch{}finally{busy=false}
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){lastInteraction=Date.now();ping()}});
window.addEventListener("focus",()=>{lastInteraction=Date.now();ping()});
setInterval(ping,15000);setTimeout(ping,1500);
})();
