// @vitest-environment jsdom
/** Almacén (memoria + espejo local) y registro de usos de permisos directos (Ola 1026P · P2). */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { EVENTO_GOBIERNO_PROTO, entornoDeCache, guardarEstado, leerEstado, olvidarTodo, claveEntidad } from "../almacen";
import { DONDE_SE_GUARDA_EL_REGISTRO, leerUsosPermiso, olvidarUsos, registrarUsoPermiso } from "../registro";
import { decidirCambioConReglas } from "../decision";
import { reglasPorDefecto } from "../reglas";
import type { ActorProto, ContextoProto } from "../../peticion/contrato";

const E = { tipo: "grupo" as const, id: "semilla" };
const AHORA = 1_800_000_000_000;

beforeEach(() => {
  olvidarTodo();
  olvidarUsos();
  window.localStorage.clear();
});

describe("almacén", () => {
  it("sin nada guardado no sabe nada de la entidad", () => {
    expect(leerEstado(E)).toBeNull();
    expect(entornoDeCache(E)).toEqual({});
  });

  it("lo guardado se recupera de la memoria y, tras un reinicio, del espejo de este aparato", () => {
    const reglas = { ...reglasPorDefecto("grupo"), visibilidad: "publica" as const };
    guardarEstado(E, { reglas, modoGobierno: "hierarchical", origen: "aparato", leidoEn: AHORA, votacion: { umbral: 66 } });
    expect(leerEstado(E)?.reglas?.visibilidad).toBe("publica");
    // Sin memoria (otra pestaña / recarga): sale del espejo local.
    const raw = window.localStorage.getItem("starseed.protomolecula.gobierno.v1");
    olvidarTodo();
    window.localStorage.setItem("starseed.protomolecula.gobierno.v1", raw as string);
    const s = leerEstado(E);
    expect(s?.origen).toBe("aparato");
    expect(s?.modoGobierno).toBe("hierarchical");
    expect(s?.votacion?.umbral).toBe(66);
    expect(entornoDeCache(E)).toMatchObject({ modoGobierno: "hierarchical", votacion: { umbral: 66 } });
  });

  it("no se fía del espejo local: lo manipulado se sanea", () => {
    window.localStorage.setItem(
      "starseed.protomolecula.gobierno.v1",
      JSON.stringify({ [claveEntidad(E)]: { reglas: { visibilidad: "privada", cambios: { reglas: "propuesta" }, permisosDirectos: [{ id: "x", sujeto: { tipo: "persona", usuarioId: "u" }, tipos: ["reglas"] }] }, modoGobierno: "raro", origen: "cuenta" } }),
    );
    const s = leerEstado(E);
    expect(s?.modoGobierno).toBe("democratic");
    expect(s?.reglas?.cambios.reglas).toBe("votacion");
    expect(s?.reglas?.permisosDirectos).toEqual([]);
    expect(s?.reglas?.acceso.abrir).toBe("gestion");
  });

  it("JSON roto o con otra forma no rompe nada", () => {
    window.localStorage.setItem("starseed.protomolecula.gobierno.v1", "{no es json");
    expect(leerEstado(E)).toBeNull();
    window.localStorage.setItem("starseed.protomolecula.gobierno.v1", JSON.stringify([1, 2]));
    expect(leerEstado(E)).toBeNull();
  });

  it("guarda como mucho 40 entidades, olvidando las más antiguas", () => {
    for (let i = 0; i < 45; i++) guardarEstado({ tipo: "grupo", id: `g-${i}` }, { reglas: null, modoGobierno: "democratic", origen: "ninguno", leidoEn: i });
    const todo = JSON.parse(window.localStorage.getItem("starseed.protomolecula.gobierno.v1") as string);
    expect(Object.keys(todo)).toHaveLength(40);
    expect(todo["grupo:g-0"]).toBeUndefined();
    expect(todo["grupo:g-44"]).toBeDefined();
  });

  it("si el almacenamiento falla, la memoria de la sesión sigue valiendo", () => {
    const espia = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("lleno"); });
    expect(() => guardarEstado(E, { reglas: null, modoGobierno: "democratic", origen: "ninguno", leidoEn: AHORA })).not.toThrow();
    expect(leerEstado(E)?.modoGobierno).toBe("democratic");
    espia.mockRestore();
  });

  it("el evento de gobierno existe con un nombre estable", () => {
    expect(EVENTO_GOBIERNO_PROTO).toBe("starseed:protomolecula-gobierno");
  });
});

