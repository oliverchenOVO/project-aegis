import { create } from "zustand";
export type Layer =
  | "INCIDENTS"
  | "UNITS"
  | "MEDICAL"
  | "POWER"
  | "COMMS"
  | "TRAFFIC"
  | "FLOOD"
  | "CIVILIANS"
  | "INTELLIGENCE";
interface UIState {
  selected?: string;
  speed: number;
  paused: boolean;
  layers: Layer[];
  select: (id?: string) => void;
  setSpeed: (speed: number) => void;
  setPaused: (paused: boolean) => void;
  toggleLayer: (layer: Layer) => void;
}
export const useUI = create<UIState>((set) => ({
  selected: undefined,
  speed: 1,
  paused: true,
  layers: [
    "INCIDENTS",
    "UNITS",
    "MEDICAL",
    "POWER",
    "COMMS",
    "TRAFFIC",
    "FLOOD",
    "CIVILIANS",
    "INTELLIGENCE",
  ],
  select: (selected) => set({ selected }),
  setSpeed: (speed) => set({ speed }),
  setPaused: (paused) => set({ paused }),
  toggleLayer: (layer) =>
    set((s) => ({
      layers: s.layers.includes(layer)
        ? s.layers.filter((l) => l !== layer)
        : [...s.layers, layer],
    })),
}));
