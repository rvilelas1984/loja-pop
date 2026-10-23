# Automações da jornada — Club Pop

Em `admin-novos-alunos.html`, selecione Bike Pop ou Gym Pop e abra **WhatsApp → Automações da jornada**.

1. Atualize os fluxos ChatPro, escolha nome, condição, fluxo e dias de espera.
2. Selecione dias e horário. Use **Adicionar dias e horário** para outras combinações (até 12).
3. Salve. Toda automação nova, duplicada ou editada fica **Pausada**.
4. Use **Prévia / consentimento** para conferir os alunos e registrar a comprovação de autorização, a data e sua validade. A autorização é específica da unidade, da identidade e do telefone. Cadastro no ChatPro não comprova consentimento.
5. Use **Ativar**. O cron existente do Worker verifica os horários a cada minuto. **Pausar**, **Editar**, **Duplicar** e **Excluir** ficam na linha da automação. Excluir preserva histórico.

## Regras

- Fuso: America/Sao_Paulo. A próxima execução aparece somente quando ativa.
- Coorte: alunos cujo primeiro cadastro vinculado é dos últimos 90 dias. Uma mudança de ID EVO não reinicia a jornada.
- Cadastro/sem agendamento: ainda sem reserva, presença ou conversão.
- Agendamento: reserva futura, antes da primeira presença/conversão. Como o snapshot não fornece a data de criação da reserva, a espera começa na primeira observação pelo motor.
- Não comparecimento: exige status explícito de falta. Ausência de uma linha de presença não comprova falta.
- Primeira presença: antes da conversão. Conversão: contrato direto ativo, excluindo Wellhub/TotalPass.
- Inatividade: começa após sete dias sem presença, sem reserva futura; a espera configurada é adicional.
- Dias de espera são períodos completos de 24 horas desde o evento.
- Alunos removidos da jornada não recebem. Pedidos de não receber contato bloqueiam até nova autorização posterior comprovada.
- Intervalo mínimo de 24 horas entre contatos. O histórico manual e os lotes pendentes/aceitos/em revisão também são verificados.
- CPF/e-mail vinculam identidades; e-mails compartilhados com CPFs conflitantes são bloqueados para revisão.

## Execução e histórico

O motor usa somente D1, sem consultar EVO. Uma fila persistente processa os alunos em lotes, com até três tentativas de envio por passagem e retomada no minuto seguinte. Horários sobrepostos não repetem o mesmo evento/fluxo. A fila é cancelada se a automação for pausada, editada, excluída ou ficar pendente por mais de 24 horas.

O motor recupera horários perdidos nos últimos dez minutos. Interrupções maiores não geram disparos antigos em massa. O indicador do agendador mostra a última passagem e eventuais erros. A qualidade/atualidade da seleção depende da sincronização D1 existente.

O histórico mostra elegíveis à condição, aceitos pelo ChatPro, falhas e ignorados, com detalhes por aluno. **Aceito pelo ChatPro não confirma entrega no WhatsApp.** Não foi criado um indicador de entrega sem webhook comprobatório.

Falhas comprovadamente anteriores à chamada de envio podem ser liberadas para o próximo horário por **Liberar falhas seguras**. Timeout/erro após iniciar o envio é resultado incerto e permanece bloqueado para conferência no ChatPro, sem repetição cega. O registro de contato de um envio aceito é reparado pelo cron sem reenviar a mensagem.

## Verificação

`node --test journey-automations.test.mjs`

Os testes usam SQLite em memória e um adaptador ChatPro simulado; não representam mensagens entregues. A validação controlada do D1 de produção criou, leu, editou e excluiu logicamente uma configuração pausada em cada unidade. Nenhum histórico preexistente foi apagado. O teste real de envio depende da indicação de um destinatário e fluxo autorizados.
