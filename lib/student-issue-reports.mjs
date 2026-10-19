// Validação compartilhada dos relatos beta. Identidade sempre vem da sessão validada no servidor.
export const ISSUE_AREAS = Object.freeze(['dashboard','missoes','presencas','brasoes','estrelas','vouchers','beneficios','loja','perfil','outros']);
export const ISSUE_STATUSES = Object.freeze(['aberto','em_analise','aguardando_aluno','resolvido','encerrado']);
export const ISSUE_PRIORITIES = Object.freeze(['baixa','media','alta','critica']);
export function validateStudentIssue(input) {
  if (!input || typeof input !== 'object') throw new Error('Relato inválido');
  const area = String(input.area || '').trim();
  const description = String(input.description || '').trim();
  if (!ISSUE_AREAS.includes(area)) throw new Error('Selecione a área do problema');
  if (description.length < 10 || description.length > 3000) throw new Error('Descrição deve ter entre 10 e 3000 caracteres');
  return { area, description };
}
export function validateIssueUpdate(input) {
  const status = String(input?.status || '');
  const priority = String(input?.priority || '');
  const note = String(input?.note || '').trim();
  if (!ISSUE_STATUSES.includes(status)) throw new Error('Situação inválida');
  if (!ISSUE_PRIORITIES.includes(priority)) throw new Error('Prioridade inválida');
  if (note.length > 3000) throw new Error('Observação muito longa');
  return {status, priority, note};
}
export function issueStudentIdentity(session) {
  // Nunca aceitar nome, unidade, member_id ou ID EVO enviados pelo navegador.
  if (!session || !session.memberId || !session.memberName || !['bike','gym','club'].includes(session.unit)) throw new Error('Sessão do aluno inválida');
  return {memberId:String(session.memberId),memberName:String(session.memberName),evoMemberId:session.evoMemberId == null ? null : String(session.evoMemberId),unit:session.unit};
}
