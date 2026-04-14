# Baseline Update Report

- Generated at: 2026-03-05T13:12:28.804Z
- Ontology version: 1.1.0
- Issues: 10
- Proposed edge changes: 12
- Unmapped files: 8
- Protected node violations: 1
- Approval required: yes
- Auto apply eligible: no

## Approval Required Reasons

- Protected node rule violated (1)

## Critical Signals

- Protected node violations: 1
- Removed nodes: 0
- Removed data edges: 0
- Removed call edges: 0
- Proposed edge changes: 12
- Unmapped files: 8
- Unmapped generated node issues: 0

## Issues

- [unmapped-file] Unmapped changed file: migrations/0001_init.sql
- [unmapped-file] Unmapped changed file: migrations/0002_contacts_multilingual_soft_delete.sql
- [unmapped-file] Unmapped changed file: migrations/0003_question_sets_questions_answers.sql
- [unmapped-file] Unmapped changed file: NestCall.code-workspace
- [unmapped-file] Unmapped changed file: open-next.config.ts
- [unmapped-file] Unmapped changed file: public/_headers
- [unmapped-file] Unmapped changed file: tsconfig.tsbuildinfo
- [unmapped-file] Unmapped changed file: wrangler.jsonc
- [edge-drift] Detected 12 edge drift candidates.
- [missing-protected-node] Protected node id missing from baseline: pkg-workers-workers

## Proposed Edge Changes

- added: pkg-app-app-route-api-internal-call-context-route-ts -> pkg-app-app-route-api-internal-extraction-retry-route-ts · route [route]
- added: pkg-app-app-route-api-internal-call-context-route-ts -> pkg-app-app-route-api-internal-questions-reorder-route-ts · route [route]
- added: pkg-app-app-route-api-internal-call-context-route-ts -> pkg-app-app-route-api-internal-transcript-route-ts · route [route]
- added: pkg-app-app-route-api-internal-call-context-route-ts -> pkg-app-app-route-api-twilio-respond-route-ts · route [route]
- added: pkg-app-app-route-api-internal-call-context-route-ts -> pkg-app-app-route-api-twilio-status-route-ts · route [route]
- added: pkg-app-app-route-api-internal-call-context-route-ts -> pkg-app-app-route-api-twilio-voice-route-ts · route [route]
- removed: pkg-app-app -> pkg-app-app-route-api-internal-extraction-retry-route-ts · route [route]
- removed: pkg-app-app -> pkg-app-app-route-api-internal-questions-reorder-route-ts · route [route]
- removed: pkg-app-app -> pkg-app-app-route-api-internal-transcript-route-ts · route [route]
- removed: pkg-app-app -> pkg-app-app-route-api-twilio-respond-route-ts · route [route]
- removed: pkg-app-app -> pkg-app-app-route-api-twilio-status-route-ts · route [route]
- removed: pkg-app-app -> pkg-app-app-route-api-twilio-voice-route-ts · route [route]

## Unmapped Files

- migrations/0001_init.sql (untracked, +28/-0)
- migrations/0002_contacts_multilingual_soft_delete.sql (untracked, +78/-0)
- migrations/0003_question_sets_questions_answers.sql (untracked, +54/-0)
- NestCall.code-workspace (untracked, +11/-0)
- open-next.config.ts (untracked, +4/-0)
- public/_headers (untracked, +5/-0)
- tsconfig.tsbuildinfo (untracked, +1/-0)
- wrangler.jsonc (untracked, +40/-0)

