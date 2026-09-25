import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

/* ── Todo lo que sale a la red o al navegador se sustituye ─────────────────── */

const m = vi.hoisted(() => ({
    usuario: null as null | { id: string; email: string },
    neuronas: [] as unknown[],
    sincronizarBiblioteca: vi.fn(async () => undefined),
    sincronizarInstalaciones: vi.fn(async () => []),
    sincronizarAjustes: vi.fn(async () => ({ applied: 3, pushedBack: 0 })),
    mergeUserPrefs: vi.fn(async () => ({ ok: true, atomic: true })),
    setPermission: vi.fn(),
}));

vi.mock("@/context/appearance-context", () => ({
    useAppearance: () => ({ config: { themeStore: { activeMode: "default" }, styling: { crystalPreset: "none" } } }),
}));
vi.mock("@/context/account-context", () => ({
    useAccount: () => ({ user: m.usuario, loading: false }),
}));
vi.mock("@/utils/supabase/client", () => ({
    createClient: () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
        auth: { getUser: async () => ({ data: { user: m.usuario } }) },
    }),
}));
vi.mock("@/lib/sync/user-prefs", () => ({ mergeUserPrefs: m.mergeUserPrefs }));
vi.mock("@/lib/library-sync", () => ({ syncNow: m.sincronizarBiblioteca }));
vi.mock("@/lib/instalaciones/instalaciones-store", () => ({
    sincronizarInstalaciones: m.sincronizarInstalaciones,
    useInstalaciones: () => [],
}));
vi.mock("@/lib/sync/realtime-sync", () => ({
    onRealtimeSyncStatus: (cb: (s: { state: string }) => void) => {
        cb({ state: "connected" });
        return () => true;
    },
    syncNow: m.sincronizarAjustes,
}));
vi.mock("@/lib/neurons/neurons", () => ({
    NEURON_EVENT: "starseed:neurons",
    listNeurons: async () => m.neuronas,
    thisDeviceId: () => "este",
    setPermission: m.setPermission,
    setNeuronName: vi.fn(),
    removeNeuron: vi.fn(async () => true),
}));
vi.mock("@/lib/profiles/profiles", () => ({
    useActiveProfile: () => ({ profile: null, profiles: [], loading: false, setActive: vi.fn() }),
    profileKindLabel: () => "Personal",
    profileKindHint: () => "",
}));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { MiPuenteDeMando } from "../mi-puente-de-mando";

beforeEach(() => {
    window.localStorage.clear();
    m.usuario = null;
    m.neuronas = [];
    Object.values(m).forEach((v) => {
        if (typeof v === "function" && "mockClear" in v) (v as { mockClear: () => void }).mockClear();
    });
});

afterEach(() => cleanup());

const neurona = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    name: id === "este" ? "Mi Mac" : "Móvil",
    kind: id === "este" ? "laptop" : "mobile",
    capabilities: { platform: id === "este" ? "macOS" : "Android", ollama: id === "este" },
    permissions: { compute: true, storage: true, sync: true, agent: true, senses: true, wake: true },
    online: id === "este",
    isThisDevice: id === "este",
    last_seen_at: new Date().toISOString(),
    ...extra,
});

