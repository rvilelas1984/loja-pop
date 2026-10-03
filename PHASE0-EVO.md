# Fase 0 — credenciais oficiais Bike Pop

## Restauração e origem

- Main auditada: `d8cd4ab67817b5975a26d066b8e506979d118164`.
- Branch: `restore/pre-evo-d1-oficial-20261003`.
- Worker anterior: versão `e4c0aef6-f176-407a-89b1-941801cfa8e6`, deployment `d4833fae-06d3-46b2-ba3f-a7021d3eb8b8`.
- Vercel anterior: `dpl_5FKG2uS5tpxqKK69zt3fDhj8JhHi`.
- Worker foi auditado diretamente no Cloudflare: sua fonte não estava no repositório. `club-pop-worker.mjs` passa a registrá-la sem mover os demais componentes.
- D1: `0447f24a-0efb-43bf-a121-a83273ddb46e`. Nenhuma migration.

## Referências migradas

| Local anterior | Consumidores |
| --- | --- |
| Worker `/promotion-numbers/admin/sync-batch` | Contratos e sincronização de participantes/promoções |
| Worker `evoProfile` | Perfil, elegibilidade e revisões de promoções |
| Worker `evoAttendance` | Presenças, histórico, missões e emissão/sincronização de números |
| Worker `findEvoMember` | Primeiro acesso e localização do aluno |
| Worker `/admin/evo-config` POST | Teste direto passou a usar o mesmo resolvedor |
| `api/evo.js` | Perfil, contratos do aluno, Fitcoins e presenças mensais |
| `api/evo-admin.js` | Atividades, alunos, contratos/categorias, diagnósticos e movimentação ADM de Fitcoins |
| `api/tela-checkin.js` | Grade e lugares da aula |
| `api/redemption.js` | Elegibilidade de serviço, consulta de saldo, débito, conferência e estorno |
| `lib/fitcoin-reward.js` | Créditos/débitos de missões e promoções |

`EVO_WEBHOOK_SECRET` autentica um webhook e não é credencial de consulta EVO: preservado. `GYM_EVO_DNS`/`GYM_EVO_TOKEN` permanecem no caminho Gym. Nenhuma referência executável Bike a `EVO_DNS`/`EVO_TOKEN` permanece, incluindo referências por prefixo dinâmico.

## Resolução e falhas

`getEvoConfig(env, "bike")` lê o D1 a cada operação: DNS, token, enabled e expires_at. Sem cache de credenciais nem fallback. Validade é inclusiva até o fim da data cadastrada em America/Sao_Paulo; datas vazias ou impossíveis são recusadas.

Falhas identificáveis, HTTP 503: `EVO_NAO_CONFIGURADA`, `EVO_CONFIG_DESATIVADA`, `EVO_CONFIG_INCOMPLETA`, `EVO_VALIDADE_INVALIDA`, `CREDENCIAL_EVO_EXPIRADA`, `EVO_CONFIG_INDISPONIVEL`.

O adaptador Vercel envia chamadas assinadas ao Worker; o token EVO não sai dele. Destinos e métodos são limitados; redirects são recusados; PUT financeiro não recebe retry automático. Usa a chave administrativa existente com domínio de assinatura exclusivo, sem alterar login, cookies ou papéis. Cada chamada adiciona um passo interno de verificação na Vercel.

Não há limpeza de histórico ao falhar. Login local de conta existente continua disponível; novas consultas/sincronizações EVO falham. A rotina existente de reconciliação de presenças só é alcançada depois de resposta EVO bem-sucedida. Leitura de históricos, confirmações de entrega e relatórios existentes mantêm seus caminhos.

## Evidências técnicas antes do commit

- 42 testes automatizados aprovados: `node phase0-evo.test.mjs`.
- D1 e EVO simulados nos testes; nenhuma movimentação financeira real executada.
- Configuração ausente, desabilitada, vencida, incompleta, data inválida e falha D1: zero chamadas EVO e zero escritas históricas nos fluxos testados, mesmo com secrets legados disponíveis.
- Troca de token, bloqueio e restauração testados no mesmo processo sem deploy.
- Primeiro acesso, login existente com Bike indisponível, perfil, contratos, presenças, Fitcoins, missões, promoções, resgates e estorno testados.
- ADM, Recepção, Tela Check-in e Gym cobertos; função Worker de localização Gym permanece idêntica à original.
- Assinatura inválida/expirada, corpo alterado, destinos não permitidos e ausência de credenciais no retorno testados.
- Sintaxe verificada nas funções Vercel e no Worker.
- Banco auditado antes: 325 alunos, 374 presenças, 546 números, 0 resgates D1, 0 vouchers, 0 mission_progress; `foreign_key_check` sem violações. Resgates/transações também existem no JSON do projeto e não são limpos por esta migração.
- Estrutura mantida em 3 diretórios (`api`, `data`, `lib`) e 12 funções Vercel. Nenhuma pasta/unidade ou função adicional.

## Publicação e homologação

O commit é consolidado após os testes técnicos. Deploy e testes de produção precisam ser conferidos separadamente; este documento não afirma homologação operacional concluída.

Ordem segura: publicar Worker preservando bindings/secrets, publicar Vercel, confirmar versões e realizar leituras reais. Se a Vercel falhar, o Worker continua compatível com os consumidores anteriores.

Antes de remover secrets legados, Renato precisa validar em conta de teste:

1. Bike: primeiro acesso de aluno ainda sem PIN e login de aluno existente; perfil, contratos, saldo e presenças.
2. ADM: contratos e sincronização de promoção; Missões/Promoções/Números da Sorte; conferir registros antigos.
3. Recepção: Tela Check-in, resgates e históricos; realizar um resgate/recompensa de teste e o estorno correspondente, conferindo saldo e registro único.
4. Gym: login/vínculo, perfil, Fitcoins, grade e resgate de teste.
5. Desativar temporariamente a configuração Bike em janela controlada; confirmar erro identificável em consultas novas e Gym funcionando. Nunca apagar DNS/token para esse teste.
6. Restaurar DNS/token/validade pelo ADM (token em branco mantém o existente); testar conexão e repetir consultas sem novo deploy. Confirmar históricos intactos.

Os testes financeiros e o primeiro acesso real exigem contas autorizadas; não são substituídos por mocks. Secrets legados permanecem até essa homologação. Fase 1 não foi iniciada.
