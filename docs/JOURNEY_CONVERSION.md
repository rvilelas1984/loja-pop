# Jornada — indicadores e conversão

A base é a lista de cadastros filtrada por unidade, datas de cadastro e categoria. As seis etapas são exclusivas. O indicador superior de Conversão é histórico: inclui a etapa atual de Conversão e os convertidos em Análise pós-90 dias. As três categorias somam o total histórico convertido; pendências são mostradas separadamente e não entram nesse total.

A classificação compartilhada usa os códigos EVO 4 (Wellhub/Gympass), 5 (TotalPass) e os nomes de contratos já reconhecidos. Demais contratos são diretos, incluindo pacotes e recorrentes. IDs de plataforma sem contrato exibem “Contrato não identificado”. Contrato de plataforma sem ID exibe a pendência de identificação. A conversão requer contrato iniciado; nas plataformas requer também ID. Contratos futuros não convertem. Histórico permanece após cancelamento/expiração.

Contratos simultâneos não multiplicam pessoas. A categoria principal usa o contrato validado ativo mais recente, depois o validado mais recente, com desempate estável. O início dos 90 dias usa o primeiro contrato validado. Todos os contratos continuam disponíveis na lista.

Seleção nos sub-blocos encaminha ao fluxo manual existente, sem disparar. Automação de primeira presença perde elegibilidade quando o aluno avança. O histórico do evento permanece. O envio manual revalida etapa, identidade, telefone, remoção e recusa no servidor, além dos controles existentes de autorização e duplicidade.

## Validação em 28/10/2026

- 44 testes passaram: jornada/automações, interface, classificação de conversão e identidade.
- Navegador em 390 e 1440 px: sete indicadores; 202 pessoas distribuídas sem IDs duplicados; seleção WhatsApp por etapa; limpeza ao mudar categoria; datas 25/10–28/10; troca Bike/Gym; sem overflow da página ou erros JavaScript.
- Inspeção visual das listas em computador e celular. Tabelas mantêm rolagem horizontal no celular.
- D1 consultado somente para leitura no período 25/10/2026–28/10/2026. Nenhum teste enviou mensagens reais.
- Cinco falhas da suíte adicional de reservas foram reproduzidas no commit anterior; não são regressões desta alteração.

Restauração anterior à publicação: `restore/jornada-conversao-prepublish-20261028`, commit `d11fa0b974e85e0b555c24215fefb06dab37fcc0`. Nenhuma migração de banco é necessária.
