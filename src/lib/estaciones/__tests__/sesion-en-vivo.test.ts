/**
 * Sesión en vivo de punta a punta con canales en memoria, relojes simulados (desfases y retardos
 * conocidos) y criptografía REAL (WebCrypto de Node): sincronización, quien llega tarde, firmas
 * falsas descartadas, estación privada cifrada y la referencia única del reloj.
 */
import { afterEach, describe, expect, it } from "vitest";
import { crearLlaves, crearToken, firmar, idDeLlave } from "../cripto-estacion";
import { RelojComun } from "../reloj-comun";
import { SesionEnVivo, oyentesDe, type CanalEstacion } from "../sesion-en-vivo";
import { posicionEn, type FichaSesion } from "../transmision-parametrica";

/** Tiempo «verdadero» del laboratorio. Cada medio lo ve con su propio desfase. */
let T = 1_700_000_000_000;

/** Bus de difusión en memoria: entregar avanza el tiempo el retardo del tramo. */
function bus(retardo = 12) {
  const miembros: { cb: Set<(t: string) => void> }[] = [];
  const vistos: string[] = [];
  const canal = (): CanalEstacion => {
    const yo = { cb: new Set<(t: string) => void>() };
    miembros.push(yo);
    return {
      tipo: "internet",
      etiqueta: "bus de pruebas",
      enviar(texto) {
        vistos.push(texto);
        T += retardo;
        for (const m of miembros) if (m !== yo) for (const cb of m.cb) cb(texto);
      },
      alRecibir(cb) {
        yo.cb.add(cb);
        return () => yo.cb.delete(cb);
      },
      abierto: () => true,
      oyentes: () => miembros.length - 1,
      cerrar: () => undefined,
    };
  };
  return { canal, vistos };
}

const sinTiempo = {
  poner: (() => 0) as unknown as typeof setTimeout,
  quitar: (() => undefined) as unknown as typeof clearTimeout,
  lotePongMs: 0,
};

async function asentar(): Promise<void> {
  for (let i = 0; i < 30; i++) await new Promise((r) => setTimeout(r, 0));
}

async function nuevaFicha(privada = false) {
  const llaves = await crearLlaves();
  const ficha: FichaSesion = {
    v: 1,
    id: await idDeLlave(llaves.publica),
    fuente: "omnifrecuencias",
    titulo: "Círculo de 432 Hz",
    enlace: "https://omnifrecuencias.vercel.app/",
    pk: llaves.publica,
    privada,
    params: { tipo: "omnifrecuencias", entonacion: { volumen: 0.7, osciladores: [{ id: "a", f: 432, onda: "sine", vol: 0.5, x: 0, y: 0, z: 0 }] } },
    creada: T,
  };
  return { llaves, ficha };
}

function medio(desfase: number) {
  return new RelojComun({ relojLocal: () => T + desfase });
}

const abiertas: SesionEnVivo[] = [];
afterEach(() => {
  for (const s of abiertas.splice(0)) s.cerrar();
});

function sesion(op: ConstructorParameters<typeof SesionEnVivo>[0]) {
  const s = new SesionEnVivo({ ...sinTiempo, ...op });
  abiertas.push(s);
  return s;
}

