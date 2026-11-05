import React, { createContext, useContext, ReactNode, useState } from "react";
import { AppearanceConfig, defaultConfig } from "@/context/appearance-context";
import { ThemeProvider } from "next-themes";

// Mock window.matchMedia for next-themes
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Create a mock AppearanceContext that matches the real one
const MockAppearanceContext = createContext<{
  config: AppearanceConfig;
  updateConfig: (updates: Partial<AppearanceConfig>) => void;
  resetConfig: () => void;
  updateSection: <K extends keyof AppearanceConfig>(section: K, data: Partial<AppearanceConfig[K]>) => void;
  addCustomFont: (font: any) => void;
  removeCustomFont: (name: string) => void;
  saveTheme: (name: string) => void;
  loadTheme: (id: string) => void;
  deleteTheme: (id: string) => void;
  exportTheme: () => void;
  importTheme: (file: File) => Promise<void>;
  undo: () => void;
  canUndo: boolean;
  bgScopeMode: "cuenta" | "perfil" | "pagina";
  setBgScopeMode: (mode: "cuenta" | "perfil" | "pagina") => void;
  bgScopeHasOverride: boolean;
  clearBackgroundScope: () => void;
  bgScopePath: string;
  bgScopeProfileId: string | null;
} | null>(null);

// Mock the useAppearance hook to use our mock context
const mockConfig = defaultConfig;
const mockValue = {
  config: mockConfig,
  updateConfig: () => {},
  resetConfig: () => {},
  updateSection: () => {},
  addCustomFont: () => {},
  removeCustomFont: () => {},
  saveTheme: () => {},
  loadTheme: () => {},
  deleteTheme: () => {},
  exportTheme: () => {},
  importTheme: async () => {},
  undo: () => {},
  canUndo: false,
  bgScopeMode: "cuenta" as const,
  setBgScopeMode: () => {},
  bgScopeHasOverride: false,
  clearBackgroundScope: () => {},
  bgScopePath: "/",
  bgScopeProfileId: null,
};

// Mock the entire appearance-context module
vi.mock("@/context/appearance-context", () => ({
  AppearanceProvider: ({ children }: { children: ReactNode }) => (
    <MockAppearanceContext.Provider value={mockValue}>{children}</MockAppearanceContext.Provider>
  ),
  useAppearance: () => mockValue,
  AppearanceConfig: {} as any,
  defaultConfig: mockConfig,
  OsThemeId: {} as any,
  DeepPartial: {} as any,
}));

export function TestThemeProvider({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>{children}</ThemeProvider>;
}

export function renderWithProviders(
  ui: React.ReactElement,
  options?: { wrapper?: React.FC<{ children: ReactNode }> }
) {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <TestThemeProvider>
      {children}
    </TestThemeProvider>
  );
  return { wrapper: options?.wrapper ?? Wrapper };
}