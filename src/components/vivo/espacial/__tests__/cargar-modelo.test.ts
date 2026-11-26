/**
 * Integración de la carga de modelos con la caché de promesas (IMG-agentes-reimaginada).
 * Una respuesta 429/500 no puede quedarse en caché: la siguiente llamada vuelve a pedir.
 * Se usa la vía de error antes de GLTFLoader, así la prueba no descarga ni parsea nada.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { cargarModelo } from "../cargar-modelo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cargarModelo · caché de promesas rechazadas", () => {
  it("un fallo no se queda en caché: la segunda llamada vuelve a pedir", async () => {
    const url = "https://modelos.ejemplo/uno.glb";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers: new Headers() })
      .mockResolvedValueOnce({ ok: false, status: 500, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);

    await expect(cargarModelo(url)).rejects.toThrow("429");
    await expect(cargarModelo(url)).rejects.toThrow("500");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dos llamadas a la vez comparten una sola descarga", async () => {
    const url = "https://modelos.ejemplo/dos.glb";
    let resolver: (r: unknown) => void = () => {};
    const fetchMock = vi.fn(
      () =>
        new Promise((res) => {
          resolver = res;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const a = cargarModelo(url);
    const b = cargarModelo(url);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    resolver({ ok: false, status: 503, headers: new Headers() });
    await expect(a).rejects.toThrow("503");
  });

  it("agota los intentos y deja de pedir al servidor (sin gastar créditos)", async () => {
    const url = "https://modelos.ejemplo/tres.glb";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429, headers: new Headers() });
    vi.stubGlobal("fetch", fetchMock);

    await expect(cargarModelo(url)).rejects.toThrow("429");
    await expect(cargarModelo(url)).rejects.toThrow("429");
    await expect(cargarModelo(url)).rejects.toThrow("429");
    await expect(cargarModelo(url)).rejects.toThrow("No se reintenta");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
