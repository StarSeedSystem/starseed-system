// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
let ruta = "/escritorios";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => ruta }));

let sesion: { user: { id: string } } | null = null;
let alCambiar: ((ev: string, s: typeof sesion) => void) | null = null;
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: sesion } }),
      onAuthStateChange: (cb: (ev: string, s: typeof sesion) => void) => {
        alCambiar = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
    },
  }),
}));

const sugerirEmail = vi.fn();
const snapshot = (sesionActual: { user_id: string } | null) => ({
  deviceId: "d1",
  medioActual: "nube",
  sesionActual,
  otrasCuentas: [{ user_id: "u-alex", email: "alex@star.seed", ts: Date.now() - 60_000, medio: "navegador" }],
  medios: [],
  almacenamiento: { ok: true, dispositivos: 0, nombres: [] },
  ts: Date.now(),
});
let snap = snapshot(null);
vi.mock("@/lib/entorno/deteccion-entorno", () => ({
  detectarEntorno: async () => snap,
  ultimoEntorno: () => snap,
  sugerirEmail: (e: string) => sugerirEmail(e),
}));

import { EntornoMontaje } from "../entorno-montaje";

async function montar() {
  const r = render(<EntornoMontaje />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return r;
}

describe("EntornoMontaje · Cuenta detectada en este dispositivo", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    sesion = null; ruta = "/escritorios"; snap = snapshot(null);
    push.mockReset(); sugerirEmail.mockReset(); sessionStorage.clear();
  });

  it("sin sesión ofrece continuar como la cuenta detectada", async () => {
    await montar();
    expect(screen.getByText("Cuenta detectada en este dispositivo")).toBeTruthy();
  });

  it("«Continuar» deja el correo para el login, lleva a /login y el aviso desaparece", async () => {
    await montar();
    await act(async () => { screen.getByRole("button", { name: /Continuar como alex/ }).click(); });
    expect(sugerirEmail).toHaveBeenCalledWith("alex@star.seed");
    expect(push).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Cuenta detectada en este dispositivo")).toBeNull();
  });

  it("desaparece en cuanto se inicia sesión, aunque el snapshot guardado sea viejo", async () => {
    await montar();
    expect(screen.getByText("Cuenta detectada en este dispositivo")).toBeTruthy();
    await act(async () => { alCambiar?.("SIGNED_IN", { user: { id: "u-alex" } }); });
    expect(screen.queryByText("Cuenta detectada en este dispositivo")).toBeNull();
  });

  it("con sesión ya abierta al cargar no aparece", async () => {
    sesion = { user: { id: "u-otra" } };
    await montar();
    expect(screen.queryByText("Cuenta detectada en este dispositivo")).toBeNull();
  });

  it("en /login no aparece (el correo ya llega relleno al formulario)", async () => {
    ruta = "/login";
    await montar();
    expect(screen.queryByText("Cuenta detectada en este dispositivo")).toBeNull();
  });
});
