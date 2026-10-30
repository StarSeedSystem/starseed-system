import { describe, expect, it, vi } from "vitest";
import { adnPorDefecto, type AdnAvatar } from "@/lib/avatares/adn/adn";
import type { CambioAvatar } from "@/lib/avatares/adn/cambios";
import { avataresDePresencia, mismosAvatares, sanearMetaAvatar, type MetaAvatar } from "@/lib/vivo/espacial/avatares";
import { EVENTOS_ESCENA, type EventoEscena } from "@/lib/vivo/espacial/canal";
import {
  MAX_CAMBIOS_POR_LOTE, MOTIVO_SIN_ADN, adnParaXr, conectarSincroniaAdn, crearEmisorAdn, crearReceptorAdn,
  nivelAvatarXr, presenciaConAdn, sanearLoteAdn, type LoteAdn,
} from "../sincronia-adn";

const ADN = (rev = 3): AdnAvatar => ({ ...adnPorDefecto("adn-ana", "Ana", { tipo: "perfil", id: "p-ana" }), rev });
const REF = "biblioteca:adn-ana";
const meta = (clave: string, extra: Partial<MetaAvatar> = {}): MetaAvatar => ({
  clave, uid: null, nombre: "Ana", color: "#7C5CFF", modo: "3d", editor: false, desde: 1, ...extra,
});
const tic = () => new Promise((r) => setTimeout(r, 0));
const azul: CambioAvatar = { op: "material", slot: "cabello", campo: "color", valor: "#0000ff" };

function reloj() {
  let t = 0;
  const tareas: { fn: () => void; en: number; id: number }[] = [];
  let sig = 1;
  return {
    ahora: () => t,
    programar: (fn: () => void, ms: number) => { const id = sig++; tareas.push({ fn, en: t + ms, id }); return id; },
    cancelar: (id: unknown) => { const i = tareas.findIndex((x) => x.id === id); if (i >= 0) tareas.splice(i, 1); },
    avanzar(ms: number) {
      t += ms;
      for (const x of tareas.filter((x) => x.en <= t)) { tareas.splice(tareas.indexOf(x), 1); x.fn(); }
    },
  };
}

describe("MetaAvatar con ADN (presencia)", () => {
  it("acepta adnRef interna y adnRev entera; sin ellos queda como antes", () => {
    const m = sanearMetaAvatar({ nombre: "Ana", adnRef: REF, adnRev: 4.7 }, "k1")!;
    expect(m.adnRef).toBe(REF);
    expect(m.adnRev).toBe(4);
    const viejo = sanearMetaAvatar({ nombre: "Ana" }, "k1")!;
    expect("adnRef" in viejo).toBe(false);
    expect("adnRev" in viejo).toBe(false);
  });
  it("rechaza URLs externas como ref", () => {
    expect(sanearMetaAvatar({ adnRef: "https://malo.example/a.vrm", adnRev: 1 }, "k1")!.adnRef).toBeUndefined();
  });
  it("mismosAvatares nota un cambio de revisión del ADN", () => {
    const a = avataresDePresencia({ k1: [{ nombre: "Ana", adnRef: REF, adnRev: 1 }] }, "yo");
    const b = avataresDePresencia({ k1: [{ nombre: "Ana", adnRef: REF, adnRev: 2 }] }, "yo");
    expect(mismosAvatares(a, b)).toBe(false);
  });
  it("presenciaConAdn suma los campos solo con una ref interna", () => {
    expect(presenciaConAdn({ nombre: "Ana" }, REF, 5)).toEqual({ nombre: "Ana", adnRef: REF, adnRev: 5 });
    expect(presenciaConAdn({ nombre: "Ana" }, "https://x.y/z", 5)).toEqual({ nombre: "Ana" });
  });
  it("el canal de la escena lleva el evento adn", () => {
    expect(EVENTOS_ESCENA).toContain("adn");
  });
});

