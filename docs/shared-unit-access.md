# Acesso entre unidades

Em **Configurações → Acesso entre unidades**, o administrador seleciona contratos
do catálogo sincronizado, sempre identificados por unidade de origem e código.
Salvar concede acesso à outra unidade enquanto pelo menos um contrato selecionado
estiver ativo e dentro da validade. O mesmo mecanismo atende Bike → Gym e Gym → Bike.

As regras ficam em `club_settings/shared_unit_access`, com revisão para impedir
sobrescrita concorrente e auditoria atômica com a configuração. Nenhuma regra vem
pré-selecionada. Não há migração nem criação de contratos financeiros. Nenhuma
consulta EVO é realizada por esse fluxo.

Login, primeiro acesso, atualização da sessão e consultas de evolução recalculam
o acesso. O aplicativo atualiza as unidades ao voltar ao primeiro plano e ao
alternar a unidade. Remover uma regra não bloqueia uma unidade liberada por outro
contrato válido. Uma falha de leitura não é interpretada como liberação.

## Evolução e identidade

Histórico, frequência mensal e estrelas usam a unidade da presença. Uma sessão
duplicada sob IDs diferentes conta uma vez. O acesso compartilhado não substitui
`gym_client_id` ou `evo_member_id` nem altera saldos ou históricos importados.

A leitura de presenças sob o ID da outra unidade exige CPF do perfil de origem
compatível com a conta autenticada, ausência de outro proprietário do ID e prova
na unidade de destino: CPF correspondente ou presença nominal com mesmo ID e
nome completo, quando não há perfil de destino. Coincidência numérica sozinha
não basta. Casos sem prova apresentam pendência para a recepção. Contas importadas
sem PIN precisam concluir o primeiro acesso, que já valida e registra seu CPF.

Promoções, missões e benefícios continuam sujeitos à elegibilidade específica de
cada recurso. Liberar uma unidade não emite números da sorte nem créditos.

## Validação e reversão

`node --test tests/shared-unit-access.test.mjs tests/member-identity.test.mjs
tests/promotion-eligibility.test.mjs tests/student-lucky-numbers.test.mjs`

Os testes usam SQLite real para validade, cancelamento, seleção de contratos,
auditoria, concorrência, identidade e contagem por unidade. Os cenários incluem
7 presenças no Bike e 11 no Gym, além de acesso ao Gym sem contrato próprio.

Para retirar uma liberação, remova o contrato na configuração e salve. O histórico
permanece intacto. Para reverter a implementação, reverta seu único commit;
as regras salvas ficam sem efeito na versão anterior, sem precisar apagar dados.

## Consolidação

Consolida a preparação da branch `feat/contratos-acesso-duas-unidades-20261028`
com a integração efetiva ao login, painel, histórico e estrelas. A tabela
preparatória `shared_unit_contract_rules` estava vazia e não é utilizada; a
configuração definitiva usa `club_settings`, com revisão e auditoria.
O status EVO `1` mantém o mesmo significado de ativo já utilizado no login
de produção; os demais códigos numéricos não concedem acesso.
