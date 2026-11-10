/**
 * preparacion-archivo (ARC1110A): la raíz SHA-256 por bloques es BYTE A BYTE la de `calcularHashLista` (el receptor la
 * verifica con esa definición), avisa del avance, se puede cancelar y no bloquea el hilo.
 */
import { describe, expect, it } from "vitest";
import { calcularHashLista } from "@/lib/network/archivos-malla";
import { hashearPorBloques } from "@/lib/malla/preparacion-archivo-nucleo";
import { prepararArchivo } from "@/lib/malla/preparacion-archivo";

const relleno = (n: number) => new Blob([new Uint8Array(n).map((_, i) => (i * 131 + 17) & 255)]);

async function referencia(b: Blob, tam: number, trozos: number): Promise<string> {
  return (await calcularHashLista((i) => b.slice(i * tam, Math.min(b.size, (i + 1) * tam)).arrayBuffer(), trozos)).raiz;
}

describe("hashearPorBloques", () => {
  for (const [tamano, tam] of [
    [0, 16384],
    [1, 16384],
    [16383, 16384],
    [16384, 16384],
    [16385, 16384],
    [3 * 1024 * 1024 + 123, 63 * 1024],
  ] as const) {
    it(`misma raíz que calcularHashLista (${tamano} B, trozo ${tam})`, async () => {
      const b = relleno(tamano);
      const trozos = Math.max(1, Math.ceil(tamano / tam));
      const r = await hashearPorBloques(b, tam, trozos, { bloqueBytes: tam * 3 }); // varios bloques
      expect(r).toEqual({ ok: true, raiz: await referencia(b, tam, trozos) });
    });
  }

  it("avisa del avance (creciente, termina en 100) y cede el turno entre bloques", async () => {
    const b = relleno(1024 * 1024);
    const pcts: number[] = [];
    let cedidas = 0;
    const r = await hashearPorBloques(b, 16384, 64, {
      bloqueBytes: 16384 * 8,
      alProgreso: (p) => pcts.push(p),
      ceder: async () => void cedidas++,
    });
    expect(r.ok).toBe(true);
    expect(pcts).toEqual([13, 25, 38, 50, 63, 75, 88, 100]);
    expect(cedidas).toBe(8);
  });

  it("se cancela entre bloques", async () => {
    let n = 0;
    const r = await hashearPorBloques(relleno(1024 * 1024), 16384, 64, { bloqueBytes: 16384 * 4, cancelado: () => ++n > 2 });
    expect(r).toMatchObject({ ok: false, cancelado: true });
  });

  it("parámetros imposibles: fallo con motivo, no excepción", async () => {
    const r = await hashearPorBloques(relleno(10), 0, 0);
    expect(r.ok).toBe(false);
  });
});

describe("prepararArchivo", () => {
  it("sin Worker usa el hilo y da la misma raíz; informa de vía y tiempo", async () => {
    const b = relleno(700_000);
    const trozos = Math.ceil(700_000 / 63_000);
    const r = await prepararArchivo(b, 63_000, trozos, { usarWorker: false });
    expect(r).toMatchObject({ ok: true, via: "hilo" });
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(r.ok && r.raiz).toBe(await referencia(b, 63_000, trozos));
  });

  it("50 MB: el temporizador sigue disparando durante la preparación en el hilo (cede entre bloques)", async () => {
    const grande = new Blob([new Uint8Array(50 * 1024 * 1024)]);
    const tam = 63 * 1024;
    const trozos = Math.ceil(grande.size / tam);
    let ticks = 0;
    const reloj = setInterval(() => ticks++, 2);
    const r = await prepararArchivo(grande, tam, trozos, { usarWorker: false });
    clearInterval(reloj);
    console.log(`[ARC1110A] preparar 50 MB en el hilo: ${r.ms} ms, ${ticks} ticks de 2 ms`);
    expect(r.ok).toBe(true);
    expect(ticks).toBeGreaterThanOrEqual(10); // 13 bloques de ~4 MiB, con un turno cedido entre cada uno
  }, 60_000);

  it("cancelada: devuelve cancelado sin raíz", async () => {
    let vueltas = 0;
    const r = await prepararArchivo(relleno(2 * 1024 * 1024), 16384, 128, { usarWorker: false, cancelado: () => ++vueltas > 1 });
    expect(r).toMatchObject({ ok: false, cancelado: true });
  });
});
