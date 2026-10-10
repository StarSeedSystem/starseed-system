/**
 * Canal multitrayecto: los trozos de un archivo por varios enlaces a la vez, y de punta a punta
 * con el motor de archivos real (`archivos-malla`) y dos caminos con distinta velocidad.
 */
import { describe, expect, it } from "vitest";
import { crearCanalMultitrayecto, esTrozo } from "@/lib/malla/canal-multitrayecto";
import { crearAlmacenEnMemoria, crearMotorArchivos, type CanalArchivos, type MotorArchivos } from "@/lib/network/archivos-malla";

function canalFalso(opts: { falla?: () => boolean; cola?: () => number } = {}) {
  const enviados: string[] = [];
  const oyentes = new Set<(d: string | ArrayBuffer) => void>();
  const canal: CanalArchivos = {
    enviar: (t) => {
      if (opts.falla?.()) return false;
      enviados.push(t);
      return true;
    },
    bufferedAmount: () => opts.cola?.() ?? 0,
    alMensaje: (cb) => {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },
  };
  return { canal, enviados, oyentes };
}

const trozo = (i: number) => JSON.stringify({ t: "archivo.chunk", id: "x", index: i, datosB64: "AA==" });

describe("crearCanalMultitrayecto", () => {
  it("reconoce los trozos y reparte por capacidad; el control va por el principal", () => {
    const a = canalFalso();
    const b = canalFalso();
    const multi = crearCanalMultitrayecto([
      { id: "local:1", canal: a.canal, capacidadKbps: 30_000 },
      { id: "cuenta:B", canal: b.canal, capacidadKbps: 10_000 },
    ]);
    expect(esTrozo(trozo(0))).toBe(true);
    expect(multi.enviar(JSON.stringify({ t: "archivo.oferta", id: "x" }))).toBe(true);
    for (let i = 0; i < 40; i++) expect(multi.enviar(trozo(i))).toBe(true);
    expect(multi.enviar(JSON.stringify({ t: "archivo.fin", id: "x" }))).toBe(true);
    expect(multi.reparto()).toEqual({ "local:1": 30, "cuenta:B": 10 });
    expect(a.enviados[0]).toContain("archivo.oferta");
    expect(a.enviados.at(-1)).toContain("archivo.fin");
    expect(b.enviados.some((t) => t.includes("oferta") || t.includes("fin"))).toBe(false);
    expect(multi.enlaces()).toEqual(["local:1", "cuenta:B"]);
  });

  it("si un enlace falla, el trozo va por otro; solo devuelve false si fallan todos", () => {
    let caido = true;
    const a = canalFalso({ falla: () => caido });
    const b = canalFalso();
    const multi = crearCanalMultitrayecto([{ id: "a", canal: a.canal }, { id: "b", canal: b.canal }]);
    for (let i = 0; i < 6; i++) expect(multi.enviar(trozo(i))).toBe(true);
    expect(multi.reparto()).toEqual({ a: 0, b: 6 });
    // El control también conmuta si el principal no lo acepta.
    expect(multi.enviar(JSON.stringify({ t: "archivo.fin", id: "x" }))).toBe(true);
    expect(b.enviados.at(-1)).toContain("archivo.fin");
    caido = false;
    const c = canalFalso({ falla: () => true });
    expect(crearCanalMultitrayecto([{ id: "c", canal: c.canal }]).enviar(trozo(0))).toBe(false);
  });

  it("salta el enlace con la cola llena y avisa de cola solo cuando TODOS van llenos", () => {
    let colaA = 5_000_000;
    const a = canalFalso({ cola: () => colaA });
    const b = canalFalso({ cola: () => 100 });
    const multi = crearCanalMultitrayecto([{ id: "a", canal: a.canal }, { id: "b", canal: b.canal }]);
    for (let i = 0; i < 4; i++) multi.enviar(trozo(i));
    expect(multi.reparto()).toEqual({ a: 0, b: 4 });
    expect(multi.bufferedAmount?.()).toBe(100);
    colaA = 0;
    expect(multi.bufferedAmount?.()).toBe(0);
  });

  it("solo ofrece binario si todos los enlaces lo admiten", () => {
    const a = canalFalso();
    const b = canalFalso();
    const conBinario: CanalArchivos = { ...b.canal, enviarBinario: () => true };
    expect(crearCanalMultitrayecto([{ id: "a", canal: a.canal }, { id: "b", canal: conBinario }]).enviarBinario).toBeUndefined();
    expect(typeof crearCanalMultitrayecto([{ id: "b", canal: conBinario }, { id: "c", canal: { ...conBinario } }]).enviarBinario).toBe("function");
  });
});

/** Dos caminos A→B (uno rápido, otro con retraso) y uno de vuelta B→A. */
function dosCaminos(motorA: MotorArchivos, motorB: MotorArchivos) {
  const haciaA = new Set<(d: string | ArrayBuffer) => void>();
  const vuelta: CanalArchivos = {
    enviar: (t) => {
      queueMicrotask(() => motorA.manejarMensaje(vuelta, t, { mismaCuenta: true }));
      return true;
    },
    alMensaje: (cb) => {
      haciaA.add(cb);
      return () => haciaA.delete(cb);
    },
  };
  const camino = (retrasoMs: number): CanalArchivos => ({
    enviar: (t) => {
      setTimeout(() => motorB.manejarMensaje(vuelta, t, { mismaCuenta: true }), retrasoMs);
      return true;
    },
    alMensaje: () => () => undefined,
  });
  return { rapido: camino(0), lento: camino(30) };
}

describe("de punta a punta con el motor de archivos", () => {
  it("un archivo repartido por dos caminos llega entero y verificado aunque el «fin» se adelante", async () => {
    const motorA = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 1024 });
    const motorB = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 1024 });
    const { rapido, lento } = dosCaminos(motorA, motorB);
    const multi = crearCanalMultitrayecto([
      { id: "rapido", canal: rapido, capacidadKbps: 2000 },
      { id: "lento", canal: lento, capacidadKbps: 1000 },
    ]);
    const datos = new Uint8Array(10 * 1024 + 77).map((_, i) => (i * 31) % 251);
    const r = await motorA.enviarArchivo(multi, new Blob([datos]), "prueba.bin", { tipo: "dispositivo", id: "B" });
    expect(r.ok).toBe(true);
    const hecho = await new Promise<boolean>((resolver) => {
      const t0 = Date.now();
      const mirar = () => {
        const recibido = motorB.listaTransferencias().find((e) => e.rol === "recibir");
        if (recibido?.fase === "completada") return resolver(true);
        if (recibido?.fase === "error" || Date.now() - t0 > 8000) return resolver(false);
        setTimeout(mirar, 20);
      };
      mirar();
    });
    expect(hecho).toBe(true);
    const id = motorB.listaTransferencias().find((e) => e.rol === "recibir")!.id;
    const blob = motorB.blobRecibido(id)!;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(datos);
    const reparto = multi.reparto();
    expect(reparto.rapido + reparto.lento).toBe(11);
    expect(reparto.lento).toBeGreaterThan(0);
  });
});
