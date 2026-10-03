# v0.2.1 — 2.5D Emergency Command Map

Project AEGIS 的地圖視覺升級：保留原有 Pixi 與俯視 XY 指揮介面，加入有高度的建築量體、固定光影、四區城市形態、立體橋梁／河岸，以及醫院、消防、EMS、警察、公用事業、變電站、通訊與市政地標。

車輛、路線、事件、淹水及基礎設施警示維持只使用已接收情報。靜態城市採三層有界 LOD 快取；相機操作立即繪製，收到新情報時合併重繪，閒置額外繪製為零。模擬規則、平衡、seed、存檔格式、replay 與 simulationVersion 都維持 v0.2.0。

驗證：117／117 測試（原有 103 項加 14 項地圖測試），lint、typecheck、production build 通過；原有 golden 未修改。實際 Windows 封裝版與 portable 各在 NVIDIA GPU／SwiftShader 通過地震、洪水、1920×1080、1600×900、1366×768 的互動測試；存檔、AAR、替代決策分支、checkpoint seek 皆通過。完整測量、失敗嘗試與畫面見 [MAP_25D_UPGRADE.md](MAP_25D_UPGRADE.md)。

已知限制：這是 2.5D 建築量體，光影與煙塵為靜態視覺；SwiftShader 比 GPU 慢，晚期洪水的大量事件牌仍可能擁擠。裝飾建築面不是新的遊戲互動物件。Windows executable 未簽章。

Windows portable：`AEGIS-0.2.1-Windows-x64.exe`，100,366,977 bytes（95.72 MiB）。

SHA-256：`7FB5155E0DB785BC0B299FB1CFE429F087D4B17E7BB292BDABF95C5D4E491A81`

此版本為 private release。保留 v0.1.0 與 v0.2.0 的既有 tags、assets 與存檔相容性。
