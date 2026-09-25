import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DispositivoParaInstalar, ReleaseOficial } from "@/lib/apps-oficiales/apps-oficiales";

const BASE = "https://github.com/StarSeedSystem/starseed-system/releases/download/v0.3.0";
const asset = (nombre: string, mb: number) => ({ nombre, url: `${BASE}/${nombre}`, bytes: mb * 1024 * 1024 });

const est = vi.hoisted(() => ({
    dispositivo: { sistema: "macos", arquitectura: "arm64" } as DispositivoParaInstalar,
    nativa: false,
    release: null as unknown as ReleaseOficial,
}));

vi.mock("@/lib/apps-oficiales/ultima-version", () => ({
    useUltimaVersion: (id: string) =>
        id ? { release: est.release, instalables: [], origen: "github", cargando: false } : { release: null, instalables: [], origen: "respaldo", cargando: false },
    obtenerUltimaVersion: async () => ({ release: est.release, origen: "github" }),
}));

vi.mock("@/lib/apps-oficiales/dispositivo-actual", () => ({
    useDispositivoActual: () => est.dispositivo,
    esAppNativa: () => est.nativa,
}));

import { BotonInstalarOS, OtrosSistemasOS } from "../instalar-os";

let clics: string[] = [];

beforeEach(() => {
    est.release = {
        tag: "v0.3.0",
        publicado: "2026-10-01T10:00:00Z",
        url: "",
        assets: [
            asset("StarSeed.OS_0.3.0_universal.dmg", 30),
            asset("StarSeed.OS_0.3.0_x64-setup.exe", 8),
            asset("StarSeed.OS_0.3.0_amd64.AppImage", 80),
            asset("StarSeed-os-0.3.0.apk", 12),
            asset("StarSeed.Nexus_0.3.0_universal.dmg", 30),
            asset("StarSeed-nexus-0.3.0.apk", 12),
        ],
    };
    est.dispositivo = { sistema: "macos", arquitectura: "arm64" };
    est.nativa = false;
    clics = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clics.push(this.href);
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe("BotonInstalarOS", () => {
    it("en un Mac descarga al momento el .dmg de la última versión y dice cómo abrirlo", async () => {
        render(<BotonInstalarOS />);
        const boton = screen.getByRole("button", { name: "Descargar para macOS" });
        expect(screen.getByText(/v0\.3\.0 · imagen de disco \.dmg · 30 MB/)).toBeTruthy();

        await act(async () => {
            fireEvent.click(boton);
        });

        expect(clics).toEqual([`${BASE}/StarSeed.OS_0.3.0_universal.dmg`]);
        const estado = screen.getByTestId("resultado-instalar-os");
        expect(estado.textContent).toContain("Descargando StarSeed.OS_0.3.0_universal.dmg (v0.3.0).");
        expect(estado.textContent).toContain("arrastra StarSeed OS a la carpeta Aplicaciones");
        const otros = screen.getByRole("link", { name: /Otros sistemas y versiones/ });
        expect(otros.getAttribute("href")).toBe("https://github.com/StarSeedSystem/starseed-system/releases/latest");
        const deNuevo = screen.getByRole("link", { name: "Descargar de nuevo" });
        expect(deNuevo.getAttribute("href")).toBe(`${BASE}/StarSeed.OS_0.3.0_universal.dmg`);
    });

    it("en Android descarga el .apk del OS y no el de Nexus", async () => {
        est.dispositivo = { sistema: "android", arquitectura: "arm64" };
        render(<BotonInstalarOS compacto />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Descargar para Android" }));
        });
        expect(clics).toEqual([`${BASE}/StarSeed-os-0.3.0.apk`]);
        expect(screen.getByTestId("resultado-instalar-os").textContent).toContain("instale apps desconocidas");
    });

    it("en iPhone/iPad no descarga nada: enseña cómo instalar la web desde Safari", async () => {
        est.dispositivo = { sistema: "ios", arquitectura: "arm64" };
        render(<BotonInstalarOS />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Añadir a pantalla de inicio" }));
        });
        expect(clics).toEqual([]);
        const estado = screen.getByTestId("resultado-instalar-os");
        expect(estado.textContent).toContain("Añadir a pantalla de inicio");
        expect(estado.textContent).toContain("Safari");
    });

    it("dentro de la app nativa se muestra como ya instalada y no hace nada", () => {
        est.nativa = true;
        render(<BotonInstalarOS />);
        const boton = screen.getByRole("button", { name: "Ya estás en la app de StarSeed OS" }) as HTMLButtonElement;
        expect(boton.disabled).toBe(true);
    });

    it("avisa a quien lo usa de lo que pasó (para anotar el destino en la Biblioteca)", async () => {
        const onResultado = vi.fn();
        render(<BotonInstalarOS onResultado={onResultado} />);
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: "Descargar para macOS" }));
        });
        expect(onResultado).toHaveBeenCalledTimes(1);
        expect(onResultado.mock.calls[0][0]).toMatchObject({ descargaIniciada: true, plan: { tipo: "descargar" } });
    });
});

describe("OtrosSistemasOS", () => {
    it("enlaza los archivos del OS de cada sistema y todas las versiones", () => {
        render(<OtrosSistemasOS release={est.release} />);
        const bloque = screen.getByTestId("otros-sistemas-os");
        expect(bloque.textContent).toContain("v0.3.0");
        const hrefs = Array.from(bloque.querySelectorAll("a")).map((x) => x.getAttribute("href"));
        expect(hrefs).toContain(`${BASE}/StarSeed.OS_0.3.0_x64-setup.exe`);
        expect(hrefs).toContain(`${BASE}/StarSeed-os-0.3.0.apk`);
        expect(hrefs).not.toContain(`${BASE}/StarSeed-nexus-0.3.0.apk`);
        expect(hrefs).toContain("https://github.com/StarSeedSystem/starseed-system/releases/latest");
    });
});
