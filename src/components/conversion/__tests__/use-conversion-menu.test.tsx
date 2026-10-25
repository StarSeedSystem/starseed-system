// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { _limpiarCacheConversion } from "@/lib/conversion/cliente";
import { archivoDeAdjuntos, nombreConExtension, useConversionMenu } from "../use-conversion-menu";

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
        expect(result.current!.motivo).toMatch(/no hay una neurona que convierta/);
    });

    it("sin archivo convertible no hay submenú", () => {
        const { result } = renderHook(() => useConversionMenu(null, vi.fn()));
        expect(result.current).toBeUndefined();
    });

    it("en un mensaje elige el primer adjunto con URL real y salta los que no la tienen", () => {
        expect(archivoDeAdjuntos(null)).toBeNull();
        expect(archivoDeAdjuntos([])).toBeNull();
        expect(archivoDeAdjuntos([{ kind: "file", name: "nota.txt" }, { name: "solo referencia", refId: "r1" }])).toBeNull();
        expect(archivoDeAdjuntos([
            { name: "solo referencia", refId: "r1" },
            { name: "informe.PDF", mime: "application/pdf", dataUrl: "data:application/pdf;base64,AAA" },
            { name: "foto.jpg", url: "https://x/f.jpg" },
        ])).toEqual({ nombre: "informe.PDF", url: "data:application/pdf;base64,AAA", tipoMime: "application/pdf" });
        expect(archivoDeAdjuntos([
            { name: "escaneo", mime: "image/png", route: "/api/files/escaneo" },
        ])).toEqual({ nombre: "escaneo", url: "/api/files/escaneo", tipoMime: "image/png" });
    });

    it("pone la extensión que falte (de la URL, del tipo o .md para notas)", () => {
        expect(nombreConExtension({ nombre: "Foto", url: "https://x/obj/123-foto.JPG?t=1" })).toBe("Foto.jpg");
        expect(nombreConExtension({ nombre: "Foto", tipoMime: "image/png" })).toBe("Foto.png");
        expect(nombreConExtension({ nombre: "Ideas", contenido: "# hola" })).toBe("Ideas.md");
        expect(nombreConExtension({ nombre: "informe.pdf", url: "https://x/y" })).toBe("informe.pdf");
    });
});
