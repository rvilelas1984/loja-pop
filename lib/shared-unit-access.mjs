// Regra central de elegibilidade para acesso Bike Pop + Gym Pop.
// Sem chamadas à EVO, sem escrita de presenças e sem contratos fictícios.
// O chamador deve fornecer contratos sincronizados e regras ativas do D1.
const UNITS = new Set(['bike', 'gym']);
const clean = value => String(value ?? '').trim();
const unitOf = value => {
  const v = clean(value).toLowerCase();
  if (['bike', 'bikepop', 'bike pop'].includes(v)) return 'bike';
  if (['gym', 'gympop', 'gym pop', 'jimpop'].includes(v)) return 'gym';
  return '';
};
const contractIdOf = c => clean(c?.contractId ?? c?.contract_id ?? c?.idContract ?? c?.id_contract ?? c?.contract?.id);
const contractUnitOf = c => unitOf(c?.unit ?? c?.sourceUnit ?? c?.source_unit);
const ruleContractIdOf = r => clean(r?.contractId ?? r?.contract_id);
const ruleUnitOf = r => unitOf(r?.unit ?? r?.sourceUnit ?? r?.source_unit);
const enabled = r => r?.enabled === true || r?.enabled === 1 || r?.enabled === '1';
const active = c => {
  if (c?.isActive === true || c?.active === true) return true;
  if (c?.isActive === false || c?.active === false) return false;
  const status = clean(c?.status ?? c?.contractStatus).toLowerCase();
  return ['active', 'ativo', 'vigente', 'current'].includes(status);
};
const withinDates = (c, day) => {
  const start = clean(c?.startDate ?? c?.start_date).slice(0, 10);
  const end = clean(c?.endDate ?? c?.end_date).slice(0, 10);
  return (!start || start <= day) && (!end || end >= day);
};

/**
 * Decide permissões de visualização no Club Pop. NÃO concede acesso à reserva
 * de aulas na EVO nem substitui validação de identidade/CPF no servidor.
 * Regras sempre usam o par (unidade de origem, ID do contrato EVO).
 * O status do contrato é verificado em cada avaliação (fail-closed).
 */
export function resolveSharedUnitAccess({contracts = [], rules = [], today, identityVerified = false} = {}) {
  const date = clean(today).slice(0, 10);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) throw new TypeError('today deve ser YYYY-MM-DD em America/Sao_Paulo');
  const nativeUnits = new Set();
  const eligibleContracts = [];
  if (!identityVerified) return {units: [], nativeUnits: [], shared: false, eligibleContracts};
  for (const contract of contracts) {
    const unit = contractUnitOf(contract);
    const id = contractIdOf(contract);
    if (!UNITS.has(unit) || !id || !active(contract) || !withinDates(contract, date)) continue;
    nativeUnits.add(unit);
    if (rules.some(rule => enabled(rule) && ruleUnitOf(rule) === unit && ruleContractIdOf(rule) === id)) {
      eligibleContracts.push({unit, contractId: id});
    }
  }
  const units = eligibleContracts.length ? ['bike', 'gym'] : [...nativeUnits].sort();
  return {units, nativeUnits: [...nativeUnits].sort(), shared: eligibleContracts.length > 0, eligibleContracts};
}

/** A filtragem dos históricos nunca usa a permissão compartilhada como unidade. */
export function filterActivitiesBySourceUnit(activities = [], requestedUnit) {
  const unit = unitOf(requestedUnit);
  if (!unit) return [];
  return activities.filter(activity => unitOf(activity?.unit ?? activity?.sourceUnit ?? activity?.source_unit) === unit);
}