describe("SesionEnVivo", () => {
  it("un oyente con el reloj 5 s desfasado se sincroniza y suena en el mismo punto", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const b = bus(12);
    const anfitrion = sesion({ ficha, llave: llaves.privada, referencia: true, canales: [b.canal()], reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }) });
    const oyente = sesion({ ficha, canales: [b.canal()], reloj: medio(5000) });
    anfitrion.arrancar();
    oyente.arrancar();
    await asentar();
    for (let i = 0; i < 8; i++) {
      oyente.sondearAhora();
      await asentar();
    }
    const r = oyente.foto().reloj;
    expect(r.modo).toBe("sincronizado");
    expect(Math.abs(oyente.ahora() - anfitrion.ahora())).toBeLessThan(0.5);
    expect(r.cotaMs).toBeGreaterThan(0);

    const res = await anfitrion.accion("iniciar");
    expect(res.ok).toBe(true);
    await asentar();
    T += 3000;
    const pA = anfitrion.foto().posicion;
    const pO = oyente.foto().posicion;
    expect(pO.fase).toBe("sonando");
    expect(Math.abs(pO.posicionMs - pA.posicionMs)).toBeLessThan(0.5);
    expect(pO.ancla).toBe(pA.ancla);
  });

  it("quien llega tarde pide el estado y calcula dónde va sin que nadie le ponga al día", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const b = bus(5);
    const anfitrion = sesion({ ficha, llave: llaves.privada, referencia: true, canales: [b.canal()], reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }) });
    anfitrion.arrancar();
    await anfitrion.accion("iniciar");
    T += 10_000;
    await anfitrion.accion("pausar");
    T += 4_000;
    await anfitrion.accion("reanudar");
    T += 2_500;
    const tarde = sesion({ ficha, canales: [b.canal()], reloj: medio(-321) });
    tarde.arrancar(); // manda «pedir» y el anfitrión contesta con su estado firmado
    await asentar();
    expect(tarde.foto().estado.linea.map((a) => a.tipo)).toEqual(["iniciar", "pausar", "reanudar"]);
    const ahora = anfitrion.ahora();
    expect(posicionEn(tarde.foto().estado, ahora).posicionMs).toBeCloseTo(posicionEn(anfitrion.foto().estado, ahora).posicionMs, 6);
  });

  it("descarta órdenes firmadas con otra llave y las que no llevan firma", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const intruso = await crearLlaves();
    const b = bus(1);
    const oyente = sesion({ ficha, canales: [b.canal()], reloj: medio(0) });
    oyente.arrancar();
    const falso = b.canal();
    const d = JSON.stringify({ n: 1, t: T + 100, tipo: "terminar" });
    falso.enviar(JSON.stringify({ t: "est", s: ficha.id, e: "accion", d, f: await firmar(intruso.privada, `${ficha.id}\naccion\n${d}`) }));
    falso.enviar(JSON.stringify({ t: "est", s: ficha.id, e: "accion", d }));
    await asentar();
    expect(oyente.foto().estado.linea).toHaveLength(0);
    expect(oyente.foto().descartados).toBe(2);
    // La buena sí entra.
    falso.enviar(JSON.stringify({ t: "est", s: ficha.id, e: "accion", d, f: await firmar(llaves.privada, `${ficha.id}\naccion\n${d}`) }));
    await asentar();
    expect(oyente.foto().estado.linea).toHaveLength(1);
  });

  it("un oyente no puede mandar órdenes a todos", async () => {
    const { ficha } = await nuevaFicha();
    const oyente = sesion({ ficha, canales: [bus().canal()], reloj: medio(0) });
    const r = await oyente.accion("pausar");
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/solo quien emite/i);
  });

  it("privada: el contenido viaja cifrado y sin token no se entiende", async () => {
    const { llaves, ficha } = await nuevaFicha(true);
    const token = crearToken();
    const b = bus(3);
    const anfitrion = sesion({ ficha, token, llave: llaves.privada, referencia: true, canales: [b.canal()], reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }) });
    const invitado = sesion({ ficha, token, canales: [b.canal()], reloj: medio(77) });
    const colado = sesion({ ficha, token: crearToken(), canales: [b.canal()], reloj: medio(0) });
    anfitrion.arrancar();
    invitado.arrancar();
    colado.arrancar();
    await anfitrion.accion("iniciar");
    await asentar();
    expect(invitado.foto().estado.linea).toHaveLength(1);
    expect(colado.foto().estado.linea).toHaveLength(0);
    expect(b.vistos.join("\n")).not.toContain("Círculo");
    expect(b.vistos.join("\n")).not.toContain("iniciar");
  });

  it("solo la referencia contesta la hora; otro medio con control calla mientras la oye", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const b = bus(4);
    const ref = sesion({ ficha, llave: llaves.privada, referencia: true, canales: [b.canal()], reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }) });
    const movil = sesion({ ficha, llave: llaves.privada, canales: [b.canal()], reloj: medio(900) });
    const oyente = sesion({ ficha, canales: [b.canal()], reloj: medio(-40) });
    ref.arrancar();
    movil.arrancar();
    oyente.arrancar();
    for (let i = 0; i < 4; i++) {
      movil.sondearAhora();
      await asentar();
    }
    expect(movil.foto().reloj.modo).toBe("sincronizado");
    const antes = b.vistos.length;
    oyente.sondearAhora();
    await asentar();
    const pongs = b.vistos.slice(antes).filter((x) => x.includes('"e":"pong"'));
    expect(pongs).toHaveLength(1); // solo la referencia
    expect(Math.abs(oyente.ahora() - ref.ahora())).toBeLessThan(0.5);
    // El móvil, ya sincronizado, puede mandar órdenes en hora común.
    expect((await movil.accion("iniciar")).ok).toBe(true);
  });

  it("un canal que abre tarde (Realtime suscribiéndose) pide el estado al abrirse", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const b = bus(2);
    const anfitrion = sesion({ ficha, llave: llaves.privada, referencia: true, canales: [b.canal()], reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }) });
    anfitrion.arrancar();
    await anfitrion.accion("iniciar");
    const base = b.canal();
    let abierto = false;
    let avisar: (() => void) | null = null;
    const tardio: CanalEstacion = {
      ...base,
      enviar: (t) => (abierto ? base.enviar(t) : undefined),
      abierto: () => abierto,
      alAbrir: (cb) => {
        avisar = cb;
        return () => (avisar = null);
      },
    };
    const oyente = sesion({ ficha, canales: [tardio], reloj: medio(10) });
    oyente.arrancar(); // su «pedir» se pierde: el canal aún no está abierto
    await asentar();
    expect(oyente.foto().estado.linea).toHaveLength(0);
    abierto = true;
    avisar!();
    await asentar();
    expect(oyente.foto().estado.linea).toHaveLength(1);
  });

  it("las respuestas de hora van en lote: un mensaje para muchos oyentes, sin perder precisión", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const b = bus(10);
    const cola: (() => void)[] = [];
    const ponerManual = ((fn: () => void) => {
      cola.push(fn);
      return cola.length;
    }) as unknown as typeof setTimeout;
    const anfitrion = sesion({
      ficha, llave: llaves.privada, referencia: true, canales: [b.canal()],
      reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }),
      poner: ponerManual, lotePongMs: 200,
    });
    const oyentes = [123, -4567, 89_000].map((d) => sesion({ ficha, canales: [b.canal()], reloj: medio(d) }));
    for (const s of oyentes) s.sondearAhora();
    await asentar();
    const antes = b.vistos.length;
    T += 150; // el lote espera: lo que tarda en contestar se descuenta en la fórmula
    cola.splice(0).forEach((fn) => fn());
    await asentar();
    expect(b.vistos.slice(antes).filter((x) => x.includes('"e":"pong"'))).toHaveLength(1);
    for (const s of oyentes) {
      expect(s.foto().reloj.modo).toBe("sincronizado");
      expect(Math.abs(s.ahora() - anfitrion.ahora())).toBeLessThan(0.5);
    }
  });

  it("una ficha cuya llave no da su id se cierra sola", async () => {
    const { ficha } = await nuevaFicha();
    const otra = await crearLlaves();
    const s = sesion({ ficha: { ...ficha, pk: otra.publica }, canales: [bus().canal()], reloj: medio(0) });
    s.arrancar();
    await asentar();
    expect(s.foto().canales).toHaveLength(0);
    expect(s.foto().descartados).toBe(1);
  });
});

