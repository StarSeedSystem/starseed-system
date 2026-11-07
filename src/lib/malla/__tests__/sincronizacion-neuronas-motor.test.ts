/**
 * Dos (y tres) neuronas EN MEMORIA hablando por un canal local de mentira con las mismas reglas que el
 * real: la app acusa en cuanto guarda la trama y la webview la procesa después. Se prueba el motor
 * entero (solicitud → ventana → aceptar → «Vinculadas» en las dos → recordar → reconexión sola).
 */
import { describe, expect, it } from "vitest";
import {
  crearMotorSync,
  type AvisoSync,
  type DepsMotorSync,
  type MotorSync,
} from "../sincronizacion-neuronas-motor";
import {
  CADUCA_SOLICITUD_MS,
  CLAVE_VINCULOS_LOCAL,
  PUERTO_MALLA_LOCAL,
  claveVinculosCuenta,
  leerVinculos,
  type NeuronaSync,
  type VecinoRedLocal,
} from "../sincronizacion-neuronas";

interface Nodo {
  ip: string;
  yo: NeuronaSync;
  huella: string;
  motor: MotorSync;
  almacen: Map<string, string>;
  avisos: AvisoSync[];
  enviadosNativos: Array<{ ip: string; json: string }>;
}

function crearRed() {
  const reloj = { t: 1_800_000_000_000 };
  const nodos = new Map<string, Nodo>();
  const enVuelo = new Set<Promise<unknown>>();
  let ids = 0;

  function nodo(p: { ip: string; yo: NeuronaSync; huella: string; nativa?: boolean; enLinea?: boolean; almacen?: Map<string, string> }): Nodo {
    const almacen = p.almacen ?? new Map<string, string>();
    const n = { ip: p.ip, yo: p.yo, huella: p.huella, almacen, avisos: [], enviadosNativos: [] } as unknown as Nodo;
    const deps: DepsMotorSync = {
      ahora: () => reloj.t,
      nuevoId: () => `id-${++ids}`,
      neuronaPropia: () => p.yo.neurona,
      yo: async () => p.yo,
      miCuenta: async () => p.yo.cuenta ?? null,
      firmar: async (m) => ({ firmado: true, huella: p.huella, m: JSON.parse(JSON.stringify(m)) }),
      verificar: async (sobre) => {
        const o = sobre as { firmado?: boolean; huella?: string; m?: unknown };
        return { cuerpo: o?.m, huella: o?.huella, valido: o?.firmado === true };
      },
      nativa: {
        disponible: () => p.nativa !== false,
        estado: async () => ({
          escuchando: true,
          puerto: PUERTO_MALLA_LOCAL,
          motivo: "",
          ultimo_seq: 0,
          vecinos: [...nodos.values()]
            .filter((x) => x.ip !== p.ip)
            .map<VecinoRedLocal>((x) => ({ ip: x.ip, propia: false, neurona: null, tipo: "escritorio", puerto: PUERTO_MALLA_LOCAL, canal: true, visto_hace_s: 2 })),
        }),
        enviar: async (ip, _puerto, json) => {
          n.enviadosNativos.push({ ip, json });
          const destino = nodos.get(ip);
          if (!destino) return { ok: false, motivo: `No se pudo conectar con ${ip}:47071: Connection refused` };
          const x = JSON.parse(json) as { t: string; c?: string; b?: unknown };
          if (x.t === "tu.msg" && x.c === "sync") {
            // La app acusa al guardar; la webview lo procesa después.
            const tarea = Promise.resolve().then(() => destino.motor.recibir(x.b, { via: "red-local-nativa", ip: p.ip }));
            enVuelo.add(tarea);
            void tarea.finally(() => enVuelo.delete(tarea));
          }
          return { ok: true, ms: 3 };
        },
      },
      transporte: {
        enviar: async () => ({ ok: false, confirmado: false, tipo: null, motivo: "No hay ningún enlace abierto ahora mismo.", ms: 0 }),
        releCuenta: async () => ({ ok: false, motivo: "sin internet" }),
        enlacesHacia: async () => [],
        enLinea: () => p.enLinea === true,
      },
      almacen: { leer: (k) => almacen.get(k) ?? null, escribir: (k, v) => void almacen.set(k, v) },
    };
    n.motor = crearMotorSync(deps);
    n.motor.alAviso((a) => n.avisos.push(a));
    nodos.set(p.ip, n);
    return n;
  }

  async function calma(): Promise<void> {
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 0));
      if (!enVuelo.size && i >= 2) return;
      await Promise.allSettled([...enVuelo]);
    }
  }

  return { reloj, nodos, nodo, calma };
}

