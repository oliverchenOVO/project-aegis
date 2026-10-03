# Project AEGIS — Phase 1 驗收報告

## 實作範圍

Electron / TypeScript 桌面應變指揮中心，包含一個 30 分鐘的虛構都市地震情境。純模擬核心使用固定 tick、分流 seeded RNG、路網尋路與因果事件。消防、救護、警察、公用事業共 18 個單位；火勢、建物損害、道路封閉、傷患惡化、醫院治療、電力與通訊互相影響。改派與召回保留已進入道路的行進進度。

情報具有觀測時間、送達時間、來源、可靠度、遺失與延遲；UI 只接收公開 DTO，正常遊玩無法取得世界真值。情報可陳舊、矛盾或交叉佐證。展示 seed `AEGIS-2026-001` 的醫院發電機報告在途中變得陳舊，AAR 以觀測與送達時的真實狀況說明原因。

五種命令支援排隊、通訊處理、確認、執行及失敗。Pixi 地圖顯示實際路網、已知事件與最後回報的單位位置，提供圖層、縮放及平移。完成後提供 AAR、因果時間軸、逐筆情報審計，以及完整校驗後的唯讀重播與定位。

重播每 300 ticks 記錄 canonical state hash，驗證結果、事件序列與 AAR。`.aegis` ZIP 包含 manifest、scenario、snapshot、commands 與 events；載入先驗證版本、schema、引用與重播一致性，再原子替換 session。毀損存檔保留目前進度。

## 自動測試與效能

- Lint、TypeScript typecheck、production build 通過。
- Vitest：6 個測試檔、25 項測試通過，涵蓋單元、整合、情報隔離、命令後果、決定性、重播、存讀檔與自然結束。
- 100 個固定 seed：100 完成，0 crashes、0 invariant failures、0 replay mismatches；最大事件數 4,008。
- 本機最後一次測量平均 **3,028.82 ticks/sec**；p95 每個 seed 的模擬執行時間 **933.13 ms**，包含定期不變量與 checkpoint 檢查，不包含隨後完整重播的時間。這是測試程序的量測，受到同時執行的打包工作影響，並非畫面 FPS。
- 詳細數據：[benchmark.json](qa/benchmark.json)。CLI 支援 `pnpm benchmark 1000`；本次 release 驗收採指定的 100 seeds。

驗收中曾發現並修復：Pixi 在嚴格 CSP 下的初始化問題、測試錯誤假設情報必須在第一分鐘送達、Electron 套件未自動安裝執行環境，以及 F 槽目錄 rename／copy 與測試程序鎖住成品的問題。打包改為本機暫存目錄產生、原生 PowerShell 複製並檢查成品；測試完成後關閉自己的程序。CI 早期 Windows build 失敗已修正；正式 release 以修正版通過結果為準。

## 桌面與視覺 QA

完整流程涵蓋實際桌面啟動、主選單、地震、接收情報、派遣、命令確認、單位路線、地圖縮放、原生存讀檔橋接、毀損檔案、自然結束、AAR、驗證重播、定位與即時播放／暫停。測試用指定路徑替代檔案選擇對話框，仍走實際 IPC、磁碟讀寫與存檔校驗。

檢查 1920×1080、1600×900、1366×768、概念原生尺寸 1664×941，另檢查 700×900 水平溢位。指揮中心以桌面為主要操作尺寸。

內建瀏覽器先行檢查時工具逾時，後續使用 Playwright 操作真實 Electron 執行檔。Portable 驗收另啟動自解壓縮 `.exe`，透過僅供 QA 啟用的本機 debugging port 操作其實際視窗；一般啟動不啟用該連接埠。

與 [概念圖](design/command-center-concept.png) 的 fidelity ledger：

| 比對項目   | 實作與檢查結果                                                                       |
| ---------- | ------------------------------------------------------------------------------------ |
| 整體配置   | 左資源列、中央地圖、右情報與派遣、底部命令佇列，保留指揮中心層級                     |
| 色彩       | 深灰底、低彩度藍與緊急橘；沒有霓虹或裝飾漸層                                         |
| 字體       | Segoe UI / 微軟正黑體，小字資訊列與清楚面板標題                                      |
| 圖示       | Lucide 線條圖示，實際單位與地圖符號保持類型辨識                                      |
| 間距       | 緊湊面板、細邊界；派遣按鈕固定於滾動清單下方                                         |
| 狀態與文案 | 呈現真實時間、送達狀態與情報年齡，沒有虛構 API 連線或傷亡總數                        |
| 刻意偏離   | 地圖由真實 scenario graph 繪製；省略概念圖中虛構日期、設定／個人圖示與無功能下拉選單 |

## 實際限制與下一階段

目前只有都市地震情境；災害與醫療是彙總模型，尚未建模每位市民的行為。重播定位從起點重新計算；存檔僅支援目前版本，跨版本 migration 留待後續。Phase 1 不包含 LLM API、語音、3D 或反事實分支。Windows 成品使用預設 Electron 圖示，未作程式碼簽章。

Phase 2 建議先加入第二種災害與 checkpoint seek，建立跨版本存檔策略，再擴展個體市民與通訊敘事；持續維持情報隔離、seeded RNG 及重播雜湊契約。

## Build、Git 與發佈

**Phase 1 驗收通過。** 最終 Windows packaged build 與 production build 皆 exit 0；成品完整桌面流程 15 組檢查通過、無 console error／warning，實際 Portable 自解壓啟動與派遣確認通過、無 page error。

- 成品：`F:\CodeX開發小東東\AI 災難指揮中心\release\AEGIS-0.1.0-Windows-x64.exe`
- 大小：510,653,100 bytes（約 487 MiB）；使用 store 壓縮設定，優先降低打包耗時。
- SHA-256：`DB429DDA69229E9E8A5652A95B7DF96E519F11AFB0BCAD0C9E0735A55348FE28`
- Branch：`main`；最新實作 commit：`a8e2e1c72dbed18dcee4807a97ddf86f4ca829de`。最終文件與 QA 證據 commit 由不可變 release tag `v0.1.0^{commit}` 識別，可用 `git rev-parse v0.1.0` 取得完整 SHA。
- [最終實作 CI](https://github.com/oliverchenOVO/project-aegis/actions/runs/37108829908)：Linux core、Windows package／desktop smoke 全數成功。
- [Private GitHub repository](https://github.com/oliverchenOVO/project-aegis)；實作與交付文件已提交並推送，工作樹乾淨。
- Release／tag：[`v0.1.0`](https://github.com/oliverchenOVO/project-aegis/releases/tag/v0.1.0)，附 Windows Portable 成品。

證據：[桌面 QA 紀錄](qa/desktop-smoke.json)、[Portable 啟動紀錄](qa/portable-launch.json)、[指揮中心畫面](qa/command-center.png)、[AAR 畫面](qa/aar.png)。實際原生尺寸畫面與概念圖已並列檢視，以上 fidelity ledger 記錄了比對與刻意偏離。