describe("varios canales de red a la vez (Supabase + relé propio)", () => {
  /** El mismo bus visto como otro tipo de canal. */
  const como = (c: CanalEstacion, tipo: CanalEstacion["tipo"]): CanalEstacion => ({ ...c, tipo, etiqueta: tipo });
  const fijo = (tipo: CanalEstacion["tipo"], n: number | null | "lanza"): CanalEstacion => ({
    tipo,
    etiqueta: tipo,
    enviar: () => undefined,
    alRecibir: () => () => undefined,
    abierto: () => true,
    oyentes: () => {
      if (n === "lanza") throw new Error("roto");
      return n;
    },
    cerrar: () => undefined,
  });

  it("oyentesDe: internet y relé son el mismo público (se toma el mayor); los locales se suman", () => {
    expect(oyentesDe([fijo("internet", 4), fijo("rele", 4)])).toBe(4);
    expect(oyentesDe([fijo("internet", 4), fijo("rele", 6)])).toBe(6);
    expect(oyentesDe([fijo("rele", 3)])).toBe(3);
    expect(oyentesDe([fijo("internet", 4), fijo("rele", 4), fijo("local", 1)])).toBe(5);
    expect(oyentesDe([fijo("internet", 4), fijo("local", 1), fijo("local", 1)])).toBe(6);
    expect(oyentesDe([fijo("local", 1)])).toBe(1);
  });

  it("oyentesDe: sin dato de presencia es null, no cero; un canal caído o roto no cuenta", () => {
    expect(oyentesDe([])).toBeNull();
    expect(oyentesDe([fijo("internet", null), fijo("rele", null)])).toBeNull();
    expect(oyentesDe([fijo("internet", null), fijo("rele", 2)])).toBe(2);
    expect(oyentesDe([fijo("internet", "lanza"), fijo("rele", 2)])).toBe(2);
    expect(oyentesDe([fijo("internet", 0), fijo("rele", null)])).toBe(0);
    const sinPresencia: CanalEstacion = { ...fijo("internet", 0), oyentes: undefined };
    expect(oyentesDe([sinPresencia])).toBeNull();
  });

  it("lo mismo recibido por Supabase y por el relé no altera el estado ni se cuenta como descartado", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const a = bus(3);
    const r = bus(3);
    const anfitrion = sesion({
      ficha, llave: llaves.privada, referencia: true, canales: [a.canal(), como(r.canal(), "rele")],
      reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }),
    });
    const oyente = sesion({ ficha, canales: [a.canal(), como(r.canal(), "rele")], reloj: medio(40) });
    anfitrion.arrancar();
    oyente.arrancar();
    await asentar();
    const res = await anfitrion.accion("iniciar");
    expect(res.ok).toBe(true);
    await asentar();
    // La orden salió por los DOS caminos y le llegó dos veces al oyente...
    expect(a.vistos.filter((x) => x.includes('"e":"accion"'))).toHaveLength(1);
    expect(r.vistos.filter((x) => x.includes('"e":"accion"'))).toHaveLength(1);
    // ...pero la línea de tiempo tiene una sola acción (aplicarAccion es idempotente por n).
    expect(oyente.foto().estado.linea).toHaveLength(1);
    expect(oyente.foto().estado.linea[0].n).toBe(res.accion?.n);
    expect(oyente.foto().descartados).toBe(0);
    // Y los conectados no se cuentan dos veces: el anfitrión es 1 persona vista por dos canales.
    expect(oyente.foto().oyentes).toBe(1);
    expect(anfitrion.foto().oyentes).toBe(1);
  });

  it("si cae uno de los dos caminos, la estación sigue llegando por el otro", async () => {
    const { llaves, ficha } = await nuevaFicha();
    const a = bus(3);
    const r = bus(3);
    let releArriba = true;
    const rele = (): CanalEstacion => {
      const c = como(r.canal(), "rele");
      return { ...c, abierto: () => releArriba && c.abierto(), enviar: (t) => (releArriba ? c.enviar(t) : undefined) };
    };
    const anfitrion = sesion({
      ficha, llave: llaves.privada, referencia: true, canales: [a.canal(), rele()],
      reloj: new RelojComun({ esReferencia: true, relojLocal: () => T }),
    });
    const oyente = sesion({ ficha, canales: [a.canal(), rele()], reloj: medio(-9) });
    anfitrion.arrancar();
    oyente.arrancar();
    await asentar();
    releArriba = false; // el relé se cae; Supabase sigue
    await anfitrion.accion("iniciar");
    await asentar();
    expect(oyente.foto().estado.linea.map((x) => x.tipo)).toEqual(["iniciar"]);
    expect(oyente.foto().canales.map((c) => [c.tipo, c.abierto])).toEqual([["internet", true], ["rele", false]]);
  });
});
