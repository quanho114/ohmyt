# SDD ledger — plan: docs/superpowers/plans/2026-10-02-lobehub-appearance.md

Spec: docs/superpowers/specs/2026-10-02-lobehub-appearance-design.md approved; plan approved via ask, Native selected.
Ruling: work in current folder without git/worktree/task-start scripts — Git absence already observed; approved plan explicitly prohibits git init — cost if wrong: no git-backed rollback, preserve only scoped edits.
Pre-flight: Tasks 1→2/3/4/5 share Appearance enum/prop contract; consistent.
Pre-flight: Task 3→4/5 share ContentBlock props; consistent.
Pre-flight: Task 4→5 keeps ChatStage mounted so scroll/draft/tool manual choices survive; consistent.
Ruling: test UI via actual browser smoke, do not add source/wording/wiring assertions — developer workflow overrides broad skill test-per-function prescription — cost if wrong: interaction coverage depends on recorded smoke.
Design read: reference-led product settings, neutral monochrome defaults, variance 2 / motion 2 / density 5; maintain system font, existing lucide and native controls. Marketing-page skill is outside this surface, no new UI framework.
Task 1: started; no product edits yet.
Task 1: complete core state — test/test_appearance.js missing module RED → normalization/legacy/locale GREEN; real browser click Dark + reload retains data-theme and stored object. Storage failure/palette surface checks remain in final smoke.
Ruling: preserve externally added stats tab and latest Home/Sidebar changes — user changes observed in fresh snapshots — cost if wrong: additional live section must stay localized/integrated rather than deleting it.
Task 2: started; API boundary and real system context.
Task 2: complete — isolated HTTP test RED 202 vs 400 → GREEN; real AgentLoop context probe retained base/security instructions, auto no section, vi/en appropriate instruction. Browser model output remains final smoke.
Task 3: started — installed highlight.js and mermaid successfully; shared renderer next.
Paused by user request after Task 2 checkpoint; no further product edits until user resumes.
Task 3: partial — ContentBlock created, ChatMessage CodeBlock deleted/migrated, props threaded through ChatStage/App, code-theme CSS added. Unsafe plain source/whitespace SSR regression GREEN. Mermaid browser/security/theme race/copy NOT exercised.
Task 4: partial — AppearanceSettings and settingsLocale created; LSP renamed SettingsDialog/file to SettingsPage; App keeps workspace mounted hidden/inert and tracks opener; full-page settings/CSS written. ProviderSettings locale prop not implemented yet; StatisticsSettings and remaining engine UI labels not translated. Build/typecheck/new-page smoke NOT run. Obsolete modal/source-text tests still present and must be removed per plan.
Task 5: pending — actual auto-scroll/tool expansion/menu/link icons/response animation; final acceptance smoke, full checks, usage/design docs.
Final independent review: pending.
Ruling: static Mermaid import replaces lazy import literal — project rule ts-no-dynamic-import authoritative — cost: larger startup dependency graph. Top-level import type required for type-only dependencies.
Known resume details: SettingsPage currently passes locale to ProviderSettings but its props contract lacks it; complete before build. Keep user-added stats and Home/Sidebar changes. Task 2 raw-prompt DB assertion and real-provider output observation remain acceptance checks, not claimed verified.
Verification observed: test_appearance GREEN after renderer creation; test_e2e_suite GREEN after language validation; browser old settings theme switch/reload GREEN. No full build, typecheck, suite, new settings UI or Mermaid security proof yet.
Resume: fresh read changed files → finish Task 3/4 → Task 5 → independent review. Do not recreate completed state/language implementation.
