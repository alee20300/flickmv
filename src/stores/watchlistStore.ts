import { create } from 'zustand';
import type { DbWatchlistItem } from '../types/database';

interface WatchlistStore {
  reorderingItems: Record<string, DbWatchlistItem[]>;
  setReorderingItems: (watchlistId: string, items: DbWatchlistItem[]) => void;
  clearReorderingItems: (watchlistId: string) => void;
}

export const useWatchlistStore = create<WatchlistStore>((set) => ({
  reorderingItems: {},
  setReorderingItems: (watchlistId, items) =>
    set((state) => ({
      reorderingItems: { ...state.reorderingItems, [watchlistId]: items },
    })),
  clearReorderingItems: (watchlistId) =>
    set((state) => {
      const next = { ...state.reorderingItems };
      delete next[watchlistId];
      return { reorderingItems: next };
    }),
}));