describe("sanearLoteAdn", () => {
  it("filtra los cambios con sanearCambio y descarta lo inválido", () => {
    const l = sanearLoteAdn({ ref: REF, rev: 4, cambios: [azul, { op: "hackear" }, { op: "pieza", slot: "cabeza", ref: "https://x" }] });
    expect(l).toEqual({ ref: REF, rev: 4, cambios: [azul] });
    expect(sanearLoteAdn({ ref: "https://x", rev: 1, cambios: [azul] })).toBeNull();
    expect(sanearLoteAdn({ ref: REF, rev: -1, cambios: [azul] })).toBeNull();
    expect(sanearLoteAdn({ ref: REF, rev: 1, cambios: [] })).toBeNull();
    expect(sanearLoteAdn({ ref: REF, rev: 1, cambios: Array(MAX_CAMBIOS_POR_LOTE + 1).fill(azul) })).toBeNull();
  });
});

describe("receptor", () => {
  it("lee el ADN de quien entra UNA vez por ref+rev, aunque la presencia se repita", async () => {
    const leer = vi.fn(async () => ADN(3));
    const r = crearReceptorAdn(leer);
    const otro = { ...meta("k2", { adnRef: REF, adnRev: 3 }), nombre: "Bea" };
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 }), otro]);
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 }), otro]);
    await tic();
    expect(leer).toHaveBeenCalledTimes(1);
    expect(r.de("k1")?.estado).toBe("listo");
    expect(r.de("k2")?.adn?.id).toBe("adn-ana");
    // Una revisión guardada nueva sí se lee (una vez).
    leer.mockImplementation(async () => ADN(9));
    r.presentes([meta("k1", { adnRef: REF, adnRev: 9 })]);
    r.presentes([meta("k1", { adnRef: REF, adnRev: 9 })]);
    await tic();
    expect(leer).toHaveBeenCalledTimes(2);
    expect(r.de("k1")?.adn?.rev).toBe(9);
    expect(r.de("k2")).toBeNull();
  });

  it("un fallo de lectura se dice y no se reintenta en bucle", async () => {
    const leer = vi.fn(async () => null);
    const r = crearReceptorAdn(leer);
    for (let i = 0; i < 5; i++) r.presentes([meta("k1", { adnRef: REF, adnRev: 3 })]);
    await tic();
    expect(leer).toHaveBeenCalledTimes(1);
    expect(r.de("k1")).toEqual({ estado: "sin-adn", adn: null, motivo: MOTIVO_SIN_ADN });
  });

  it("descarta un ADN leído que no es el de la ref", async () => {
    const r = crearReceptorAdn(async () => ({ ...ADN(3), id: "otro" }));
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 })]);
    await tic();
    expect(r.de("k1")?.estado).toBe("sin-adn");
  });

  it("aplica solo lotes más nuevos y de la ref que esa persona anuncia", async () => {
    const r = crearReceptorAdn(async () => ADN(3));
    const avisos = vi.fn();
    r.suscribir(avisos);
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 })]);
    await tic();
    expect(r.recibir("k1", { ref: REF, rev: 5, cambios: [azul] })).toBe(true);
    expect(r.de("k1")?.adn?.materiales.cabello?.color).toBe("#0000ff");
    expect(r.de("k1")?.adn?.rev).toBe(5);
    expect(r.recibir("k1", { ref: REF, rev: 4, cambios: [{ ...azul, valor: "#ff0000" }] })).toBe(false);
    expect(r.recibir("k1", { ref: "biblioteca:adn-ajeno", rev: 9, cambios: [azul] })).toBe(false);
    expect(r.recibir("k9", { ref: REF, rev: 9, cambios: [azul] })).toBe(false);
    expect(r.de("k1")?.adn?.materiales.cabello?.color).toBe("#0000ff");
    expect(avisos).toHaveBeenCalled();
  });

  it("guarda los lotes que llegan mientras se lee y los aplica después", async () => {
    let soltar: (a: AdnAvatar) => void = () => {};
    const r = crearReceptorAdn(() => new Promise((res) => { soltar = res; }));
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 })]);
    expect(r.recibir("k1", { ref: REF, rev: 4, cambios: [azul] })).toBe(false);
    expect(r.recibir("k1", { ref: REF, rev: 2, cambios: [{ ...azul, valor: "#ff0000" }] })).toBe(false);
    soltar(ADN(3));
    await tic();
    expect(r.de("k1")?.adn?.materiales.cabello?.color).toBe("#0000ff");
    expect(r.de("k1")?.adn?.rev).toBe(4);
  });

  it("si ya tiene una revisión igual o más nueva por el vivo, no vuelve a leer", async () => {
    const leer = vi.fn(async () => ADN(3));
    const r = crearReceptorAdn(leer);
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 })]);
    await tic();
    r.recibir("k1", { ref: REF, rev: 6, cambios: [azul] });
    r.presentes([meta("k1", { adnRef: REF, adnRev: 6 })]);
    expect(leer).toHaveBeenCalledTimes(1);
  });
});

