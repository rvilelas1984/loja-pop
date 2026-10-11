# Central de Moedas — implementação e verificação

Base: d987b40. Checkpoints salvos em commits locais durante a execução.

## Implementado
- Cadastro de moedas próprias e unidades, configuração de valor, inativação.
- Fitcoins: consulta do espelho `evo_students`; sem carteira local paralela.
- Carteiras vinculadas a members, histórico imutável, atualização atômica por trigger, deduplicação e saldo não negativo.
- Indicadores, busca por aluno/contrato, moeda/mês/origem, paginação de dez alunos.
- Regras diárias e semanais: dias distintos confirmados, início configurável, desativadas por padrão, processamento por lotes e ciclo automático horário no D1.
- Missões com moedas próprias em metas separadas das recompensas legadas; elegibilidade, período, progresso D1 e entrega atômica.
- Loja: valor da moeda e desconto máximo por item; pedido sem débito; confirmação administrativa de pagamento/entrega debita e encaminha resgate, com estoque na mesma transação.
- Histórico na Central de Moedas e Central de Atividades.

## Limites explícitos
- Fitcoins externas permanecem somente consulta nesta central. Alterá-las localmente criaria um saldo paralelo; nenhuma chamada EVO foi adicionada.
- Moedas próprias não foram conectadas ao QR Pix automático. O pedido da Loja exige confirmação na recepção. Pix legado preservado.
- Club Pop não soma saldos/presenças Bike/Gym nesta central. Sem fonte própria de presenças Club, não há créditos por presença nessa unidade.
- Histórico externo de entradas/resgates contém somente as movimentações existentes no conteúdo D1 do Club Pop, não um extrato completo externo.
- Moedas próprias e regras não foram criadas/ativadas em produção para testes.

## Testes
`node tests/currency-routes.test.mjs`: ledger, isolamento, paginação, regras, checkout, rollback de estoque/saldo, rotas e missão idempotente.
`node --test activity-center.test.mjs`: sete testes de regressão da central, autenticação e Pop Fit.
Sintaxe JavaScript e scripts inline validada. Chromium indisponível: download bloqueado/inválido; revisão visual mobile ainda requer navegador.

## D1
Migração aditiva `migrations/20261011_currency_ledger.sql` aplicada via API, dez instruções confirmadas. Trigger utiliza SELECT RAISE WHERE, compatível com parser remoto do D1. Nenhum saldo existente foi alterado.

## Publicação
A confirmar após push: Worker Cloudflare e interface Vercel, commit final e smoke checks de produção.
