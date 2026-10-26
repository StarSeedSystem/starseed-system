/** Reglas de la Protomolécula por entidad: valores por defecto, saneado hostil e invariantes (Ola 1026P · P2). */
import { describe, it, expect } from "vitest";
import {
  AYUDA_MODO, CLAVE_REGLAS, MAX_PERMISOS, MS_DIA, NIVEL_DE_VISIBILIDAD, TIPOS_DELEGABLES, acotarAcceso, conPermiso, crearPermiso, esEntidadGobernada,
  describirCambios, etiquetaSujeto, normalizarReglas, permisoVigente, reglasPorDefecto, scopeDeEntidad, serializarReglas, sinPermiso, tiposTocados, tipoEntidadDeKind,
  type PermisoDirecto, type ReglasProtomolecula,
} from "../reglas";
import { TIPOS_CAMBIO_PROTO } from "../../peticion/contrato";

const AHORA = 1_800_000_000_000;
const permisoBueno = (extra: Partial<PermisoDirecto> = {}): PermisoDirecto => ({
  id: "p1", sujeto: { tipo: "persona", usuarioId: "u-ana", nombre: "Ana" }, tipos: ["contenido"], concedidoPor: "u-dueno", concedidoEn: AHORA, ...extra,
});

describe("valores por defecto (democrático primero)", () => {
  it.each(["grupo", "comunidad", "pagina"] as const)("%s: votación para reglas y permisos, propuesta para diseño y funciones, directo para el contenido", (tipo) => {
    const r = reglasPorDefecto(tipo);
    expect(r.cambios).toMatchObject({ reglas: "votacion", permisos: "votacion", diseno: "propuesta", funciones: "propuesta", contenido: "directo" });
    expect(r.cambios.creacion).toBe("propuesta");
    expect(r.visibilidad).toBe("miembros");
    expect(r.acceso).toEqual({ abrir: "miembros", usar: "miembros" });
    expect(r.permisosDirectos).toEqual([]);
  });

  it("cada tipo de cambio tiene un modo y ninguno es 'propuesta' donde no puede serlo", () => {
    for (const modo of ["democratic", "hierarchical"] as const) {
      const r = reglasPorDefecto("pagina", modo);
      for (const t of TIPOS_CAMBIO_PROTO) expect(["directo", "propuesta", "votacion"]).toContain(r.cambios[t]);
      expect(r.cambios.reglas).not.toBe("propuesta");
      expect(r.cambios.permisos).not.toBe("propuesta");
    }
  });

  it("una página con gobierno jerárquico decide directamente quien gestiona; sin modo, es democrática", () => {
    expect(reglasPorDefecto("pagina", "hierarchical").cambios).toMatchObject({ diseno: "directo", funciones: "directo", permisos: "directo", reglas: "directo" });
    expect(reglasPorDefecto("pagina").cambios.reglas).toBe("votacion");
  });

  it("lo que viene por defecto ya cumple las invariantes (normalizar no lo cambia)", () => {
    for (const modo of ["democratic", "hierarchical"] as const) {
      const r = reglasPorDefecto("grupo", modo);
      expect(normalizarReglas(r, r)).toEqual(r);
    }
  });
});

