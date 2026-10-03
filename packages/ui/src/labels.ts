import type { Agency } from "../../domain/src/index";
export const agencyNames: Record<Agency, string> = {
  FIRE: "消防",
  EMS: "緊急醫療",
  POLICE: "警察",
  UTILITY: "公用事業",
};
export const incidentNames: Record<string, string> = {
  FIRE: "建築火災",
  BUILDING_COLLAPSE: "建物倒塌",
  MASS_CASUALTY: "大量傷患",
  ROAD_BLOCKAGE: "道路阻斷",
  POWER_FAILURE: "供電中斷",
  COMMUNICATION_FAILURE: "通訊故障",
  FLOOD: "區域淹水",
  STRANDED_CIVILIANS: "居民受困",
};
export const statusNames: Record<string, string> = {
  AVAILABLE: "待命",
  HANDOVER: "院方交接中",
  DOWN: "離線",
  STRAINED: "醫療緊繃",
  OVER_CAPACITY: "超過容量",
  DIVERTING: "分流中",
  POWER_EMERGENCY: "供電緊急",
  DISPATCHED: "受令",
  EN_ROUTE: "前往中",
  OPERATING: "作業中",
  RETURNING: "返回中",
  DISABLED: "無法執行",
  SENT: "已送出・等待回覆",
  RECEIVED: "已接收",
  ACKNOWLEDGED: "已確認",
  FAILED: "失敗",
  PENDING: "待執行",
  EXECUTING: "執行中",
  COMPLETED: "完成",
  NORMAL: "正常",
  DEGRADED: "降級",
  OFFLINE: "離線",
  BLOCKED: "封閉",
  DISPATCH_UNIT: "派遣",
  REASSIGN_UNIT: "改派",
  RECALL_UNIT: "召回",
  REQUEST_STATUS: "查詢狀態",
  SET_INCIDENT_PRIORITY: "設定優先序",
  EVACUATE_ZONE: "疏散區域",
};
export const color: Record<string, number> = {
  FIRE: 0xe87944,
  EMS: 0x63b2e5,
  POLICE: 0x739bd0,
  UTILITY: 0xd5b75b,
};
export function duration(n: number) {
  return `${Math.floor(n / 60)}分 ${n % 60}秒`;
}
