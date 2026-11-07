import { describe, expect, it } from "vitest";
import {
  CADUCA_SOLICITUD_MS,
  PUERTO_MALLA_LOCAL,
  autoAceptable,
  candidatosRedLocal,
  destinoDeSenal,
  esperaMiRespuesta,
  fusionarVinculos,
  leerMensaje,
  leerVinculos,
  mensajeRespuesta,
  mensajeSolicitud,
  motivoSinCamino,
  nuevaEntrante,
  nuevaSaliente,
  permitirSolicitud,
  planDeEnvio,
  ponerVinculo,
  reconexionesPendientes,
  senalesRedLocal,
  serializarVinculos,
  sincronizacionesDe,
  solicitudParaMi,
  textoEstado,
  transicion,
  viaDeOrigen,
  viasDeVinculo,
  vinculoDeSolicitud,
  type NeuronaSync,
  type VecinoRedLocal,
  type VinculoNeurona,
} from "../sincronizacion-neuronas";

const T = 1_800_000_000_000;
const MAC: NeuronaSync = { neurona: "mac-1", sync: "sync-mac", cuenta: "u-1", nombre: "Mac de Alex", plataforma: "macOS", medio: "app-nativa", capacidades: ["canal local (TCP 47071)"] };
const TAB: NeuronaSync = { neurona: "tab-1", sync: "sync-tab", cuenta: "u-1", nombre: "Tablet", capacidades: [] };

const vecino = (ip: string, extra: Partial<VecinoRedLocal> = {}): VecinoRedLocal => ({
  ip,
  propia: false,
  neurona: null,
  tipo: "desconocido",
  puerto: PUERTO_MALLA_LOCAL,
  canal: null,
  visto_hace_s: 3,
  ...extra,
});

const vinculo = (neurona: string, extra: Partial<VinculoNeurona> = {}): VinculoNeurona => ({
  neurona,
  nombre: neurona,
  recordado: true,
  recordadoPorElOtro: true,
  capacidades: [],
  creado: T,
  ultimoEncuentro: T,
  ultimaVia: "red-local-nativa",
  huella: "id:huella-" + neurona,
  ...extra,
});

describe("mensajes", () => {
  it("ida y vuelta de una solicitud, saneada", () => {
    const m = mensajeSolicitud({ id: "s1", de: MAC, para: { neurona: "tab-1" }, ahora: T, recordar: true });
    const leido = leerMensaje(JSON.parse(JSON.stringify(m)));
    expect(leido).toMatchObject({ t: "sync.solicitud", id: "s1", para: { neurona: "tab-1" }, recordar: true, auto: false });
    expect(leido?.caduca).toBe(T + CADUCA_SOLICITUD_MS);
    expect(leido?.de.nombre).toBe("Mac de Alex");
  });

  it("rechaza lo que no es del protocolo y limpia lo que sobra", () => {
    expect(leerMensaje(null)).toBeNull();
    expect(leerMensaje({ t: "sync.solicitud", v: 2, id: "x", de: MAC, ts: T })).toBeNull();
    expect(leerMensaje({ t: "otra.cosa", v: 1, id: "x", de: MAC, ts: T })).toBeNull();
    expect(leerMensaje({ t: "sync.respuesta", v: 1, id: "x", de: MAC, ts: T })).toBeNull(); // sin «acepta»
    expect(leerMensaje({ t: "sync.solicitud", v: 1, id: "x y", de: MAC, ts: T })).toBeNull(); // id raro
    expect(leerMensaje({ t: "sync.solicitud", v: 1, id: "x", de: { nombre: "sin id" }, ts: T })).toBeNull();
    const sucio = leerMensaje({
      t: "sync.solicitud",
      v: 1,
      id: "x",
      ts: T,
      caduca: T + 99 * 60_000,
      de: { neurona: "n1", nombre: "  Hola\u0000\nmundo  ", capacidades: Array.from({ length: 30 }, (_, i) => `c${i}`), cuenta: "no válida!" },
    });
    expect(sucio?.de.nombre).toBe("Hola mundo");
    expect(sucio?.de.capacidades).toHaveLength(16);
    expect(sucio?.de.cuenta).toBeUndefined();
    expect(sucio?.caduca).toBe(T + 10 * 60_000); // nadie deja una solicitud viva para siempre
  });

  it("solo es para mí si me nombra, o si llegó directa sin destinatario", () => {
    const yo = { neurona: "tab-1", sync: "sync-tab" };
    const a = leerMensaje(mensajeSolicitud({ id: "a", de: MAC, para: { neurona: "tab-1" }, ahora: T }))!;
    const b = leerMensaje(mensajeSolicitud({ id: "b", de: MAC, para: { neurona: "otra" }, ahora: T }))!;
    const c = leerMensaje(mensajeSolicitud({ id: "c", de: MAC, para: {}, ahora: T }))!;
    const d = leerMensaje(mensajeSolicitud({ id: "d", de: MAC, para: { sync: "sync-tab" }, ahora: T }))!;
    expect(solicitudParaMi(a, yo, false)).toBe(true);
    expect(solicitudParaMi(b, yo, true)).toBe(false);
    expect(solicitudParaMi(c, yo, true)).toBe(true);
    expect(solicitudParaMi(c, yo, false)).toBe(false);
    expect(solicitudParaMi(d, yo, false)).toBe(true);
  });
});

