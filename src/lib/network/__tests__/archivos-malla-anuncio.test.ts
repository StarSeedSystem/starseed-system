/**
 * archivos-malla · anuncio temprano (ARC1110A). Motor REAL en dos neuronas sobre canales en memoria:
 *   · el receptor ve la tarjeta y puede aceptar/rechazar ANTES de que exista la oferta (el SHA-256 aún no está);
 *   · lo aceptado de antemano empieza solo, sin segunda pregunta;
 *   · un par antiguo (sin `admiteAnuncio`) sigue con el flujo de siempre;
 *   · preparar un archivo grande no bloquea el hilo (un temporizador sigue disparando);
 *   · los hitos salen en el registro, sin nombres.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  crearAlmacenEnMemoria,
  crearMotorArchivos,
  esMensajeArchivoMalla,
  type CanalArchivos,
  type ConfigMotorArchivos,
  type MotorArchivos,
} from "@/lib/network/archivos-malla";
import { fijarSumideroArchivo } from "@/lib/network/archivos-diagnostico";

interface Par {
  canalA: CanalArchivos;
  canalB: CanalArchivos;
  vistoAaB: string[];
  vistoBaA: string[];
  /** Mientras sea true, la oferta de A queda retenida (aún «no está lista»). */
  retener: { oferta: boolean };
  retenidos: string[];
  soltar(): void;
}

function crearPar(opts: { anuncio?: boolean; transformarAaB?: (t: string) => string } = {}): Par {
  const oyentesA = new Set<(d: string | ArrayBuffer) => void>();
  const oyentesB = new Set<(d: string | ArrayBuffer) => void>();
  const vistoAaB: string[] = [];
  const vistoBaA: string[] = [];
  const retener = { oferta: false };
  const retenidos: string[] = [];
  const entregarB = (t: string) => {
    for (const l of Array.from(oyentesB)) l(opts.transformarAaB ? opts.transformarAaB(t) : t);
  };
  const canalA: CanalArchivos = {
    enviar: (t) => {
      vistoAaB.push(t);
      if (retener.oferta && t.startsWith('{"t":"archivo.oferta"')) {
        retenidos.push(t);
        return true;
      }
      entregarB(t);
      return true;
    },
    ...(opts.anuncio === false ? {} : { admiteAnuncio: () => true }),
    alMensaje: (cb) => (oyentesA.add(cb), () => oyentesA.delete(cb)),
  };
  const canalB: CanalArchivos = {
    enviar: (t) => {
      vistoBaA.push(t);
      for (const l of Array.from(oyentesA)) l(t);
      return true;
    },
    alMensaje: (cb) => (oyentesB.add(cb), () => oyentesB.delete(cb)),
  };
  return {
    canalA,
    canalB,
    vistoAaB,
    vistoBaA,
    retener,
    retenidos,
    soltar() {
      retener.oferta = false;
      for (const t of retenidos.splice(0)) entregarB(t);
    },
  };
}

function montar(par: Par, configB: ConfigMotorArchivos = {}): { a: MotorArchivos; b: MotorArchivos; ofertasB: string[] } {
  const ofertasB: string[] = [];
  const a = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), tamanoChunkBase64: 4096 });
  const b = crearMotorArchivos({
    almacen: crearAlmacenEnMemoria(),
    onOfertaEntrante: (o) => ofertasB.push(o.id),
    ...configB,
  });
  par.canalA.alMensaje((d) => a.manejarMensaje(par.canalA, d, { mismaCuenta: true }));
  par.canalB.alMensaje((d) => b.manejarMensaje(par.canalB, d, { mismaCuenta: true }));
  return { a, b, ofertasB };
}

async function hasta(fn: () => boolean, ms = 8000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("hasta: plazo agotado");
    await new Promise((r) => setTimeout(r, 4));
  }
}

const datos = (kib: number) => new Blob([new Uint8Array(kib * 1024).map((_, i) => (i * 31 + 7) & 255)]);
const preguntar = async () => "preguntar" as const;

afterEach(() => fijarSumideroArchivo(null));