const MAC: NeuronaSync = { neurona: "mac-1", sync: "sync-mac", cuenta: "u-1", nombre: "Mac de Alex", medio: "app-nativa", capacidades: ["canal local (TCP 47071)"] };
const TAB: NeuronaSync = { neurona: "tab-1", sync: "sync-tab", cuenta: "u-1", nombre: "Tablet", medio: "app-nativa", capacidades: ["WebRTC"] };
const OTRA: NeuronaSync = { neurona: "otra-1", nombre: "Portátil de otra persona", capacidades: [] };

describe("motor de sincronización entre neuronas (dos aparatos en memoria)", () => {
  it("Sincronizar ahora sin internet: la otra ve la solicitud al instante; aceptada, las dos quedan Vinculadas y la recuerdan", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    const tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });

    const r = await mac.motor.solicitar({ neurona: "tab-1", nombre: "Tablet" });
    expect(r).toMatchObject({ ok: true, via: "red-local-nativa", ofrecerQr: false });
    expect(r.detalle).toBe("Solicitud enviada por la red local (app nativa, sin internet) · difundida a 1 neurona de esta red · esperando respuesta");
    await red.calma();

    const entrante = tab.motor.instantanea().solicitudes[0];
    expect(entrante).toMatchObject({ direccion: "entrante", estado: "recibida", via: "red-local-nativa", huellaOtro: "id:mac", ip: "192.168.1.10" });
    expect(entrante.otro).toMatchObject({ neurona: "mac-1", nombre: "Mac de Alex", cuenta: "u-1" });
    expect(entrante.otro.capacidades).toEqual(["canal local (TCP 47071)"]);

    mac.motor.recordar(r.id!, true); // la casilla de quien pidió
    expect(await tab.motor.responder(entrante.id, true, true)).toEqual({ ok: true });
    await red.calma();

    expect(mac.motor.solicitud(r.id!)).toMatchObject({ estado: "vinculada", via: "red-local-nativa", ip: "192.168.1.20", huellaOtro: "id:tab" });
    expect(tab.motor.solicitud(entrante.id)).toMatchObject({ estado: "vinculada", recordarOtro: true });
    expect(mac.avisos.map((a) => a.tipo)).toEqual(["vinculadas"]);
    expect(tab.avisos.map((a) => a.tipo)).toEqual(["vinculadas"]);
    expect(tab.avisos[0].texto).toBe("Vinculadas por la red local (app nativa, sin internet) · se recordará para futuros encuentros");

    const vMac = leerVinculos(mac.almacen.get(CLAVE_VINCULOS_LOCAL));
    expect(vMac).toMatchObject([{ neurona: "tab-1", huella: "id:tab", recordado: true, recordadoPorElOtro: true, ultimaIp: "192.168.1.20" }]);
    expect(mac.almacen.get(claveVinculosCuenta("mac-1"))).not.toContain("192.168.1.20"); // a la cuenta, sin IP
    const vivo = mac.motor.instantanea().vinculos[0];
    expect(vivo).toMatchObject({ neurona: "tab-1", enRedLocal: true, capacidades: ["WebRTC"] });
    expect(vivo.sincronizaciones[0]).toMatchObject({ id: r.id, estado: "vinculada", via: "red-local-nativa" });
  });

  it("solo la neurona nombrada enseña la solicitud; las demás de la red la ignoran", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    const tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });
    const otra = red.nodo({ ip: "192.168.1.30", yo: OTRA, huella: "id:otra" });
    const r = await mac.motor.solicitar({ neurona: "tab-1" });
    expect(r.detalle).toContain("difundida a 2 neuronas de esta red");
    await red.calma();
    expect(tab.motor.instantanea().solicitudes).toHaveLength(1);
    expect(otra.motor.instantanea().solicitudes).toHaveLength(0);
  });

  it("rechazar: quien pidió ve «rechazada» con el motivo", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    const tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });
    const r = await mac.motor.solicitar({ neurona: "tab-1", nombre: "Tablet" });
    await red.calma();
    const id = tab.motor.instantanea().solicitudes[0].id;
    await tab.motor.responder(id, false, false);
    await red.calma();
    expect(mac.motor.solicitud(r.id!)).toMatchObject({ estado: "rechazada", motivo: "Tablet la rechazó." });
    expect(mac.avisos.map((a) => a.tipo)).toEqual(["rechazada"]);
    expect(leerVinculos(mac.almacen.get(CLAVE_VINCULOS_LOCAL) ?? null)).toEqual([]);
  });

  it("recordadas en las dos: al reaparecer se vinculan SOLAS (sin ventana) y avisan «reconectada»", async () => {
    const red = crearRed();
    const almMac = new Map<string, string>();
    const almTab = new Map<string, string>();
    let mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac", almacen: almMac });
    let tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab", almacen: almTab });
    const r = await mac.motor.solicitar({ neurona: "tab-1" }, { recordar: true });
    await red.calma();
    await tab.motor.responder(tab.motor.instantanea().solicitudes[0].id, true, true);
    await red.calma();
    expect(mac.motor.solicitud(r.id!)?.estado).toBe("vinculada");

    // Otro día: las dos apps arrancan de nuevo con lo guardado.
    red.reloj.t += 24 * 3600_000;
    red.nodos.clear();
    mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac", almacen: almMac });
    tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab", almacen: almTab });
    tab.motor.cargar();
    mac.motor.activarReconexion(true);
    await mac.motor.refrescarRed(); // el faro vuelve a oír la tablet
    await red.calma();

    const sMac = mac.motor.instantanea().solicitudes[0];
    const sTab = tab.motor.instantanea().solicitudes[0];
    expect(sMac).toMatchObject({ auto: true, estado: "vinculada", ip: "192.168.1.20" });
    expect(sTab).toMatchObject({ auto: true, estado: "vinculada", recordarYo: true });
    expect(mac.avisos.map((a) => a.tipo)).toEqual(["reconectada"]);
    expect(tab.avisos.map((a) => a.tipo)).toEqual(["reconectada"]);

    // Siguen ahí en la vuelta siguiente: no se repite.
    await mac.motor.refrescarRed();
    await red.calma();
    expect(mac.motor.instantanea().solicitudes).toHaveLength(1);
  });

  it("una neurona que dice ser la recordada pero firma con otra identidad NO se acepta sola", async () => {
    const red = crearRed();
    const almTab = new Map<string, string>();
    almTab.set(
      CLAVE_VINCULOS_LOCAL,
      JSON.stringify({ v: 1, vinculos: [{ neurona: "mac-1", nombre: "Mac de Alex", huella: "id:mac", recordado: true, capacidades: [], creado: 1, ultimoEncuentro: 1 }] }),
    );
    const impostor = red.nodo({ ip: "192.168.1.66", yo: MAC, huella: "id:impostor" });
    const tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab", almacen: almTab });
    await impostor.motor.solicitar({ neurona: "tab-1" }, { auto: true });
    await red.calma();
    const s = tab.motor.instantanea().solicitudes[0];
    expect(s).toMatchObject({ estado: "recibida", huellaOtro: "id:impostor" }); // se pregunta: no se acepta sola
    expect(tab.avisos).toEqual([]);
  });

  it("las dos pulsan a la vez: cada solicitud es el «sí» de la otra → Vinculadas sin ventana", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    const tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });
    await Promise.all([mac.motor.solicitar({ neurona: "tab-1" }), tab.motor.solicitar({ neurona: "mac-1" })]);
    await red.calma();
    expect(mac.motor.instantanea().solicitudes.map((s) => [s.direccion, s.estado])).toEqual([["saliente", "vinculada"]]);
    expect(tab.motor.instantanea().solicitudes.map((s) => [s.direccion, s.estado])).toEqual([["saliente", "vinculada"]]);
  });

  it("cancelar desde quien pidió quita la ventana de la otra; sin respuesta, caduca", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    const tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });
    const r = await mac.motor.solicitar({ neurona: "tab-1", nombre: "Tablet" });
    await red.calma();
    await mac.motor.cancelar(r.id!);
    await red.calma();
    expect(tab.motor.instantanea().solicitudes[0]).toMatchObject({ estado: "cancelada", motivo: "Mac de Alex la canceló." });

    const r2 = await mac.motor.solicitar({ neurona: "tab-1", nombre: "Tablet" });
    await red.calma();
    red.reloj.t += CADUCA_SOLICITUD_MS + 1;
    mac.motor.tic();
    tab.motor.tic();
    expect(mac.motor.solicitud(r2.id!)?.estado).toBe("caducada");
    expect(tab.avisos.map((a) => a.tipo)).toContain("caducada");
  });

  it("dice la verdad cuando no hay camino: navegador sin internet → ofrece el QR", async () => {
    const red = crearRed();
    const web = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac", nativa: false, enLinea: false });
    const r = await web.motor.solicitar({ neurona: "tab-1" });
    expect(r.ok).toBe(false);
    expect(r.ofrecerQr).toBe(true);
    expect(r.detalle).toContain("un navegador no puede descubrir otra neurona por sí solo");
    expect(r.intentos).toEqual([{ via: null, ok: false, detalle: "No hay ningún enlace abierto ahora mismo." }]);
    expect(web.motor.solicitud(r.id!)?.estado).toBe("cancelada");
  });

  it("a una IP concreta va directa (sin difundir) y la latencia queda medida", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });
    red.nodo({ ip: "192.168.1.30", yo: OTRA, huella: "id:otra" });
    const r = await mac.motor.solicitar({ ip: "192.168.1.20" });
    expect(r.detalle).toBe("Solicitud enviada por la red local (app nativa, sin internet) · en 192.168.1.20 · esperando respuesta");
    expect(mac.enviadosNativos.map((e) => e.ip)).toEqual(["192.168.1.20"]);
    expect(mac.motor.solicitud(r.id!)?.estado).toBe("recibida"); // la app de la tablet acusó
    await red.calma();
    const tab = red.nodos.get("192.168.1.20")!;
    await tab.motor.responder(tab.motor.instantanea().solicitudes[0].id, true, false);
    await red.calma();
    const vias = await mac.motor.medirVias("tab-1");
    expect(vias.find((v) => v.via === "red-local-nativa")).toMatchObject({ disponible: true, latenciaMs: 3 });
    expect(mac.enviadosNativos.at(-1)?.json).toBe('{"t":"tu.ping","v":1}');
  });

  it("no se pide sincronizar a una misma: «Esa neurona eres tú»", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    expect(await mac.motor.solicitar({ neurona: "mac-1" })).toMatchObject({ ok: false, id: null, detalle: "Esa neurona eres tú." });
    expect(await mac.motor.solicitar({})).toMatchObject({ ok: false, id: null });
  });
});

