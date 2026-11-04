# API de operação Pop Live

Autorização: Bearer já cadastrado em pop_live_app_tokens. Nenhum segredo no JavaScript.
Migração aditiva: migrations/20261104_pop_live_operation.sql (executar uma vez antes do deploy). Reutiliza pop_live_sessions e pop_live_session_devices; não cria agenda nem cadastros paralelos.
Backup de código: backup/pre-pop-live-definitivo-20261104.

GET /pop-live/classes?unit=bike|gym: agenda D1 oficial, próximos 7 dias com margem de 2 horas, São Paulo.
POST /pop-live/sessions: {unit,class_id}; cria/recupera sessão oficial de forma idempotente.
GET /pop-live/sessions/:id: estado persistido.
GET /pop-live/sessions/:id/participants: somente check-ins checked_in=1, não removidos/não cancelados, com associação existente e perfil oficial.
POST /pop-live/sessions/:id/participants: {member_id,watch}; contrato para adapter autenticado do check-in. Exige check-in já existente, relógio da unidade e exclusividade. Não substituir por check-in fictício.
POST /pop-live/sessions/:id/start: {operation_key,rules:{type:none|calories|zone,target,zone,podium:kcal|z3|z4|z5,showTV}}.
POST /pop-live/sessions/:id/finish: {operation_key,finished_at,people:[{member_id,watch,kcal,zones:[z1,z2,z3,z4,z5]}]}.
POST /pop-live/sessions/:id/close: {operation_key}; grava resultados individuais e estado closed numa transação D1.
GET /pop-live/sessions/:id/results: resultados consolidados para consumo por um adapter autenticado Club Pop. Não disponibiliza dados de outros alunos sem autorização.

Tempos de zonas em segundos; timestamps em milissegundos Unix. Regras congeladas no primeiro start; reenvio mantém horário original. O primeiro finish aceito congela resultados. Close repetido não duplica registros.
Testes usam SQLite real com adapter D1; não substituem teste no runtime Cloudflare nem homologação com equipamentos.
