# Project AEGIS v0.1.0

Phase 1 都市地震指揮模擬：透過延遲、陳舊與互相矛盾的情報，在有限資源下派遣消防、救護、警察與公用事業單位。

包含 deterministic simulation、真實路網尋路、五種命令、情報迷霧、`.aegis` 存讀檔、AAR 因果與情報審計，以及每 300 ticks 雜湊校驗的唯讀重播。

驗收：25 項測試通過；100 seeds 完成，0 crashes、0 invariant failures、0 replay mismatches。Linux 核心與 Windows 打包／桌面流程 CI 通過；本機實際 Portable 啟動及成品完整流程通過。

下載 `AEGIS-0.1.0-Windows-x64.exe`，直接執行即可開始。遊玩不需要 API key、網路、Unity 或 Blender。此成品未作程式碼簽章。

目前提供一個 30 分鐘的都市地震情境，採彙總災害／醫療模型。存檔支援本版本；重播定位從起點重新計算。詳細 QA 證據、已修正問題與限制見 `docs/PHASE1_REPORT.md`。
