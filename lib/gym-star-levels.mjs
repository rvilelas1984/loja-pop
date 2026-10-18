// Gym Pop lifetime stars. One completed class = one star, independent of distinct days.
export const GYM_STAR_MILESTONES = Object.freeze([
  [12,'Primeiro Movimento'],
  [24,'Entrou no Ritmo'],
  [50,'Energia POP'],
  [100,'Ritmo de Campeã(o)'],
  [150,'Superação POP'],
  [200,'Potência POP'],
  [250,'Elite Gym POP'],
  [300,'Lenda Gym POP']
]);
export function gymStarProgress(value) {
  const total=Math.max(0,Math.floor(Number(value)||0));
  const achieved=total>=300?[Math.floor(total/50)*50,'Lenda Gym POP']:GYM_STAR_MILESTONES.filter(([n])=>n<=total).at(-1)||[0,'Começando a jornada'];
  const next=GYM_STAR_MILESTONES.find(([n])=>n>total)?.[0]||(Math.floor(total/50)+1)*50;
  const nextTitle=GYM_STAR_MILESTONES.find(([n])=>n===next)?.[1]||'Lenda Gym POP';
  const current=achieved[0],remaining=next-total;
  return {total,currentMilestone:current,title:achieved[1],nextMilestone:next,nextTitle,remaining,
    percent:Math.min(100,Math.max(0,Math.round((total-current)/(next-current)*100))),
    message:remaining===1?'Falta apenas 1 aula para '+nextTitle+'!':'Faltam '+remaining+' aulas para '+nextTitle+'!'};
}
export function gymStarTotal(legacy,current) {
  return Math.max(0,Math.floor(Number(legacy)||0))+Math.max(0,Math.floor(Number(current)||0));
}
