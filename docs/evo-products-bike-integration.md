# Integração de produtos EVO — Bike Pop (preparação)

## Escopo
Importação manual e somente leitura do catálogo EVO para D1; não registrar vendas nem alterar estoque EVO nesta fase. Reaproveitar autenticação administrativa e getEvoConfig do Worker. Não expor credenciais.

## Contrato de dados proposto
Tabela isolada `evo_product_catalog`: `tenant_key`, `unit`, `evo_product_id` (texto, identificador original), `name`, `sku`, `barcode`, `price_cents`, `stock_quantity` (nullable), `active`, `raw_json`, `last_synced_at`, `last_seen_at`. Chave única (tenant_key,unit,evo_product_id). Não confundir estoque desconhecido com zero.
Tabela `evo_product_sync`: tenant_key, unit, last_attempt_at, last_success_at, last_count, last_error, request_count. Preservar catálogo anterior quando API falhar.

## Fluxo de importação
1. Administrador seleciona Bike Pop e aciona Atualizar produtos EVO.
2. Worker valida sessão e papel admin, tenant/unidade e configuração EVO; impede execuções simultâneas.
3. Consulta endpoint oficial de produtos e percorre paginação real conforme contrato validado. Cada chamada, inclusive erro, registra `purpose=products_catalog` em `evo_request_log`.
4. Valida ID obrigatório e tipos; armazena JSON bruto, normaliza preço/estoque; faz upsert por unidade. Só marca produtos ausentes como inativos após paginação completa e sucesso integral.
5. Responde produtos recebidos, atualizados, inválidos, páginas/requisições utilizadas e horário.

## Antes de habilitar chamadas reais
- Confirmar na documentação EVO endpoint, autenticação, formato de paginação e localização/semântica do estoque; não assumir que a consulta devolve saldo.
- Mapear telas e tabelas atuais da loja e suas dependências de Pix, Fitcoins e resgates.
- Validar migrations e testes com respostas simuladas, inclusive falha na página intermediária, duplicação, estoque nulo e isolamento Bike/Gym.
- Medir saldo da franquia e executar consulta real apenas quando o operador acionar o botão.

## Venda (fase posterior)
Persistir identificadores EVO de produto e aluno, quantidade, preço e referência idempotente do pedido. Registrar venda somente após confirmação do pagamento. Confirmar comportamento de baixa automática do estoque antes de qualquer ajuste separado; não assumir uma requisição por venda sem validação.

## Segurança operacional
Nenhum endpoint público de escrita; não alterar catálogo local de produtos de teste automaticamente; sem publicação em produção nesta preparação.