describe("máquina de estados", () => {
  it("camino feliz: enviada → recibida → vinculada (saliente) · recibida → aceptada → vinculada (entrante)", () => {
    let sal = nuevaSaliente({ id: "s1", otro: { ...TAB }, ahora: T });
    expect(sal.estado).toBe("enviada");
    expect(textoEstado(sal)).toBe("Buscando por dónde llegar…");
    sal = transicion(sal, { tipo: "entregada", via: "red-local-nativa", detalle: "en 192.168.1.20" }, T + 5);
    expect(sal.estado).toBe("recibida");
    expect(textoEstado(sal)).toContain("la red local (app nativa, sin internet) · en 192.168.1.20");

    const m = leerMensaje(mensajeSolicitud({ id: "s1", de: MAC, para: { neurona: "tab-1" }, ahora: T }))!;
    let ent = nuevaEntrante(m, { via: "red-local-nativa", ip: "192.168.1.10", huella: "id:mac", ahora: T + 6 });
    expect(ent.estado).toBe("recibida");
    expect(esperaMiRespuesta(ent)).toBe(true);
    expect(textoEstado(ent)).toBe("Mac de Alex quiere sincronizarse contigo (por la red local (app nativa, sin internet))");
    ent = transicion(ent, { tipo: "acepto", recordar: true }, T + 10);
    expect(ent.estado).toBe("aceptada-por-mi");
    expect(esperaMiRespuesta(ent)).toBe(false);

    sal = transicion(sal, { tipo: "respuesta", acepta: true, recordar: true }, T + 11);
    expect(sal.estado).toBe("vinculada");
    expect(sal.recordarOtro).toBe(true);
    ent = transicion(ent, { tipo: "confirmada", recordar: false }, T + 12);
    expect(ent.estado).toBe("vinculada");
    expect(textoEstado(ent)).toBe("Vinculadas por la red local (app nativa, sin internet) · se recordará para futuros encuentros");
    // Las terminales ya no cambian.
    expect(transicion(ent, { tipo: "cancela-el-otro" }, T + 13)).toBe(ent);
  });

  it("rechazo, cancelación, fallo y caducidad dicen su motivo", () => {
    const sal = nuevaSaliente({ id: "s", otro: { ...TAB }, ahora: T });
    expect(transicion(sal, { tipo: "respuesta", acepta: false, recordar: false }, T + 1)).toMatchObject({ estado: "rechazada", motivo: "Tablet la rechazó." });
    expect(transicion(sal, { tipo: "cancelo" }, T + 1)).toMatchObject({ estado: "cancelada", motivo: "La cancelaste." });
    expect(transicion(sal, { tipo: "fallo", motivo: "Sin camino." }, T + 1)).toMatchObject({ estado: "cancelada", motivo: "Sin camino." });
    expect(transicion(sal, { tipo: "reloj" }, T + 1000)).toBe(sal);
    expect(transicion(sal, { tipo: "reloj" }, T + CADUCA_SOLICITUD_MS + 1)).toMatchObject({ estado: "caducada", motivo: "Nadie respondió a tiempo." });

    const m = leerMensaje(mensajeSolicitud({ id: "e", de: MAC, para: {}, ahora: T }))!;
    const ent = nuevaEntrante(m, { via: "enlace-local", ahora: T });
    expect(transicion(ent, { tipo: "rechazo" }, T + 1)).toMatchObject({ estado: "rechazada", motivo: "La rechazaste." });
    const aceptada = transicion(ent, { tipo: "acepto", recordar: false }, T + 1);
    expect(transicion(aceptada, { tipo: "rechazo" }, T + 2)).toBe(aceptada); // ya aceptada: se cancela, no se rechaza
    expect(transicion(aceptada, { tipo: "reloj" }, T + CADUCA_SOLICITUD_MS + 1)).toMatchObject({ estado: "caducada", motivo: "Mac de Alex no confirmó a tiempo." });
  });

  it("lanzada por un agente: el otro acepta y falta la mía («aceptada por el otro»)", () => {
    let sal = nuevaSaliente({ id: "ag", otro: { ...TAB }, ahora: T, aceptoYo: false });
    sal = transicion(sal, { tipo: "respuesta", acepta: true, recordar: false }, T + 1);
    expect(sal.estado).toBe("aceptada-por-el-otro");
    expect(esperaMiRespuesta(sal)).toBe(true);
    expect(textoEstado(sal)).toBe("Tablet aceptó · falta que aceptes tú");
    sal = transicion(sal, { tipo: "acepto", recordar: true }, T + 2);
    expect(sal.estado).toBe("vinculada");
  });

  it("una entrante no se confirma antes de aceptarla, ni acepta respuestas", () => {
    const m = leerMensaje(mensajeSolicitud({ id: "e", de: MAC, para: {}, ahora: T }))!;
    const ent = nuevaEntrante(m, { via: "rele", ahora: T });
    expect(transicion(ent, { tipo: "confirmada" }, T + 1)).toBe(ent);
    expect(transicion(ent, { tipo: "respuesta", acepta: true, recordar: true }, T + 1)).toBe(ent);
  });
});