describe("emisor", () => {
  it("no emite si no hay nadie, y a 10 Hz como mucho con poca gente", () => {
    const c = reloj();
    const enviados: LoteAdn[] = [];
    const e = crearEmisorAdn({ enviar: (l) => enviados.push(l), ...c });
    e.fijarGuardado(ADN(3), REF);
    expect(e.cambiar(azul)?.materiales.cabello?.color).toBe("#0000ff"); // tu pantalla, al instante
    expect(enviados).toHaveLength(0);
    e.fijarOtros(1);
    // nadie la tenía pendiente (se vació al no haber nadie) pero sí el diff contra lo guardado
    expect(enviados).toHaveLength(1);
    for (let i = 0; i < 60; i++) { e.cambiar({ op: "morfologia", clave: "altura", valor: i / 60 }); c.avanzar(5); }
    // 300 ms → como mucho 3-4 envíos más (uno inmediato, luego cada 100 ms), y un deslizador viaja como uno
    expect(enviados.length).toBeLessThanOrEqual(5);
    c.avanzar(200);
    const ultimo = enviados[enviados.length - 1];
    expect(ultimo.cambios.filter((x) => x.op === "morfologia")).toHaveLength(1);
    expect(ultimo.rev).toBe(e.actual()!.rev);
    expect(ultimo.ref).toBe(REF);
  });

  it("con 8 o más personas espera 250 ms entre lotes", () => {
    const c = reloj();
    const enviados: LoteAdn[] = [];
    const e = crearEmisorAdn({ enviar: (l) => enviados.push(l), ...c });
    e.fijarGuardado(ADN(3), REF);
    e.fijarOtros(8);
    e.cambiar(azul);
    e.cambiar({ op: "morfologia", clave: "altura", valor: 0.9 });
    expect(enviados).toHaveLength(1);
    c.avanzar(200);
    expect(enviados).toHaveLength(1);
    c.avanzar(60);
    expect(enviados).toHaveLength(2);
  });

  it("con la pestaña oculta no emite; al volver manda lo pendiente", () => {
    const c = reloj();
    const enviados: LoteAdn[] = [];
    const e = crearEmisorAdn({ enviar: (l) => enviados.push(l), ...c });
    e.fijarGuardado(ADN(3), REF);
    e.fijarOtros(2);
    e.pausar();
    e.cambiar(azul);
    c.avanzar(1000);
    expect(enviados).toHaveLength(0);
    e.reanudar();
    expect(enviados).toHaveLength(1);
  });

  it("a quien entra le manda lo no guardado; quien ya lo tenía lo ignora por revisión", async () => {
    const c = reloj();
    const enviados: LoteAdn[] = [];
    const e = crearEmisorAdn({ enviar: (l) => enviados.push(l), ...c });
    const guardado = ADN(3);
    e.fijarGuardado(guardado, REF);
    e.fijarOtros(1);
    const viejo = crearReceptorAdn(async () => guardado);
    viejo.presentes([meta("ana", { adnRef: REF, adnRev: 3 })]);
    await tic();
    e.cambiar(azul);
    viejo.recibir("ana", enviados.at(-1));
    c.avanzar(500);
    e.fijarOtros(2); // entra alguien
    const nuevo = crearReceptorAdn(async () => guardado);
    nuevo.presentes([meta("ana", { adnRef: REF, adnRev: 3 })]);
    await tic();
    expect(nuevo.recibir("ana", enviados.at(-1))).toBe(true);
    expect(viejo.recibir("ana", enviados.at(-1))).toBe(false);
    expect(nuevo.de("ana")?.adn).toEqual(viejo.de("ana")?.adn);
    expect(nuevo.de("ana")?.adn).toEqual(e.actual());
  });

  it("sin ADN fijado o con una ref externa no hace nada", () => {
    const enviar = vi.fn();
    const e = crearEmisorAdn({ enviar });
    expect(e.cambiar(azul)).toBeNull();
    e.fijarGuardado(ADN(3), "https://x.y/a.vrm");
    expect(e.actual()).toBeNull();
    e.destruir();
  });
});

