import { create } from 'zustand';

interface UIState {
  addTitleSheetWatchlistId: string | null;
  openAddTitleSheet: (watchlistId: string) => void;
  closeAddTitleSheet: () => void;
  paywallVisible: boolean;
  paywallFeature: string | null;
  showPaywall: (feature: string) => void;
  hidePaywall: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  addTitleSheetWatchlistId: null,
  openAddTitleSheet: (watchlistId) => set({ addTitleSheetWatchlistId: watchlistId }),
  closeAddTitleSheet: () => set({ addTitleSheetWatchlistId: null }),
  paywallVisible: false,
  paywallFeature: null,
  showPaywall: (feature) => set({ paywallVisible: true, paywallFeature: feature }),
  hidePaywall: () => set({ paywallVisible: false, paywallFeature: null }),
}));
