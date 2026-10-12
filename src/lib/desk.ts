import { create } from "zustand";
import type { ScanResult } from "./market.functions";

const KEY = "scannerstock-last";

type Desk = {
  result: ScanResult | null;
  ready: boolean;
  setResult: (result: ScanResult) => void;
  hydrate: () => void;
};

export const useDesk = create<Desk>((set, get) => ({
  result: null,
  ready: false,
  setResult: (result) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(result));
    } catch {
      /* private mode */
    }
    set({ result, ready: true });
  },
  hydrate: () => {
    if (get().ready) return;
    try {
      const raw = localStorage.getItem(KEY);
      const result = raw ? (JSON.parse(raw) as ScanResult) : null;
      set({ result, ready: true });
    } catch {
      set({ ready: true });
    }
  },
}));
