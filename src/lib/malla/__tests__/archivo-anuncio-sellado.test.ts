/**
 * Anuncio temprano SELLADO (ARC1110A): el anuncio viaja como una oferta cifrada (nadie en el camino ve el nombre ni el
 * tamaño), el receptor lo abre y enseña la tarjeta antes de que haya oferta, y la oferta real reutiliza la misma clave.
 * Motor REAL de archivos, canal sellado REAL en las dos puntas.
 */
import { afterEach, describe, expect, it } from "vitest";
import { armarCanalArchivo, CAPACIDADES_ARCHIVO, CAPACIDAD_ANUNCIO, parAnuncia } from "@/lib/malla/archivo-seguro";
import { AJUSTES_VIAS_POR_DEFECTO } from "@/lib/malla/ajustes-vias-archivo";
import { crearAlmacenSellos, crearCanalSellado } from "@/lib/malla/canal-sellado";
import { abrirSobreCon } from "@/lib/malla/cifrado-archivo";
import { olvidarClavesVivas } from "@/lib/malla/claves-destinatario";
import { crearAlmacenEnMemoria, crearMotorArchivos, type CanalArchivos } from "@/lib/network/archivos-malla";
import { firmanteDePrueba, identidadEcdh } from "./ayudas-cifrado";

afterEach(() => olvidarClavesVivas());

async function hasta(fn: () => boolean, ms = 10_000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("hasta: plazo agotado");
    await new Promise((r) => setTimeout(r, 4));
  }
}

describe("anuncio sellado", () => {
  it("la capacidad se anuncia en el saludo y se reconoce", () => {
    expect(CAPACIDADES_ARCHIVO).toContain(CAPACIDAD_ANUNCIO);
    expect(parAnuncia([CAPACIDAD_ANUNCIO])).toBe(true);
    expect(parAnuncia(["archivo.e2e.v1"])).toBe(false);
    expect(parAnuncia(null)).toBe(false);
  });

  async function montar(parAnuncioActivo: boolean) {
    const rx = await identidadEcdh();
    const { firmar, verificar } = await firmanteDePrueba();
    const enCable: string[] = [];
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 4096 });
    const ofertasB: string[] = [];
    const motorB = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), politica: async () => "preguntar" as const, onOfertaEntrante: (o) => ofertasB.push(o.id) });
    const oyentesRx = new Set<(d: string | ArrayBuffer) => void>();
    const baseRx: CanalArchivos = {
      enviar: (t) => {
        queueMicrotask(() => motorA.manejarMensaje(canalA, t, { mismaCuenta: true }));
        return true;
      },
      alMensaje: (cb) => (oyentesRx.add(cb), () => oyentesRx.delete(cb)),
    };
    const selladoRx = crearCanalSellado(baseRx, { almacen: crearAlmacenSellos(), abrirSobre: abrirSobreCon(rx.priv), verificar });
    selladoRx.alMensaje((claro) => motorB.manejarMensaje(selladoRx, claro, { mismaCuenta: true }));
    const cable: CanalArchivos = {
      enviar: (t) => {
        enCable.push(t);
        queueMicrotask(() => oyentesRx.forEach((cb) => cb(t)));
        return true;
      },
      alMensaje: () => () => undefined,
    };
    const armado = await armarCanalArchivo({
      vias: [{ id: "nativo:lan", tipo: "directa", canal: cable }],
      bytes: 200 * 1024,
      parCifra: true,
      parAnuncia: parAnuncioActivo,
      destinatarios: async () => [{ pub: rx.pub }],
      ajustes: AJUSTES_VIAS_POR_DEFECTO,
      firmar,
      verificar,
    });
    const canalA = armado.canal!;
    return { motorA, motorB, canalA, enCable, ofertasB };
  }

  it("el par lo entiende: el anuncio va cifrado (sin nombre ni tamaño en claro), B enseña la tarjeta y todo termina verificado con UNA pregunta", async () => {
    const t = await montar(true);
    expect(t.canalA.admiteAnuncio?.()).toBe(true);
    const datos = new Uint8Array(200 * 1024).map((_, i) => (i * 7) & 255);
    const r = await t.motorA.enviarArchivo(t.canalA, new Blob([datos]), "plano-privado.pdf", { tipo: "dispositivo" });
    await hasta(() => t.motorB.estadoDe(r.id)?.fase === "pendiente-aceptar");
    // El primer mensaje del cable es el anuncio, sellado como oferta cifrada.
    expect(t.enCable[0].startsWith('{"t":"archivo.oferta.cif"')).toBe(true);
    for (const x of t.enCable) {
      expect(x.includes("plano-privado")).toBe(false);
      expect(x.includes('"t":"archivo.anuncio"')).toBe(false);
    }
    const tarjeta = t.motorB.estadoDe(r.id)!;
    expect(tarjeta).toMatchObject({ nombre: "plano-privado.pdf", tamano: 200 * 1024 });
    t.motorB.aceptarOferta(r.id); // de antemano
    await hasta(() => t.motorA.estadoDe(r.id)?.fase === "completada" && t.motorB.estadoDe(r.id)?.fase === "completada");
    expect(new Uint8Array(await t.motorB.blobRecibido(r.id)!.arrayBuffer())).toEqual(datos);
    expect(t.ofertasB).toEqual([r.id]);
    expect(t.motorB.estadoDe(r.id)?.cifradoArchivo).toBe("archivo");
  }, 40_000);

  it("par sin la capacidad: el canal sellado no ofrece anuncio y el flujo es el de siempre", async () => {
    const t = await montar(false);
    expect(t.canalA.admiteAnuncio?.() ?? false).toBe(false);
    const r = await t.motorA.enviarArchivo(t.canalA, new Blob([new Uint8Array(30 * 1024)]), "a.bin", { tipo: "dispositivo" });
    await r.listo;
    await hasta(() => t.motorB.estadoDe(r.id)?.fase === "pendiente-aceptar");
    expect(t.motorB.estadoDe(r.id)?.preparando).toBeFalsy();
    t.motorB.aceptarOferta(r.id);
    await hasta(() => t.motorA.estadoDe(r.id)?.fase === "completada");
  }, 40_000);
});
