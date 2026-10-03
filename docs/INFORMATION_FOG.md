# Information fog

The chain is `World Fact → Observation → Report → Transmission → Knowledge → Public View`. The authoritative engine lives in a dedicated Web Worker. React imports a narrow `CommandPort` and received DTOs, and never imports the simulation or snapshot models.

Reports record source, subject, observed tick, transmission tick, received tick, expiry, observation confidence and source reliability. The engine stores an audit reference to the fact at observation and at receipt. These references and undelivered/lost reports are omitted from normal views. Civilian observations can estimate intensity inaccurately; a delayed, previously true report is a different failure category.

The knowledge projection uses the newest **observation time**, not simply arrival order. Older delayed reports therefore cannot overwrite a newer observation. Independent sources within 135 seconds add corroboration; incompatible claims remain visible as conflicts. Confidence combines observation quality, source reliability, corroboration, conflict and aging. A normal view only identifies age-based staleness; it cannot magically know that an unseen fact has changed. AAR can additionally identify truth changes during transmission after the scenario finishes.

## Showcase

The shared `AEGIS-2026-001` seed demonstrates Hospital B observing its operational generator at tick 180 and receiving that report at tick 360. The generator fails between those ticks. No seed-specific branch exists in the engine. Scenario initial fuel, power damage and normal seeded communications produce this sequence. Inspect source, observed/received time and report age in the live panel. AAR's per-report audit explicitly distinguishes correct-at-observation from stale-at-arrival, with a replay link.

Radio modes normal / degraded / offline determine report delays, losses and command delays. Command transport and report transport are independent. An acknowledged dispatch does not imply its field-position report has arrived. Unit markers show last received location; an old position is labeled with observation age.

Initial unit status reports are a legitimate pre-event roster at tick zero. Static roads, hospitals, bases and jurisdiction labels are public cartography. Incident severity, road damage, hospital power, current patient loads and actual casualties remain hidden until observed; casualty totals are disclosed only in AAR.