describe("anuncio temprano: aceptar antes de que exista la oferta", () => {
  it("el receptor ve la tarjeta «preparando…» y acepta de antemano; al llegar la oferta empieza solo (sin otra pregunta)", async () => {
    const par = crearPar();
    par.retener.oferta = true; // la oferta (con el SHA-256) todavía no está lista
    const { a, b, ofertasB } = montar(par, { politica: preguntar });
    const r = await a.enviarArchivo(par.canalA, datos(64), "video.mp4", { tipo: "dispositivo" }, { tipoMime: "video/mp4" });
    expect(r.ok).toBe(true);

    // El anuncio ya está en B: tarjeta pendiente, en «preparando», con el nombre y el tamaño y SIN oferta.
    await hasta(() => b.estadoDe(r.id)?.fase === "pendiente-aceptar");
    const tarjeta = b.estadoDe(r.id)!;
    expect(tarjeta.preparando).toBe(true);
    expect(tarjeta.motivo).toMatch(/está preparando el archivo/);
    expect(tarjeta.nombre).toBe("video.mp4");
    expect(tarjeta.tamano).toBe(64 * 1024);
    expect(b.ofertasPendientes().map((e) => e.id)).toContain(r.id);
    expect(ofertasB).toEqual([r.id]);
    await r.listo; // el remitente terminó de preparar, pero la oferta está retenida: B aún no la tiene
    expect(par.retenidos).toHaveLength(1);

    // Aceptar de antemano: el remitente se entera, B deja de estar «por decidir».
    b.aceptarOferta(r.id);
    expect(b.estadoDe(r.id)).toMatchObject({ fase: "transfiriendo", preaceptada: true, preparando: true });
    expect(b.ofertasPendientes()).toHaveLength(0);
    expect(par.vistoBaA.some((t) => t.startsWith('{"t":"archivo.preaceptar"'))).toBe(true);
    expect(a.estadoDe(r.id)?.preaceptada).toBe(true);
    // un segundo clic no repite nada
    b.aceptarOferta(r.id);
    expect(par.vistoBaA.filter((t) => t.startsWith('{"t":"archivo.preaceptar"'))).toHaveLength(1);

    // Llega la oferta: empieza SOLA y termina verificada; B nunca vuelve a preguntar.
    par.soltar();
    await hasta(() => b.estadoDe(r.id)?.fase === "completada" && a.estadoDe(r.id)?.fase === "completada");
    expect(ofertasB).toEqual([r.id]); // una sola notificación: la del anuncio
    expect(b.blobRecibido(r.id)!.size).toBe(64 * 1024);
    expect(par.vistoBaA.filter((t) => t.startsWith('{"t":"archivo.aceptar"'))).toHaveLength(1);
  });

  it("rechazar de antemano: el remitente deja de preparar y la oferta no sale", async () => {
    const par = crearPar();
    const { a, b } = montar(par, { politica: preguntar });
    // Un archivo grande para que dé tiempo a rechazar mientras se prepara.
    const r = await a.enviarArchivo(par.canalA, datos(8 * 1024), "grande.bin", { tipo: "dispositivo" });
    await hasta(() => b.estadoDe(r.id)?.fase === "pendiente-aceptar");
    b.rechazarOferta(r.id);
    expect(b.estadoDe(r.id)?.fase).toBe("rechazada");
    await hasta(() => a.estadoDe(r.id)?.fase === "rechazada");
    expect(await r.listo).toBe(false);
    expect(par.vistoAaB.some((t) => t.startsWith('{"t":"archivo.oferta"'))).toBe(false);
  });

  it("política «auto-aceptar» (misma cuenta): la tarjeta sale en «preparando» y se recibe sin preguntar", async () => {
    const par = crearPar();
    par.retener.oferta = true;
    const { a, b, ofertasB } = montar(par, { politica: async () => "auto-aceptar" as const });
    const r = await a.enviarArchivo(par.canalA, datos(32), "a.bin", { tipo: "dispositivo" });
    await hasta(() => b.estadoDe(r.id)?.preparando === true);
    expect(b.estadoDe(r.id)).toMatchObject({ fase: "transfiriendo", preaceptada: true });
    await r.listo;
    par.soltar();
    await hasta(() => b.estadoDe(r.id)?.fase === "completada");
    expect(ofertasB).toHaveLength(0);
  });

  it("un par antiguo (el canal no anuncia) sigue con el flujo de siempre: solo oferta, se pregunta al llegar", async () => {
    const par = crearPar({ anuncio: false });
    const { a, b, ofertasB } = montar(par, { politica: preguntar });
    const r = await a.enviarArchivo(par.canalA, datos(16), "viejo.bin", { tipo: "dispositivo" });
    await r.listo;
    expect(par.vistoAaB.some((t) => t.startsWith('{"t":"archivo.anuncio"'))).toBe(false);
    await hasta(() => b.estadoDe(r.id)?.fase === "pendiente-aceptar");
    expect(b.estadoDe(r.id)?.preparando).toBeFalsy();
    expect(b.estadoDe(r.id)?.sha256).toMatch(/^[0-9a-f]{64}$/);
    b.aceptarOferta(r.id);
    await hasta(() => a.estadoDe(r.id)?.fase === "completada");
    expect(ofertasB).toEqual([r.id]);
  });

  it("un receptor anterior ignora el anuncio (mensaje desconocido) y la oferta le llega igual", async () => {
    // Simula al receptor anterior: su guard no conoce «archivo.anuncio» (devuelve null) — aquí, un motor que lo descarta.
    const par = crearPar();
    const a = crearMotorArchivos({ almacen: crearAlmacenEnMemoria() });
    const b = crearMotorArchivos({ almacen: crearAlmacenEnMemoria(), politica: async () => "auto-aceptar" as const });
    par.canalA.alMensaje((d) => a.manejarMensaje(par.canalA, d, { mismaCuenta: true }));
    par.canalB.alMensaje((d) => {
      if (typeof d === "string" && d.startsWith('{"t":"archivo.anuncio"')) return; // el viejo no lo entiende
      b.manejarMensaje(par.canalB, d, { mismaCuenta: true });
    });
    const r = await a.enviarArchivo(par.canalA, datos(24), "x.bin", { tipo: "dispositivo" });
    await hasta(() => a.estadoDe(r.id)?.fase === "completada");
    expect(b.blobRecibido(r.id)!.size).toBe(24 * 1024);
  });

  it("el guard del protocolo acepta anuncio y preaceptar y rechaza uno mal formado", () => {
    expect(esMensajeArchivoMalla({ t: "archivo.anuncio", id: "x", nombre: "a", tipo: "b", tamano: 1, trozos: 1, tamanoTrozo: 1 })).toBe(true);
    expect(esMensajeArchivoMalla({ t: "archivo.anuncio", id: "x", nombre: 5 })).toBe(false);
    expect(esMensajeArchivoMalla({ t: "archivo.preaceptar", id: "x" })).toBe(true);
  });
});

