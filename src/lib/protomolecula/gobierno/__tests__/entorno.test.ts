// @vitest-environment jsdom
/** Carga y guardado del gobierno de la Protomolécula contra la cuenta, con la gobernanza y Supabase simuladas (Ola 1026P · P2). */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const owner = { valor: null as string | null };
vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    auth: { getUser: (...a: unknown[]) => getUser(...a) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: owner.valor ? { owner_id: owner.valor } : null }) }) }) }),
  }),
}));
const getConfig = vi.fn();
const saveConfig = vi.fn();
vi.mock("@/lib/governance/config", () => ({ getConfig: (...a: unknown[]) => getConfig(...a), saveConfig: (...a: unknown[]) => saveConfig(...a) }));
const roleOf = vi.fn();
vi.mock("@/lib/governance/permissions", () => ({ roleOf: (...a: unknown[]) => roleOf(...a) }));
const membersFromMemberships = vi.fn();
vi.mock("@/lib/governance/membership", () => ({ membersFromMemberships: (...a: unknown[]) => membersFromMemberships(...a) }));
const fetchProfilesByIds = vi.fn();
vi.mock("@/lib/social/os-profiles", () => ({ fetchProfilesByIds: (...a: unknown[]) => fetchProfilesByIds(...a) }));

import { EVENTO_GOBIERNO_PROTO, leerEstado, olvidarTodo } from "../almacen";
import { cargarEntorno, guardarReglas, listarPersonas } from "../entorno";
import { CLAVE_REGLAS, reglasPorDefecto, serializarReglas } from "../reglas";

const G = { tipo: "grupo" as const, id: "semilla" };
const P = { tipo: "pagina" as const, id: "faro" };

beforeEach(() => {
  olvidarTodo();
  window.localStorage.clear();
  vi.clearAllMocks();
  owner.valor = null;
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  roleOf.mockResolvedValue("colaborador");
  getConfig.mockResolvedValue({ mode: "democratic", params: {} });
  saveConfig.mockResolvedValue({ ok: true });
});

describe("cargarEntorno", () => {
  it("lo que no es un grupo, una comunidad ni una página no tiene gobierno propio", async () => {
    expect(await cargarEntorno({ tipo: "molecula", id: "m1" })).toBeNull();
    expect(await cargarEntorno({ tipo: "grupo", id: "" })).toBeNull();
    expect(getConfig).not.toHaveBeenCalled();
  });

  it("sin reglas guardadas: modo democrático, nada propio y tu rol", async () => {
    const r = await cargarEntorno(G);
    expect(r).toMatchObject({ origen: "ninguno", reglasGuardadas: null, modoGobierno: "democratic", persona: { usuarioId: "u1", rol: "colaborador", esDueno: false, sesion: true } });
    expect(getConfig).toHaveBeenCalledWith("group", "semilla");
  });

  it("lee las reglas de la configuración de la entidad, el modo y los umbrales de votación", async () => {
    const guardadas = { ...reglasPorDefecto("grupo", "hierarchical"), visibilidad: "publica" as const };
    getConfig.mockResolvedValue({ mode: "hierarchical", params: { threshold: 66, minParticipants: 5, minPercent: 20, config: { otra: "x", [CLAVE_REGLAS]: serializarReglas(guardadas) } } });
    const r = await cargarEntorno(P);
    expect(getConfig).toHaveBeenCalledWith("page", "faro");
    expect(r?.origen).toBe("cuenta");
    expect(r?.modoGobierno).toBe("hierarchical");
    expect(r?.reglasGuardadas?.visibilidad).toBe("publica");
    expect(r?.entorno.votacion).toEqual({ umbral: 66, minParticipantes: 5, minPorcentaje: 20 });
    expect(leerEstado(P)?.origen).toBe("cuenta");
  });

  it("no se fía de lo que haya en la cuenta: lo normaliza y las invariantes siguen en pie", async () => {
    const manipulado = JSON.stringify({
      version: 1, visibilidad: "privada", transparencia: false, aprobarSolaIA: true,
      cambios: { reglas: "propuesta", permisos: "propuesta", contenido: "directo", diseno: "no-existe" },
      permisosDirectos: [{ id: "x", sujeto: { tipo: "persona", usuarioId: "u9" }, tipos: ["reglas", "permisos"], concedidoEn: 1 }],
      acceso: { abrir: "cualquiera", usar: "cualquiera" },
    });
    getConfig.mockResolvedValue({ mode: "democratic", params: { config: { [CLAVE_REGLAS]: manipulado } } });
    const r = (await cargarEntorno(G))?.reglasGuardadas;
    expect(r).not.toBeNull();
    expect(r?.cambios.reglas).not.toBe("propuesta");
    expect(r?.cambios.permisos).not.toBe("propuesta");
    expect(r?.cambios.contenido).toBe("directo");
    expect(r?.permisosDirectos.every((p) => !p.tipos.includes("reglas") && !p.tipos.includes("permisos"))).toBe(true);
    expect(r?.acceso.abrir).toBe("gestion"); // privada acota el acceso
    expect(JSON.stringify(r)).not.toMatch(/transparencia|aprobarSola/);
  });

  it("si la cuenta no responde, sigue con lo último que se sabía de este aparato", async () => {
    const guardadas = { ...reglasPorDefecto("grupo"), visibilidad: "publica" as const };
    getConfig.mockResolvedValueOnce({ mode: "democratic", params: { config: { [CLAVE_REGLAS]: serializarReglas(guardadas) } } });
    await cargarEntorno(G);
    getConfig.mockRejectedValue(new Error("sin red"));
    const r = await cargarEntorno(G);
    expect(r?.reglasGuardadas?.visibilidad).toBe("publica");
    expect(r?.origen).toBe("cuenta");
  });

  it("quien es dueña de la entidad lo es por su cuenta, no por lo que diga el rol", async () => {
    owner.valor = "u1";
    roleOf.mockResolvedValue(null);
    expect((await cargarEntorno(G))?.persona).toMatchObject({ esDueno: true, rol: "owner" });
    owner.valor = "otra";
    expect((await cargarEntorno(G))?.persona).toMatchObject({ esDueno: false, rol: null });
  });

  it("sin sesión no hay persona", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect((await cargarEntorno(G))?.persona).toEqual({ usuarioId: null, rol: null, esDueno: false, sesion: false });
  });
});

