/**
 * recentStore — a small most-recently-used list of selected records.
 *
 * selectionStore is a FROZEN interface, so recents live here instead. The
 * CommandBar pushes an entry whenever the user picks a search result, and shows
 * the list on an empty query for quick re-access. Capped + de-duplicated (the
 * newest occurrence wins, moved to the front).
 *
 * Purely in-memory (session-scoped); no persistence by design.
 */
import { create } from 'zustand';

/** One recent selection. */
export interface RecentEntry {
  id: string;
  /** Record kind string. */
  t: string;
  /** Display name at the time of selection. */
  n: string;
}

/** Max recents kept. */
const MAX_RECENTS = 8;

export interface RecentState {
  recents: RecentEntry[];
  /** Record a selection — moves it to the front, de-duplicated, capped. */
  push: (entry: RecentEntry) => void;
  /** Clear the recents list. */
  clear: () => void;
}

export const useRecentStore = create<RecentState>((set) => ({
  recents: [],
  push: (entry) =>
    set((state) => {
      const without = state.recents.filter((r) => r.id !== entry.id);
      return { recents: [entry, ...without].slice(0, MAX_RECENTS) };
    }),
  clear: () => set({ recents: [] }),
}));