describe("preparar un archivo grande no bloquea", () => {
  it("50 MB: enviarArchivo vuelve al instante, el anuncio ya está en B y un temporizador sigue disparando durante la preparación", async () => {
    const par = crearPar();
    const { a, b } = montar(par, { politica: preguntar });
    const grande = new Blob([new Uint8Array(50 * 1024 * 1024)]);
    let ticks = 0;
    const reloj = setInterval(() => ticks++, 5);
    const t0 = performance.now();
    const r = await a.enviarArchivo(par.canalA, grande, "pelicula.mp4", { tipo: "dispositivo" }, { tipoMime: "video/mp4" });
    const hastaAnuncio = performance.now() - t0;
    expect(hastaAnuncio).toBeLessThan(1500); // antes: el SHA-256 de los 50 MB, sin tope
    await hasta(() => b.estadoDe(r.id)?.fase === "pendiente-aceptar");
    expect(a.estadoDe(r.id)).toMatchObject({ preparando: true, fase: "esperando-aceptacion" });
    const ticksAlAnuncio = ticks;
    await r.listo;
    clearInterval(reloj);
    const prepMs = performance.now() - t0;
    console.log(`[ARC1110A] 50 MB: anuncio en ${Math.round(hastaAnuncio)} ms, preparado en ${Math.round(prepMs)} ms, ${ticks} ticks (${ticksAlAnuncio} antes de terminar)`);
    expect(ticks).toBeGreaterThan(3);
    expect(a.estadoDe(r.id)?.preparando).toBe(false);
    expect(par.vistoAaB.some((t) => t.startsWith('{"t":"archivo.oferta"'))).toBe(true);
    a.cancelar(r.id);
  }, 60_000);
});

