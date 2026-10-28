# Central de Eventos — 27/10/2026

A central existente permanece em `admin-atividades.html`, agora com menu e título “Central de Eventos”.

## Cobertura e funcionamento

- Inventário de 196 fontes atuais do D1, mais duas fontes já previstas no código e criadas sob demanda; 66 páginas inventariadas.
- 464 tipos catalogados, além das ações que já aparecem na auditoria existente. Seis tipos das fontes sob demanda ficam pendentes até a primeira utilização.
- Categorias, origem, código estável, campos disponíveis, referências de código, última detecção e histórico paginado em 10 ocorrências.
- Atualização da tela a cada 15 segundos enquanto estiver visível; datas em São Paulo. Sem requisições à EVO nesta consulta.
- Captura prospectiva no `audit_log`; não cria um sistema paralelo de eventos nem reenvia histórico para automações.
- Reservas comparadas atomicamente ao estado anterior e à versão da sincronização. Lista repetida não cria novo agendamento; retirada da lista não afirma que houve um cancelamento na EVO.
- Criação de presença deduplicada pela identidade da fonte, inclusive em exclusão/reimportação. Mudanças de carimbo de sincronização não são eventos novos.
- Campos de PIN, token, CPF, contato, conteúdo de chat e imagens não são copiados para os novos eventos.
- Medalhas e troféus usam o cálculo do Hall. O cron estabelece a base sem recriar conquistas antigas e registra cruzamentos novos, com até 200 alterações por execução. A preparação inicial pode levar vários ciclos de um minuto.
- Configurações de WhatsApp/e-mail não são alteradas nem são criados disparos.
- Tabelas novas desconhecidas aparecem como “Precisa mapear”. Fontes técnicas, cópias e credenciais ficam explicitamente separadas.

## Exemplos de gatilhos para a próxima etapa

| Uso | Código | Condição adicional |
| --- | --- | --- |
| Novo cliente identificado | `cp.registration.client.detected` | unidade e janela de detecção |
| Nova oportunidade | `cp.registration.opportunity.detected` | unidade e janela de detecção |
| Agendamento de aluno recebido | `cp.checkin_reservation_snapshots.detected` | aula/unidade |
| Agendamento de oportunidade | `cp.evo_prospect_reservations.detected` | oportunidade/aula/unidade |
| Presença recebida | `cp.evo_member_attendance.created` | data da aula distinta da detecção |
| Etapa da jornada detectada | `cp.club_journey_event_details.created` | campo `rule` e `event_key` |
| Página acessada | `cp.club_app_page_sessions.created` | campo `page`; heartbeat não é novo acesso |
| Contrato alterado | `cp.evo_member_contracts.updated` | `membership_status` e `previous_membership_status` |
| Nova medalha/troféu | `cp.conquest.medal.earned` / `cp.conquest.trophy.earned` | unidade e alvo |

Eventos genéricos de alteração não equivalem automaticamente a conversão, pagamento aprovado ou cancelamento: a automação deverá selecionar também a transição de estado pertinente. O cadastro de um tipo não ativa uma automação.

## Instalação e restauração

1. Publicar o Worker deste commit antes de instalar os gatilhos. D1 inclui escritas de triggers em `meta.changes`; os guardas de operações únicas foram ajustados para preservar suas condições de concorrência.
2. Aplicar `migrations/20261027_event_center.sql` em `club-pop-db`. Apenas índices e triggers; nenhuma carga histórica ou exclusão de dados.
3. Confirmar Worker e Vercel, quantidade de triggers, leitura do catálogo e novas ocorrências.

Base de código anterior: `fa57bc74ec76c277e36ca11926d763b88ff54739`.
Bookmark D1 anterior à instalação: `00000727-000052e2-00005112-679efee7e5c977a4a49833fe572e8a34`.

Para desfazer a funcionalidade, aplicar primeiro `migrations/20261027_event_center_rollback.sql` e depois restaurar o código. O rollback remove apenas a captura e preserva o histórico de auditoria. Uma restauração integral do D1 apagaria mudanças posteriores ao bookmark e não é o procedimento normal.

## Validação

26 testes direcionados aprovados: autorização e unidade, registro de cliente/oportunidade, ausência de replay, deduplicação, reserva concorrente/antiga, 200 reservas, privacidade dos payloads, heartbeat, conteúdos, paginação, metadados, vouchers e proteção do checkout com a contagem real de triggers do D1.

Navegador: 1440 px e 390 px; filtros, histórico, detalhes e busca exercitados; zero erros de JavaScript e sem overflow horizontal da página.

A suíte antiga de reservas tem cinco falhas já reproduzidas no commit anterior; `tests/checkout.test.mjs` também falha na base. Não foram usadas como evidência de aprovação. Os novos testes exercitam os caminhos alterados com SQLite real e contagem equivalente ao D1.
