/**
 * Pruebas del puente de Genesis al panel «Mis bots» (BOT1011I1, montaje).
 * jsdom, sin red: supabase se simula; localStorage es el almacén real.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u-1" } } }) },
  }),
}));

import { SeccionBotsGenesis } from "../../genesis/seccion-bots";

describe("SeccionBotsGenesis", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("monta el PanelBots con la sesión y lista el bot predeterminado", async () => {
    render(<SeccionBotsGenesis />);
    await waitFor(() => expect(screen.getByText("Astraura")).toBeTruthy());
    expect(screen.getByText(/Astraura local · activo/)).toBeTruthy();
  });
});