describe("registro de usos de permisos directos (transparencia)", () => {
  const ctx: ContextoProto = { ruta: "/grupo/semilla", ambito: "grupo", gobernadaPor: { tipo: "grupo", id: "semilla", nombre: "Semilla" } };
  const actor: ActorProto = { usuarioId: "u-ana", rol: "miembro", origen: "humano" };
  const reglas = {
    ...reglasPorDefecto("grupo"),
    cambios: { ...reglasPorDefecto("grupo").cambios, contenido: "votacion" as const },
    permisosDirectos: [{ id: "pd-ana", sujeto: { tipo: "persona" as const, usuarioId: "u-ana" }, tipos: ["contenido" as const], concedidoPor: "u-d", concedidoEn: AHORA - 1 }],
  };

  it("anota quién, qué tipo, cuándo y por qué origen cuando el veredicto viene de un permiso", () => {
    const v = decidirCambioConReglas(ctx, actor, "contenido", { reglas, ahora: AHORA });
    expect(v.via).toBe("permiso-directo");
    const uso = registrarUsoPermiso(E, actor, "contenido", v, "  Cambió   el texto de bienvenida ", "Ana", AHORA);
    expect(uso).toMatchObject({ permisoId: "pd-ana", usuarioId: "u-ana", nombre: "Ana", tipoCambio: "contenido", origen: "humano", resumen: "Cambió el texto de bienvenida", en: AHORA });
    expect(leerUsosPermiso(E)).toHaveLength(1);
  });

  it("anota también el uso de una IA, con su origen", () => {
    const v = decidirCambioConReglas(ctx, { ...actor, origen: "ia" }, "contenido", { reglas, ahora: AHORA });
    const uso = registrarUsoPermiso(E, { ...actor, origen: "ia" }, "contenido", v, "Cambio pedido a Aurora", undefined, AHORA);
    expect(uso?.origen).toBe("ia");
  });

  it("no anota lo que no fue un permiso directo ni lo que no se aplica", () => {
    const porRango = decidirCambioConReglas(ctx, { usuarioId: "u-g", rol: "gestor", origen: "humano" }, "diseno", { reglas, ahora: AHORA });
    expect(porRango).toMatchObject({ decision: "aplicar", via: "rango" });
    expect(registrarUsoPermiso(E, actor, "diseno", porRango, "x")).toBeNull();
    const votar = decidirCambioConReglas(ctx, { ...actor, usuarioId: "u-otra" }, "contenido", { reglas, ahora: AHORA });
    expect(votar.decision).toBe("votar");
    expect(registrarUsoPermiso(E, actor, "contenido", votar, "x")).toBeNull();
    expect(registrarUsoPermiso(E, actor, "contenido", { via: "permiso-directo", decision: "aplicar" }, "sin id de permiso")).toBeNull();
    expect(leerUsosPermiso(E)).toEqual([]);
  });

  it("separa por entidad, ordena de más reciente a más antiguo y avisa a la interfaz", () => {
    const aviso = vi.fn();
    window.addEventListener(EVENTO_GOBIERNO_PROTO, aviso);
    const v = decidirCambioConReglas(ctx, actor, "contenido", { reglas, ahora: AHORA });
    registrarUsoPermiso(E, actor, "contenido", v, "primero", undefined, AHORA);
    registrarUsoPermiso(E, actor, "contenido", v, "segundo", undefined, AHORA + 5);
    registrarUsoPermiso({ tipo: "grupo", id: "otro" }, actor, "contenido", v, "de otro grupo", undefined, AHORA + 9);
    expect(leerUsosPermiso(E).map((u) => u.resumen)).toEqual(["segundo", "primero"]);
    expect(leerUsosPermiso({ tipo: "grupo", id: "otro" })).toHaveLength(1);
    expect(aviso).toHaveBeenCalledTimes(3);
    window.removeEventListener(EVENTO_GOBIERNO_PROTO, aviso);
  });

  it("guarda como mucho 200 y dice honestamente dónde (este aparato)", () => {
    const v = decidirCambioConReglas(ctx, actor, "contenido", { reglas, ahora: AHORA });
    for (let i = 0; i < 210; i++) registrarUsoPermiso(E, actor, "contenido", v, `uso ${i}`, undefined, AHORA + i);
    expect(leerUsosPermiso(E)).toHaveLength(200);
    expect(DONDE_SE_GUARDA_EL_REGISTRO).toBe("aparato");
  });

  it("un registro corrupto no rompe la lectura", () => {
    window.localStorage.setItem("starseed.protomolecula.gobierno.usos.v1", "{{{");
    expect(leerUsosPermiso(E)).toEqual([]);
    window.localStorage.setItem("starseed.protomolecula.gobierno.usos.v1", JSON.stringify([null, 3, { permisoId: "p", entidad: E, en: 1 }]));
    expect(leerUsosPermiso(E)).toHaveLength(1);
  });
});