describe("invariantes: lo que NO se puede configurar", () => {
  it("no existe ningún campo para apagar la transparencia ni para que una IA apruebe sola", () => {
    const claves = Object.keys(reglasPorDefecto());
    expect(claves.join(",")).not.toMatch(/transparen|ia|agente|auto/i);
    const r = normalizarReglas({ transparencia: false, iaAprueba: true, autoAprobar: true, permisosDirectos: [], cambios: {} });
    expect(Object.keys(r)).not.toContain("transparencia");
    expect(Object.keys(r)).not.toContain("iaAprueba");
    expect(JSON.stringify(r)).not.toMatch(/iaAprueba|autoAprobar|transparencia/);
  });

  it("«reglas» y «permisos» no admiten el modo propuesta: se quedan en votación", () => {
    const r = normalizarReglas({ cambios: { reglas: "propuesta", permisos: "propuesta", diseno: "propuesta" } });
    expect(r.cambios.reglas).toBe("votacion");
    expect(r.cambios.permisos).toBe("votacion");
    expect(r.cambios.diseno).toBe("propuesta");
  });

  it("un permiso directo nunca cubre «reglas» ni «permisos»", () => {
    const r = normalizarReglas({ permisosDirectos: [permisoBueno({ tipos: ["reglas", "permisos", "diseno"] as never })] });
    expect(r.permisosDirectos).toHaveLength(1);
    expect(r.permisosDirectos[0].tipos).toEqual(["diseno"]);
    const solo = normalizarReglas({ permisosDirectos: [permisoBueno({ tipos: ["reglas"] as never })] });
    expect(solo.permisosDirectos).toEqual([]);
    expect(TIPOS_DELEGABLES).not.toContain("reglas");
    expect(TIPOS_DELEGABLES).not.toContain("permisos");
  });

  it("el acceso nunca es más abierto que la visibilidad ni «usar» más abierto que «abrir»", () => {
    expect(acotarAcceso("privada", { abrir: "cualquiera", usar: "cualquiera" })).toEqual({ abrir: "gestion", usar: "gestion" });
    expect(acotarAcceso("miembros", { abrir: "cualquiera", usar: "cualquiera" })).toEqual({ abrir: "miembros", usar: "miembros" });
    expect(acotarAcceso("publica", { abrir: "cualquiera", usar: "colaboracion" })).toEqual({ abrir: "cualquiera", usar: "colaboracion" });
    expect(acotarAcceso("publica", { abrir: "gestion", usar: "miembros" })).toEqual({ abrir: "gestion", usar: "gestion" });
    const r = normalizarReglas({ visibilidad: "privada", acceso: { abrir: "cualquiera", usar: "miembros" } });
    expect(r.acceso).toEqual({ abrir: NIVEL_DE_VISIBILIDAD.privada, usar: NIVEL_DE_VISIBILIDAD.privada });
  });
});

describe("normalizarReglas ante entradas hostiles", () => {
  const base = reglasPorDefecto("grupo");
  it.each([[null], [undefined], [42], [true], [[]], ["no es json"], ["[1,2]"], ["null"], ["{"]])("%j → la base", (x) => {
    expect(normalizarReglas(x, base)).toEqual(base);
  });

  it("acepta el texto JSON de una propuesta aprobada", () => {
    const r = normalizarReglas(JSON.stringify({ visibilidad: "publica", cambios: { contenido: "votacion" } }), base);
    expect(r.visibilidad).toBe("publica");
    expect(r.cambios.contenido).toBe("votacion");
    expect(r.cambios.diseno).toBe(base.cambios.diseno);
  });

  it("descarta valores desconocidos y conserva los de la base", () => {
    const r = normalizarReglas({ visibilidad: "secreta", cambios: { contenido: "siempre", inventado: "directo", diseno: 7 }, acceso: { abrir: "todos" } }, base);
    expect(r.visibilidad).toBe(base.visibilidad);
    expect(r.cambios).toEqual(base.cambios);
    expect(r.acceso).toEqual(base.acceso);
  });

  it("ignora __proto__ y claves raras sin contaminar nada", () => {
    const r = normalizarReglas('{"__proto__":{"polluted":true},"cambios":{"__proto__":"directo","constructor":"directo"}}', base);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(r.cambios).toEqual(base.cambios);
  });

  it("descarta permisos mal formados, duplicados y con sujeto inválido", () => {
    const r = normalizarReglas({
      permisosDirectos: [
        permisoBueno(),
        permisoBueno(), // mismo id
        { id: "", sujeto: { tipo: "persona", usuarioId: "x" }, tipos: ["contenido"] },
        { id: "p2", sujeto: { tipo: "persona", usuarioId: "" }, tipos: ["contenido"] },
        { id: "p3", sujeto: { tipo: "rol", desde: "observador" }, tipos: ["contenido"] },
        { id: "p4", sujeto: { tipo: "rol", desde: "gestion" }, tipos: [] },
        { id: "p5", sujeto: { tipo: "rol", desde: "gestion" }, tipos: ["nada"] },
        "texto", null, 7,
        { id: "p6", sujeto: { tipo: "rol", desde: "colaboracion" }, tipos: ["diseno", "diseno", "funciones"] },
      ],
    }, base);
    expect(r.permisosDirectos.map((p) => p.id)).toEqual(["p1", "p6"]);
    expect(r.permisosDirectos[1].tipos).toEqual(["diseno", "funciones"]);
  });

  it(`como mucho ${MAX_PERMISOS} permisos`, () => {
    const muchos = Array.from({ length: MAX_PERMISOS + 20 }, (_, i) => permisoBueno({ id: `p-${i}` }));
    expect(normalizarReglas({ permisosDirectos: muchos }, base).permisosDirectos).toHaveLength(MAX_PERMISOS);
  });

  it("recorta textos largos y quita caracteres de control", () => {
    const r = normalizarReglas({ permisosDirectos: [permisoBueno({ motivo: "x".repeat(900) + "\u0000\u0007", sujeto: { tipo: "persona", usuarioId: "u-ana", nombre: "N".repeat(300) } })] }, base);
    expect(r.permisosDirectos[0].motivo?.length).toBeLessThanOrEqual(240);
    expect(r.permisosDirectos[0].motivo).not.toMatch(/[\u0000-\u001F]/);
    expect((r.permisosDirectos[0].sujeto as { nombre?: string }).nombre?.length).toBeLessThanOrEqual(80);
  });

  it("caduca y fechas: solo números finitos y no negativos", () => {
    const r = normalizarReglas({ permisosDirectos: [permisoBueno({ caduca: -5 as never, concedidoEn: Infinity as never })] }, base);
    expect(r.permisosDirectos[0].caduca).toBeUndefined();
    expect(r.permisosDirectos[0].concedidoEn).toBe(0);
  });
});