describe("guardarReglas", () => {
  it("guarda en la configuración de la entidad conservando lo demás y lo anota en el aparato", async () => {
    getConfig.mockResolvedValue({ mode: "hierarchical", params: { threshold: 51, config: { otra: "x" } } });
    const aviso = vi.fn();
    window.addEventListener(EVENTO_GOBIERNO_PROTO, aviso);
    const r = await guardarReglas(G, { ...reglasPorDefecto("grupo", "hierarchical"), visibilidad: "publica" }, "u1");
    expect(r).toEqual({ ok: true, donde: "cuenta" });
    const [scope, id, modo, params] = saveConfig.mock.calls[0] as [string, string, string, { threshold: number; config: Record<string, string> }];
    expect([scope, id, modo]).toEqual(["group", "semilla", "hierarchical"]);
    expect(params.threshold).toBe(51);
    expect(params.config.otra).toBe("x");
    const guardado = JSON.parse(params.config[CLAVE_REGLAS]);
    expect(guardado.visibilidad).toBe("publica");
    expect(guardado.actualizadoPor).toBe("u1");
    expect(typeof guardado.actualizadoEn).toBe("number");
    expect(leerEstado(G)).toMatchObject({ origen: "cuenta", modoGobierno: "hierarchical" });
    expect(aviso).toHaveBeenCalledTimes(1);
    window.removeEventListener(EVENTO_GOBIERNO_PROTO, aviso);
  });

  it("la verja de propiedad no se salta: se dice y no se guarda en ninguna parte", async () => {
    saveConfig.mockResolvedValue({ ok: false, error: "Solo el propietario puede guardar la configuración directamente." });
    const r = await guardarReglas(G, reglasPorDefecto("grupo"), "u1");
    expect(r).toMatchObject({ ok: false, bloqueado: true });
    expect(leerEstado(G)).toBeNull();
  });

  it("si la cuenta falla por otra causa, queda SOLO en este aparato y lo dice", async () => {
    saveConfig.mockResolvedValue({ ok: false, error: "timeout" });
    const r = await guardarReglas(G, { ...reglasPorDefecto("grupo"), visibilidad: "publica" }, "u1");
    expect(r).toMatchObject({ ok: true, donde: "aparato" });
    expect((r as { aviso?: string }).aviso).toMatch(/SOLO en este aparato/);
    expect(leerEstado(G)).toMatchObject({ origen: "aparato" });
    expect(leerEstado(G)?.reglas?.visibilidad).toBe("publica");
  });

  it("si la gobernanza lanza, igual: aparato y aviso", async () => {
    getConfig.mockRejectedValue(new Error("sin red"));
    const r = await guardarReglas(G, reglasPorDefecto("grupo"), null);
    expect(r).toMatchObject({ ok: true, donde: "aparato" });
  });

  it("lo que no es una entidad gobernada se rechaza", async () => {
    expect(await guardarReglas({ tipo: "molecula", id: "m" }, reglasPorDefecto("grupo"), null)).toMatchObject({ ok: false });
    expect(saveConfig).not.toHaveBeenCalled();
  });

  it("nunca guarda reglas que quiten la transparencia o abran permisos directos sobre reglas", async () => {
    const trucadas = { ...reglasPorDefecto("grupo"), cambios: { ...reglasPorDefecto("grupo").cambios, reglas: "propuesta" as const } };
    await guardarReglas(G, trucadas, "u1");
    const params = saveConfig.mock.calls[0][3] as { config: Record<string, string> };
    expect(JSON.parse(params.config[CLAVE_REGLAS]).cambios.reglas).not.toBe("propuesta");
  });
});

describe("listarPersonas", () => {
  it("devuelve las personas de la entidad con nombre, ordenadas", async () => {
    membersFromMemberships.mockResolvedValue(["b2222222-x", "a1111111-x", "c3333333-x"]);
    fetchProfilesByIds.mockResolvedValue({ "b2222222-x": { displayName: "Zoe" }, "a1111111-x": { username: "ana" } });
    const l = await listarPersonas(G);
    expect(l.map((p) => p.nombre)).toEqual(["@ana", "Cuenta c3333333", "Zoe"]);
  });

  it("sin directorio de perfiles, enseña el identificador acortado", async () => {
    membersFromMemberships.mockResolvedValue(["abcdefgh-1234"]);
    fetchProfilesByIds.mockRejectedValue(new Error("x"));
    expect(await listarPersonas(G)).toEqual([{ id: "abcdefgh-1234", nombre: "Cuenta abcdefgh" }]);
  });

  it("si no se puede leer la pertenencia, devuelve vacío en vez de inventar", async () => {
    membersFromMemberships.mockRejectedValue(new Error("x"));
    expect(await listarPersonas(G)).toEqual([]);
    expect(await listarPersonas({ tipo: "molecula", id: "m" })).toEqual([]);
  });
});
