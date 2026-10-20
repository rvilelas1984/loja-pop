# Sessões por contrato — 20/10/2026

## Entrega conservadora

O dashboard das duas unidades usa os contratos de `evo_member_contracts`, sem consulta EVO no acesso. A view `evo_session_contract_links` acompanha automaticamente as gravações das sincronizações existentes. A view não altera payloads nem indicadores oficiais; não modifica presenças ou estrelas. A migração deve preceder a publicação do Worker. Se a view não estiver disponível, o modal informa indisponibilidade.

O vínculo é confirmado somente quando o registro bruto contém `idMemberMembership` igual ao identificador de exatamente um contrato do mesmo aluno e unidade. Compatibilidade por datas gera apenas diagnóstico provável ou ambíguo. Todas as categorias participam da análise; agregadores não são descartados para artificialmente tornar um pacote a única opção. Contratos adicionais são excluídos da hipótese por datas. Contratos cancelados antes da aula são excluídos dessa hipótese, preservando o histórico anterior ao cancelamento.

O modal mostra apenas registros confirmados, explicitamente não finalizados e futuros, com exclusão de cancelamentos/remoções/faltas conhecidos. Dados ausentes não significam zero reservas. Indicadores oficiais não são recalculados com cobertura parcial. O filtro já existente de indicadores de agregadores foi preservado.

## Evidência real D1

- Cristiane, Bike, aluno 975709: sessão 19373062, 22/10/2026 07:15, Douglas, bike 5, `isFinalized:false`.
- Nenhum `idMemberMembership`, `idMembership`, `idSale` ou `idSaleItem` nesse payload.
- Contrato 7597229: 20/10 a 19/11, contrato renovado 7267520, `idSale:9355135`. `sessions:null`; oficiais 0 concluídas, 0 agendadas, 8 pendentes.
- Resultado da nova view: `contract_key:null`, `candidate_contract_key:7597229`, `confidence:probable_unique`, `evidence:date_window_only`. Não comprova o contrato consumido.
- Amostra total disponível: 1.859 estados Bike, 325 ambíguos, 1.372 prováveis e 162 sem candidato. Nenhum confirmado. Aluno 1030082 possui exemplos com dois candidatos.
- Nenhum dos estados possui `idSaleItem` positivo; nenhum contrato armazenado possui `sessions[]` não vazio. Não havia estados Gym nessa tabela no momento da verificação.

## Investigação documental

Fontes oficiais consultadas:
- https://api-en.abcevo.com/get-activity-sessions-for-a-member-35669759e0
- https://api-en.abcevo.com/get-summary-of-membermemberships-by-id-35669790e0
- https://api-en.abcevo.com/get-sale-by-id-35669840e0

`activities/member/sessions` documenta presença/falta/finalização, sem contrato. `membermembership/{id}` documenta `sessions[].idSession`, validade e bônus, sem demonstrar equivalência entre `idSession` e `idActivitieSession`. Não cruzar esses IDs por coincidência. Venda documenta `idSaleItem` e `idMemberMembership`; é um caminho de investigação quando houver item real associado ao participante. `idMembership` é plano, não a aquisição/renovação individual; `idSale` sozinho também não demonstra qual item foi consumido.

Não foram feitas chamadas autenticadas novas à EVO. A pesquisa documental e os dados D1 não provam que nenhum outro endpoint possa fornecer o vínculo. A consulta pontual do detalhe do contrato e do participante na aula ainda é necessária para resolver o caso; se esses retornos também não fornecerem o vínculo, solicitar à EVO o identificador do contrato consumido e a semântica do saldo após reserva. Não foi aplicada a subtração 8−1.

## Validação

- `node --check club-pop-worker.mjs` e `node --check lib/session-contracts.mjs`.
- `node --test tests/session-contracts.test.mjs`: isolamento por contrato, deduplicação, provável/ambíguo, cancelamentos, finalização e sintaxe de todos os scripts inline (inclusive módulos).
- `python tests/session-contracts-sql.py`: SQL real SQLite, isolamento aluno/unidade, contratos simultâneos, IDs inexistentes e alteração de cancelamento refletida pela view.
- View aplicada e consultada no D1, sem modificação dos indicadores.
- Navegação autenticada, validação visual do modal e teste completo do dashboard em produção continuam pendentes. O Chromium local não estava instalado e seu download falhou. Deploy não é evidência de funcionamento.

## Limitações de sincronização

A view acompanha apenas o que as sincronizações existentes realmente armazenam. Não cria chamadas por aluno, não amplia a cobertura Gym automaticamente e não infere cancelamento por ausência em uma página parcial. Um cancelamento não recebido continua sendo limitação da origem. Para não exibir um vínculo confirmado apenas no passado como uma reserva futura atual, exige-se `isFinalized:false` e os demais filtros explícitos. Melhorias de captura da EVO dependem de um retorno real comprovado antes de modificar as sincronizações.
