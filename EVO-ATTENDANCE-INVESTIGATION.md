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

## Documentação confirmada
https://api.abcevo.com/get-activities-schedule-details-32242623e0 documenta enrollments.status: 0=Presente, 1=Falta, 2=Falta Justificada. Status da aula 6=Finalizada; outros tipos encerrados existem e precisam de validação. Não inferir presença a partir de simples inscrição/check-in.
O endpoint schedule tem showFullWeek e take, sem skip: respostas no limite não podem ser consideradas completas automaticamente.

## Resultado real 14
Sessions sem idMember retornou HTTP400, custo1 requisição registrada. Não fornece caminho coletivo nesse teste. Teste15 enfileirado isoladamente: detalhe da sessão19065967.

## Testes reais concluídos
15: sessão19065967 HTTP200, 32 participantes,30 presenças, cliente983786 presente.
16: sessão19225314 HTTP200,35 participantes,32 presenças, cliente983786 presente.
17: sessão19225246 HTTP200,35 participantes,26 presenças, cliente983786 presente.
Cada detalhe custou1 chamada. As3 presenças de referência coincidiram. Total88 registros de presença, não88 pessoas distintas.
18: grade03/10 HTTP200,3 aulas finalizadas, sem enrollments. Campos reais idAtividadeSessao e activityDate diferem do schema esperado; o sanitizador descartou os valores, mas registrou os nomes. Portanto grade lista aulas; detalhe fornece presenças. Custo teórico de um dia=1+N aulas, ainda não sincronizado integralmente.
Total desta investigação5 chamadas EVO Bike. Nenhuma gravação operacional de presenças, sem Gym/VIP. Cron temporário desativado após os testes.
Parser conservador preparado: apenas status6 finalizado, participante status0 presente, removidos ignorados; normalização AM/PM paraHH:mm. Testesunitários passaram. Integração ainda pendente.
