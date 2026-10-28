// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { _limpiarCacheConversion } from "@/lib/conversion/cliente";
import { nombreConExtension, useConversionMenu } from "../use-conversion-menu";

afterEach(() => {
    _limpiarCacheConversion();
    vi.unstubAllGlobals();
});

describe("«Convertir a…» del clic derecho", () => {
    it("pregunta a la neurona y ofrece los destinos de ESE archivo, los habituales primero", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({
            filee: { instalado: true, version: "2.0.0" },
            destinos: { nombre: "HEIC", ids: ["heic"], destinos: ["tga", "png", "jpg", "pdf", "webp", "qoi", "avif", "gif", "bmp", "ico"], conMotor: [] },
        })));
        const guardar = vi.fn(async () => "guardado junto al original");
        const archivo = { nombre: "Viaje.HEIC", url: "https://x/v.heic" };
        const { result } = renderHook(() => useConversionMenu(archivo, guardar));
        await waitFor(() => expect(result.current?.estado).toBe("listo"));
        expect(result.current!.principales).toEqual(["pdf", "png", "jpg", "webp", "gif", "avif", "bmp", "ico"]);
        expect(result.current!.resto).toBe(2);
        expect(result.current!.etiqueta("pdf")).toBe("PDF");
    });

    it("en un medio sin conversor lo dice (no finge)", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
        const archivo = { nombre: "a.pdf", url: "https://x/a.pdf" };
        const { result } = renderHook(() => useConversionMenu(archivo, vi.fn()));
        await waitFor(() => expect(result.current?.estado).toBe("no-disponible"));
        expect(result.current!.motivo).toMatch(/Ninguna neurona de tu malla convierte archivos ahora mismo/);
    });

    it("sin archivo convertible no hay submenú", () => {
        const { result } = renderHook(() => useConversionMenu(null, vi.fn()));
        expect(result.current).toBeUndefined();
    });

    it("pone la extensión que falte (de la URL, del tipo o .md para notas)", () => {
        expect(nombreConExtension({ nombre: "Foto", url: "https://x/obj/123-foto.JPG?t=1" })).toBe("Foto.jpg");
        expect(nombreConExtension({ nombre: "Foto", tipoMime: "image/png" })).toBe("Foto.png");
        expect(nombreConExtension({ nombre: "Ideas", contenido: "# hola" })).toBe("Ideas.md");
        expect(nombreConExtension({ nombre: "informe.pdf", url: "https://x/y" })).toBe("informe.pdf");
    });
});
