# Investigação de presenças coletivas — 2026-10-04

Escopo exclusivo: Bike Pop, sem VIP/Gym/sincronização massiva.
Base main: 5d0b96090caa684649d1ee3b8d9f6724144b7b38.
Restauração: restore/pre-attendance-bulk-20261004.

Referência validada no D1 para cliente 983786 em outubro:
- 2026-10-01 18:15, sessão 19065967
- 2026-10-03 11:00, sessão 19225314
- 2026-10-03 09:45, sessão 19225246

A API existente usa /api/v2/activities/member/sessions por idMember e filtra presenca=true e isFinalized=true. Preservar.
Swagger oficial https://evo-integracao.w12app.com.br/swagger/v1/swagger.json confirma:
- /api/v1/activities/schedule: date e showFullWeek; sem paginação skip.
- /api/v1/activities/schedule/detail: idActivitySession, ou idConfiguration+activityDate. Retorna lista de participantes/enrollments.
- Não demonstrado que esse seja o endpoint da tela privada Gerenciar → Atividades → Clientes. Nenhuma sessão EVO disponível no navegador; precisa de acesso autenticado ou captura sanitizada da requisição para verificar esse caminho exato.

Teste pequeno 14 pendente: sessions sem idMember, período 1–4 outubro, take25. Apenas 1 chamada, Bike, resultado sanitizado em evo_sync_probe. Worker temporário club-pop-bike-sync-probe possui fetch404 e cron; não altera históricos. Após retorno, analisar antes de testar detalhe da sessão19065967.
Código de diagnóstico e teste unitário acompanham este checkpoint. Teste passou (uma chamada, Bike, sem valores de PII/credenciais na resposta).
Remover cron temporário ao concluir. Nenhuma mudança no Worker principal ou funcionalidades.
