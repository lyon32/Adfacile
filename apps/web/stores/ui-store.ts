// Préférences d'affichage non stockées sur le serveur (LLD §7.4). Rien qui existe déjà au serveur :
// ni la langue ni le thème (profil), ni les données.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UiState {
  sidebarCollapsed: boolean;
  statsChartRange: '7d' | '30d';
  toggleSidebar(): void;
  setStatsChartRange(range: UiState['statsChartRange']): void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      statsChartRange: '7d',
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      setStatsChartRange: (range) => {
        set({ statsChartRange: range });
      },
    }),
    {
      name: 'pubeka-ui',
      // Seules les valeurs sont gardées, jamais les fonctions.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        statsChartRange: state.statsChartRange,
      }),
    },
  ),
);
