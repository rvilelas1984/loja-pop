// Bike Pop: each completed class earns one lifetime star. No Gym data included.
export const BIKE_STAR_MILESTONES = Object.freeze([
  [12,'Primeiro Giro'],[24,'Pegou o Ritmo'],[50,'Ritmo de Ouro'],
  [100,'Centurião POP'],[150,'Energia POP'],[200,'Potência POP'],
  [250,'Elite POP'],[300,'Lenda POP']
]);
export function bikeStarProgress(value){
  const total=Math.max(0,Math.floor(Number(value)||0));
  const achieved=total>=300?[Math.floor(total/50)*50,'Lenda POP']:BIKE_STAR_MILESTONES.filter(([n])=>n<=total).at(-1)||[0,'Começando a jornada'];
  const next=BIKE_STAR_MILESTONES.find(([n])=>n>total)?.[0]||(Math.floor(total/50)+1)*50;
  const nextTitle=BIKE_STAR_MILESTONES.find(([n])=>n===next)?.[1]||'Lenda POP';
  const current=achieved[0],remaining=next-total;
  return {total,currentMilestone:current,title:achieved[1],nextMilestone:next,nextTitle,
    remaining,percent:Math.min(100,Math.max(0,Math.round((total-current)/(next-current)*100))),
    message:remaining===1?'Falta apenas 1 aula para '+nextTitle+'!':
      'Faltam '+remaining+' aulas para '+nextTitle+'!'};
}
export function bikeStarTotal(legacy,actual){
  return Math.max(0,Math.floor(Number(legacy)||0))+Math.max(0,Math.floor(Number(actual)||0));
}
