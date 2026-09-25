import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider } from "@/context/appearance-context";
import type { DestinoInstalacion } from "@/lib/instalaciones/destinos";
import { NATIVE_TAG, NATIVE_VERSION } from "@/lib/version/os-release";
import type { AccionInstalacion } from "@/lib/instalaciones/plan";
import type { DatosInstalacion } from "../use-datos-instalacion";

const est = vi.hoisted(() => ({
    datos: null as unknown as DatosInstalacion,
    guardados: [] as DestinoInstalacion[],
    acciones: [] as AccionInstalacion[],
    webAbierta: "",
}));

vi.mock("../use-datos-instalacion", () => ({ useDatosInstalacion: () => est.datos }));

vi.mock("@/lib/apps-oficiales/dispositivo-actual", () => ({
    useDispositivoActual: () => ({ sistema: "android", arquitectura: "arm64" }),
    esAppNativa: () => false,
}));

vi.mock("@/lib/apps-oficiales/ultima-version", async () => {
    const real = await vi.importActual<typeof import("@/lib/apps-oficiales/apps-oficiales")>("@/lib/apps-oficiales/apps-oficiales");
    return {
        useUltimaVersion: (id: string) => {
            const app = real.APPS_OFICIALES[id];
            return app
                ? { release: app.respaldo, instalables: real.instalables(app.respaldo.assets), origen: "github", cargando: false }
                : { release: null, instalables: [], origen: "respaldo", cargando: false };
        },
    };
});

vi.mock("@/lib/instalaciones/instalaciones-store", () => ({
    useInstalaciones: () => [],
    guardarDestinos: (d: DestinoInstalacion[]) => {
        est.guardados.push(...d);
    },
}));

vi.mock("@/lib/instalaciones/ejecutar", () => ({
    ejecutarAcciones: (_app: unknown, acciones: AccionInstalacion[]) => {
        est.acciones.push(...acciones);
        return { descargaIniciada: acciones.some((a) => a.tipo === "descargar"), errores: [] };
    },
    abrirWebParaInstalar: (web: string) => {
        est.webAbierta = web;
    },
}));

