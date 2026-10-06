(function(){
  function unit(){try{const s=JSON.parse(sessionStorage.getItem("clubpop")||"{}");return (localStorage.getItem("clubpop_active_unit")||s.unit)==="gym"?"gym":"bike"}catch{return localStorage.getItem("clubpop_active_unit")==="gym"?"gym":"bike"}}
  function paintHeader(){
    const u=unit(),label=u==="gym"?"GYM POP":"BIKE POP";
    document.documentElement.dataset.clubUnit=u;
    const dash=document.getElementById("dashUnitBrand");if(dash)dash.textContent=label;
    document.querySelectorAll(".club-unit-badge,.cp-student-brand .cp-unit").forEach(x=>x.textContent=label);
    const top=document.querySelector("#dashboard .top")||document.querySelector(".app > .top")||document.querySelector("header.top");
    if(top&&!top.querySelector(".club-unit-badge")&&!document.getElementById("dashUnitBrand")){const b=document.createElement("div");b.className="club-unit-badge";b.textContent=label;top.appendChild(b)}
  }
  async function paintTheme(){
    const u=unit();try{const r=await fetch("/api/evo-config?route=unit-theme&unit="+u,{cache:"no-store"}),d=await r.json();if(!r.ok||!d.ok||!d.updatedAt)return;const color=d.backgroundColor;document.documentElement.style.setProperty("--club-unit-custom-bg",color);document.body.style.background=color;const app=document.querySelector(".app"),dash=document.getElementById("dashboard");if(app)app.style.background=color;if(dash)dash.style.background=color}catch{}
  }
  const css=document.createElement("style");css.id="cp-header-standard-v3";css.textContent=".top,.cp-student-head{min-height:82px!important;box-sizing:border-box!important;padding:26px 18px 14px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important}.club-unit-badge{display:inline-flex;align-items:center;justify-content:center;min-height:26px;padding:5px 10px;border-radius:999px;font-size:10px;font-weight:950;letter-spacing:.45px;white-space:nowrap}html[data-club-unit=\"bike\"] .club-unit-badge{background:#6f42c1;color:#fff}html[data-club-unit=\"gym\"] .club-unit-badge{background:#e83e8c;color:#fff}";document.head.appendChild(css);
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{paintHeader();paintTheme()});else{paintHeader();paintTheme()}
  window.addEventListener("pageshow",()=>{paintHeader();paintTheme()});
  window.clubPopRefreshHeader=()=>{paintHeader();paintTheme()};
})();