describe("Mi Puente de Mando", () => {
    it("pinta las siete páginas como pestañas accesibles y abre Inicio", async () => {
        render(<MiPuenteDeMando />);
        const lista = screen.getByRole("tablist", { name: "Páginas de Mi Puente de Mando" });
        const tabs = within(lista).getAllByRole("tab");
        expect(tabs.map((t) => t.textContent)).toEqual([
            expect.stringContaining("Inicio"),
            "Dispositivos",
            "Apps",
            "Archivos y sincronización",
            "Perfiles",
            "Privacidad y seguridad",
            "Personalizar",
        ]);
        expect(tabs[0]).toHaveAttribute("aria-selected", "true");
        const panel = screen.getByRole("tabpanel");
        expect(panel).toHaveAttribute("aria-labelledby", tabs[0]?.id);
        expect(await within(panel).findByRole("heading", { name: "Inicio" })).toBeInTheDocument();
    });

    it("sin sesión avisa e invita a iniciar sesión (con un enlace real)", async () => {
        render(<MiPuenteDeMando />);
        expect(await screen.findByText(/No has iniciado sesión: solo ves este dispositivo/)).toBeInTheDocument();
        const enlaces = screen.getAllByRole("link", { name: /Iniciar sesión/ });
        expect(enlaces[0]).toHaveAttribute("href", "/login");
    });

    it("las flechas mueven entre páginas y la página se carga al abrirla", async () => {
        m.usuario = { id: "u1", email: "ana@example.org" };
        m.neuronas = [neurona("este"), neurona("otro")];
        render(<MiPuenteDeMando />);
        const lista = screen.getByRole("tablist", { name: "Páginas de Mi Puente de Mando" });
        fireEvent.keyDown(lista, { key: "ArrowRight" });
        const dispositivos = screen.getByRole("tab", { name: "Dispositivos" });
        expect(dispositivos).toHaveAttribute("aria-selected", "true");
        expect(dispositivos).toHaveFocus();
        expect(await screen.findByRole("heading", { name: "Mi Mac" })).toBeInTheDocument();
        expect(screen.getByText("Este dispositivo")).toBeInTheDocument();
        expect(screen.getAllByText("Ollama").length).toBeGreaterThan(0);
        // Este dispositivo no se puede quitar desde aquí; el otro sí.
        expect(screen.getAllByRole("button", { name: /Quitar de la cuenta/ })).toHaveLength(1);
    });

    it("un permiso se cambia con su interruptor y se anuncia el resultado", async () => {
        m.usuario = { id: "u1", email: "ana@example.org" };
        m.neuronas = [neurona("este")];
        render(<MiPuenteDeMando />);
        fireEvent.click(screen.getByRole("tab", { name: "Dispositivos" }));
        const interruptor = await screen.findByRole("switch", { name: "Agentes" });
        fireEvent.click(interruptor);
        expect(m.setPermission).toHaveBeenCalledWith("este", "agent", false);
        await waitFor(() => expect(screen.getAllByRole("status").some((s) => /Agentes desactivado/.test(s.textContent ?? ""))).toBe(true));
    });

    it("Sincronizar ahora usa los tres canales y guarda la hora", async () => {
        m.usuario = { id: "u1", email: "ana@example.org" };
        render(<MiPuenteDeMando />);
        const boton = await screen.findByRole("button", { name: /Sincronizar ahora/ });
        await act(async () => {
            fireEvent.click(boton);
        });
        await waitFor(() => expect(m.sincronizarAjustes).toHaveBeenCalledTimes(1));
        expect(m.sincronizarBiblioteca).toHaveBeenCalledTimes(1);
        expect(m.sincronizarInstalaciones).toHaveBeenCalledTimes(1);
        await waitFor(() => expect(window.localStorage.getItem("starseed.mi-mando.ultima-sync.v1")).not.toBeNull());
        expect(await screen.findByText(/Sincronización completa/)).toBeInTheDocument();
    });

    it("Personalizar oculta una página, la guarda y la quita de las pestañas al salir", async () => {
        m.usuario = { id: "u1", email: "ana@example.org" };
        render(<MiPuenteDeMando />);
        fireEvent.click(screen.getByRole("tab", { name: "Personalizar" }));
        fireEvent.click(await screen.findByRole("button", { name: "Ocultar Apps" }));
        const guardado = JSON.parse(window.localStorage.getItem("starseed.mi-mando.ajustes.v1") ?? "{}") as { ocultas?: string[] };
        expect(guardado.ocultas).toEqual(["apps"]);
        expect(screen.queryByRole("tab", { name: "Apps" })).not.toBeInTheDocument();
        // Inicio no ofrece ocultarse.
        expect(screen.queryByRole("button", { name: "Ocultar Inicio" })).not.toBeInTheDocument();
        // Con sesión, se sube a la cuenta agrupando los cambios.
        await waitFor(() => expect(m.mergeUserPrefs).toHaveBeenCalledWith({ miMando: expect.objectContaining({ ocultas: ["apps"] }) }, { userId: "u1" }), {
            timeout: 2000,
        });
    });
});
