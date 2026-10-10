import { describe, expect, it } from "vitest";
import { crearPuertoSerieNativo } from "../serie-nativa";
import type { Resultado } from "../tipos";

function puenteFalso(abrir: Resultado<null> = { ok: true, valor: null }) {
  const orden: string[] = [];
  const escritos: number[][] = [];
  let alDatos: ((b: Uint8Array) => void) | null = null;
  let alCierre: ((r: string) => void) | null = null;
  return {
    orden,
    escritos,
    emitir: (b: number[]) => alDatos?.(Uint8Array.from(b)),
    cerrarDesdeRust: (r: string) => alCierre?.(r),
    puente: {
      async alRecibirSerie(cb: (b: Uint8Array) => void) {
        orden.push("escuchar");
        alDatos = cb;
        return () => (alDatos = null);
      },
      async alCerrarSerie(cb: (r: string) => void) {
        alCierre = cb;
        return () => (alCierre = null);
      },
      async serieAbrir(ruta: string, baudios?: number) {
        orden.push(`abrir ${ruta} ${baudios}`);
        return abrir;
      },
      async serieEscribir(d: Uint8Array) {
        escritos.push(Array.from(d));
        return { ok: true as const, valor: null };
      },
      async serieCerrar() {
        orden.push("cerrar");
        return { ok: true as const, valor: null };
      },
    },
  };
}

describe("puerto serie nativo con forma de SerialPort", () => {
  it("escucha antes de abrir, entrega los bytes y escribe por Rust", async () => {
    const f = puenteFalso();
    const p = crearPuertoSerieNativo("/dev/ttyACM0", f.puente);
    await p.open({ baudRate: 115200 });
    expect(f.orden).toEqual(["escuchar", "abrir /dev/ttyACM0 115200"]);
    const lector = p.readable!.getReader();
    f.emitir([0x94, 0xc3, 0x00, 0x01]);
    expect(Array.from((await lector.read()).value ?? [])).toEqual([0x94, 0xc3, 0x00, 0x01]);
    const escritor = p.writable!.getWriter();
    await escritor.write(new Uint8Array([1, 2]));
    expect(f.escritos).toEqual([[1, 2]]);
    f.cerrarDesdeRust("/dev/ttyACM0");
    expect((await lector.read()).done).toBe(true);
  });

  it("si Rust no puede abrir, open falla con su motivo", async () => {
    const f = puenteFalso({ ok: false, motivo: "Sin permiso para /dev/ttyACM0. En Linux: añade tu usuario al grupo «dialout»" });
    const p = crearPuertoSerieNativo("/dev/ttyACM0", f.puente);
    await expect(p.open()).rejects.toThrow(/dialout/);
  });

  it("close suelta los oyentes y cierra en Rust", async () => {
    const f = puenteFalso();
    const p = crearPuertoSerieNativo("/dev/cu.usbmodem1", f.puente);
    await p.open();
    await p.close();
    expect(f.orden.at(-1)).toBe("cerrar");
    expect(p.getInfo()).toEqual({ ruta: "/dev/cu.usbmodem1" });
  });
});
