import { create } from 'zustand';
import type { User } from '../types/domain';
interface UI {
  user: User | null;
  importOpen: boolean;
  paletteOpen: boolean;
  setUser: (v: User | null) => void;
  setImport: (v: boolean) => void;
  setPalette: (v: boolean) => void;
}
export const useUI = create<UI>((set) => ({
  user: null,
  importOpen: false,
  paletteOpen: false,
  setUser: (user) => set({ user }),
  setImport: (importOpen) => set({ importOpen }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
}));
