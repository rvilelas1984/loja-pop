/* Club Pop guided tour — preview rollout, no API calls and no account mutations. */
(()=>{"use strict";
const VERSION="2026-10-tour-v1",RUN="cp_tour_run",DONE="cp_tour_done_"+VERSION;
const steps=[
["/","Boas-vindas ao Club Pop","Aqui começa sua jornada. Vamos conhecer os recursos principais em poucos passos.","#dashboard"],
["/","Seu painel inicial","No dashboard você acompanha sua evolução e encontra os atalhos mais importantes.",".hello"],
["/","Escolha a unidade","Alterne entre Bike Pop e Gym Pop. Cada unidade apresenta suas informações.", "#unitSwitch"],
["/","Fitcoins","Acompanhe seu saldo. Use os Fitcoins nos benefícios e produtos disponíveis.",".balance"],
["/","Estrelas","Cada aula realizada soma uma estrela. O histórico é acumulativo, mesmo com várias aulas no mesmo dia.","#bikeStarsCard"],
["/","Sua medalha atual","Este atalho leva ao Hall de Conquistas, com seus marcos e medalhas.","#clubHallCurrentMedal"],
["/meu-hall-conquistas.html","Hall de Conquistas","Conheça suas medalhas, troféus e marcos de aulas. O histórico mostra sua evolução e novas conquistas.","#cpMedalPanel"],
["/meu-hall-conquistas.html","Medalhas e outras conquistas","Explore as abas do Hall. Suas conquistas são calculadas com base no histórico confirmado de aulas.","#cpTabBadges"],
["/missoes.html","Suas missões","Aqui você acompanha metas, desafios e recompensas disponíveis.","main"],
["/missoes.html","Criar uma missão","Em Nova missão, escolha um desafio próprio ou entre amigos. Defina total de aulas, dias diferentes, constância semanal ou modalidade.","button"],
["/missoes.html","Configurar a meta","Escolha quantidade e período. Nos desafios entre amigos, adicione participantes; depois acompanhe a evolução pela página.","main"],
["/loja.html","Loja e Fitcoins","Conheça os produtos e serviços, confira valores e condições e escolha como usar seus Fitcoins.","main"],
["/beneficios.html","Benefícios","Veja os benefícios disponíveis, condições e opções de resgate.","main"],
["/meus-vouchers.html","Meus vouchers","Acompanhe vouchers e orientações de utilização. Alguns resgates exigem validação da recepção.","main"],
["/minhas-compras.html","Minhas compras","Consulte o histórico de compras e pedidos feitos no Club Pop.","main"],
["/promocoes.html","Promoções","Veja campanhas ativas, regras de participação e oportunidades de ganhar prêmios.","main"],
["/meus-numeros.html","Meus números da sorte","Quando houver promoções com números da sorte, acompanhe sua participação aqui.","main"],
["/perfil.html","Meu perfil","Acesse seus dados, atalhos, histórico e preferências pessoais.","main"],
["/privacidade.html","Sua privacidade","Você pode controlar a visibilidade das suas estrelas e outras informações públicas, conforme as opções disponíveis.","main"],
["/perfil.html","Pronto para explorar!","Você já conhece o essencial. Para rever este guia, use o botão Rever tutorial no seu perfil.","main"]
];
const $=(q)=>document.querySelector(q);
function path(){return location.pathname.replace(/\/$/,"")||"/"}
function read(){try{return JSON.parse(sessionStorage.getItem(RUN)||"null")}catch{return null}}
function write(s){sessionStorage.setItem(RUN,JSON.stringify(s))}
function finish(skipped){sessionStorage.removeItem(RUN);document.getElementById("cp-tour-mask")?.remove();document.getElementById("cp-tour-panel")?.remove();document.querySelectorAll(".cp-tour-focus").forEach(x=>x.classList.remove("cp-tour-focus"));if(!skipped)localStorage.setItem(DONE,"done");}
function launch(){write({index:0});location.pathname==="/"?render():location.assign("/?tutorial=1")}
window.clubPopStartTutorial=launch;
function css(){if($("#cp-tour-style"))return;const el=document.createElement("style");el.id="cp-tour-style";el.textContent='.cp-tour-focus{position:relative!important;z-index:2147483001!important;outline:4px solid #b98aff!important;outline-offset:4px!important;border-radius:14px!important;box-shadow:0 0 28px #ae79ffbb!important}.cp-tour-mask{position:fixed;inset:0;background:#070b19ae;z-index:2147483000;pointer-events:none}.cp-tour-panel{position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(440px,calc(100vw - 24px));max-height:56vh;overflow:auto;background:#fff;color:#172033;z-index:2147483002;border-radius:23px;padding:21px;box-shadow:0 25px 65px #0006;font:14px/1.5 system-ui,sans-serif}.cp-tour-panel h2{margin:8px 0;font-size:21px}.cp-tour-panel p{margin:0 0 13px;color:#667184}.cp-tour-panel .cp-tour-actions{display:flex;gap:8px;align-items:center}.cp-tour-panel button{border:0;padding:11px 12px;border-radius:10px;font-weight:800;cursor:pointer}.cp-tour-panel .cp-next{background:#7445cf;color:white;flex:1}.cp-tour-panel .cp-back{background:#eee8fa;color:#63439d}.cp-tour-panel .cp-skip{background:transparent;color:#7e8390}.cp-tour-progress{height:5px;background:#eee9f7;border-radius:8px;margin:12px 0 16px}.cp-tour-progress span{display:block;height:100%;background:#8253e0;border-radius:8px}.cp-tour-replay{display:block;margin:12px 0;padding:12px 14px;border:1px solid #d8c9f4;border-radius:12px;background:#f5efff;color:#6538b7;font-weight:800;width:100%;cursor:pointer}';document.head.append(el)}
function render(){const state=read();if(!state)return;const n=state.index;if(n>=steps.length){finish(false);return}const [route,title,body,selector]=steps[n];if(path()!==route){location.assign(route);return}css();document.querySelectorAll(".cp-tour-focus").forEach(x=>x.classList.remove("cp-tour-focus"));let target=$(selector);if(target&&getComputedStyle(target).display==="none")target=null;if(target){target.classList.add("cp-tour-focus");target.scrollIntoView({behavior:"instant",block:"center"})}
if(!$("#cp-tour-mask")){let mask=document.createElement("div");mask.id="cp-tour-mask";mask.className="cp-tour-mask";document.body.append(mask)}
let panel=$("#cp-tour-panel");if(!panel){panel=document.createElement("section");panel.id="cp-tour-panel";panel.className="cp-tour-panel";panel.setAttribute("role","dialog");panel.setAttribute("aria-label","Tutorial Club Pop");document.body.append(panel)}
panel.innerHTML='<small style="color:#7548cf;font-weight:900">TUTORIAL · '+(n+1)+' DE '+steps.length+'</small><h2></h2><p></p><div class="cp-tour-progress"><span style="width:'+Math.round((n+1)/steps.length*100)+'%"></span></div><div class="cp-tour-actions"><button class="cp-skip">Pular</button><button class="cp-back">Voltar</button><button class="cp-next">'+(n===steps.length-1?"Concluir":"Próximo →")+'</button></div>';
panel.querySelector("h2").textContent=title;panel.querySelector("p").textContent=body;
panel.querySelector(".cp-skip").onclick=()=>finish(true);panel.querySelector(".cp-back").disabled=n===0;panel.querySelector(".cp-back").onclick=()=>move(n-1);panel.querySelector(".cp-next").onclick=()=>move(n+1);
}
function move(n){write({index:n});render()}
function replay(){if(path()!=="/perfil.html")return;let host=$("main")||$(".shell")||document.body;if($("#cp-tour-replay"))return;let b=document.createElement("button");b.id="cp-tour-replay";b.className="cp-tour-replay";b.textContent="🎓 Rever tutorial do Club Pop";b.onclick=launch;host.append(b)}
function init(){if(path()==="/perfil.html")replay();if(new URLSearchParams(location.search).get("tutorial")==="1"&&!read())write({index:0});if(read()){setTimeout(render,650);return}
// Rollout guard: automatic first-login activation remains disabled until D1 identity/status integration is validated.
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();