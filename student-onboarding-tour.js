/* Club Pop guided tour — preview rollout, no API calls and no account mutations. */
(()=>{"use strict";
const VERSION="2026-10-tour-v3",RUN="cp_tour_run",DONE="cp_tour_done_"+VERSION;
const steps=[
 [
  "/",
  "Início · Dashboard",
  "Este é seu painel: aqui você acompanha suas aulas, seu progresso e os principais atalhos.",
  "#dashboard"
 ],
 [
  "/",
  "Unidades",
  "Alterne entre Bike Pop e Gym Pop para consultar as informações de cada estúdio.",
  "#unitSwitch"
 ],
 [
  "/",
  "Fitcoins",
  "Confira o saldo de Fitcoins e acesse a loja para descobrir como utilizá-los.",
  ".balance"
 ],
 [
  "/",
  "Estrelas",
  "Cada aula efetivamente realizada vale uma estrela, mesmo que você faça várias aulas no mesmo dia.",
  "#bikeStarsCard"
 ],
 [
  "/",
  "Medalha atual",
  "Toque na medalha para conhecer seu Hall de Conquistas.",
  "#clubHallCurrentMedal"
 ],
 [
  "/meu-hall-conquistas.html",
  "Hall · Medalhas e troféus",
  "Seu histórico de estrelas libera medalhas. Quatro medalhas completam uma jornada e liberam um troféu.",
  "#cpMedalPanel"
 ],
 [
  "/meu-hall-conquistas.html",
  "Hall · Brasões",
  "Nesta aba você acompanha os brasões e outros reconhecimentos disponíveis.",
  "#cpTabBadges"
 ],
 [
  "/missoes.html",
  "Menu · Desafios e missões",
  "Pelo menu Desafios você acompanha missões disponíveis e seu progresso.",
  ".nav"
 ],
 [
  "/missoes.html",
  "Nova missão",
  "Toque em Nova missão para escolher desafio próprio ou entre amigos. Depois selecione uma das quatro metas.",
  "main"
 ],
 [
  "/missoes.html",
  "Defina seu objetivo",
  "Escolha total de aulas, dias diferentes, constância semanal ou aulas por modalidade; configure a meta e, se quiser, convide amigos.",
  "main"
 ],
 [
  "/beneficios.html",
  "Menu · Benefícios",
  "Veja os benefícios disponíveis, as condições e como resgatar.",
  "main"
 ],
 [
  "/meus-vouchers.html",
  "Meus vouchers",
  "Consulte seus vouchers e instruções de utilização.",
  "main"
 ],
 [
  "/loja.html",
  "Menu · Loja",
  "Veja produtos e serviços, confira preços e opções de pagamento com Fitcoins.",
  "main"
 ],
 [
  "/minhas-compras.html",
  "Minhas compras",
  "Acompanhe seus pedidos e o histórico de compras.",
  "main"
 ],
 [
  "/promocoes.html",
  "Promoções",
  "Confira campanhas, critérios de participação e prazos.",
  "main"
 ],
 [
  "/meus-numeros.html",
  "Números da sorte",
  "Quando uma promoção oferecer números da sorte, você poderá acompanhar seus números aqui.",
  "main"
 ],
 [
  "/perfil.html",
  "Menu · Perfil",
  "Aqui ficam seus dados, histórico, atalhos e configurações pessoais.",
  "main"
 ],
 [
  "/perfil.html",
  "Atalhos da conta",
  "Pelo perfil você também acessa Hall de Conquistas, missões, vouchers e compras.",
  ".card"
 ],
 [
  "/privacidade.html",
  "Configurações de privacidade",
  "Controle a exibição pública de estrelas e conquistas conforme as opções disponíveis.",
  "main"
 ],
 [
  "/perfil.html",
  "Tudo pronto!",
  "Você concluiu a visita. Use Rever tutorial no perfil sempre que precisar.",
  "main"
 ]
];
const $=(q)=>document.querySelector(q);
function path(){return location.pathname.replace(/\/$/,"")||"/"}
function read(){try{return JSON.parse(sessionStorage.getItem(RUN)||"null")}catch{return null}}
function write(s){sessionStorage.setItem(RUN,JSON.stringify(s))}
function finish(skipped){document.getElementById("communityCreate")?.close?.();sessionStorage.removeItem(RUN);document.getElementById("cp-tour-mask")?.remove();document.getElementById("cp-tour-panel")?.remove();document.querySelectorAll(".cp-tour-focus").forEach(x=>x.classList.remove("cp-tour-focus"));if(!skipped)localStorage.setItem(DONE,"done");}
function launch(){write({index:0});location.pathname==="/"?render():location.assign("/?tutorial=1")}
window.clubPopStartTutorial=launch;
function css(){if($("#cp-tour-style"))return;const el=document.createElement("style");el.id="cp-tour-style";el.textContent='.cp-tour-focus{position:relative!important;z-index:2147483001!important;outline:4px solid #b98aff!important;outline-offset:4px!important;border-radius:14px!important;box-shadow:0 0 28px #ae79ffbb!important}.cp-tour-mask{position:fixed;inset:0;background:#070b19ae;z-index:2147483000;pointer-events:none}.cp-tour-panel{position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(440px,calc(100vw - 24px));max-height:56vh;overflow:auto;background:#fff;color:#172033;z-index:2147483002;border-radius:23px;padding:21px;box-shadow:0 25px 65px #0006;font:14px/1.5 system-ui,sans-serif}.cp-tour-panel h2{margin:8px 0;font-size:21px}.cp-tour-panel p{margin:0 0 13px;color:#667184}.cp-tour-panel .cp-tour-actions{display:flex;gap:8px;align-items:center}.cp-tour-panel button{border:0;padding:11px 12px;border-radius:10px;font-weight:800;cursor:pointer}.cp-tour-panel .cp-next{background:#7445cf;color:white;flex:1}.cp-tour-panel .cp-back{background:#eee8fa;color:#63439d}.cp-tour-panel .cp-skip{background:transparent;color:#7e8390}.cp-tour-progress{height:5px;background:#eee9f7;border-radius:8px;margin:12px 0 16px}.cp-tour-progress span{display:block;height:100%;background:#8253e0;border-radius:8px}.cp-tour-replay{display:block;margin:12px 0;padding:12px 14px;border:1px solid #d8c9f4;border-radius:12px;background:#f5efff;color:#6538b7;font-weight:800;width:100%;cursor:pointer}';document.head.append(el)}
function render(){const state=read();if(!state)return;const n=state.index;if(n>=steps.length){finish(false);return}const [route,title,body,selector]=steps[n];if(path()!==route){
 if(state.lastRoute===route){write({index:n+1});render();return} // route unavailable or redirected: never loop
 write({...state,lastRoute:route});
 // Prefer the actual student menu when it exposes the destination.
 const navButton=Array.from(document.querySelectorAll(".nav button")).find(button=>{
  const action=button.getAttribute("onclick")||"";
  return action.includes("'"+route+"'")||action.includes('"'+route+'"')||
    (route==="/missoes.html"&&action.includes("'/desafios'"))||
    (route==="/beneficios.html"&&action.includes("'/beneficios'"))||
    (route==="/loja.html"&&action.includes("'/loja'"))||
    (route==="/perfil.html"&&action.includes("'/perfil'"));
 });
 if(navButton){navButton.click();return}
 location.assign(route);return
}write({index:n});css();document.querySelectorAll(".cp-tour-focus").forEach(x=>x.classList.remove("cp-tour-focus"));let target=$(selector);if(target&&getComputedStyle(target).display==="none")target=null;if(target){target.classList.add("cp-tour-focus");target.scrollIntoView({behavior:"instant",block:"center"})}if(route==="/missoes.html"&&n>0&&steps[n-1]?.[1]==="Nova missão"){document.getElementById("communityNew")?.click();}
if(!$("#cp-tour-mask")){let mask=document.createElement("div");mask.id="cp-tour-mask";mask.className="cp-tour-mask";document.body.append(mask)}
let panel=$("#cp-tour-panel");if(!panel){panel=document.createElement("section");panel.id="cp-tour-panel";panel.className="cp-tour-panel";panel.setAttribute("role","dialog");panel.setAttribute("aria-label","Tutorial Club Pop");document.body.append(panel)}
panel.innerHTML='<small style="color:#7548cf;font-weight:900">TUTORIAL · '+(n+1)+' DE '+steps.length+'</small><h2></h2><p></p><div class="cp-tour-progress"><span style="width:'+Math.round((n+1)/steps.length*100)+'%"></span></div><div class="cp-tour-actions"><button class="cp-skip">Pular</button><button class="cp-back">Voltar</button><button class="cp-next">'+(n===steps.length-1?"Concluir":"Próximo →")+'</button></div>';
panel.querySelector("h2").textContent=title;panel.querySelector("p").textContent=body;
panel.querySelector(".cp-skip").onclick=()=>finish(true);panel.querySelector(".cp-back").disabled=n===0;panel.querySelector(".cp-back").onclick=()=>move(n-1);panel.querySelector(".cp-next").onclick=()=>move(n+1);
}
function move(n){document.getElementById("communityCreate")?.close?.();write({index:n});render()}
function replay(){if(path()!=="/perfil.html")return;let host=$("main")||$(".shell")||document.body;if($("#cp-tour-replay"))return;let b=document.createElement("button");b.id="cp-tour-replay";b.className="cp-tour-replay";b.textContent="🎓 Rever tutorial do Club Pop";b.onclick=launch;host.append(b)}
function init(){if(path()==="/perfil.html")replay();const login=$("#login");const isLogin=path()==="/"&&login&&getComputedStyle(login).display!=="none";if(isLogin){sessionStorage.removeItem(RUN);return}if(new URLSearchParams(location.search).get("tutorial")==="1"&&!read())write({index:0});if(read()){setTimeout(()=>{const l=$("#login");if(path()==="/"&&l&&getComputedStyle(l).display!=="none"){sessionStorage.removeItem(RUN);return}render()},950);return}
// Rollout guard: automatic first-login activation remains disabled until D1 identity/status integration is validated.
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();