describe("vínculos", () => {
  it("una solicitud vinculada deja un vínculo con huella, vía e IP", () => {
    const m = leerMensaje(mensajeSolicitud({ id: "e", de: MAC, para: {}, ahora: T }))!;
    let ent = nuevaEntrante(m, { via: "red-local-nativa", ip: "192.168.1.10", huella: "id:mac", ahora: T });
    expect(vinculoDeSolicitud(ent, undefined, T)).toBeNull();
    ent = transicion(transicion(ent, { tipo: "acepto", recordar: true }, T), { tipo: "confirmada", recordar: true }, T);
    const v = vinculoDeSolicitud(ent, undefined, T + 1)!;
    expect(v).toMatchObject({ neurona: "mac-1", huella: "id:mac", recordado: true, recordadoPorElOtro: true, ultimaVia: "red-local-nativa", ultimaIp: "192.168.1.10" });
  });

  it("se guardan solo los recordados; a la cuenta, sin IP", () => {
    const lista = ponerVinculo(ponerVinculo([], vinculo("a", { ultimaIp: "192.168.1.5" })), vinculo("b", { recordado: false }));
    const local = leerVinculos(serializarVinculos(lista, "local"));
    const cuenta = leerVinculos(serializarVinculos(lista, "cuenta"));
    expect(local.map((v) => v.neurona)).toEqual(["a"]);
    expect(local[0].ultimaIp).toBe("192.168.1.5");
    expect(cuenta[0].ultimaIp).toBeUndefined();
    expect(serializarVinculos(lista, "cuenta")).not.toContain("192.168");
    expect(leerVinculos("{roto")).toEqual([]);
    expect(leerVinculos(JSON.stringify({ vinculos: [{ nombre: "sin id" }, { neurona: "ok", ultimaIp: "no-ip" }] }))).toMatchObject([{ neurona: "ok" }]);
  });

  it("fusión: gana el encuentro más reciente y la IP es del aparato", () => {
    const local = [vinculo("a", { ultimoEncuentro: T, ultimaIp: "192.168.1.5", nombre: "viejo" })];
    const cuenta = [vinculo("a", { ultimoEncuentro: T + 10, nombre: "nuevo" }), vinculo("b")];
    const f = fusionarVinculos(local, cuenta);
    expect(f.find((v) => v.neurona === "a")).toMatchObject({ nombre: "nuevo", ultimaIp: "192.168.1.5" });
    expect(f.map((v) => v.neurona).sort()).toEqual(["a", "b"]);
  });

  it("se acepta solo una neurona recordada con LA MISMA huella", () => {
    expect(autoAceptable(vinculo("a"), "id:huella-a")).toBe(true);
    expect(autoAceptable(vinculo("a"), "id:otra")).toBe(false);
    expect(autoAceptable(vinculo("a", { recordado: false }), "id:huella-a")).toBe(false);
    expect(autoAceptable(vinculo("a", { huella: undefined }), "id:huella-a")).toBe(false);
    expect(autoAceptable(undefined, "id:huella-a")).toBe(false);
  });

  it("limitador: 3 solicitudes por minuto de una misma identidad", () => {
    let h: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = permitirSolicitud(h, T + i);
      expect(r.permitir).toBe(true);
      h = r.historial;
    }
    expect(permitirSolicitud(h, T + 10).permitir).toBe(false);
    expect(permitirSolicitud(h, T + 60_001).permitir).toBe(true);
  });
});

