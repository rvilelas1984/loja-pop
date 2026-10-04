# EVO current students — checkpoint 2026-10-04

Scope: Bike only. Gym calls remain at 5 from before this work.

Verified investigations:
- activeclients and active-members return XLSX, not the XML declared by docs; 59 unique report IDs.
- members status=1/showMemberships=true/take=25 produced 504 unique current IDs in 21 calls (probe 11), including 501 membershipStatus Active and 3 Suspended.
- registration flags: 253 Wellhub,225 TotalPass,35 overlap,443 unique aggregators. These are registration flags, not a claim of 446 current aggregator contracts.
- 325 distinct linked Club IDs,81 matched,423 only EVO,244 only Club.
- VIP remains unverified, shown as unknown, never invented as zero.

Production:
- Worker binary fix 953a235; XLSX parser 905b9e7.
- Atomic mirror and filtered sync bf38535 deployed to Worker and Vercel READY.
- Four new D1 tables plus running-job unique index applied; existing cache/history untouched.
- Temporary read-only EVO report probe 12 pending cron propagation; next controlled mirror validation is probe 13.
- Temporary Worker club-pop-bike-sync-probe has no public execution route; REMOVE schedule and Worker after testing.

Tests: SQLite mirror atomicity/history/duplicates, API→Worker→D1 with mock EVO, real 59-row XLSX fixture, DOM script D1-only page opening/SP times/sync controls, unauthorized/Gym production API rejection and Worker health200.

Remaining: complete controlled live sync, verify D1 counts and full run cost, recheck bindings/health, clean temporary probes; browser authenticated admin validation still pending. Do not claim full panel category equivalence.

Resume: Continue loja-pop main, current-student integration. Read this file and latest commit. Bike only, preserve history; commit tested checkpoints about every 5 minutes and supply a short resume prompt.