describe("ajustes por neurona vinculada (VIN1107A)", () => {
  async function vinculadasYReiniciadas() {
    const red = crearRed();
    const almMac = new Map<string, string>();
    const almTab = new Map<string, string>();
    let mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac", almacen: almMac });
    let tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab", almacen: almTab });
    const r = await mac.motor.solicitar({ neurona: "tab-1" }, { recordar: true });
    await red.calma();
    await tab.motor.responder(tab.motor.instantanea().solicitudes[0].id, true, true);
    await red.calma();
    expect(mac.motor.solicitud(r.id!)?.estado).toBe("vinculada");
    red.reloj.t += 24 * 3600_000;
    red.nodos.clear();
    mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac", almacen: almMac });
    tab = red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab", almacen: almTab });
    mac.motor.cargar();
    tab.motor.cargar();
    return { red, mac, tab, almMac };
  }

  it("por defecto reconectar sola y todas las vías; el vínculo vivo lo dice", async () => {
    const { mac } = await vinculadasYReiniciadas();
    expect(mac.motor.instantanea().vinculos[0].ajustes).toEqual({ reconectarSola: true, viasPermitidas: null });
  });

  it("«reconectar sola» apagado en quien pediría: al reaparecer la tablet NO se le pide nada", async () => {
    const { red, mac, almMac } = await vinculadasYReiniciadas();
    mac.motor.cambiarAjustes("tab-1", { reconectarSola: false });
    expect(mac.motor.instantanea().vinculos[0].ajustes.reconectarSola).toBe(false);
    expect(JSON.parse(almMac.get("starseed.malla.vinculos-ajustes.v1")!)).toEqual({ "tab-1": { reconectarSola: false, viasPermitidas: null } });
    mac.motor.activarReconexion(true);
    await mac.motor.refrescarRed();
    await red.calma();
    expect(mac.motor.instantanea().solicitudes).toHaveLength(0);
    expect(mac.enviadosNativos).toHaveLength(0);
  });

  it("«reconectar sola» apagado en quien recibe: la solicitud automática NO se acepta sola, se pregunta", async () => {
    const { red, mac, tab } = await vinculadasYReiniciadas();
    tab.motor.cambiarAjustes("mac-1", { reconectarSola: false });
    mac.motor.activarReconexion(true);
    await mac.motor.refrescarRed();
    await red.calma();
    const entrante = tab.motor.instantanea().solicitudes[0];
    expect(entrante).toMatchObject({ direccion: "entrante", estado: "recibida" });
    expect(tab.avisos).toHaveLength(0);
  });

  it("vías permitidas: sin la red local, la solicitud no sale por ahí y lo explica", async () => {
    const red = crearRed();
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac" });
    red.nodo({ ip: "192.168.1.20", yo: TAB, huella: "id:tab" });
    mac.motor.cambiarAjustes("tab-1", { viasPermitidas: ["rele"] });
    const r = await mac.motor.solicitar({ neurona: "tab-1", nombre: "Tablet" });
    expect(r.ok).toBe(false);
    expect(r.detalle).toContain("está desactivado la red local y los enlaces directos y la malla");
    expect(mac.enviadosNativos).toHaveLength(0);
    // Volver a permitir todas: ya sale por la red local.
    mac.motor.cambiarAjustes("tab-1", { viasPermitidas: null });
    expect(mac.motor.instantanea().vinculos).toHaveLength(0); // sin vínculo aún; el ajuste vive aparte
    const r2 = await mac.motor.solicitar({ neurona: "tab-1", nombre: "Tablet" });
    expect(r2).toMatchObject({ ok: true, via: "red-local-nativa" });
  });

  it("los ajustes guardados se leen al arrancar y olvidar un vínculo no los pierde", async () => {
    const red = crearRed();
    const alm = new Map<string, string>([["starseed.malla.vinculos-ajustes.v1", JSON.stringify({ "tab-1": { reconectarSola: false, viasPermitidas: ["rele", "malla-cuenta"] } })]]);
    const mac = red.nodo({ ip: "192.168.1.10", yo: MAC, huella: "id:mac", almacen: alm });
    expect(mac.motor.ajustes("tab-1")).toEqual({ reconectarSola: false, viasPermitidas: ["rele", "malla-cuenta"] });
    mac.motor.olvidar("tab-1");
    expect(mac.motor.ajustes("tab-1").reconectarSola).toBe(false);
    expect(mac.motor.ajustes("otra")).toEqual({ reconectarSola: true, viasPermitidas: null });
  });
});
