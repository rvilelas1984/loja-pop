// Inventário D1 e referências de código, revisado em 27/10/2026. Sem dados pessoais.
export const eventSources = [
  {
    "table": "aggregator_branch_defaults",
    "label": "Configuração de filial do agregador",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "branch_code"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "branch_code",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "aggregator_member_links",
    "label": "Vínculo do aluno ao agregador",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "origin",
      "aggregator_id"
    ],
    "fields": [
      "unit",
      "origin",
      "evo_member_id"
    ],
    "tracked": [
      "evo_member_id",
      "confirmed_by"
    ],
    "timestamp": "created_at",
    "columns": [
      "unit",
      "origin",
      "aggregator_id",
      "evo_member_id",
      "confirmed_by",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "aggregator_member_rejections",
    "label": "Vínculo de agregador rejeitado",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "origin",
      "aggregator_id",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "origin",
      "evo_member_id"
    ],
    "tracked": [
      "rejected_by"
    ],
    "timestamp": "created_at",
    "columns": [
      "unit",
      "origin",
      "aggregator_id",
      "evo_member_id",
      "rejected_by",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "aggregator_sales_batches",
    "label": "Lote de repasses de agregadores",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "competence"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "rows_json",
      "audit_json",
      "official",
      "saved_by"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "competence",
      "rows_json",
      "audit_json",
      "official",
      "saved_by",
      "saved_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "aggregator_sales_evo_returns",
    "label": "Retorno de venda do agregador",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "competence",
      "origin",
      "value_cents"
    ],
    "fields": [
      "unit",
      "origin",
      "status"
    ],
    "tracked": [
      "cpf",
      "status",
      "reason"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "competence",
      "origin",
      "cpf",
      "value_cents",
      "status",
      "reason",
      "checked_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "aggregator_sales_history",
    "label": "Histórico de repasses",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "origin"
    ],
    "tracked": [
      "unit",
      "competence",
      "origin",
      "total",
      "success",
      "failed",
      "action"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "competence",
      "origin",
      "total",
      "success",
      "failed",
      "action",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "app_content",
    "label": "Conteúdo compartilhado do Clube Pop",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "content_key"
    ],
    "fields": [],
    "tracked": [
      "content_json"
    ],
    "timestamp": null,
    "columns": [
      "content_key",
      "content_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs",
      "lib/evo-product-sales.mjs",
      "lib/currency-ledger.mjs",
      "lib/partner-media.mjs",
      "lib/checkout-fitcoins.mjs",
      "lib/lucky-draw-official.mjs",
      "lib/checkout.mjs"
    ]
  },
  {
    "table": "attendance_cleanup_backup_20261008",
    "label": "attendance cleanup backup 20261008",
    "category": "Agendamentos e presenças",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "evo_member_id",
      "attendance_key"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "attendance_date",
      "start_time",
      "activity_name",
      "id_activity_session"
    ],
    "tracked": [
      "attendance_date",
      "start_time",
      "activity_name",
      "id_activity_session"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "attendance_key",
      "attendance_date",
      "start_time",
      "activity_name",
      "id_activity_session",
      "raw_json",
      "synced_at"
    ],
    "references": []
  },
  {
    "table": "attendance_history",
    "label": "attendance history",
    "category": "Agendamentos e presenças",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "evo_member_id",
      "unit",
      "attendance_date",
      "activity_name"
    ],
    "tracked": [
      "member_id",
      "evo_member_id",
      "unit",
      "attendance_key",
      "attendance_date",
      "activity_id",
      "activity_name"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "member_id",
      "evo_member_id",
      "unit",
      "attendance_key",
      "attendance_date",
      "activity_id",
      "activity_name",
      "raw_json",
      "synced_at"
    ],
    "references": [
      "admin-requisicoes.html",
      "club-pop-worker.mjs",
      "lib/lucky-draw-audit.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "attendance_sync_ranges",
    "label": "attendance sync ranges",
    "category": "Agendamentos e presenças",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "unit",
      "start_date",
      "end_date"
    ],
    "tracked": [
      "member_id",
      "unit",
      "start_date",
      "end_date"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "member_id",
      "unit",
      "start_date",
      "end_date",
      "synced_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "audit_log",
    "label": "audit log",
    "category": "Rotinas e requisições",
    "origin": "Sistema e administração",
    "mode": "native",
    "note": "Ações já registradas pelo sistema, preservadas no histórico.",
    "keys": [
      "id"
    ],
    "fields": [],
    "tracked": [
      "actor_type",
      "actor_id",
      "action",
      "entity_type",
      "entity_id"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "actor_type",
      "actor_id",
      "action",
      "entity_type",
      "entity_id",
      "metadata_json",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/currency-ledger.mjs",
      "lib/checkout-fitcoins.mjs"
    ]
  },
  {
    "table": "auth_sessions",
    "label": "Sessão de acesso do aluno",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "revoked_at"
    ],
    "tracked": [
      "revoked_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "token_hash",
      "created_at",
      "expires_at",
      "revoked_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/community-challenges.mjs"
    ]
  },
  {
    "table": "benefit_voucher_claims",
    "label": "Resgate de voucher de benefício",
    "category": "Benefícios e vouchers",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "offer_id",
      "member_id",
      "batch_id"
    ],
    "tracked": [
      "offer_id",
      "member_id",
      "batch_id",
      "code"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "offer_id",
      "member_id",
      "batch_id",
      "code",
      "created_at"
    ],
    "references": [
      "lib/benefit-vouchers.mjs"
    ]
  },
  {
    "table": "benefit_voucher_offers",
    "label": "Oferta de voucher",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "batch_id",
      "model_id",
      "quantity",
      "status",
      "start_date",
      "end_date"
    ],
    "tracked": [
      "unit",
      "batch_id",
      "model_id",
      "title",
      "description",
      "quantity",
      "per_member",
      "start_date",
      "end_date",
      "status",
      "colors_json"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "batch_id",
      "model_id",
      "title",
      "description",
      "quantity",
      "per_member",
      "start_date",
      "end_date",
      "status",
      "colors_json",
      "created_at"
    ],
    "references": [
      "lib/benefit-vouchers.mjs"
    ]
  },
  {
    "table": "bike_baseline_backup_20261019",
    "label": "bike baseline backup 20261019",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "evo_member_id"
    ],
    "tracked": [
      "evo_member_id",
      "baseline_count",
      "source"
    ],
    "timestamp": null,
    "columns": [
      "evo_member_id",
      "baseline_count",
      "source",
      "updated_at"
    ],
    "references": []
  },
  {
    "table": "bike_evo_historical_baseline",
    "label": "Base histórica de estrelas",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "evo_member_id"
    ],
    "fields": [
      "evo_member_id"
    ],
    "tracked": [
      "baseline_count",
      "source"
    ],
    "timestamp": null,
    "columns": [
      "evo_member_id",
      "baseline_count",
      "source",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/admin-bike-ranking.mjs"
    ]
  },
  {
    "table": "bike_legacy_audit_removed_20261021",
    "label": "bike legacy audit removed 20261021",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "member_id"
    ],
    "fields": [
      "member_id",
      "evo_member_id"
    ],
    "tracked": [
      "evo_member_id",
      "previous_legacy",
      "reason"
    ],
    "timestamp": "created_at",
    "columns": [
      "member_id",
      "evo_member_id",
      "previous_legacy",
      "reason",
      "created_at"
    ],
    "references": []
  },
  {
    "table": "bike_legacy_backup_20261019",
    "label": "bike legacy backup 20261019",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "evo_member_id"
    ],
    "tracked": [
      "evo_member_id",
      "presencas_legadas_bike"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "evo_member_id",
      "presencas_legadas_bike"
    ],
    "references": []
  },
  {
    "table": "checkin_layouts",
    "label": "Mapa de posições da aula",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "activity_id"
    ],
    "fields": [
      "unit",
      "activity_name",
      "capacity"
    ],
    "tracked": [
      "activity_name",
      "capacity",
      "rows_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "activity_id",
      "activity_name",
      "capacity",
      "rows_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "checkin_reservation_snapshots",
    "label": "Agendamento do aluno",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "snapshot",
    "note": "Diferenças entre listas recebidas; remoção da lista não comprova cancelamento na EVO.",
    "keys": [
      "unit",
      "session_id",
      "slot_number"
    ],
    "fields": [
      "unit",
      "session_id",
      "activity_date",
      "start_time",
      "activity_name",
      "slot_number",
      "evo_member_id",
      "removed",
      "status",
      "checked_in"
    ],
    "tracked": [
      "activity_date",
      "start_time",
      "activity_name",
      "evo_member_id",
      "member_name",
      "removed",
      "status",
      "checked_in"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "session_id",
      "activity_date",
      "start_time",
      "activity_name",
      "slot_number",
      "evo_member_id",
      "member_name",
      "removed",
      "status",
      "checked_in",
      "updated_at"
    ],
    "references": [
      "admin-automacao.html",
      "club-pop-worker.mjs",
      "lib/journey-data.mjs",
      "lib/hall-conquests.mjs",
      "lib/reservation-sync.mjs",
      "lib/teacher-view.mjs"
    ]
  },
  {
    "table": "checkin_snapshot_versions",
    "label": "checkin snapshot versions",
    "category": "Rotinas e requisições",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "session_id"
    ],
    "fields": [
      "unit",
      "session_id"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "session_id",
      "observed_at"
    ],
    "references": [
      "admin-automacao.html",
      "lib/reservation-sync.mjs"
    ]
  },
  {
    "table": "checkin_stars_privacy",
    "label": "Privacidade no check-in",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "member_id"
    ],
    "fields": [
      "member_id",
      "enabled"
    ],
    "tracked": [
      "enabled"
    ],
    "timestamp": null,
    "columns": [
      "member_id",
      "enabled",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/hall-conquests.mjs"
    ]
  },
  {
    "table": "class_chat_bans",
    "label": "Bloqueio no chat",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "member_id"
    ],
    "fields": [
      "unit",
      "member_id"
    ],
    "tracked": [
      "reason"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "member_id",
      "expires_at",
      "reason"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "class_chat_consents",
    "label": "Aceite do chat",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "session_id",
      "member_id"
    ],
    "fields": [
      "unit",
      "session_id",
      "member_id"
    ],
    "tracked": [],
    "timestamp": "accepted_at",
    "columns": [
      "unit",
      "session_id",
      "member_id",
      "accepted_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "class_chat_messages",
    "label": "Mensagem no chat da aula",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "session_id",
      "member_id",
      "slot_number",
      "deleted"
    ],
    "tracked": [
      "unit",
      "session_id",
      "member_id",
      "slot_number",
      "content",
      "deleted"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "session_id",
      "member_id",
      "slot_number",
      "content",
      "created_at",
      "deleted"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/teacher-view.mjs"
    ]
  },
  {
    "table": "class_chat_name_preferences",
    "label": "Preferência de nome no chat",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "member_id"
    ],
    "fields": [
      "unit",
      "member_id",
      "show_name"
    ],
    "tracked": [
      "show_name"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "member_id",
      "show_name"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "class_chat_presence",
    "label": "class chat presence",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "session_id",
      "member_id"
    ],
    "fields": [
      "unit",
      "session_id",
      "member_id"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "session_id",
      "member_id",
      "last_seen_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "class_chat_reports",
    "label": "Denúncia no chat",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "session_id",
      "status"
    ],
    "tracked": [
      "unit",
      "session_id",
      "message_id",
      "reporter_id",
      "reason",
      "status"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "session_id",
      "message_id",
      "reporter_id",
      "reason",
      "status",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "class_chat_settings",
    "label": "Configuração do chat",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "enabled"
    ],
    "tracked": [
      "enabled",
      "test_member_id",
      "open_before",
      "close_after",
      "duration_minutes",
      "reveal_names",
      "ban_days"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "enabled",
      "test_member_id",
      "open_before",
      "close_after",
      "duration_minutes",
      "reveal_names",
      "ban_days"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/teacher-view.mjs"
    ]
  },
  {
    "table": "club_app_analytics",
    "label": "Acesso ao aplicativo",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "session_id"
    ],
    "fields": [
      "session_id",
      "member_id",
      "unit",
      "page"
    ],
    "tracked": [
      "member_id",
      "unit",
      "page"
    ],
    "timestamp": null,
    "columns": [
      "session_id",
      "member_id",
      "unit",
      "first_seen",
      "last_seen",
      "page",
      "page_views"
    ],
    "references": []
  },
  {
    "table": "club_app_page_sessions",
    "label": "Página acessada no aplicativo",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "session_id"
    ],
    "fields": [
      "session_id",
      "member_id",
      "unit",
      "page"
    ],
    "tracked": [
      "member_id",
      "unit",
      "page"
    ],
    "timestamp": null,
    "columns": [
      "session_id",
      "member_id",
      "unit",
      "page",
      "first_seen",
      "last_seen",
      "page_views"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_chatpro_config",
    "label": "chatpro config",
    "category": "Rotinas e requisições",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "id"
    ],
    "fields": [
      "enabled"
    ],
    "tracked": [
      "base_url",
      "enabled",
      "enabled_units"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "api_key_cipher",
      "base_url",
      "enabled",
      "updated_at",
      "enabled_units"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_currencies",
    "label": "Moeda do Clube Pop",
    "category": "Rotinas e requisições",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "status"
    ],
    "tracked": [
      "code",
      "name",
      "symbol",
      "brl_value",
      "status",
      "source"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "code",
      "name",
      "symbol",
      "brl_value",
      "status",
      "source",
      "created_at",
      "updated_at"
    ],
    "references": [
      "lib/currency-ledger.mjs",
      "lib/checkout.mjs"
    ]
  },
  {
    "table": "club_currency_jobs",
    "label": "currency jobs",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "after_member"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "after_member",
      "lease_until",
      "last_completed",
      "last_error"
    ],
    "references": [
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "club_currency_orders",
    "label": "Pedido com moedas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "unit",
      "currency_id",
      "item_type",
      "item_id",
      "quantity",
      "status"
    ],
    "tracked": [
      "member_id",
      "unit",
      "currency_id",
      "item_type",
      "item_id",
      "item_name",
      "quantity",
      "price_cents",
      "discount_cents",
      "cash_cents",
      "status",
      "confirmation_ref"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "unit",
      "currency_id",
      "item_type",
      "item_id",
      "item_name",
      "quantity",
      "price_cents",
      "discount_cents",
      "cash_cents",
      "status",
      "confirmation_ref",
      "created_at",
      "confirmed_at"
    ],
    "references": [
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "club_currency_reward_rules",
    "label": "Regra de recompensa em moedas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "currency_id",
      "unit",
      "enabled"
    ],
    "tracked": [
      "currency_id",
      "unit",
      "rule_type",
      "target_count",
      "reward_amount",
      "enabled"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "currency_id",
      "unit",
      "rule_type",
      "target_count",
      "reward_amount",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "references": [
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "club_currency_rule_periods",
    "label": "currency rule periods",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rule_id"
    ],
    "fields": [
      "start_date"
    ],
    "tracked": [
      "start_date"
    ],
    "timestamp": null,
    "columns": [
      "rule_id",
      "start_date"
    ],
    "references": [
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "club_currency_store_rules",
    "label": "Regra de desconto em moedas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "item_type",
      "item_id",
      "currency_id"
    ],
    "fields": [
      "unit",
      "item_type",
      "item_id",
      "currency_id",
      "enabled"
    ],
    "tracked": [
      "max_discount_percent",
      "enabled"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "item_type",
      "item_id",
      "currency_id",
      "max_discount_percent",
      "enabled"
    ],
    "references": [
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "club_currency_transactions",
    "label": "Movimentação de moedas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "currency_id",
      "unit",
      "amount",
      "kind",
      "origin"
    ],
    "tracked": [
      "wallet_id",
      "member_id",
      "currency_id",
      "unit",
      "amount",
      "kind",
      "origin",
      "source_ref",
      "dedupe_key"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "wallet_id",
      "member_id",
      "currency_id",
      "unit",
      "amount",
      "kind",
      "origin",
      "source_ref",
      "dedupe_key",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "club_currency_units",
    "label": "Moeda habilitada na unidade",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "currency_id",
      "unit"
    ],
    "fields": [
      "currency_id",
      "unit",
      "enabled"
    ],
    "tracked": [
      "enabled"
    ],
    "timestamp": null,
    "columns": [
      "currency_id",
      "unit",
      "enabled"
    ],
    "references": [
      "lib/currency-ledger.mjs",
      "lib/checkout.mjs"
    ]
  },
  {
    "table": "club_currency_wallets",
    "label": "Saldo de moedas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "currency_id",
      "unit"
    ],
    "tracked": [
      "member_id",
      "currency_id",
      "unit",
      "balance"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "currency_id",
      "unit",
      "balance",
      "created_at",
      "updated_at"
    ],
    "references": [
      "lib/currency-ledger.mjs",
      "lib/checkout.mjs"
    ]
  },
  {
    "table": "club_draw_early_closures",
    "label": "Encerramento antecipado de promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "promotion_slug"
    ],
    "fields": [
      "promotion_slug"
    ],
    "tracked": [
      "reason",
      "closed_by",
      "original_end"
    ],
    "timestamp": null,
    "columns": [
      "promotion_slug",
      "closed_at",
      "reason",
      "closed_by",
      "original_end"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_draw_review_numbers",
    "label": "Número revisado na auditoria",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "promotion_id",
      "code"
    ],
    "fields": [
      "promotion_id"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "promotion_id",
      "code"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_draw_reviews",
    "label": "Auditoria da promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "promotion_id"
    ],
    "fields": [
      "promotion_id",
      "unit"
    ],
    "tracked": [
      "unit",
      "participants",
      "eligible",
      "excluded",
      "number_count"
    ],
    "timestamp": null,
    "columns": [
      "promotion_id",
      "unit",
      "reviewed_at",
      "participants",
      "eligible",
      "excluded",
      "number_count",
      "contract_synced_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_equipment",
    "label": "Equipamento",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "unit",
      "type",
      "serial",
      "identifier"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "type",
      "serial",
      "identifier",
      "created_at"
    ],
    "references": [
      "lib/equipment-maintenance.mjs"
    ]
  },
  {
    "table": "club_equipment_issues",
    "label": "Tipo de problema de equipamento",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "unit",
      "label"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "unit",
      "label"
    ],
    "references": [
      "lib/equipment-maintenance.mjs"
    ]
  },
  {
    "table": "club_equipment_maintenance",
    "label": "Manutenção de equipamento",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "status",
      "completed_at"
    ],
    "tracked": [
      "unit",
      "equipment_id",
      "issue_id",
      "side",
      "room_position",
      "status",
      "notes",
      "completed_at"
    ],
    "timestamp": "opened_at",
    "columns": [
      "id",
      "unit",
      "equipment_id",
      "issue_id",
      "side",
      "room_position",
      "status",
      "opened_at",
      "completed_at",
      "notes"
    ],
    "references": [
      "lib/equipment-maintenance.mjs"
    ]
  },
  {
    "table": "club_evo_import_batches",
    "label": "Lote de importação de vendas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "state"
    ],
    "tracked": [
      "unit",
      "branch_code",
      "state",
      "created_by",
      "snapshot_json",
      "return_json"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "branch_code",
      "state",
      "created_by",
      "created_at",
      "reviewed_at",
      "snapshot_json",
      "return_json"
    ],
    "references": [
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_evo_import_items",
    "label": "Item de venda exportado",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "order_id"
    ],
    "fields": [
      "order_id",
      "unit",
      "batch_id",
      "item_type",
      "status",
      "sale_date"
    ],
    "tracked": [
      "unit",
      "batch_id",
      "item_type",
      "item_name",
      "member_name",
      "cpf",
      "value_cents",
      "sale_date",
      "receipt_code",
      "status",
      "return_log"
    ],
    "timestamp": "created_at",
    "columns": [
      "order_id",
      "unit",
      "batch_id",
      "item_type",
      "item_name",
      "member_name",
      "cpf",
      "value_cents",
      "sale_date",
      "receipt_code",
      "status",
      "return_log",
      "checked_at",
      "created_at"
    ],
    "references": [
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_evo_import_settings",
    "label": "Configuração de importação de vendas",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "branch_code",
      "receipts_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "branch_code",
      "receipts_json",
      "updated_at"
    ],
    "references": [
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_evo_product_sales",
    "label": "Envio de venda à EVO",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "order_id"
    ],
    "fields": [
      "order_id",
      "unit",
      "quantity",
      "session_id",
      "state"
    ],
    "tracked": [
      "unit",
      "product_id",
      "member_evo_id",
      "quantity",
      "original_cents",
      "discount_cents",
      "pix_cents",
      "fitcoins",
      "provider_order_id",
      "session_id",
      "state",
      "evo_sale_id",
      "stock_before",
      "stock_after",
      "verification_json"
    ],
    "timestamp": "created_at",
    "columns": [
      "order_id",
      "unit",
      "product_id",
      "member_evo_id",
      "quantity",
      "original_cents",
      "discount_cents",
      "pix_cents",
      "fitcoins",
      "provider_order_id",
      "session_id",
      "state",
      "attempts",
      "checks",
      "evo_sale_id",
      "request_json",
      "response_json",
      "last_error",
      "stock_before",
      "stock_after",
      "verification_json",
      "sent_at",
      "checked_at",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs",
      "lib/evo-product-sales.mjs"
    ]
  },
  {
    "table": "club_evo_shop_cutoff",
    "label": "Data de corte da loja",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [],
    "tracked": [],
    "timestamp": "created_at",
    "columns": [
      "id",
      "cutoff_at",
      "created_at"
    ],
    "references": [
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_fiscal_sale_entries",
    "label": "Registro fiscal de venda",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "order_id"
    ],
    "fields": [
      "order_id",
      "unit"
    ],
    "tracked": [
      "unit",
      "registered_by"
    ],
    "timestamp": null,
    "columns": [
      "order_id",
      "unit",
      "registered_by",
      "registered_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_journey_automation_runs",
    "label": "Resultado da execução da jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "automation_id",
      "student_id",
      "status"
    ],
    "tracked": [
      "unit",
      "automation_id",
      "student_id",
      "slot",
      "status",
      "detail"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "automation_id",
      "student_id",
      "slot",
      "status",
      "detail",
      "created_at"
    ],
    "references": [
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_automation_state",
    "label": "Ativação ou revisão da automação",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "automation_id"
    ],
    "fields": [
      "automation_id",
      "unit",
      "deleted",
      "activated_at"
    ],
    "tracked": [
      "unit",
      "deleted",
      "revision",
      "activated_at"
    ],
    "timestamp": null,
    "columns": [
      "automation_id",
      "unit",
      "deleted",
      "revision",
      "activated_at"
    ],
    "references": [
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_automations",
    "label": "Regra de automação da jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "rule",
      "flow_id",
      "enabled"
    ],
    "tracked": [
      "unit",
      "name",
      "rule",
      "flow_id",
      "days_json",
      "time_hhmm",
      "delay_days",
      "extra_text",
      "enabled"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "name",
      "rule",
      "flow_id",
      "days_json",
      "time_hhmm",
      "delay_days",
      "extra_text",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "references": [
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_consents",
    "label": "Autorização de contato",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "person_id",
      "student_id",
      "revoked_at"
    ],
    "tracked": [
      "unit",
      "person_id",
      "student_id",
      "phone",
      "evidence",
      "actor",
      "revoked_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "person_id",
      "student_id",
      "phone",
      "evidence",
      "consented_at",
      "expires_at",
      "revoked_at",
      "actor",
      "created_at"
    ],
    "references": [
      "lib/journey-plan.mjs",
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_deliveries",
    "label": "Envio da jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "automation_id",
      "person_id",
      "student_id",
      "flow_id",
      "event_key",
      "execution_id",
      "status"
    ],
    "tracked": [
      "unit",
      "automation_id",
      "person_id",
      "student_id",
      "phone",
      "flow_id",
      "event_key",
      "execution_id",
      "status",
      "detail",
      "contact_recorded"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "automation_id",
      "person_id",
      "student_id",
      "phone",
      "flow_id",
      "event_key",
      "execution_id",
      "status",
      "detail",
      "contact_recorded",
      "created_at",
      "updated_at"
    ],
    "references": [
      "lib/journey-plan.mjs",
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_engine",
    "label": "journey engine",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "id"
    ],
    "fields": [],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "id",
      "lease_token",
      "lease_until",
      "last_tick",
      "last_scan",
      "last_error"
    ],
    "references": [
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_event_details",
    "label": "Detecção de etapa da jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "person_id",
      "event_key"
    ],
    "fields": [
      "unit",
      "person_id",
      "event_key",
      "rule"
    ],
    "tracked": [
      "rule"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "person_id",
      "event_key",
      "rule",
      "detected_at",
      "synced_at",
      "transition_at"
    ],
    "references": [
      "lib/journey-plan.mjs",
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_events",
    "label": "Evento da jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "person_id",
      "event_key"
    ],
    "fields": [
      "unit",
      "person_id",
      "event_key"
    ],
    "tracked": [],
    "timestamp": "event_at",
    "columns": [
      "unit",
      "person_id",
      "event_key",
      "event_at"
    ],
    "references": [
      "lib/journey-plan.mjs",
      "lib/journey-automations.mjs"
    ]
  },
  {
    "table": "club_journey_execution_details",
    "label": "Resumo da execução da jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "execution_id"
    ],
    "fields": [
      "execution_id"
    ],
    "tracked": [
      "candidates"
    ],
    "timestamp": null,
    "columns": [
      "execution_id",
      "started_at",
      "candidates"
    ],
    "references": [
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_executions",
    "label": "Execução de automação",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "automation_id",
      "status"
    ],
    "tracked": [
      "unit",
      "automation_id",
      "revision",
      "slot",
      "status",
      "people_json",
      "eligible",
      "accepted",
      "failed",
      "ignored",
      "detail"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "automation_id",
      "revision",
      "slot",
      "status",
      "people_json",
      "cursor",
      "eligible",
      "accepted",
      "failed",
      "ignored",
      "detail",
      "created_at",
      "finished_at"
    ],
    "references": [
      "lib/journey-automations.mjs",
      "lib/journey-engine.mjs"
    ]
  },
  {
    "table": "club_journey_identities",
    "label": "journey identities",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "person_id"
    ],
    "tracked": [
      "person_id"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "token",
      "person_id"
    ],
    "references": [
      "lib/journey-plan.mjs",
      "lib/journey-data.mjs",
      "lib/journey-automations.mjs"
    ]
  },
  {
    "table": "club_manual_activation_pending",
    "label": "manual activation pending",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "unit",
      "evo_member_id"
    ],
    "tracked": [
      "unit",
      "evo_member_id",
      "profile_json",
      "source"
    ],
    "timestamp": null,
    "columns": [
      "token",
      "unit",
      "evo_member_id",
      "profile_json",
      "source",
      "expires_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_manual_activations",
    "label": "Ativação manual de aluno",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "member_id"
    ],
    "tracked": [
      "member_id",
      "actor"
    ],
    "timestamp": "created_at",
    "columns": [
      "unit",
      "evo_member_id",
      "member_id",
      "actor",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_mp_credentials",
    "label": "mp credentials",
    "category": "Rotinas e requisições",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "environment"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "environment",
      "access_token_cipher",
      "webhook_secret_cipher",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_new_student_interventions",
    "label": "Intervenção na jornada",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "kind"
    ],
    "tracked": [
      "unit",
      "evo_member_id",
      "kind",
      "note"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "evo_member_id",
      "kind",
      "note",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-data.mjs",
      "lib/journey-automations.mjs"
    ]
  },
  {
    "table": "club_pix_delivery_audit",
    "label": "Auditoria de entrega do pedido",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "order_id"
    ],
    "fields": [
      "order_id",
      "status"
    ],
    "tracked": [
      "status"
    ],
    "timestamp": "created_at",
    "columns": [
      "order_id",
      "status",
      "created_at"
    ],
    "references": []
  },
  {
    "table": "club_pix_delivery_audit_test_archive_20261011",
    "label": "pix delivery audit test archive 20261011",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "order_id",
      "status"
    ],
    "tracked": [
      "order_id",
      "status"
    ],
    "timestamp": "created_at",
    "columns": [
      "order_id",
      "status",
      "created_at"
    ],
    "references": []
  },
  {
    "table": "club_pix_fulfillment",
    "label": "Entrega do pedido",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "order_id"
    ],
    "fields": [
      "order_id",
      "member_id",
      "unit",
      "debit_state",
      "delivery_state"
    ],
    "tracked": [
      "member_id",
      "unit",
      "fitcoins_requested",
      "debit_state",
      "debit_reference",
      "delivery_state",
      "delivery_reference"
    ],
    "timestamp": null,
    "columns": [
      "order_id",
      "member_id",
      "unit",
      "fitcoins_requested",
      "debit_state",
      "debit_reference",
      "delivery_state",
      "delivery_reference",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs",
      "lib/checkout-fitcoins.mjs"
    ]
  },
  {
    "table": "club_pix_fulfillment_attempts",
    "label": "Tentativa de entrega ou débito",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "attempt_id"
    ],
    "fields": [
      "order_id",
      "unit",
      "operation",
      "state"
    ],
    "tracked": [
      "order_id",
      "unit",
      "operation",
      "state",
      "external_reference"
    ],
    "timestamp": "created_at",
    "columns": [
      "attempt_id",
      "order_id",
      "unit",
      "operation",
      "state",
      "external_reference",
      "created_at",
      "updated_at"
    ],
    "references": []
  },
  {
    "table": "club_pix_fulfillment_test_archive_20261011",
    "label": "pix fulfillment test archive 20261011",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "order_id",
      "member_id",
      "unit",
      "debit_state",
      "delivery_state"
    ],
    "tracked": [
      "order_id",
      "member_id",
      "unit",
      "fitcoins_requested",
      "debit_state",
      "debit_reference",
      "delivery_state",
      "delivery_reference"
    ],
    "timestamp": null,
    "columns": [
      "order_id",
      "member_id",
      "unit",
      "fitcoins_requested",
      "debit_state",
      "debit_reference",
      "delivery_state",
      "delivery_reference",
      "updated_at"
    ],
    "references": []
  },
  {
    "table": "club_pix_orders",
    "label": "Pedido da loja",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "unit",
      "item_type",
      "item_id",
      "status",
      "currency_id",
      "external_state",
      "reservation_state"
    ],
    "tracked": [
      "member_id",
      "unit",
      "item_type",
      "item_id",
      "amount_cents",
      "status",
      "provider_order_id",
      "idempotency_key",
      "original_cents",
      "discount_cents",
      "currency_id",
      "currency_quantity",
      "currency_rate_micros",
      "payment_mode",
      "item_name",
      "reservation_state",
      "external_member_id",
      "external_state",
      "external_before",
      "external_after"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "unit",
      "item_type",
      "item_id",
      "amount_cents",
      "status",
      "provider_order_id",
      "idempotency_key",
      "created_at",
      "updated_at",
      "original_cents",
      "discount_cents",
      "currency_id",
      "currency_quantity",
      "currency_rate_micros",
      "payment_mode",
      "item_name",
      "reservation_state",
      "choice_expires_at",
      "external_member_id",
      "external_state",
      "external_before",
      "external_after"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs",
      "lib/evo-product-sales.mjs",
      "lib/checkout-fitcoins.mjs",
      "lib/checkout.mjs"
    ]
  },
  {
    "table": "club_pix_orders_test_archive_20261011",
    "label": "pix orders test archive 20261011",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "member_id",
      "unit",
      "item_type",
      "item_id",
      "status",
      "currency_id",
      "external_state",
      "reservation_state"
    ],
    "tracked": [
      "member_id",
      "unit",
      "item_type",
      "item_id",
      "amount_cents",
      "status",
      "provider_order_id",
      "idempotency_key",
      "original_cents",
      "discount_cents",
      "currency_id",
      "currency_quantity",
      "currency_rate_micros",
      "payment_mode",
      "item_name",
      "reservation_state",
      "external_member_id",
      "external_state",
      "external_before",
      "external_after"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "unit",
      "item_type",
      "item_id",
      "amount_cents",
      "status",
      "provider_order_id",
      "idempotency_key",
      "created_at",
      "updated_at",
      "original_cents",
      "discount_cents",
      "currency_id",
      "currency_quantity",
      "currency_rate_micros",
      "payment_mode",
      "item_name",
      "reservation_state",
      "choice_expires_at",
      "external_member_id",
      "external_state",
      "external_before",
      "external_after"
    ],
    "references": [
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_pix_provider_events",
    "label": "Confirmação do provedor de pagamento",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "event_key"
    ],
    "fields": [
      "event_key",
      "order_id"
    ],
    "tracked": [
      "order_id",
      "provider_order_id",
      "provider_status",
      "amount_cents"
    ],
    "timestamp": null,
    "columns": [
      "event_key",
      "order_id",
      "provider_order_id",
      "provider_status",
      "amount_cents",
      "verified_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "club_pix_provider_events_test_archive_20261011",
    "label": "pix provider events test archive 20261011",
    "category": "Loja e moedas",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "rowid"
    ],
    "fields": [
      "event_key",
      "order_id"
    ],
    "tracked": [
      "event_key",
      "order_id",
      "provider_order_id",
      "provider_status",
      "amount_cents"
    ],
    "timestamp": null,
    "columns": [
      "event_key",
      "order_id",
      "provider_order_id",
      "provider_status",
      "amount_cents",
      "verified_at"
    ],
    "references": []
  },
  {
    "table": "club_reception_access",
    "label": "Permissões da recepção",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [],
    "tracked": [
      "units_json",
      "permissions_json"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "units_json",
      "permissions_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_settings",
    "label": "Configuração do sistema",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "key"
    ],
    "fields": [],
    "tracked": [
      "value"
    ],
    "timestamp": null,
    "columns": [
      "key",
      "value",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/admin-bike-ranking.mjs",
      "lib/admin-gym-ranking.mjs"
    ]
  },
  {
    "table": "club_task_history",
    "label": "Mudança de situação da tarefa",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "old_status",
      "new_status"
    ],
    "tracked": [
      "task_id",
      "unit",
      "actor_name",
      "old_status",
      "new_status"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "task_id",
      "unit",
      "actor_name",
      "old_status",
      "new_status",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_task_templates",
    "label": "Modelo de tarefa",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "unit",
      "title"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "title",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_tasks",
    "label": "Tarefa administrativa",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "category",
      "evo_member_id",
      "status",
      "completed_at"
    ],
    "tracked": [
      "unit",
      "source",
      "source_key",
      "category",
      "title",
      "problem",
      "evo_member_id",
      "aggregator_origin",
      "aggregator_id",
      "assigned_staff_id",
      "assigned_name",
      "status",
      "completed_by",
      "completed_name",
      "notes",
      "priority",
      "student_name",
      "student_cpf",
      "completed_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "source",
      "source_key",
      "category",
      "title",
      "problem",
      "evo_member_id",
      "aggregator_origin",
      "aggregator_id",
      "assigned_staff_id",
      "assigned_name",
      "status",
      "completed_by",
      "completed_name",
      "completed_at",
      "created_at",
      "updated_at",
      "notes",
      "priority",
      "student_name",
      "last_action_by",
      "last_action_at",
      "student_cpf"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_voucher_automation",
    "label": "Configuração de automação de voucher",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "value"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "value"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_voucher_batches",
    "label": "Lote de vouchers",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "model_id",
      "status",
      "completed_at"
    ],
    "tracked": [
      "unit",
      "model_id",
      "evo_voucher_id",
      "requested_quantity",
      "status",
      "completed_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "model_id",
      "evo_voucher_id",
      "requested_quantity",
      "status",
      "created_at",
      "completed_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/benefit-vouchers.mjs"
    ]
  },
  {
    "table": "club_voucher_codes",
    "label": "Atribuição de código de voucher",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "batch_id",
      "status"
    ],
    "tracked": [
      "unit",
      "batch_id",
      "evo_voucher_id",
      "code",
      "request_id",
      "status"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "batch_id",
      "evo_voucher_id",
      "code",
      "request_id",
      "status",
      "created_at",
      "assigned_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_voucher_manual_codes",
    "label": "Código manual de voucher",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "batch_id",
      "code"
    ],
    "fields": [
      "batch_id",
      "unit"
    ],
    "tracked": [
      "unit"
    ],
    "timestamp": "created_at",
    "columns": [
      "batch_id",
      "unit",
      "code",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/benefit-vouchers.mjs"
    ]
  },
  {
    "table": "club_voucher_models",
    "label": "Modelo de voucher",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "enabled"
    ],
    "tracked": [
      "unit",
      "name",
      "discount_type",
      "discount_value",
      "validity_days",
      "contract_ids_json",
      "enabled",
      "public_name"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "name",
      "discount_type",
      "discount_value",
      "validity_days",
      "contract_ids_json",
      "enabled",
      "created_at",
      "updated_at",
      "public_name"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/benefit-vouchers.mjs"
    ]
  },
  {
    "table": "club_voucher_requests",
    "label": "Solicitação de voucher",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "model_id",
      "member_id",
      "status",
      "batch_id"
    ],
    "tracked": [
      "unit",
      "model_id",
      "member_id",
      "source_type",
      "source_id",
      "idempotency_key",
      "delivery_mode",
      "status",
      "evo_voucher_id",
      "assigned_code",
      "error",
      "batch_id"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "model_id",
      "member_id",
      "source_type",
      "source_id",
      "idempotency_key",
      "delivery_mode",
      "status",
      "evo_voucher_id",
      "assigned_code",
      "attempts",
      "error",
      "created_at",
      "processed_at",
      "batch_id"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_voucher_service_automation",
    "label": "Automação de voucher de serviço",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "value"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "value"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_whatsapp_birthday_config",
    "label": "Configuração de aniversariantes",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "enabled",
      "flow_id"
    ],
    "tracked": [
      "enabled",
      "flow_id",
      "times_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "enabled",
      "flow_id",
      "times_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_whatsapp_birthday_dispatch",
    "label": "Envio para aniversariante",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "member_id",
      "flow_id",
      "status"
    ],
    "tracked": [
      "unit",
      "send_date",
      "member_id",
      "scheduled_time",
      "flow_id",
      "status",
      "error"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "unit",
      "send_date",
      "member_id",
      "scheduled_time",
      "flow_id",
      "status",
      "sent_at",
      "error"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_whatsapp_mission_dispatch",
    "label": "Envio relacionado à missão",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "mission_id",
      "flow_id",
      "state"
    ],
    "tracked": [
      "member_id",
      "mission_id",
      "rule_key",
      "flow_id",
      "state"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "mission_id",
      "rule_key",
      "flow_id",
      "state",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_whatsapp_new_config",
    "label": "Configuração de novos alunos",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "enabled"
    ],
    "tracked": [
      "enabled",
      "flows_json",
      "times_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "enabled",
      "flows_json",
      "times_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "club_whatsapp_new_dispatch",
    "label": "Envio para novo aluno",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "category",
      "flow_id",
      "status"
    ],
    "tracked": [
      "unit",
      "send_date",
      "evo_member_id",
      "category",
      "scheduled_time",
      "flow_id",
      "status",
      "error"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "unit",
      "send_date",
      "evo_member_id",
      "category",
      "scheduled_time",
      "flow_id",
      "status",
      "sent_at",
      "error"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "community_challenge_participants",
    "label": "Participação na comunidade",
    "category": "Missões e conquistas",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "challenge_id",
      "member_id"
    ],
    "fields": [
      "challenge_id",
      "member_id",
      "status"
    ],
    "tracked": [
      "status"
    ],
    "timestamp": "joined_at",
    "columns": [
      "challenge_id",
      "member_id",
      "status",
      "joined_at",
      "invited_at"
    ],
    "references": [
      "lib/admin-community-missions.mjs",
      "lib/community-challenges.mjs"
    ]
  },
  {
    "table": "community_challenges",
    "label": "Missão da comunidade",
    "category": "Missões e conquistas",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "creator_member_id",
      "target",
      "status"
    ],
    "tracked": [
      "unit",
      "creator_member_id",
      "title",
      "description",
      "visibility",
      "metric",
      "target",
      "modality",
      "status",
      "theme",
      "prize_description",
      "prize_terms",
      "weekly_min_classes",
      "weekly_distinct_days"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "creator_member_id",
      "title",
      "description",
      "visibility",
      "metric",
      "target",
      "modality",
      "start_at",
      "end_at",
      "status",
      "created_at",
      "theme",
      "prize_description",
      "prize_terms",
      "weekly_min_classes",
      "weekly_distinct_days"
    ],
    "references": [
      "lib/admin-community-missions.mjs",
      "lib/community-challenges.mjs"
    ]
  },
  {
    "table": "conquest_tv_display",
    "label": "Conquista exibida na TV",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id",
      "target",
      "earned_date"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "target",
      "session_id"
    ],
    "tracked": [
      "displayed_date",
      "session_id"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "target",
      "earned_date",
      "displayed_date",
      "session_id",
      "displayed_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/hall-conquests.mjs"
    ]
  },
  {
    "table": "conquest_tv_settings",
    "label": "Configuração dos destaques de conquistas",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "show_empty",
      "positions_seconds",
      "highlights_seconds"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "show_empty",
      "positions_seconds",
      "highlights_seconds",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_attendance_import_queue",
    "label": "Aula na fila de presenças",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "id_activity_session"
    ],
    "fields": [
      "unit",
      "id_activity_session",
      "activity_date",
      "status"
    ],
    "tracked": [
      "activity_date",
      "status"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "id_activity_session",
      "activity_date",
      "status",
      "attempts",
      "last_error"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_attendance_import_runs",
    "label": "Importação de presenças",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "status"
    ],
    "tracked": [
      "unit",
      "period_from",
      "period_to",
      "status",
      "classes_found",
      "classes_done",
      "presences_saved"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "unit",
      "period_from",
      "period_to",
      "status",
      "requests",
      "classes_found",
      "classes_done",
      "presences_saved",
      "started_at",
      "finished_at"
    ],
    "references": []
  },
  {
    "table": "evo_attendance_sessions",
    "label": "Aula sincronizada",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "id_activity_session"
    ],
    "fields": [
      "unit",
      "id_activity_session",
      "activity_date",
      "start_time",
      "activity_name",
      "status",
      "attendance_count"
    ],
    "tracked": [
      "activity_date",
      "start_time",
      "activity_name",
      "status",
      "attendance_count",
      "instructor_name"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "id_activity_session",
      "activity_date",
      "start_time",
      "activity_name",
      "status",
      "attendance_count",
      "synced_at",
      "instructor_name"
    ],
    "references": [
      "admin-professores.html",
      "admin-automacao.html",
      "club-pop-worker.mjs",
      "lib/hall-conquests.mjs",
      "lib/session-contracts.mjs",
      "lib/reservation-sync.mjs",
      "lib/teacher-view.mjs",
      "lib/flash-mission-classes.mjs",
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "evo_contract_catalog",
    "label": "Contrato do catálogo",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "tenant_key",
      "unit",
      "evo_contract_id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "contract_name",
      "category_id",
      "category_name",
      "is_active",
      "source",
      "inactive_since"
    ],
    "timestamp": null,
    "columns": [
      "tenant_key",
      "unit",
      "evo_contract_id",
      "contract_name",
      "category_id",
      "category_name",
      "is_active",
      "source",
      "first_seen_at",
      "last_seen_at",
      "last_synced_at",
      "inactive_since"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_contract_catalog_sync",
    "label": "Atualização do catálogo de contratos",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "tenant_key",
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "tenant_key",
      "unit",
      "last_attempt_at",
      "last_success_at",
      "last_result",
      "last_count",
      "last_error"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_contract_categories",
    "label": "Categoria de contrato",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "tenant_key",
      "unit",
      "category_id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "category_name",
      "source"
    ],
    "timestamp": null,
    "columns": [
      "tenant_key",
      "unit",
      "category_id",
      "category_name",
      "source",
      "last_synced_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_contract_sync_checkpoint",
    "label": "contract sync checkpoint",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "next_skip",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_contract_sync_generation",
    "label": "contract sync generation",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "run_id",
      "completed"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "run_id",
      "next_skip",
      "completed",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_current_runs",
    "label": "Sincronização de alunos ativos",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "state",
      "removed"
    ],
    "tracked": [
      "unit",
      "state",
      "report_ids",
      "added",
      "changed",
      "removed",
      "error"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "unit",
      "state",
      "next_skip",
      "requests",
      "report_ids",
      "added",
      "changed",
      "removed",
      "error",
      "started_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_current_runs_v2",
    "label": "Sincronização atual de alunos ativos",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "state",
      "removed"
    ],
    "tracked": [
      "unit",
      "state",
      "report_ids",
      "added",
      "changed",
      "removed",
      "error"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "unit",
      "state",
      "next_skip",
      "requests",
      "report_ids",
      "added",
      "changed",
      "removed",
      "error",
      "started_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_current_stage",
    "label": "current stage",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "run_id",
      "evo_member_id"
    ],
    "fields": [
      "evo_member_id"
    ],
    "tracked": [
      "payload"
    ],
    "timestamp": null,
    "columns": [
      "run_id",
      "evo_member_id",
      "payload"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_current_stage_v2",
    "label": "current stage v2",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "run_id",
      "evo_member_id"
    ],
    "fields": [
      "evo_member_id"
    ],
    "tracked": [
      "payload"
    ],
    "timestamp": null,
    "columns": [
      "run_id",
      "evo_member_id",
      "payload"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_daily_registration_runs",
    "label": "Coleta diária de cadastros",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "category",
      "status"
    ],
    "tracked": [
      "unit",
      "day",
      "category",
      "found",
      "inserted",
      "status",
      "error"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "day",
      "category",
      "found",
      "inserted",
      "requests",
      "status",
      "error",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_daily_registrations",
    "label": "Novo cadastro ou oportunidade",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "category",
      "evo_id"
    ],
    "fields": [
      "unit",
      "category",
      "evo_id"
    ],
    "tracked": [
      "register_day",
      "display_name"
    ],
    "timestamp": "register_at",
    "columns": [
      "unit",
      "category",
      "evo_id",
      "register_day",
      "register_at",
      "display_name",
      "payload_json",
      "first_seen_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-data.mjs"
    ]
  },
  {
    "table": "evo_instructor_backfill_attempts",
    "label": "Identificação de professor da aula",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "id_activity_session"
    ],
    "fields": [
      "unit",
      "id_activity_session",
      "status"
    ],
    "tracked": [
      "status",
      "detail"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "id_activity_session",
      "attempted_at",
      "status",
      "detail"
    ],
    "references": [
      "admin-automacao.html",
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_member_attendance",
    "label": "Presença confirmada",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id",
      "attendance_key"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "attendance_date",
      "start_time",
      "activity_name",
      "id_activity_session"
    ],
    "tracked": [
      "attendance_date",
      "start_time",
      "activity_name",
      "id_activity_session"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "attendance_key",
      "attendance_date",
      "start_time",
      "activity_name",
      "id_activity_session",
      "raw_json",
      "synced_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-data.mjs",
      "lib/hall-conquests.mjs",
      "lib/session-contracts.mjs",
      "lib/currency-ledger.mjs",
      "lib/admin-bike-ranking.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/admin-community-missions.mjs",
      "lib/pop-draws.mjs",
      "lib/admin-gym-ranking.mjs",
      "lib/member-identity.mjs",
      "lib/community-challenges.mjs"
    ]
  },
  {
    "table": "evo_member_attendance_states",
    "label": "Situação de presença e falta",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id",
      "id_activity_session"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "id_activity_session",
      "attendance_date",
      "start_time",
      "activity_name",
      "evo_status",
      "justified_absence"
    ],
    "tracked": [
      "attendance_date",
      "start_time",
      "activity_name",
      "evo_status",
      "justified_absence"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "id_activity_session",
      "attendance_date",
      "start_time",
      "activity_name",
      "evo_status",
      "justified_absence",
      "raw_json",
      "synced_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/session-contracts.mjs"
    ]
  },
  {
    "table": "evo_member_cache",
    "label": "member cache",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "evo_member_id"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "payload_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_member_contracts",
    "label": "Contrato do aluno",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id",
      "contract_key"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "membership_status",
      "start_date",
      "end_date",
      "cancel_date",
      "sale_date"
    ],
    "tracked": [
      "id_membership",
      "id_member_membership",
      "category_id",
      "membership_name",
      "membership_status",
      "start_date",
      "end_date",
      "cancel_date",
      "sale_date",
      "is_additional"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "contract_key",
      "id_membership",
      "id_member_membership",
      "category_id",
      "membership_name",
      "membership_status",
      "start_date",
      "end_date",
      "cancel_date",
      "sale_date",
      "is_additional",
      "raw_json",
      "source_run_id",
      "synced_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-data.mjs",
      "lib/session-contracts.mjs",
      "lib/currency-ledger.mjs",
      "lib/lucky-draw-data.mjs"
    ]
  },
  {
    "table": "evo_member_identity_aliases",
    "label": "Unificação de cadastro",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "legacy_evo_member_id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "principal_evo_member_id",
      "merged_by"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "legacy_evo_member_id",
      "principal_evo_member_id",
      "merged_by",
      "merged_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-data.mjs",
      "lib/lucky-draw-data.mjs"
    ]
  },
  {
    "table": "evo_member_master",
    "label": "Perfil recebido da EVO",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "is_current"
    ],
    "tracked": [
      "is_current",
      "personal_json",
      "contacts_json",
      "address_json",
      "access_json",
      "financial_json",
      "integrations_json",
      "memberships_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "is_current",
      "personal_json",
      "contacts_json",
      "address_json",
      "access_json",
      "financial_json",
      "integrations_json",
      "memberships_json",
      "metadata_json",
      "raw_json",
      "source_run_id",
      "evo_updated_at",
      "synced_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs",
      "lib/journey-data.mjs",
      "lib/admin-bike-ranking.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/admin-gym-ranking.mjs",
      "lib/member-identity.mjs"
    ]
  },
  {
    "table": "evo_modalities_catalog",
    "label": "Modalidade do catálogo",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_activity_id"
    ],
    "fields": [
      "unit",
      "activity_name"
    ],
    "tracked": [
      "activity_name",
      "is_active"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_activity_id",
      "activity_name",
      "is_active",
      "raw_json",
      "last_synced_at"
    ],
    "references": [
      "admin-automacao.html",
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_modalities_catalog_sync",
    "label": "Atualização de modalidades",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "last_success_at",
      "last_count",
      "last_requests"
    ],
    "references": [
      "admin-automacao.html",
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_product_catalog",
    "label": "Produto do catálogo EVO",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "tenant_key",
      "unit",
      "evo_product_id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "name",
      "sku",
      "barcode",
      "price_cents",
      "stock_quantity",
      "active"
    ],
    "timestamp": null,
    "columns": [
      "tenant_key",
      "unit",
      "evo_product_id",
      "name",
      "sku",
      "barcode",
      "price_cents",
      "stock_quantity",
      "active",
      "raw_json",
      "last_seen_at",
      "last_synced_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs",
      "lib/evo-product-sales.mjs"
    ]
  },
  {
    "table": "evo_product_sync",
    "label": "Atualização de produtos",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "tenant_key",
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "request_count"
    ],
    "timestamp": null,
    "columns": [
      "tenant_key",
      "unit",
      "last_attempt_at",
      "last_success_at",
      "last_count",
      "last_error",
      "request_count"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_prospect_reservations",
    "label": "Agendamento da oportunidade",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "snapshot",
    "note": "Diferenças entre listas recebidas; remoção da lista não comprova cancelamento na EVO.",
    "keys": [
      "unit",
      "session_id",
      "prospect_id"
    ],
    "fields": [
      "unit",
      "session_id",
      "prospect_id",
      "activity_date",
      "start_time",
      "activity_name",
      "status"
    ],
    "tracked": [
      "activity_date",
      "start_time",
      "activity_name",
      "member_name",
      "status"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "session_id",
      "prospect_id",
      "activity_date",
      "start_time",
      "activity_name",
      "member_name",
      "status",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-data.mjs",
      "lib/reservation-sync.mjs"
    ]
  },
  {
    "table": "evo_request_log",
    "label": "Requisição à EVO",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "requests",
    "note": "Requisições existentes, consultadas em bloco separado; a central não consulta a EVO.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "status"
    ],
    "tracked": [
      "unit",
      "purpose",
      "method",
      "endpoint",
      "status",
      "ok"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "purpose",
      "method",
      "endpoint",
      "status",
      "ok",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/reservation-sync.mjs"
    ]
  },
  {
    "table": "evo_reservation_jobs",
    "label": "reservation jobs",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "state"
    ],
    "tracked": [
      "run_key",
      "state",
      "payload"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "run_key",
      "state",
      "payload",
      "lease_until",
      "updated_at"
    ],
    "references": [
      "lib/reservation-sync.mjs"
    ]
  },
  {
    "table": "evo_service_catalog",
    "label": "Serviço do catálogo EVO",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_service_id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "service_name",
      "price",
      "is_active"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_service_id",
      "service_name",
      "price",
      "is_active",
      "raw_json",
      "last_synced_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "evo_service_catalog_sync",
    "label": "Atualização de serviços",
    "category": "Contratos e catálogos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "last_success_at",
      "last_count"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_session_contract_reconciliation",
    "label": "Vínculo de sessão ao contrato",
    "category": "Agendamentos e presenças",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id",
      "id_activity_session"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "id_activity_session"
    ],
    "tracked": [
      "contract_key",
      "session_date",
      "session_time",
      "confidence",
      "candidate_count",
      "source"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "id_activity_session",
      "contract_key",
      "session_date",
      "session_time",
      "confidence",
      "candidate_count",
      "source",
      "reconciled_at"
    ],
    "references": []
  },
  {
    "table": "evo_student_categories",
    "label": "student categories",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "evo_member_id",
      "category",
      "subtype"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "category"
    ],
    "tracked": [
      "source"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "category",
      "subtype",
      "source"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_student_sync_log",
    "label": "Resultado da sincronização de alunos",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "removed"
    ],
    "tracked": [
      "unit",
      "added",
      "changed",
      "removed",
      "details"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "added",
      "changed",
      "removed",
      "requests",
      "details",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_student_sync_stage",
    "label": "student sync stage",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "evo_member_id"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "payload_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_student_sync_state",
    "label": "student sync state",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "links_processed"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "next_skip",
      "links_processed",
      "requests",
      "started_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_students",
    "label": "Situação do aluno na EVO",
    "category": "Cadastros e alunos",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "evo_member_id",
      "membership_status",
      "is_current"
    ],
    "tracked": [
      "display_name",
      "membership_status",
      "fitcoins",
      "is_current"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "display_name",
      "membership_status",
      "fitcoins",
      "is_current",
      "last_run",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/currency-ledger.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/checkout-fitcoins.mjs",
      "lib/checkout.mjs"
    ]
  },
  {
    "table": "evo_sync_config",
    "label": "Configuração de sincronização",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "enabled"
    ],
    "tracked": [
      "sync_time",
      "enabled"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "sync_time",
      "enabled",
      "last_sync_at",
      "last_sync_status",
      "last_sync_requests",
      "updated_at"
    ],
    "references": [
      "admin-automacao.html",
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_sync_payload_diagnostic",
    "label": "sync payload diagnostic",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "evo_member_id"
    ],
    "fields": [
      "unit",
      "evo_member_id"
    ],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_member_id",
      "payload_json",
      "captured_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_sync_probe",
    "label": "sync probe",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "id"
    ],
    "fields": [
      "state"
    ],
    "tracked": [
      "endpoint",
      "state",
      "result_json"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "endpoint",
      "state",
      "result_json",
      "created_at"
    ],
    "references": []
  },
  {
    "table": "evo_sync_schedule_runs",
    "label": "Execução de sincronização",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "kind",
      "scheduled_minute"
    ],
    "fields": [
      "unit",
      "kind",
      "status"
    ],
    "tracked": [
      "status",
      "detail"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "kind",
      "scheduled_minute",
      "status",
      "detail",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/reservation-sync.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "evo_sync_schedules",
    "label": "Horário de sincronização",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "kind"
    ],
    "fields": [
      "unit",
      "kind"
    ],
    "tracked": [
      "times_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "kind",
      "times_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_unit_config",
    "label": "unit config",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit",
      "enabled"
    ],
    "tracked": [
      "dns",
      "enabled"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "dns",
      "token",
      "expires_at",
      "enabled",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "evo_vip_diagnostic_checkpoint",
    "label": "vip diagnostic checkpoint",
    "category": "Rotinas e requisições",
    "origin": "Integração recebida no D1",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "contracts",
      "vip_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "next_skip",
      "contracts",
      "requests",
      "vip_json",
      "details_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "gym_member_links",
    "label": "Vínculo do aluno entre unidades",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "status"
    ],
    "tracked": [
      "gym_client_id",
      "member_id",
      "link_source",
      "status"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "gym_client_id",
      "member_id",
      "link_source",
      "linked_at",
      "status"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/member-identity.mjs",
      "lib/community-challenges.mjs"
    ]
  },
  {
    "table": "import_batches",
    "label": "Lote de importação",
    "category": "Rotinas e requisições",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "reference_month",
      "status",
      "completed_at"
    ],
    "tracked": [
      "import_type",
      "filename",
      "reference_month",
      "total_rows",
      "valid_rows",
      "unmatched_rows",
      "duplicate_rows",
      "error_rows",
      "status",
      "completed_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "import_type",
      "filename",
      "file_hash",
      "reference_month",
      "total_rows",
      "valid_rows",
      "unmatched_rows",
      "duplicate_rows",
      "error_rows",
      "status",
      "created_at",
      "completed_at"
    ],
    "references": [
      "lib/evo-shop-import.mjs"
    ]
  },
  {
    "table": "landing_v2_content",
    "label": "Conteúdo da página pública",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "slot"
    ],
    "fields": [],
    "tracked": [
      "content_json"
    ],
    "timestamp": null,
    "columns": [
      "slot",
      "content_json",
      "updated_at"
    ],
    "references": []
  },
  {
    "table": "lucky_audit_snapshots",
    "label": "lucky audit snapshots",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "unit",
      "evo_id",
      "kind",
      "scope"
    ],
    "fields": [
      "unit",
      "evo_id",
      "kind",
      "scope"
    ],
    "tracked": [
      "payload"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "evo_id",
      "kind",
      "scope",
      "payload",
      "checked_at"
    ],
    "references": []
  },
  {
    "table": "lucky_draw_audit_results",
    "label": "Resultado de elegibilidade no sorteio",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "promotion_id",
      "unit",
      "evo_id"
    ],
    "fields": [
      "promotion_id",
      "unit",
      "evo_id"
    ],
    "tracked": [
      "member_ids",
      "eligible",
      "expected",
      "existing"
    ],
    "timestamp": null,
    "columns": [
      "promotion_id",
      "unit",
      "evo_id",
      "member_ids",
      "eligible",
      "expected",
      "existing",
      "details_json",
      "checked_at"
    ],
    "references": [
      "lib/lucky-draw-audit.mjs"
    ]
  },
  {
    "table": "lucky_draw_events",
    "label": "Etapa da apuração do sorteio",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "stage"
    ],
    "tracked": [
      "run_id",
      "stage"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "run_id",
      "stage",
      "details_json",
      "created_at"
    ],
    "references": [
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "lucky_draw_leases",
    "label": "lucky draw leases",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "lease_key"
    ],
    "fields": [],
    "tracked": [],
    "timestamp": null,
    "columns": [
      "lease_key",
      "token",
      "expires_at"
    ],
    "references": [
      "lib/lucky-draw-data.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "lucky_draw_pool",
    "label": "lucky draw pool",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "run_id",
      "promotion_id",
      "code"
    ],
    "fields": [
      "promotion_id",
      "unit",
      "member_id",
      "evo_id"
    ],
    "tracked": [
      "unit",
      "member_id",
      "evo_id"
    ],
    "timestamp": null,
    "columns": [
      "run_id",
      "promotion_id",
      "unit",
      "code",
      "member_id",
      "evo_id"
    ],
    "references": [
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "lucky_draw_preparation",
    "label": "Preparação do sorteio",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "promotion_id"
    ],
    "fields": [
      "promotion_id",
      "stage"
    ],
    "tracked": [
      "stage"
    ],
    "timestamp": null,
    "columns": [
      "promotion_id",
      "stage",
      "details_json",
      "updated_at"
    ],
    "references": [
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "lucky_draw_runs",
    "label": "Apuração do sorteio",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_id",
      "stage",
      "completed_at"
    ],
    "tracked": [
      "promotion_id",
      "linked_id",
      "stage",
      "winner_code",
      "winner_unit",
      "winner_member",
      "completed_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_id",
      "linked_id",
      "scheduled_at",
      "cutoff_at",
      "stage",
      "details_json",
      "pool_hash",
      "winner_code",
      "winner_unit",
      "winner_member",
      "completed_at",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "lucky_number_reconciliations",
    "label": "Correção de número da sorte",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_id",
      "member_id",
      "unit"
    ],
    "tracked": [
      "promotion_id",
      "number_id",
      "code",
      "member_id",
      "unit",
      "reason"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_id",
      "number_id",
      "code",
      "member_id",
      "unit",
      "reason",
      "details_json",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "lucky_numbers",
    "label": "Número da sorte",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_id",
      "reference_month",
      "studio",
      "origin",
      "status",
      "cancelled_at"
    ],
    "tracked": [
      "promotion_id",
      "participant_id",
      "attendance_id",
      "bonus_award_id",
      "code",
      "reference_month",
      "studio",
      "origin",
      "status",
      "cancelled_at"
    ],
    "timestamp": "issued_at",
    "columns": [
      "id",
      "promotion_id",
      "participant_id",
      "attendance_id",
      "bonus_award_id",
      "code",
      "reference_month",
      "studio",
      "origin",
      "status",
      "issued_at",
      "cancelled_at"
    ],
    "references": [
      "admin-whatsapp-rules.js",
      "club-pop-worker.mjs",
      "lib/lucky-draw-audit.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "members",
    "label": "Cadastro do aluno",
    "category": "Cadastros e alunos",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "evo_member_id",
      "status"
    ],
    "tracked": [
      "evo_member_id",
      "gym_client_id",
      "cpf_last4",
      "first_name",
      "email",
      "birth_date",
      "status",
      "presencas_legadas_bike",
      "presencas_legadas_gym"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "evo_member_id",
      "gym_client_id",
      "cpf_hash",
      "cpf_last4",
      "first_name",
      "last_name",
      "email",
      "birth_date",
      "pin_hash",
      "pin_salt",
      "pin_created_at",
      "status",
      "failed_login_attempts",
      "locked_until",
      "created_at",
      "updated_at",
      "presencas_legadas_bike",
      "presencas_legadas_gym"
    ],
    "references": [
      "admin-sincronizacoes.html",
      "laboratorio-reserva-evo.html",
      "missoes.html",
      "admin-alunos-evo.html",
      "meus-numeros.html",
      "promocao.html",
      "loja.html",
      "perfil.html",
      "promocoes.html",
      "admin-sync.html",
      "admin-moedas.html",
      "index.html",
      "club-pop-worker.mjs",
      "admin-moedas.js",
      "beneficios.html",
      "api/evo-admin.js",
      "api/evo.js",
      "api/evo-config.js",
      "api/redemption.js",
      "lib/evo-shop-import.mjs",
      "lib/evo-active-report.js",
      "lib/journey-data.mjs",
      "lib/hall-conquests.mjs",
      "lib/session-contracts.mjs",
      "lib/currency-ledger.mjs",
      "lib/fitcoin-reward.js",
      "lib/admin-bike-ranking.mjs",
      "lib/lucky-draw-audit.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/checkout-fitcoins.mjs",
      "lib/admin-community-missions.mjs",
      "lib/pop-draws.mjs",
      "lib/admin-gym-ranking.mjs",
      "lib/member-identity.mjs",
      "lib/community-challenges.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "mission_progress",
    "label": "Progresso de missão",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "mission_key",
      "reference_period",
      "progress",
      "goal",
      "status"
    ],
    "tracked": [
      "member_id",
      "mission_key",
      "reference_period",
      "progress",
      "goal",
      "status"
    ],
    "timestamp": null,
    "columns": [
      "id",
      "member_id",
      "mission_key",
      "reference_period",
      "progress",
      "goal",
      "status",
      "updated_at"
    ],
    "references": []
  },
  {
    "table": "partner_campaign_events",
    "label": "Interação com parceiro",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "benefit_id",
      "unit",
      "member_id",
      "event_type"
    ],
    "tracked": [
      "benefit_id",
      "unit",
      "member_id",
      "event_type",
      "day"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "benefit_id",
      "unit",
      "member_id",
      "event_type",
      "day",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "partner_code_vouchers",
    "label": "Código de benefício do parceiro",
    "category": "Benefícios e vouchers",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "benefit_id",
      "unit",
      "member_id"
    ],
    "fields": [
      "benefit_id",
      "unit",
      "member_id",
      "used_at"
    ],
    "tracked": [
      "member_name",
      "code",
      "used_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "benefit_id",
      "unit",
      "member_id",
      "member_name",
      "code",
      "created_at",
      "used_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "partner_daily_redemptions",
    "label": "Benefício diário utilizado",
    "category": "Benefícios e vouchers",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "benefit_id",
      "unit",
      "member_id",
      "used_at"
    ],
    "tracked": [
      "benefit_id",
      "unit",
      "member_id",
      "member_name",
      "partner_name",
      "benefit_title",
      "local_date",
      "used_at"
    ],
    "timestamp": "used_at",
    "columns": [
      "id",
      "benefit_id",
      "unit",
      "member_id",
      "member_name",
      "partner_name",
      "benefit_title",
      "local_date",
      "used_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "partner_once_redemptions",
    "label": "Benefício único utilizado",
    "category": "Benefícios e vouchers",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "benefit_id",
      "unit",
      "member_id",
      "used_at"
    ],
    "tracked": [
      "benefit_id",
      "unit",
      "member_id",
      "member_name",
      "partner_name",
      "benefit_title",
      "used_at"
    ],
    "timestamp": "used_at",
    "columns": [
      "id",
      "benefit_id",
      "unit",
      "member_id",
      "member_name",
      "partner_name",
      "benefit_title",
      "used_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "pop_draw_classes",
    "label": "Aula vinculada ao sorteio",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "draw_id",
      "unit",
      "session_id"
    ],
    "fields": [
      "draw_id",
      "unit",
      "session_id",
      "activity_date"
    ],
    "tracked": [
      "activity_date"
    ],
    "timestamp": null,
    "columns": [
      "draw_id",
      "unit",
      "session_id",
      "activity_date"
    ],
    "references": [
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "pop_draw_entries",
    "label": "Participante do sorteio por aula",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "draw_id",
      "number"
    ],
    "fields": [
      "draw_id",
      "member_id"
    ],
    "tracked": [
      "member_id",
      "member_name",
      "attendance_ref"
    ],
    "timestamp": "created_at",
    "columns": [
      "draw_id",
      "number",
      "member_id",
      "member_name",
      "attendance_ref",
      "created_at"
    ],
    "references": [
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "pop_draw_logs",
    "label": "Histórico do sorteio por aula",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "draw_id"
    ],
    "tracked": [
      "draw_id",
      "action",
      "details"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "draw_id",
      "action",
      "details",
      "created_at"
    ],
    "references": [
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "pop_draw_metadata",
    "label": "Prêmio e parceiro do sorteio",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "draw_id"
    ],
    "fields": [
      "draw_id"
    ],
    "tracked": [
      "prize_type",
      "partner_id",
      "partner_name",
      "partner_whatsapp",
      "prize_description"
    ],
    "timestamp": null,
    "columns": [
      "draw_id",
      "prize_type",
      "partner_id",
      "partner_name",
      "partner_whatsapp",
      "prize_description"
    ],
    "references": [
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "pop_draw_winners",
    "label": "Ganhador do sorteio por aula",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "draw_id",
      "position"
    ],
    "fields": [
      "draw_id",
      "member_id"
    ],
    "tracked": [
      "number",
      "member_id",
      "member_name"
    ],
    "timestamp": "drawn_at",
    "columns": [
      "draw_id",
      "position",
      "number",
      "member_id",
      "member_name",
      "drawn_at"
    ],
    "references": [
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "pop_draws",
    "label": "Sorteio por aula",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit",
      "status",
      "completed_at"
    ],
    "tracked": [
      "unit",
      "title",
      "prize_name",
      "prize_location",
      "winners_count",
      "automatic",
      "status",
      "completed_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "title",
      "prize_name",
      "prize_location",
      "draw_at",
      "winners_count",
      "automatic",
      "status",
      "created_at",
      "completed_at"
    ],
    "references": [
      "lib/pop-draws.mjs"
    ]
  },
  {
    "table": "pop_fit_entries",
    "label": "Edição de treino Pop Fit",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "member_id",
      "unit",
      "attendance_key"
    ],
    "fields": [
      "member_id",
      "unit"
    ],
    "tracked": [
      "weight",
      "height",
      "calories"
    ],
    "timestamp": null,
    "columns": [
      "member_id",
      "unit",
      "attendance_key",
      "weight",
      "height",
      "calories",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "pop_fit_images",
    "label": "Imagem gerada no Pop Fit",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "scope"
    ],
    "tracked": [
      "member_id",
      "scope",
      "period_label"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "scope",
      "image_data",
      "period_label",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "pop_fit_manual_activities",
    "label": "Atividade pessoal Pop Fit",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "activity_name",
      "activity_date",
      "start_time"
    ],
    "tracked": [
      "member_id",
      "activity_name",
      "activity_date",
      "start_time",
      "calories"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "activity_name",
      "activity_date",
      "start_time",
      "calories",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "pop_fit_profile",
    "label": "Perfil Pop Fit",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "member_id"
    ],
    "fields": [
      "member_id"
    ],
    "tracked": [
      "height",
      "initial_weight"
    ],
    "timestamp": null,
    "columns": [
      "member_id",
      "height",
      "initial_weight",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "promotion_attendance",
    "label": "Presença validada na promoção",
    "category": "Agendamentos e presenças",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_id",
      "studio",
      "reference_month",
      "status"
    ],
    "tracked": [
      "promotion_id",
      "participant_id",
      "studio",
      "reference_month",
      "source",
      "source_ref",
      "status"
    ],
    "timestamp": "occurred_at",
    "columns": [
      "id",
      "promotion_id",
      "participant_id",
      "studio",
      "occurred_at",
      "reference_month",
      "source",
      "source_ref",
      "status",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/lucky-draw-audit.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "promotion_bonus_awards",
    "label": "Bônus da promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_id",
      "reference_month",
      "studio",
      "quantity",
      "status"
    ],
    "tracked": [
      "promotion_id",
      "participant_id",
      "reference_month",
      "studio",
      "milestone",
      "quantity",
      "status"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_id",
      "participant_id",
      "reference_month",
      "studio",
      "milestone",
      "quantity",
      "status",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/lucky-draw-audit.mjs"
    ]
  },
  {
    "table": "promotion_number_update_errors",
    "label": "Erro na atualização de números",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_slug",
      "evo_member_id",
      "status",
      "resolved_at"
    ],
    "tracked": [
      "promotion_slug",
      "evo_member_id",
      "student_name",
      "error",
      "checkpoint",
      "status",
      "resolution_note",
      "resolved_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_slug",
      "evo_member_id",
      "student_name",
      "error",
      "checkpoint",
      "created_at",
      "status",
      "resolution_note",
      "resolved_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "promotion_number_update_log",
    "label": "Resultado da atualização de números",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_slug",
      "unit",
      "status",
      "evo_member_id"
    ],
    "tracked": [
      "promotion_slug",
      "unit",
      "mode",
      "status",
      "checked",
      "eligible",
      "with_attendance",
      "participants_updated",
      "generated",
      "errors",
      "checkpoint",
      "evo_member_id"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_slug",
      "unit",
      "mode",
      "status",
      "checked",
      "eligible",
      "with_attendance",
      "participants_updated",
      "generated",
      "errors",
      "checkpoint",
      "evo_member_id",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "promotion_number_update_state",
    "label": "Progresso da atualização de números",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "promotion_slug"
    ],
    "fields": [
      "promotion_slug",
      "unit",
      "status"
    ],
    "tracked": [
      "unit",
      "status",
      "checked",
      "eligible",
      "with_attendance",
      "participants_updated",
      "generated",
      "errors"
    ],
    "timestamp": null,
    "columns": [
      "promotion_slug",
      "unit",
      "next_skip",
      "status",
      "checked",
      "eligible",
      "with_attendance",
      "participants_updated",
      "generated",
      "errors",
      "started_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "promotion_participants",
    "label": "Participante da promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_id",
      "member_id"
    ],
    "tracked": [
      "promotion_id",
      "member_id"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_id",
      "member_id",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/lucky-draw-audit.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "promotion_review_requests",
    "label": "Solicitação de revisão da promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "promotion_slug",
      "member_id",
      "evo_member_id",
      "status"
    ],
    "tracked": [
      "promotion_slug",
      "member_id",
      "evo_member_id",
      "status",
      "eligibility_snapshot"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_slug",
      "member_id",
      "evo_member_id",
      "status",
      "eligibility_snapshot",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/lucky-draw-data.mjs"
    ]
  },
  {
    "table": "promotions",
    "label": "Promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "status"
    ],
    "tracked": [
      "slug",
      "name",
      "description",
      "status",
      "rules_json",
      "banner_url"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "slug",
      "name",
      "description",
      "start_at",
      "end_at",
      "status",
      "rules_json",
      "banner_url",
      "created_at",
      "updated_at"
    ],
    "references": [
      "missoes.html",
      "admin-loja-v2.js",
      "meus-numeros.html",
      "promocao.html",
      "admin-numeros-sorte.html",
      "promocoes.html",
      "index.html",
      "admin-promocoes.html",
      "admin-sorteios.html",
      "club-pop-worker.mjs",
      "admin.html",
      "api/content.js",
      "lib/fitcoin-reward.js",
      "lib/lucky-draw-audit.mjs",
      "lib/lucky-draw-data.mjs",
      "lib/lucky-draw-official.mjs"
    ]
  },
  {
    "table": "redemptions",
    "label": "Resgate de recompensa",
    "category": "Loja e moedas",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "status",
      "unit",
      "completed_at",
      "cancelled_at",
      "approved_at"
    ],
    "tracked": [
      "member_id",
      "redemption_type",
      "reference_id",
      "fitcoins",
      "status",
      "source_type",
      "source_id",
      "title",
      "details",
      "cash_amount",
      "unit",
      "dedupe_key",
      "handled_by",
      "cancel_reason",
      "completed_at",
      "cancelled_at",
      "approved_at"
    ],
    "timestamp": "requested_at",
    "columns": [
      "id",
      "member_id",
      "redemption_type",
      "reference_id",
      "fitcoins",
      "status",
      "requested_at",
      "approved_at",
      "completed_at",
      "cancelled_at",
      "source_type",
      "source_id",
      "title",
      "details",
      "cash_amount",
      "unit",
      "dedupe_key",
      "handled_by",
      "handled_at",
      "cancel_reason"
    ],
    "references": [
      "admin-loja.html",
      "hall-mission-badges.js",
      "missoes.html",
      "admin-resgates.html",
      "admin-moedas.html",
      "meus-vouchers.html",
      "index.html",
      "club-pop-worker.mjs",
      "admin-moedas.js",
      "api/redemption.js",
      "api/mission-redemptions.js",
      "lib/currency-ledger.mjs"
    ]
  },
  {
    "table": "staff_users",
    "label": "Acesso de funcionário",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "enabled"
    ],
    "tracked": [
      "name",
      "email",
      "role",
      "units_json",
      "permissions_json",
      "enabled",
      "teacher_links_json"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "name",
      "email",
      "pin_hash",
      "role",
      "units_json",
      "permissions_json",
      "enabled",
      "created_at",
      "updated_at",
      "teacher_links_json"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/teacher-view.mjs"
    ]
  },
  {
    "table": "student_issue_report_events",
    "label": "Atualização de relato",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "event_type"
    ],
    "tracked": [
      "report_id",
      "actor_type",
      "actor_id",
      "event_type",
      "note",
      "visibility"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "report_id",
      "actor_type",
      "actor_id",
      "event_type",
      "note",
      "created_at",
      "visibility"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "student_issue_reports",
    "label": "Relato do aluno",
    "category": "Aplicativo do aluno",
    "origin": "Aplicativo do aluno",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "evo_member_id",
      "unit",
      "status",
      "resolved_at"
    ],
    "tracked": [
      "member_id",
      "evo_member_id",
      "member_name",
      "unit",
      "area",
      "description",
      "status",
      "priority",
      "resolved_at"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "member_id",
      "evo_member_id",
      "member_name",
      "unit",
      "area",
      "description",
      "status",
      "priority",
      "created_at",
      "updated_at",
      "resolved_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "student_management_dispatches",
    "label": "Envio da gestão de alunos",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "batch_id"
    ],
    "fields": [
      "batch_id",
      "unit",
      "status"
    ],
    "tracked": [
      "phone",
      "unit",
      "group_name",
      "flow",
      "status"
    ],
    "timestamp": "created_at",
    "columns": [
      "batch_id",
      "phone",
      "unit",
      "group_name",
      "flow",
      "status",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs",
      "lib/journey-plan.mjs"
    ]
  },
  {
    "table": "student_management_segments",
    "label": "Segmento de alunos",
    "category": "Jornada e comunicação",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "unit",
      "name",
      "filters_json"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "unit",
      "name",
      "filters_json",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "student_tutorial_videos",
    "label": "Tutorial do aluno",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "category",
      "unit"
    ],
    "tracked": [
      "title",
      "description",
      "category",
      "unit",
      "drive_file_id",
      "sort_order",
      "published"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "title",
      "description",
      "category",
      "unit",
      "drive_file_id",
      "sort_order",
      "published",
      "created_at",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "teacher_payment_overrides",
    "label": "Atribuição e ajuste da aula",
    "category": "Professores",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "id_activity_session"
    ],
    "fields": [
      "unit",
      "id_activity_session",
      "teacher_name",
      "attendance_count",
      "capacity",
      "activity_name"
    ],
    "tracked": [
      "teacher_name",
      "attendance_count",
      "capacity",
      "activity_name",
      "teacher_absent"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "id_activity_session",
      "teacher_name",
      "attendance_count",
      "capacity",
      "activity_name",
      "teacher_absent",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "teacher_payment_settings",
    "label": "Regra de pagamento do professor",
    "category": "Professores",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "category"
    ],
    "fields": [
      "unit",
      "category",
      "capacity"
    ],
    "tracked": [
      "capacity",
      "ticket_cents",
      "bands_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "category",
      "capacity",
      "ticket_cents",
      "bands_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "teacher_weekly_payments",
    "label": "Pagamento semanal do professor",
    "category": "Professores",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit",
      "month",
      "week_start",
      "teacher_key"
    ],
    "fields": [
      "unit",
      "teacher_name",
      "paid",
      "paid_amount_cents",
      "paid_at"
    ],
    "tracked": [
      "week_end",
      "teacher_name",
      "paid",
      "paid_amount_cents",
      "paid_at"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "month",
      "week_start",
      "week_end",
      "teacher_key",
      "teacher_name",
      "paid",
      "paid_at",
      "paid_amount_cents",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "tv_campaign_events",
    "label": "Interação com propaganda da TV",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "kind",
      "unit"
    ],
    "tracked": [
      "campaign_id",
      "kind",
      "unit",
      "visitor_key"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "campaign_id",
      "kind",
      "unit",
      "visitor_key",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "tv_pop_config",
    "label": "Programação e propagandas da TV Pop",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "config_json"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "config_json",
      "updated_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "unit_ui_config",
    "label": "Identidade visual da unidade",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "unit"
    ],
    "fields": [
      "unit"
    ],
    "tracked": [
      "background_color",
      "logo_link",
      "header_color"
    ],
    "timestamp": null,
    "columns": [
      "unit",
      "background_color",
      "updated_at",
      "logo_data",
      "favicon_data",
      "logo_link",
      "header_color"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "useful_link_events",
    "label": "Interação em link útil",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "visit_id",
      "seq"
    ],
    "fields": [],
    "tracked": [
      "event",
      "step",
      "elapsed_ms"
    ],
    "timestamp": null,
    "columns": [
      "visit_id",
      "seq",
      "event",
      "step",
      "elapsed_ms",
      "received_at"
    ],
    "references": []
  },
  {
    "table": "useful_link_rate_limits",
    "label": "useful link rate limits",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "technical",
    "note": "Fonte auxiliar, histórico duplicado, credencial, cópia ou controle de execução. Sem gatilho de negócio.",
    "keys": [
      "bucket"
    ],
    "fields": [],
    "tracked": [
      "hits"
    ],
    "timestamp": null,
    "columns": [
      "bucket",
      "expires_at",
      "hits"
    ],
    "references": []
  },
  {
    "table": "useful_link_tracking_v2",
    "label": "Etapa em link útil",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "session_id",
      "event_type"
    ],
    "tracked": [
      "link_slug",
      "session_id",
      "event_type",
      "step",
      "period"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "link_slug",
      "session_id",
      "event_type",
      "step",
      "period",
      "created_at"
    ],
    "references": [
      "workers/links-uteis-worker.js",
      "lib/useful-links-routes.mjs"
    ]
  },
  {
    "table": "useful_link_visits",
    "label": "Visita em link útil",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [],
    "tracked": [
      "link",
      "device",
      "source",
      "medium",
      "campaign",
      "referrer"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "token_hash",
      "link",
      "created_at",
      "device",
      "source",
      "medium",
      "campaign",
      "referrer"
    ],
    "references": []
  },
  {
    "table": "useful_links",
    "label": "Link útil",
    "category": "Administração e conteúdo",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "target",
      "enabled"
    ],
    "tracked": [
      "slug",
      "name",
      "target",
      "config_json",
      "enabled"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "slug",
      "name",
      "target",
      "config_json",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "references": [
      "workers/links-uteis-worker.js",
      "lib/useful-links-routes.mjs"
    ]
  },
  {
    "table": "vouchers",
    "label": "Voucher do aluno",
    "category": "Benefícios e vouchers",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "note": "Criação e alterações reais no D1; atualizações apenas de carimbo não geram evento.",
    "keys": [
      "id"
    ],
    "fields": [
      "member_id",
      "status",
      "redeemed_at",
      "cancelled_at"
    ],
    "tracked": [
      "member_id",
      "code",
      "type",
      "description",
      "status",
      "redemption_id",
      "source_type",
      "source_id",
      "title",
      "used_by",
      "redeemed_at",
      "cancelled_at"
    ],
    "timestamp": "issued_at",
    "columns": [
      "id",
      "member_id",
      "code",
      "type",
      "description",
      "status",
      "issued_at",
      "expires_at",
      "redeemed_at",
      "redemption_id",
      "source_type",
      "source_id",
      "title",
      "metadata_json",
      "used_by",
      "cancelled_at"
    ],
    "references": [
      "relatar-problema.html",
      "admin-beneficios.html",
      "club-mission-card.js",
      "admin-vouchers.html",
      "missoes.html",
      "admin-missoes.html",
      "admin-alunos-evo.html",
      "beneficios-resgate.js",
      "admin-beneficios-v2.js",
      "student-community-challenges.js",
      "admin-beneficios-vouchers.js",
      "admin-configuracoes.html",
      "perfil.html",
      "admin-requisicoes.html",
      "student-app-analytics.js",
      "student-unit-theme.js",
      "student-onboarding-tour.js",
      "admin-vouchers-lotes.js",
      "meus-vouchers.html",
      "minhas-compras.html",
      "index.html",
      "admin-promocoes.html",
      "tutoriais.html",
      "beneficios-vouchers.js",
      "admin-common.js",
      "loja-v2.js",
      "admin-automacao.html",
      "club-pop-worker.mjs",
      "beneficios.html",
      "admin.html",
      "api/evo-config.js",
      "api/mission-redemptions.js",
      "lib/benefit-vouchers.mjs",
      "lib/checkout-fitcoins.mjs",
      "lib/student-issue-reports.mjs"
    ]
  },
  {
    "table": "club_mission_final_choice",
    "label": "Escolha final da recompensa",
    "category": "Missões e conquistas",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "lazy": true,
    "note": "Captura instalada automaticamente quando esta funcionalidade criar sua fonte no D1.",
    "keys": [
      "member_id",
      "mission_id",
      "period_key"
    ],
    "fields": [
      "member_id",
      "mission_id",
      "period_key",
      "goal_id"
    ],
    "tracked": [
      "member_id",
      "mission_id",
      "period_key",
      "goal_id"
    ],
    "timestamp": "created_at",
    "columns": [
      "member_id",
      "mission_id",
      "period_key",
      "goal_id",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  },
  {
    "table": "promotion_sync_runs",
    "label": "Resultado da sincronização da promoção",
    "category": "Sorteios e promoções",
    "origin": "Sistema e administração",
    "mode": "trigger",
    "lazy": true,
    "note": "Captura instalada automaticamente quando esta funcionalidade criar sua fonte no D1.",
    "keys": [
      "id"
    ],
    "fields": [
      "id",
      "promotion_slug",
      "unit",
      "processed",
      "eligible",
      "participating",
      "attendance",
      "generated",
      "errors"
    ],
    "tracked": [
      "id",
      "promotion_slug",
      "unit",
      "processed",
      "eligible",
      "participating",
      "attendance",
      "generated",
      "errors"
    ],
    "timestamp": "created_at",
    "columns": [
      "id",
      "promotion_slug",
      "unit",
      "processed",
      "eligible",
      "participating",
      "attendance",
      "generated",
      "errors",
      "created_at"
    ],
    "references": [
      "club-pop-worker.mjs"
    ]
  }
];