vi.mock("@/lib/storage/carpetas-vinculadas", () => ({
    agregarCarpetaDispositivo: async () => null,
    soportaCarpetasDispositivo: () => false,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DialogoInstalar } from "../dialogo-instalar";
import { appPorId } from "@/lib/instalaciones/plan";

function datos(parcial: Partial<DatosInstalacion> = {}): DatosInstalacion {
    return {
        cargando: false,
        sesion: true,
        estaNeurona: { id: "yo", nombre: "Móvil de Alex" },
        otras: [
            {
                id: "mac",
                name: "MacBook",
                kind: "laptop",
                capabilities: { platform: "macOS" },
                permissions: { sync: true } as DatosInstalacion["otras"][number]["permissions"],
                online: true,
            },
        ],
        perfiles: [
            {
                id: "p-arte",
                account: "u",
                handle: null,
                name: "Arte",
                kind: "tematico",
                categories: [],
                avatarUrl: null,
                coverUrl: null,
                bio: null,
                visibility: "public",
                isDefault: false,
                createdAt: "",
                updatedAt: "",
            },
        ],
        perfilActivo: null,
        carpetas: [],
        ...parcial,
    };
}

function montar(appId = "omnifrecuencias") {
    const onOpenChange = vi.fn();
    render(
        <AppearanceProvider>
            <DialogoInstalar app={appPorId(appId)} open onOpenChange={onOpenChange} />
        </AppearanceProvider>,
    );
    return { onOpenChange };
}

beforeEach(() => {
    est.datos = datos();
    est.guardados = [];
    est.acciones = [];
    est.webAbierta = "";
});

afterEach(() => cleanup());

describe("DialogoInstalar", () => {
    it("abre con la web marcada y el resumen de lo que hará", () => {
        montar();
        expect(screen.getByRole("heading", { name: "¿Dónde quieres instalar Omnifrecuencias?" })).toBeTruthy();
        expect((screen.getByLabelText(/En la web \(servidores StarSeed\)/) as HTMLInputElement).checked).toBe(true);
        expect(screen.getByText("Se instalará en: web · biblioteca de la cuenta")).toBeTruthy();
        expect(screen.getByText(/Se descargará el APK \(Android\) · 5,9 MB \(OmniFrequency\.apk\)/)).toBeTruthy();
    });

    it("instala en web + este dispositivo + otra neurona, con perfil", async () => {
        const { onOpenChange } = montar();
        fireEvent.click(screen.getByLabelText(/Este dispositivo \(Móvil de Alex\)/));
        fireEvent.click(screen.getByLabelText(/MacBook/));
        fireEvent.change(screen.getByLabelText("Perfil"), { target: { value: "p-arte" } });
        expect(screen.getByText("Se instalará en: web · este dispositivo (Móvil de Alex) · MacBook · perfil Arte")).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Instalar" }));
        });

        expect(est.acciones.map((a) => a.tipo)).toEqual(["guardar-biblioteca", "descargar", "anadir-lanzador", "avisar-neuronas"]);
        expect(est.guardados.map((d) => [d.tipo, d.neuronaId ?? null, d.estado, d.perfilNombre])).toEqual([
            ["web", null, "instalada", "Arte"],
            ["neurona", "yo", "descargada", "Arte"],
            ["neurona", "mac", "pedida", "Arte"],
        ]);
        expect(est.guardados[2].pedidaDesde).toBe("Móvil de Alex");
        expect(est.guardados.every((d) => d.version === "v2.0.0")).toBe(true);
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it("sin nada marcado no deja instalar", () => {
        montar();
        fireEvent.click(screen.getByLabelText(/En la web/));
        expect((screen.getByRole("button", { name: "Instalar" }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByText("Elige al menos un sitio donde instalarla.")).toBeTruthy();
    });

    it("sin sesión explica cómo ver las otras neuronas", () => {
        est.datos = datos({ sesion: false, otras: [] });
        montar();
        expect(screen.getByText(/hay que/)).toBeTruthy();
        expect(screen.getByRole("link", { name: "iniciar sesión" }).getAttribute("href")).toBe("/login");
    });

    it("StarSeed OS: el botón de un toque descarga el .apk del OS y anota este dispositivo", async () => {
        const clics: string[] = [];
        const espia = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
            clics.push(this.href);
        });
        montar("starseed-os");
        expect(screen.getByRole("heading", { name: "¿Dónde quieres instalar StarSeed OS?" })).toBeTruthy();
        // La casilla describe el archivo del OS (no el de Nexus ni el de Café).
        expect(screen.getByText(new RegExp(`StarSeed-os-${NATIVE_VERSION.replace(/\./g, "\\.")}\\.apk`))).toBeTruthy();

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Descargar para Android" }));
        });

        expect(clics).toEqual([`https://github.com/StarSeedSystem/starseed-system/releases/download/${NATIVE_TAG}/StarSeed-os-${NATIVE_VERSION}.apk`]);
        // No se descarga dos veces: solo se añade al Lanzador y se guarda el destino.
        expect(est.acciones.map((a) => a.tipo)).toEqual(["anadir-lanzador"]);
        expect(est.guardados.map((d) => [d.tipo, d.neuronaId, d.estado, d.archivo, d.version])).toEqual([
            ["neurona", "yo", "descargada", `StarSeed-os-${NATIVE_VERSION}.apk`, NATIVE_TAG],
        ]);
        expect(screen.getByTestId("resultado-instalar-os").textContent).toContain("instale apps desconocidas");
        expect((screen.getByLabelText(/Este dispositivo \(Móvil de Alex\)/) as HTMLInputElement).checked).toBe(false);
        espia.mockRestore();
    });

    it("una app sin instaladores ofrece Lanzador y su web", () => {
        montar("cafe");
        expect(screen.getByText(/se añadirá a tu Lanzador/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /Abrir su web/ }));
        expect(est.webAbierta).toBe("https://starseed-cafe.vercel.app");
    });
});