describe("canal de la escena", () => {
  it("viaja como evento adn con `de` y solo entrega lo de otros", async () => {
    const oy = new Set<(ev: EventoEscena, p: unknown) => void>();
    const enviados: { evento: EventoEscena; payload: Record<string, unknown> }[] = [];
    const canal = {
      enviar: (evento: EventoEscena, payload: Record<string, unknown>) => { enviados.push({ evento, payload }); },
      onMensaje: (cb: (ev: EventoEscena, p: unknown) => void) => { oy.add(cb); return () => { oy.delete(cb); }; },
    };
    const r = crearReceptorAdn(async () => ADN(3));
    r.presentes([meta("k1", { adnRef: REF, adnRev: 3 })]);
    await tic();
    const s = conectarSincroniaAdn(canal, "yo", r);
    s.enviar({ ref: REF, rev: 4, cambios: [azul] });
    expect(enviados[0]).toEqual({ evento: "adn", payload: { de: "yo", ref: REF, rev: 4, cambios: [azul] } });
    oy.forEach((cb) => cb("pose", { de: "k1", ref: REF, rev: 9, cambios: [azul] }));
    oy.forEach((cb) => cb("adn", { de: "yo", ref: REF, rev: 9, cambios: [azul] }));
    expect(r.de("k1")?.adn?.rev).toBe(3);
    oy.forEach((cb) => cb("adn", { de: "k1", ref: REF, rev: 5, cambios: [azul] }));
    expect(r.de("k1")?.adn?.rev).toBe(5);
    s.soltar();
    expect(oy.size).toBe(0);
  });
});

describe("XR", () => {
  it("el nivel de avatar sale de la calidad actual y recorta el ADN", () => {
    expect(nivelAvatarXr("minima")).toBe("orbe-manos");
    expect(nivelAvatarXr("maxima")).toBe("vrm-completo");
    const vrm: AdnAvatar = {
      ...ADN(3), base: { tipo: "vrm", ref: "biblioteca:plantilla.vrm" }, esqueleto: { tipo: "vrm-humanoide", articulaciones: 55 },
      expresionBase: { aa: 0.2, angry: 0.4 },
    };
    const minima = adnParaXr(vrm, "minima")!;
    expect(minima.calidad).toBe("orbe-manos");
    expect(minima.adn.base.tipo).toBe("orbe");
    expect(minima.adn.aura).toEqual(vrm.aura);
    const baja = adnParaXr(vrm, "baja")!;
    expect(baja.adn.base.tipo).toBe("vrm");
    expect(baja.adn.expresionBase).toEqual({ aa: 0.2 });
    expect(adnParaXr(null, "alta")).toBeNull();
  });
});
