import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CARPETA_BIBLIOTECA, cabeEnBiblioteca, descargarResultado, guardarEnBiblioteca } from "../guardar";
import { LIMITE_BIBLIOTECA_BYTES, type ResultadoGrabacion } from "../tipos";

const grabacion = (bytes = 1000): ResultadoGrabacion => ({
  tipo: "video",
  blob: new Blob([new Uint8Array(8)], { type: "video/webm" }),
  url: "blob:x/1",
  mimeType: "video/webm",
  extension: "webm",
  nombre: "starseed-grabacion-2026-10-26-1530.webm",
  bytes,
  duracionMs: 3000,
});

describe("grabación · descargar y guardar en la Biblioteca", () => {
  it("el límite local es el mismo que el de la subida real (os-files)", () => {
    const fuente = readFileSync(path.join(process.cwd(), "src/lib/files/os-files.ts"), "utf8");
    expect(fuente).toMatch(/export const MAX_UPLOAD_BYTES = 50 \* 1024 \* 1024;/);
    expect(LIMITE_BIBLIOTECA_BYTES).toBe(50 * 1024 * 1024);
  });

  it("la Biblioteca usa la vía existente (saveMediaToLibrary) y su carpeta «Capturas» existe", () => {
    const fuente = readFileSync(path.join(process.cwd(), "src/lib/library/media-library.ts"), "utf8");
    expect(fuente).toMatch(/export async function saveMediaToLibrary/);
    expect(fuente).toMatch(/export type MediaOrigin = "Cámara" \| "Importadas" \| "Capturas";/);
    expect(CARPETA_BIBLIOTECA).toContain("Capturas");
  });

  it("cabe / no cabe en la Biblioteca justo en el límite", () => {
    expect(cabeEnBiblioteca(LIMITE_BIBLIOTECA_BYTES)).toBe(true);
    expect(cabeEnBiblioteca(LIMITE_BIBLIOTECA_BYTES + 1)).toBe(false);
  });

  it("guarda con la ref de la cuenta, el nombre y el origen «Capturas»", async () => {
    const llamadas: Array<{ ref: unknown; input: { name: string; origin: string; file: unknown } }> = [];
    const r = grabacion();
    const res = await guardarEnBiblioteca(r, {
      cargarRef: async () => ({ kind: "user", id: "u1" }),
      cargarBiblioteca: async () => ({
        saveMediaToLibrary: async (ref, input) => {
          llamadas.push({ ref, input });
          return { ok: true };
        },
      }),
    });
    expect(res).toEqual({ ok: true, carpeta: CARPETA_BIBLIOTECA });
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].ref).toEqual({ kind: "user", id: "u1" });
    expect(llamadas[0].input).toMatchObject({ name: r.nombre, origin: "Capturas", file: r.blob });
  });

  it("sin sesión no sube nada y lo dice (queda descargar)", async () => {
    let subidas = 0;
    const res = await guardarEnBiblioteca(grabacion(), {
      cargarRef: async () => null,
      cargarBiblioteca: async () => ({
        saveMediaToLibrary: async () => {
          subidas += 1;
          return { ok: true };
        },
      }),
    });
    expect(res).toMatchObject({ ok: false });
    expect((res as { mensaje: string }).mensaje).toMatch(/Inicia sesión/);
    expect(subidas).toBe(0);
  });

  it("si pesa más que el límite, ni lo intenta y explica qué hacer", async () => {
    let subidas = 0;
    const res = await guardarEnBiblioteca(grabacion(LIMITE_BIBLIOTECA_BYTES + 1), {
      cargarRef: async () => ({ kind: "user", id: "u1" }),
      cargarBiblioteca: async () => {
        subidas += 1;
        throw new Error("no debía cargarse");
      },
    });
    expect(res).toMatchObject({ ok: false });
    expect((res as { mensaje: string }).mensaje).toMatch(/50 MB/);
    expect((res as { mensaje: string }).mensaje).toMatch(/Ligera/);
    expect(subidas).toBe(0);
  });

  it("el error de la subida llega tal cual, y una excepción no rompe", async () => {
    const mal = await guardarEnBiblioteca(grabacion(), {
      cargarRef: async () => ({ kind: "user", id: "u1" }),
      cargarBiblioteca: async () => ({ saveMediaToLibrary: async () => ({ ok: false, error: "Sin espacio" }) }),
    });
    expect(mal).toEqual({ ok: false, mensaje: "Sin espacio" });
    const roto = await guardarEnBiblioteca(grabacion(), {
      cargarRef: async () => {
        throw new Error("red");
      },
    });
    expect(roto).toMatchObject({ ok: false });
  });

  it("descargar crea un enlace con el nombre, lo pulsa y lo quita", () => {
    const hijos: unknown[] = [];
    const pulsados: Array<{ href: string; download: string }> = [];
    const doc = {
      createElement: () => {
        const a = { href: "", download: "", rel: "", style: { display: "" }, click: () => pulsados.push({ href: a.href, download: a.download }) };
        return a;
      },
      body: { appendChild: (n: unknown) => hijos.push(n), removeChild: (n: unknown) => hijos.splice(hijos.indexOf(n), 1) },
    } as unknown as Document;
    descargarResultado(grabacion(), doc);
    expect(pulsados).toEqual([{ href: "blob:x/1", download: "starseed-grabacion-2026-10-26-1530.webm" }]);
    expect(hijos).toHaveLength(0);
  });
});
