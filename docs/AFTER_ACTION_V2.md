# After-action report v2 — Milestone H

Systemic scenarios attach deterministic `systemic` data to the existing AAR. Released v0.1.0 keeps its frozen report, and the unchanged non-cohort earthquake profile retains its existing structure. AAR generation never changes the world, random streams, commands or events. No language model determines classifications, metrics or causal links.

## Overview and clinical measurements

Overview reuses the counterfactual outcome calculator: counted casualties, critical cases, actual response and EMS response times with sample counts, received acknowledgement delays, overload hospital-seconds, grid outage seconds, communication node outage service-seconds, shelter arrivals and observation-based unit utilization. Zero response observations mean no arrival, not instant response. Utilization estimates use authoritative unit observations rather than received beliefs.

Clinical hospitals record one-second sampled peak census, pending admission/handover queue and occupied ICU places, cumulative handover vehicle-seconds, overload seconds and power-emergency seconds. Previously, the displayed POWER_EMERGENCY status masked simultaneous overload. Overload now measures excess census or diversion-level queue pressure independently of power status; these durations can overlap. Complete snapshots/checkpoints/saves include the measurements. Unreleased flood content advances to 1.4.0 and systemic earthquake content to 2.3.0 to identify the changed diagnostic model. Frozen v0.1 content is untouched.

## Historical intelligence audit

Classification uses observation-time truth and separately captured receipt truth. Classes overlap:

- STALE: received after expiry or truth changed during delivery.
- FALSE: reported value differed from observation truth; this does not imply intentional deception.
- INCOMPLETE: minimum subject fields were absent, explicitly listed.
- DELAYED: observation-to-receipt exceeded 90 seconds.
- LOST: explicit LOST or EXPIRED transmission result; pending reports are not relabeled lost.
- CONFLICTED: an independent, already received source reported a different value for the same subject/kind within a 135-second observation window.
- UNCORROBORATED: a received report lacked an independent, already received matching value in that window.

Receipt event order resolves same-second arrivals. Later information cannot retroactively corroborate an earlier report, and a source cannot corroborate itself. Subject identity includes kind; numeric estimates are not blindly averaged. FALSE compares the recorded value: exact numeric observation truth is not independently retained for every estimate. Source IDs, missing fields, corroborating/conflicting report IDs and creation/truth cause IDs are inspectable. As in the existing AAR, unit reports are excluded from the intelligence audit.

## Decisions and causal graphs

Decision rows expose actual command state separately from received acknowledgement and execution events. Outcomes follow direct descendants of the issue event. Missing report-to-command links are not invented from plausible player motivations. Temporal proximity and location never create edges.

`CausalIndex` rejects duplicate events, missing/forward/self references and reversed-time edges, while accepting valid ordered same-second causes. Default critical chains are bounded to depth 10 and 80 nodes. Displayed edges always join displayed nodes; omitted frontier IDs and `truncated` expose clipping. Decision analysis is bounded to 4096 visited nodes and 40 physical outcomes, with explicit truncation. Displayed nodes are cloned to protect history.

Counterfactual comparison now includes actual admission/recovery evidence alongside changed origin death counts. It also compares counted recoveries, shelter arrivals, incident resolution and power restoration by stable population origin or incident/infrastructure identity, including first occurrence times. The top 12 changed outcomes retain real event IDs and bounded causal chains from each independent timeline. Missing outcomes have no fabricated events.

## Validation

Seven new audit/graph tests cover all classes, receipt prefixes, independent-source identity, graph bounds, invalid edges, unrelated nearby events, AAR purity and exact cold-replay equality for both hazards. A clinical regression checks simultaneous power emergency/overload and preserved peaks. The first audit assertion omitted STALE for a report arriving after expiry; the implementation correctly classified it and the expectation was corrected without dropping the check.

The full 96-test suite passed in 89.01 seconds. After expanding changed causal outcomes, all 16 affected branch/AAR tests passed again in 9.48 seconds. Typecheck, lint and production build passed. The actual showcase on flood 1.4.0 passed its recovery-chain assertion, repeat fork, cold replay, save/reopen and parent immutability checks: 901 versus 897 deaths, four recoveries, and zero overload duration in either timeline. Evidence is in `qa/after-action-showcase.json`; original simulation took 4.29 seconds for 2400 ticks and branch simulation took 2.60 seconds on this probe. Final 200-seed, GUI and Windows package gates remain separate release requirements.
