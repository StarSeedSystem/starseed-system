// @vitest-environment jsdom
/**
 * IMG1011J · la tarjeta de opciones en el CHAT de Astraura: `generarImagen(prompt, opciones)`
 * devuelve varias opciones de una vez (galería del proveedor «neuronas») y las entrega en el
 * mensaje como una tarjeta de imágenes markdown, con la primera guardada en la Biblioteca.
 * Dobles para no tocar red: el motor gratis-primero devuelve una galería hecha de mentira.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const generarImagenMotor = vi.fn((a: unknown) => "" as unknown);
const guardarEnBiblioteca = vi.fn((a: unknown) => ({ ok: true, id: "lib-1", a }));

vi.mock("@/ai/astraura/media/media-gen", () => ({ generateImage: (a: unknown) => generarImagenMotor(a) }));
vi.mock("@/lib/services/oss-connections", () => ({ resolveServiceFor: vi.fn(() => null) }));
vi.mock("@/lib/integrations/services/n8n", () => ({ triggerWebhook: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/library-store", () => ({ saveResource: (a: unknown) => guardarEnBiblioteca(a) }));

import { generarImagen, sanearOpcionesImagen } from "../service-generation";

describe("sanearOpcionesImagen (pura)", () => {
  it("1–8 opciones; sin dato claro 1; nunca más de 8", () => {
    expect(sanearOpcionesImagen(undefined)).toBe(1);
    expect(sanearOpcionesImagen("tres")).toBe(1);
    expect(sanearOpcionesImagen(0)).toBe(1);
    expect(sanearOpcionesImagen(1)).toBe(1);
    expect(sanearOpcionesImagen("4")).toBe(4);
    expect(sanearOpcionesImagen(99)).toBe(8);
    expect(sanearOpcionesImagen(-2)).toBe(1);
  });
});

describe("generarImagen · tarjeta de opciones en el chat", () => {
  beforeEach(() => { generarImagenMotor.mockReset(); guardarEnBiblioteca.mockClear(); });

  it("con `opciones` N trata la galería: N imágenes markdown en el mensaje y la primera en la Biblioteca", async () => {
    generarImagenMotor.mockResolvedValueOnce({
      ok: true, provider: "neuronas", url: "https://img.ejemplo/una.png",
      galeria: {
        ok: true,
        opciones: [
          { url: "https://img.ejemplo/una.png", modelo: "SD-Turbo", capa: "dispositivo", neurona: "mac", semilla: 1, licencia: "Stability", uso: "libre", atribucion: "SD-Turbo local", segundos: 1 },
          { url: "https://img.ejemplo/dos.png", modelo: null, capa: "web-gratis", semilla: 2, licencia: "Pollinations", uso: "libre", atribucion: "Pollinations", segundos: 2 },
          { url: "https://img.ejemplo/tres.png", modelo: null, capa: "web-gratis", semilla: 3, licencia: "Pollinations", uso: "libre", atribucion: "Pollinations", segundos: 3 },
        ],
        descartes: [],
      },
    });
    const res = await generarImagen("un bosque de cristal", 3);
    expect(generarImagenMotor).toHaveBeenCalledWith({ prompt: "un bosque de cristal", opciones: 3 });
    expect(res.ok).toBe(true);
    expect(guardarEnBiblioteca).toHaveBeenCalledTimes(1);
    if (!res.ok) return;
    const urls = (res.data as { urls?: string[] } | undefined)?.urls ?? [];
    expect(urls.length).toBe(3);
    expect((res.message.match(/!\[Opción /g) ?? []).length).toBe(3);
    expect(res.message).toContain("Opción 1 · SD-Turbo · Tu aparato");
    expect(res.message).toContain("Opción 2 · Pollinations · La web (gratis)");
  });

  it("sin galería igual muestra su imagen única y guarda en la Biblioteca", async () => {
    generarImagenMotor.mockResolvedValueOnce({ ok: true, provider: "pollinations", url: "https://img.ejemplo/sola.png" });
    const res = await generarImagen("una flor", 1);
    expect(res.ok).toBe(true);
    expect(guardarEnBiblioteca).toHaveBeenCalledTimes(1);
    if (!res.ok) return;
    expect((res.message.match(/!\[Opción /g) ?? []).length).toBe(1);
    expect(res.message).toContain("la imagen");
  });

  it("si el motor no devuelve imagen, el mensaje sigue siendo el de guiar a configurar", async () => {
    generarImagenMotor.mockResolvedValueOnce({ ok: false, provider: "pollinations", error: "saturado" });
    const res = await generarImagen("una flor", 2);
    expect(res.ok).toBe(false);
    expect(guardarEnBiblioteca).not.toHaveBeenCalled();
  });
});
