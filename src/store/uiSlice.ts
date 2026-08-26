import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ThemeMode } from '@/theme/tokens';

export interface UiState {
  themeMode: ThemeMode;
  navCollapsed: boolean;
  /**
   * Nav groups the user has folded shut, by group key.
   *
   * Stored as the exception rather than the state of every group: a group
   * added in a later cycle is then open by default, without a migration, and
   * a group that is removed leaves a dead key that is simply never matched.
   */
  navGroupsCollapsed: string[];
}

/**
 * The MVP ships light-first; dark is persisted and wired because the token layer
 * already supports it (design-system.md §1).
 */
const initialState: UiState = {
  themeMode: 'light',
  navCollapsed: false,
  navGroupsCollapsed: [],
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    themeModeChanged: (state, action: PayloadAction<ThemeMode>) => {
      state.themeMode = action.payload;
    },
    themeToggled: (state) => {
      state.themeMode = state.themeMode === 'light' ? 'dark' : 'light';
    },
    navCollapsedChanged: (state, action: PayloadAction<boolean>) => {
      state.navCollapsed = action.payload;
    },
    navGroupToggled: (state, action: PayloadAction<string>) => {
      // Same reason as the selector in `AppShell`: a slice rehydrated from a
      // build that predates this field arrives without it.
      state.navGroupsCollapsed ??= [];
      state.navGroupsCollapsed = state.navGroupsCollapsed.includes(action.payload)
        ? state.navGroupsCollapsed.filter((key) => key !== action.payload)
        : [...state.navGroupsCollapsed, action.payload];
    },
  },
});

export const { themeModeChanged, themeToggled, navCollapsedChanged, navGroupToggled } =
  uiSlice.actions;

export default uiSlice.reducer;
