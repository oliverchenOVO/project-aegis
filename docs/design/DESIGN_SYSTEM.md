# Command center design contract

Reference: `command-center-concept.png` (1664×941, built-in ImageGen). Full application surface: resource rail, map, intel and incident inspector, command queue, restrained header. UI copy originates from the Phase 1 specification; Chinese localization used throughout.

Tokens: background #10151b; surface #151d25; borders #2d3d4b; muted #8a9eaf; command blue #8cc4ea; emergency orange #ec935b; text #d4dce4. No gradients or neon. Segoe UI / Microsoft JhengHei, 13px body, 16px panel titles, 11px dense rows. 4px corner radii, 8–14px panel gutters. Lucide outline icons for commands/agencies; schematic vector symbols on the map. Desktop rails 238px and 320px; flexible map, narrower at 1366px.

Required states extend the same system: scenario menu, report details, dispatch checklist, AAR, read-only replay, load errors, leave confirmation. Static cartography is code-native intentionally: roads and selectable symbols must match the actual scenario graph and observed locations. The conceptual buildings are represented by low saturation vector blocks; no raster screenshot ships as interactive UI. This functional cartographic requirement takes priority over copying the concept's artist-invented road geometry.

Intentional concept corrections: omit artist-invented calendar date, settings/profile icons, fake per-unit task dropdowns and automatic knowledge of casualty totals. The simulation clock starts at 14:00:00; every command, report and count is real. Include keyboard accessible resource and report rows, optional layer toggles and manual tick advancement to support the specified QA and replay workflow. No truth mode is enabled in normal play.