describe("red local", () => {
  const vecinos = [
    vecino("192.168.1.20", { propia: true, neurona: "tab-1", canal: true }),
    vecino("192.168.1.30"),
    vecino("192.168.1.40", { canal: false }),
    vecino("192.168.1.50", { propia: true, neurona: "otra-neurona", canal: true }),
    vecino("192.168.1.60"),
  ];

  it("exactos: por id de faro, por IP o por la última IP de un vínculo", () => {
    expect(candidatosRedLocal(vecinos, { neurona: "tab-1" })).toMatchObject({ exactos: true, lista: [{ ip: "192.168.1.20" }] });
    expect(candidatosRedLocal(vecinos, { ip: "192.168.1.30" })).toMatchObject({ exactos: true, lista: [{ ip: "192.168.1.30" }] });
    expect(candidatosRedLocal(vecinos, { neurona: "mac-9" }, [vinculo("mac-9", { ultimaIp: "192.168.1.60" })])).toMatchObject({
      exactos: true,
      lista: [{ ip: "192.168.1.60" }],
    });
    // La IP de una señal que ya no se oye: se intenta igual.
    expect(candidatosRedLocal([], { ip: "192.168.1.99" }).lista[0]).toMatchObject({ ip: "192.168.1.99", puerto: PUERTO_MALLA_LOCAL });
  });

  it("probables: solo las anónimas con canal, nunca otra neurona identificada ni la IP de otro vínculo", () => {
    const r = candidatosRedLocal(vecinos, { neurona: "mac-9" }, [vinculo("otro", { ultimaIp: "192.168.1.60" })]);
    expect(r.exactos).toBe(false);
    expect(r.lista.map((v) => v.ip)).toEqual(["192.168.1.30"]);
    expect(candidatosRedLocal(vecinos, {}).lista).toEqual([]);
  });

  it("plan: canal nativo primero, luego transporte, luego relé de la cuenta; QR solo sin internet ni canal", () => {
    expect(planDeEnvio({ nativa: true, candidatosLan: 2, enLinea: true, sesion: true }).pasos).toEqual(["red-local-nativa", "transporte", "rele-cuenta"]);
    expect(planDeEnvio({ nativa: true, candidatosLan: 0, enLinea: false, sesion: true })).toMatchObject({ pasos: ["transporte"], ofrecerQr: true });
    const navegador = planDeEnvio({ nativa: false, candidatosLan: 0, enLinea: false, sesion: false });
    expect(navegador.ofrecerQr).toBe(true);
    expect(navegador.sinCamino).toContain("un navegador no puede descubrir otra neurona por sí solo");
    expect(planDeEnvio({ nativa: true, candidatosLan: 1, enLinea: false, sesion: false })).toMatchObject({ pasos: ["red-local-nativa", "transporte"], ofrecerQr: false });
    expect(motivoSinCamino({ nativa: true, candidatosLan: 0, enLinea: false, sesion: false })).toContain("no oye ninguna otra neurona");
  });

  it("vía de un mensaje según su origen", () => {
    expect(viaDeOrigen({ tipo: "local", enlaceId: "nativo:192.168.1.5" })).toBe("red-local-nativa");
    expect(viaDeOrigen({ tipo: "local", enlaceId: "local:ab" })).toBe("enlace-local");
    expect(viaDeOrigen({ tipo: "cuenta" })).toBe("malla-cuenta");
    expect(viaDeOrigen({ tipo: "par" })).toBe("vinculo-par");
    expect(viaDeOrigen({ tipo: "rele" })).toBe("rele");
    expect(viaDeOrigen({ tipo: "lora" })).toBe("lora");
  });

  it("señales del radar: una por IP, sin duplicar las neuronas ya pintadas, con «Sincronizar ahora»", () => {
    const s = senalesRedLocal(vecinos, [vinculo("mac-9", { ultimaIp: "192.168.1.60", nombre: "Portátil" })], T, new Set(["tab-1"]));
    expect(s.map((x) => x.id)).toEqual(["lan:192.168.1.30", "lan:192.168.1.40", "lan:192.168.1.50", "lan:192.168.1.60"]);
    const portatil = s.find((x) => x.id === "lan:192.168.1.60")!;
    expect(portatil.label).toBe("Portátil");
    expect(portatil.starseed?.neuronId).toBe("mac-9");
    expect(portatil.actions[0]).toMatchObject({ id: "sync-now", enabled: true });
    const vieja = s.find((x) => x.id === "lan:192.168.1.40")!;
    expect(vieja.actions[0].enabled).toBe(false);
    expect(vieja.compatible).toBe(false);
    expect(s.find((x) => x.id === "lan:192.168.1.50")?.label).toBe("Neurona de tu cuenta en esta red");
  });

  it("reconexión: solo las recordadas que REAPARECEN, sin solicitud en curso ni intento reciente", () => {
    const vinculos = [vinculo("tab-1"), vinculo("mac-9", { ultimaIp: "192.168.1.60" }), vinculo("nada", { recordado: false })];
    const r1 = reconexionesPendientes({ vinculos, vecinos, presentesAntes: new Set(), ultimosIntentos: {}, enCurso: new Set(), ahora: T });
    expect(r1.reconectar.map((x) => [x.vinculo.neurona, x.ip])).toEqual([
      ["tab-1", "192.168.1.20"],
      ["mac-9", "192.168.1.60"],
    ]);
    const r2 = reconexionesPendientes({ vinculos, vecinos, presentesAntes: r1.presentes, ultimosIntentos: {}, enCurso: new Set(), ahora: T + 15_000 });
    expect(r2.reconectar).toEqual([]); // siguen ahí: no se repite
    const r3 = reconexionesPendientes({ vinculos, vecinos, presentesAntes: new Set(), ultimosIntentos: { "tab-1": T }, enCurso: new Set(["mac-9"]), ahora: T + 5_000 });
    expect(r3.reconectar).toEqual([]);
  });
});

