// @vitest-environment jsdom
/**
 * Perfil de un agente en la red (Ola 1025U · U3): privado por defecto, vinculado solo a entidades concretas,
 * dispositivos virtuales sin tope y almacén por agente.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  EVENTO_PERFIL_AGENTE, actualizarPerfilAgente, agregarDispositivo, claveEntidad, clavePerfilAgente, desvincular,
  entidadDeOs, fijarDisposicion, fijarVisibilidad, guardarPerfilAgente, leerPerfilAgente, motivoSinPublicar,
  normalizarPerfil, perfilPorDefecto, puedePublicarEn, quitarDispositivo, renombrarDispositivo, tipoOsDeEntidad,
  vincular,
} from "../perfil-agente";

const AGENTE = "personalidad:aurora";
const HUERTO = { tipo: "grupo", id: "huerto" } as const;
const CALLE = { tipo: "pagina", id: "calle-viva" } as const;

beforeEach(() => localStorage.clear());

describe("un agente recién nacido", () => {
  it("es privado, sin vínculos ni dispositivos", () => {
    const p = perfilPorDefecto(AGENTE);
    expect(p).toMatchObject({ visibilidad: "privado", vinculos: [], dispositivos: [], agenteId: AGENTE });
  });

  it("no puede publicar en ningún sitio", () => {
    const p = perfilPorDefecto(AGENTE);
    expect(puedePublicarEn(p, HUERTO)).toBe(false);
    expect(puedePublicarEn(p, { tipo: "red", id: "red" })).toBe(false);
    expect(puedePublicarEn(p, null)).toBe(false);
  });
});

describe("puedePublicarEn", () => {
  it("en privado NO publica aunque tenga vínculos guardados", () => {
    const p = vincular(perfilPorDefecto(AGENTE), HUERTO, 1);
    expect(p.vinculos).toHaveLength(1);
    expect(p.visibilidad).toBe("privado");
    expect(puedePublicarEn(p, HUERTO)).toBe(false);
    expect(motivoSinPublicar(p, HUERTO)).toMatch(/solo privado/);
  });

  it("vinculado publica SOLO en las entidades elegidas", () => {
    let p = fijarVisibilidad(perfilPorDefecto(AGENTE), "vinculado", 1);
    p = vincular(p, HUERTO, 2);
    expect(puedePublicarEn(p, HUERTO)).toBe(true);
    expect(puedePublicarEn(p, CALLE)).toBe(false);
    expect(puedePublicarEn(p, { tipo: "grupo", id: "otro" })).toBe(false);
    expect(motivoSinPublicar(p, CALLE)).toMatch(/no está vinculado/);
  });

  it("nunca publica en «la red en general»: un vínculo siempre es a algo concreto", () => {
    const p = vincular(fijarVisibilidad(perfilPorDefecto(AGENTE), "vinculado", 1), HUERTO, 2);
    expect(puedePublicarEn(p, { tipo: "red", id: "red" })).toBe(false);
    expect(motivoSinPublicar(p, { tipo: "red", id: "red" })).toMatch(/concretos/);
  });

  it("una comunidad y una página con el mismo id son la misma entidad (comparten tabla)", () => {
    const p = vincular(fijarVisibilidad(perfilPorDefecto(AGENTE), "vinculado", 1), { tipo: "comunidad", id: "plaza" }, 2);
    expect(puedePublicarEn(p, { tipo: "pagina", id: "plaza" })).toBe(true);
    expect(claveEntidad({ tipo: "comunidad", id: "plaza" })).toBe(claveEntidad({ tipo: "pagina", id: "plaza" }));
  });

  it("desvincular cierra la puerta de esa entidad y deja las demás", () => {
    let p = fijarVisibilidad(perfilPorDefecto(AGENTE), "vinculado", 1);
    p = vincular(vincular(p, HUERTO, 2), CALLE, 3);
    p = desvincular(p, HUERTO, 4);
    expect(puedePublicarEn(p, HUERTO)).toBe(false);
    expect(puedePublicarEn(p, CALLE)).toBe(true);
  });
});

describe("vínculos: nada inventado", () => {
  it("rechaza ids inválidos y no duplica", () => {
    const base = perfilPorDefecto(AGENTE);
    expect(vincular(base, { tipo: "grupo", id: "con espacios!" }, 1)).toBe(base);
    expect(vincular(base, { tipo: "grupo", id: "" }, 1)).toBe(base);
    const uno = vincular(base, HUERTO, 1);
    expect(vincular(uno, HUERTO, 2)).toBe(uno);
    expect(vincular(uno, { tipo: "grupo", id: "huerto", nombre: "Huerto" }, 2).vinculos).toHaveLength(1);
  });

  it("entidadDeOs traduce lo real del OS y descarta lo que no es un grupo o una página", () => {
    expect(entidadDeOs("group", "huerto", undefined, "Huerto")).toEqual({ tipo: "grupo", id: "huerto", nombre: "Huerto" });
    expect(entidadDeOs("page", "plaza", "comunidad")).toEqual({ tipo: "comunidad", id: "plaza" });
    expect(entidadDeOs("page", "calle", "pagina")).toEqual({ tipo: "pagina", id: "calle" });
    expect(entidadDeOs("event", "x")).toBeNull();
    expect(entidadDeOs("group", "")).toBeNull();
    expect(tipoOsDeEntidad({ tipo: "grupo" })).toBe("group");
    expect(tipoOsDeEntidad({ tipo: "comunidad" })).toBe("page");
  });
});

describe("dispositivos virtuales: sin tope", () => {
  it("admite tantos como se quiera, cada uno con su id", () => {
    let p = perfilPorDefecto(AGENTE);
    for (let i = 0; i < 250; i++) p = agregarDispositivo(p, { tipo: i % 2 ? "vr" : "movil" }, `d${i}`, i);
    expect(p.dispositivos).toHaveLength(250);
    expect(new Set(p.dispositivos.map((d) => d.id)).size).toBe(250);
  });

  it("cubre pantalla, móvil, tableta, VR y AR; el nombre por defecto es el del tipo", () => {
    let p = perfilPorDefecto(AGENTE);
    (["pantalla", "movil", "tableta", "vr", "ar"] as const).forEach((tipo, i) => { p = agregarDispositivo(p, { tipo }, `d${i}`, i); });
    expect(p.dispositivos.map((d) => d.tipo)).toEqual(["pantalla", "movil", "tableta", "vr", "ar"]);
    expect(p.dispositivos.every((d) => d.nombre.length > 0)).toBe(true);
  });

  it("no repite id, renombra, quita y rechaza tipos que no existen", () => {
    let p = agregarDispositivo(perfilPorDefecto(AGENTE), { tipo: "ar", nombre: "Gafas" }, "g1", 1);
    expect(agregarDispositivo(p, { tipo: "ar" }, "g1", 2)).toBe(p);
    expect(agregarDispositivo(p, { tipo: "holograma" as never }, "h1", 2)).toBe(p);
    p = renombrarDispositivo(p, "g1", "  Gafas del taller  ", 3);
    expect(p.dispositivos[0].nombre).toBe("Gafas del taller");
    expect(renombrarDispositivo(p, "g1", "   ", 4)).toBe(p);
    p = quitarDispositivo(p, "g1", 5);
    expect(p.dispositivos).toEqual([]);
  });

  it("la disposición del OS es una referencia: se asigna, se cambia y se quita", () => {
    let p = agregarDispositivo(perfilPorDefecto(AGENTE), { tipo: "pantalla" }, "p1", 1);
    p = fijarDisposicion(p, "p1", { tipo: "escritorio", ref: "esc-1", nombre: "Mi taller" }, 2);
    expect(p.dispositivos[0].disposicion).toEqual({ tipo: "escritorio", ref: "esc-1", nombre: "Mi taller" });
    expect(fijarDisposicion(p, "p1", { tipo: "escritorio", ref: "  " }, 3)).toBe(p);
    p = fijarDisposicion(p, "p1", null, 4);
    expect(p.dispositivos[0].disposicion).toBeUndefined();
  });
});

describe("normalizarPerfil: lo que llega de fuera no se cree", () => {
  it("basura → perfil privado vacío", () => {
    expect(normalizarPerfil(null, AGENTE)).toEqual(perfilPorDefecto(AGENTE));
    expect(normalizarPerfil("hola", AGENTE)).toEqual(perfilPorDefecto(AGENTE));
  });

  it("descarta vínculos y dispositivos mal formados y repetidos; una visibilidad rara es privado", () => {
    const p = normalizarPerfil({
      visibilidad: "publico-total",
      vinculos: [HUERTO, HUERTO, { tipo: "evento", id: "x" }, { tipo: "grupo", id: "no valido!" }, 7],
      dispositivos: [{ id: "a", tipo: "vr" }, { id: "a", tipo: "ar" }, { id: "b", tipo: "nave" }, { tipo: "vr" }],
    }, AGENTE);
    expect(p.visibilidad).toBe("privado");
    expect(p.vinculos).toEqual([HUERTO]);
    expect(p.dispositivos).toHaveLength(1);
    expect(p.dispositivos[0]).toMatchObject({ id: "a", tipo: "vr" });
  });
});

describe("almacén por agente", () => {
  it("guarda con la clave del agente, lo relee igual y avisa con un evento", () => {
    const avisos: string[] = [];
    const oir = (e: Event) => avisos.push((e as CustomEvent).detail.agenteId);
    window.addEventListener(EVENTO_PERFIL_AGENTE, oir);
    const p = vincular(fijarVisibilidad(perfilPorDefecto(AGENTE), "vinculado", 5), HUERTO, 6);
    guardarPerfilAgente(p);
    window.removeEventListener(EVENTO_PERFIL_AGENTE, oir);
    expect(localStorage.getItem(clavePerfilAgente(AGENTE))).toBeTruthy();
    expect(leerPerfilAgente(AGENTE)).toEqual(p);
    expect(avisos).toEqual([AGENTE]);
  });

  it("cada agente tiene el suyo y un JSON roto vuelve a privado", () => {
    guardarPerfilAgente(fijarVisibilidad(perfilPorDefecto("bot:a"), "vinculado", 1));
    expect(leerPerfilAgente("bot:a").visibilidad).toBe("vinculado");
    expect(leerPerfilAgente("bot:b").visibilidad).toBe("privado");
    localStorage.setItem(clavePerfilAgente("bot:c"), "{no es json");
    expect(leerPerfilAgente("bot:c").visibilidad).toBe("privado");
  });

  it("actualizarPerfilAgente no escribe si el reductor no cambia nada", () => {
    const a = actualizarPerfilAgente({ id: AGENTE }, (p, ahora) => fijarVisibilidad(p, "privado", ahora), 10);
    expect(localStorage.getItem(clavePerfilAgente(AGENTE))).toBeNull();
    expect(a.visibilidad).toBe("privado");
    const b = actualizarPerfilAgente({ id: AGENTE }, (p, ahora) => fijarVisibilidad(p, "vinculado", ahora), 11);
    expect(b.actualizado).toBe(11);
    expect(leerPerfilAgente(AGENTE).visibilidad).toBe("vinculado");
  });
});