describe("hitos del archivo en el registro de enlaces", () => {
  it("anuncio-enviado → … → verificado, con kbps; sin nombres ni contenido", async () => {
    const lineas: Array<{ hito: string; id: string; detalle: string }> = [];
    fijarSumideroArchivo((l) => lineas.push({ hito: l.hito, id: l.id, detalle: l.detalle }));
    const par = crearPar();
    const { a, b } = montar(par, { politica: preguntar });
    const r = await a.enviarArchivo(par.canalA, datos(1024), "secreto-nombre.bin", { tipo: "dispositivo" });
    await hasta(() => b.estadoDe(r.id)?.fase === "pendiente-aceptar");
    b.aceptarOferta(r.id);
    await hasta(() => a.estadoDe(r.id)?.fase === "completada" && b.estadoDe(r.id)?.fase === "completada");
    const hitos = lineas.map((l) => l.hito);
    for (const h of ["anuncio-enviado", "anuncio-recibido", "preaceptado", "preparado", "oferta-enviada", "oferta-recibida", "aceptado", "primer-trozo", "progreso", "completo", "verificado"]) {
      expect(hitos, h).toContain(h);
    }
    // Orden causal en el remitente.
    expect(hitos.indexOf("anuncio-enviado")).toBeLessThan(hitos.indexOf("preparado"));
    expect(hitos.indexOf("preparado")).toBeLessThan(hitos.indexOf("oferta-enviada"));
    expect(hitos.indexOf("oferta-enviada")).toBeLessThan(hitos.indexOf("completo"));
    // 25 / 50 / 75 una vez por rol.
    expect(lineas.filter((l) => l.hito === "progreso" && l.detalle.endsWith("rol=enviar")).map((l) => l.detalle.split(" ")[0])).toEqual(["25", "50", "75"]);
    expect(lineas.find((l) => l.hito === "completo")!.detalle).toMatch(/^kbps=\d+ bytes=\d+ vias=\S+$/);
    expect(lineas.find((l) => l.hito === "preparado")!.detalle).toMatch(/^ms=\d+ via=(hilo|worker) bytes=1048576$/);
    for (const l of lineas) {
      expect(l.id).toBe(r.id);
      expect(JSON.stringify(l)).not.toContain("secreto-nombre");
    }
  }, 30_000);

  it("fallo motivo=… cuando el archivo llega alterado", async () => {
    const lineas: Array<{ hito: string; detalle: string }> = [];
    fijarSumideroArchivo((l) => lineas.push({ hito: l.hito, detalle: l.detalle }));
    const par = crearPar({
      transformarAaB: (t) => {
        if (!t.startsWith('{"t":"archivo.chunk"')) return t;
        const m = JSON.parse(t) as { datosB64: string };
        return JSON.stringify({ ...m, datosB64: m.datosB64.replace(/^./, (c) => (c === "A" ? "B" : "A")) });
      },
    });
    const { a, b } = montar(par, { politica: async () => "auto-aceptar" as const });
    const r = await a.enviarArchivo(par.canalA, datos(16), "roto.bin", { tipo: "dispositivo" });
    await hasta(() => b.estadoDe(r.id)?.fase === "error");
    expect(lineas.some((l) => l.hito === "fallo" && /^motivo=\S+ lado=receptor$/.test(l.detalle))).toBe(true);
  }, 20_000);
});