describe("señales → destino y API del panel", () => {
  it("destino de cada tipo de señal", () => {
    expect(destinoDeSenal({ id: "lan:192.168.1.20", label: "x", starseed: null })).toEqual({ ip: "192.168.1.20", nombre: "x" });
    expect(
      destinoDeSenal({
        id: "neuron:tab-1",
        label: "Tablet",
        starseed: { via: "neuron-registry", sourceId: "tab-1", name: "Tablet", ownAccount: true, capabilities: [], syncDeviceId: "sync-tab" },
      }),
    ).toEqual({ neurona: "tab-1", sync: "sync-tab", nombre: "Tablet" });
    expect(
      destinoDeSenal({
        id: "beacon:mesh-7",
        label: "Faro",
        starseed: { via: "relay-beacon", sourceId: "mesh-7", neuronId: "n-7", name: null, ownAccount: true, capabilities: [] },
      }),
    ).toEqual({ neurona: "n-7", identidadRele: "mesh-7", nombre: "Faro" });
    expect(
      destinoDeSenal({
        id: "local:ab",
        label: "Enlazado",
        starseed: { via: "direct-link", sourceId: "local:ab", name: "Enlazado", ownAccount: false, capabilities: [], syncDeviceId: "s-9" },
      }),
    ).toEqual({ enlaceId: "local:ab", sync: "s-9", nombre: "Enlazado" });
    expect(destinoDeSenal({ id: "ble:aa", label: "Auriculares", starseed: null })).toBeNull();
  });

  it("vías con latencia: la medida por ping manda; sin medida, la del enlace; sin nada, null", () => {
    const vias = viasDeVinculo(
      { redLocal: { ip: "192.168.1.20", canal: true }, enlaceLocal: null, mallaCuenta: { id: "cuenta:s", rttMs: 41 }, vinculoPar: null, rele: false },
      { "red-local-nativa": { ms: 7, at: T } },
    );
    expect(vias.find((v) => v.via === "red-local-nativa")).toMatchObject({ disponible: true, latenciaMs: 7, medidoEn: T });
    expect(vias.find((v) => v.via === "malla-cuenta")).toMatchObject({ disponible: true, latenciaMs: 41, medidoEn: null });
    expect(vias.find((v) => v.via === "enlace-local")).toMatchObject({ disponible: false, latenciaMs: null });
    expect(vias.find((v) => v.via === "rele")).toMatchObject({ disponible: false });
  });

  it("sincronizaciones de una neurona, la más reciente primero", () => {
    const a = { ...nuevaSaliente({ id: "a", otro: { ...TAB }, ahora: T }), actualizada: T + 1 };
    const b = { ...nuevaSaliente({ id: "b", otro: { ...TAB }, ahora: T }), actualizada: T + 5 };
    const c = nuevaSaliente({ id: "c", otro: { ...MAC }, ahora: T });
    const r = sincronizacionesDe("tab-1", [a, b, c]);
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
    expect(r[0]).toMatchObject({ direccion: "saliente", estado: "enviada", via: null });
  });

  it("respuesta construida con su decisión", () => {
    expect(leerMensaje(mensajeRespuesta("s1", TAB, true, true, T))).toMatchObject({ t: "sync.respuesta", acepta: true, recordar: true });
  });
});