describe("serializar y recuperar", () => {
  it("ida y vuelta sin pérdidas", () => {
    let r: ReglasProtomolecula = { ...reglasPorDefecto("comunidad"), visibilidad: "publica", acceso: { abrir: "cualquiera", usar: "miembros" } };
    r = { ...r, cambios: { ...r.cambios, diseno: "votacion", contenido: "propuesta" } };
    r = conPermiso(r, permisoBueno({ tipos: ["contenido", "creacion"], motivo: "Coordina el huerto" }));
    expect(normalizarReglas(serializarReglas(r), reglasPorDefecto("grupo"))).toEqual(r);
  });
  it("la clave de la configuración es estable", () => {
    expect(CLAVE_REGLAS).toBe("protomolecula.reglas");
  });
});

describe("permisos directos", () => {
  it("crearPermiso: con caducidad en días, sin ella, y nulo si no cubre nada delegable", () => {
    const p = crearPermiso({ sujeto: { tipo: "rol", desde: "colaboracion" }, tipos: ["diseno", "reglas" as never], concedidoPor: "u1", dias: 7 }, AHORA)!;
    expect(p.tipos).toEqual(["diseno"]);
    expect(p.caduca).toBe(AHORA + 7 * MS_DIA);
    expect(p.id).toMatch(/^pd-/);
    const sin = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u2" }, tipos: ["contenido"], concedidoPor: null }, AHORA)!;
    expect(sin.caduca).toBeUndefined();
    expect(crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u2" }, tipos: ["reglas" as never, "permisos" as never], concedidoPor: null }, AHORA)).toBeNull();
    expect(crearPermiso({ sujeto: { tipo: "persona", usuarioId: "" }, tipos: ["contenido"], concedidoPor: null }, AHORA)).toBeNull();
  });

  it("dos permisos creados a la vez tienen ids distintos", () => {
    const a = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u" }, tipos: ["contenido"], concedidoPor: null }, AHORA)!;
    const b = crearPermiso({ sujeto: { tipo: "persona", usuarioId: "u" }, tipos: ["contenido"], concedidoPor: null }, AHORA)!;
    expect(a.id).not.toBe(b.id);
  });

  it("vigencia: sin caducidad vale siempre; caducado deja de valer justo en su instante", () => {
    expect(permisoVigente(permisoBueno(), AHORA * 2)).toBe(true);
    expect(permisoVigente(permisoBueno({ caduca: AHORA + 10 }), AHORA + 9)).toBe(true);
    expect(permisoVigente(permisoBueno({ caduca: AHORA + 10 }), AHORA + 10)).toBe(false);
  });

  it("conPermiso reemplaza por id y sinPermiso quita", () => {
    let r = reglasPorDefecto("grupo");
    r = conPermiso(r, permisoBueno());
    r = conPermiso(r, permisoBueno({ tipos: ["diseno"] }));
    expect(r.permisosDirectos).toHaveLength(1);
    expect(r.permisosDirectos[0].tipos).toEqual(["diseno"]);
    expect(sinPermiso(r, "p1").permisosDirectos).toEqual([]);
  });
});

describe("tiposTocados: cada cambio sigue SU regla", () => {
  const a = reglasPorDefecto("grupo");
  it("sin cambios no toca nada", () => expect(tiposTocados(a, { ...a })).toEqual([]));
  it("visibilidad, modos o acceso son «reglas»", () => {
    expect(tiposTocados(a, { ...a, visibilidad: "publica" })).toEqual(["reglas"]);
    expect(tiposTocados(a, { ...a, cambios: { ...a.cambios, contenido: "votacion" } })).toEqual(["reglas"]);
    expect(tiposTocados(a, { ...a, acceso: { abrir: "miembros", usar: "gestion" } })).toEqual(["reglas"]);
  });
  it("los permisos directos son «permisos»; los dos a la vez tocan ambos", () => {
    expect(tiposTocados(a, conPermiso(a, permisoBueno()))).toEqual(["permisos"]);
    expect(tiposTocados(a, { ...conPermiso(a, permisoBueno()), visibilidad: "privada" })).toEqual(["reglas", "permisos"]);
  });
});

describe("qué entidad es", () => {
  it("el kind de las pantallas → tipo gobernado (igual que decisionScopeFor)", () => {
    expect(tipoEntidadDeKind("grupo")).toBe("grupo");
    expect(tipoEntidadDeKind("group")).toBe("grupo");
    for (const k of ["comunidad", "community", "ef", "entidad", "asamblea", "partido", "COMUNIDAD"]) expect(tipoEntidadDeKind(k)).toBe("comunidad");
    expect(tipoEntidadDeKind("page")).toBe("pagina");
    expect(tipoEntidadDeKind("pagina")).toBe("pagina");
    expect(tipoEntidadDeKind("algo-raro")).toBe("comunidad");
    expect(tipoEntidadDeKind(undefined)).toBe("comunidad");
  });
  it("ámbito del motor de gobernanza", () => {
    expect(scopeDeEntidad("grupo")).toBe("group");
    expect(scopeDeEntidad("comunidad")).toBe("community");
    expect(scopeDeEntidad("pagina")).toBe("page");
  });
  it("solo grupo, comunidad y página con id cuentan como entidad gobernada", () => {
    expect(esEntidadGobernada({ tipo: "grupo", id: "g" })).toBe(true);
    expect(esEntidadGobernada({ tipo: "grupo", id: "" })).toBe(false);
    expect(esEntidadGobernada({ tipo: "molecula", id: "m" })).toBe(false);
    expect(esEntidadGobernada(undefined)).toBe(false);
  });
  it("cada modo tiene su ayuda en lenguaje claro", () => {
    expect(AYUDA_MODO.propuesta).toMatch(/gestiona/);
    expect(AYUDA_MODO.votacion).toMatch(/umbral/);
  });
});

describe("describirCambios", () => {
  const a = reglasPorDefecto("grupo");
  it("sin cambios, nada", () => expect(describirCambios(a, { ...a })).toEqual([]));
  it("dice cada cambio en lenguaje claro", () => {
    const b = conPermiso({ ...a, visibilidad: "publica", cambios: { ...a.cambios, diseno: "votacion" }, acceso: { abrir: "cualquiera", usar: "colaboracion" } }, permisoBueno({ caduca: AHORA + MS_DIA }));
    const t = describirCambios(a, b);
    expect(t).toContain("Visibilidad: Solo miembros → Pública.");
    expect(t).toContain("Diseño: propuesta → votación.");
    expect(t).toContain("Quién la abre: Miembros → Cualquiera.");
    expect(t).toContain("Quién la usa: Miembros → Colaboración o más.");
    expect(t.find((x) => x.startsWith("Permiso directo nuevo para Ana: contenido"))).toBeDefined();
  });
  it("permiso retirado y cambiado", () => {
    const con = conPermiso(a, permisoBueno());
    expect(describirCambios(con, a)).toEqual(["Permiso directo retirado a Ana."]);
    expect(describirCambios(con, conPermiso(con, permisoBueno({ tipos: ["diseno"] })))).toEqual(["Permiso directo cambiado para Ana."]);
  });
  it("etiqueta del sujeto", () => {
    expect(etiquetaSujeto({ tipo: "rol", desde: "gestion" })).toBe("rol «Gestión o más»");
    expect(etiquetaSujeto({ tipo: "persona", usuarioId: "abcdefghijkl" })).toBe("la cuenta abcdefgh");
  });
});
