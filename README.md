# Club Pop / Loja Pop

## Integração EVO — Fase 0

O Bike Pop usa exclusivamente `evo_unit_config` no D1 `club-pop-db`, administrada em Configurações → Integração EVO — Bike Pop. DNS, token, validade e habilitação são verificados pelo `getEvoConfig` do Worker a cada operação. Não existe fallback para credenciais Bike de ambiente.

O Gym Pop mantém `GYM_EVO_DNS` e `GYM_EVO_TOKEN` nos ambientes atuais.

As funções Vercel usam `lib/evo-transport.js` para as chamadas Bike. O Worker mantém as credenciais e executa apenas endpoints EVO permitidos; as mensagens entre servidores são assinadas com o `ADMIN_KEY` já existente, com escopo próprio e validade de 30 segundos. A chave e as credenciais não são enviadas ao navegador. A validação ocorre pela rota interna do `api/evo-config.js`, sem adicionar função Vercel.

`club-pop-worker.mjs` é a fonte versionada do Worker. O deploy desse arquivo no Cloudflare é separado do deploy Vercel via GitHub. Preservar todos os bindings durante o upload, inclusive os secrets legados até a homologação final.

## Testes

```sh
npm run test:evo-phase0
```

Veja `PHASE0-EVO.md` para inventário, restauração e validação operacional pendente. Não avançar para a Fase 1.
