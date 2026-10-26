/** `decidirCambio`: ámbitos, roles, modos, permisos caducados e IA que no aprueba sola (Ola 1026P · P2). */
import { describe, it, expect } from "vitest";
import { decidirCambio } from "../index";
import {
  RANGO_DIRECTO, borradorDeCambio, decidirCambioConReglas, entidadGobernante, nivelDeActor, puedeAcceder, veredictoMasEstricto, veredictosPara,
  type EntornoGobierno,
} from "../decision";
import { CLAVE_REGLAS, conPermiso, reglasPorDefecto, serializarReglas, type PermisoDirecto, type ReglasProtomolecula } from "../reglas";
import { TIPOS_CAMBIO_PROTO, type ActorProto, type ContextoProto, type TipoCambioProto } from "../../peticion/contrato";
import { guardarEstado, olvidarTodo } from "../almacen";

const AHORA = 1_800_000_000_000;
const DIA = 24 * 60 * 60 * 1000;

const ctxEntidad = (tipo: "grupo" | "comunidad" | "pagina" = "grupo", ambito: ContextoProto["ambito"] = "grupo"): ContextoProto => ({
  ruta: `/${tipo}/semilla`, ambito, entidad: { tipo: "molecula", id: "m-1" }, gobernadaPor: { tipo, id: "semilla", nombre: "Semilla" },
});
const humano = (rol: string | null, extra: Partial<ActorProto> = {}): ActorProto => ({ usuarioId: "u-1", rol, origen: "humano", ...extra });
const duena = (extra: Partial<ActorProto> = {}): ActorProto => ({ usuarioId: "u-d", rol: "owner", esDueno: true, origen: "humano", ...extra });
const ia = (base: ActorProto): ActorProto => ({ ...base, origen: "ia" });
const env = (extra: EntornoGobierno = {}): EntornoGobierno => ({ ahora: AHORA, ...extra });
const decide = (a: ActorProto, t: TipoCambioProto, e: EntornoGobierno = {}, c: ContextoProto = ctxEntidad()) => decidirCambioConReglas(c, a, t, env(e));

const permiso = (extra: Partial<PermisoDirecto> = {}): PermisoDirecto => ({
  id: "pd-1", sujeto: { tipo: "persona", usuarioId: "u-1" }, tipos: ["contenido", "diseno", "funciones", "creacion"], concedidoPor: "u-d", concedidoEn: AHORA - DIA, ...extra,
});
const conReglas = (cambios: Partial<ReglasProtomolecula["cambios"]> = {}, resto: Partial<ReglasProtomolecula> = {}): ReglasProtomolecula => {
  const b = reglasPorDefecto("grupo");
  return { ...b, ...resto, cambios: { ...b.cambios, ...cambios } };
};

describe("lo personal es siempre del dueño", () => {
  for (const ambito of ["personal", "perfil"] as const) {
    it(`${ambito}: la persona dueña aplica; otra persona, nada`, () => {
      const c: ContextoProto = { ruta: "/profile", ambito };
      expect(decidirCambioConReglas(c, duena(), "diseno")).toMatchObject({ decision: "aplicar", confirmar: false, via: "dueno" });
      const otra = decidirCambioConReglas(c, humano("owner"), "diseno");
      expect(otra.decision).toBe("denegar");
      expect(otra.confirmar).toBe(false);
    });
    it(`${ambito}: una IA de la persona dueña aplica pero pide confirmación`, () => {
      const c: ContextoProto = { ruta: "/profile", ambito };
      expect(decidirCambioConReglas(c, ia(duena()), "contenido")).toMatchObject({ decision: "aplicar", confirmar: true });
      expect(decidirCambioConReglas(c, { ...ia(humano(null)), esDueno: false }, "contenido").decision).toBe("denegar");
    });
  }
  it("lo personal no mira las reglas de ninguna entidad", () => {
    const c = { ...ctxEntidad("grupo", "personal") };
    expect(decidirCambioConReglas(c, humano("gestor"), "contenido").decision).toBe("denegar");
    expect(decidirCambioConReglas(c, duena(), "reglas").decision).toBe("aplicar");
  });
});

describe("una IA sin persona detrás no cambia nada", () => {
  it.each(["agente", "ia"] as const)("%s sin usuario ni dueño: denegar", (origen) => {
    const v = decide({ usuarioId: null, rol: "owner", origen }, "contenido");
    expect(v).toMatchObject({ decision: "denegar", via: "sin-persona", confirmar: false });
  });
  it("un humano sin sesión tampoco entra: no es miembro", () => {
    expect(decide({ usuarioId: null, rol: null, origen: "humano" }, "contenido").decision).toBe("denegar");
  });
  it("tipo de cambio desconocido", () => {
    expect(decide(duena(), "inventado" as TipoCambioProto).decision).toBe("denegar");
  });
});

describe("matriz con las reglas por defecto (democrático)", () => {
  // rol → veredicto esperado por tipo
  const R = {
    dueno:  { contenido: "aplicar", creacion: "aplicar",  diseno: "aplicar",  funciones: "aplicar",  permisos: "votar", reglas: "votar" },
    gestor: { contenido: "aplicar", creacion: "aplicar",  diseno: "aplicar",  funciones: "aplicar",  permisos: "votar", reglas: "votar" },
    colab:  { contenido: "aplicar", creacion: "proponer", diseno: "proponer", funciones: "proponer", permisos: "votar", reglas: "votar" },
    miembro:{ contenido: "votar",   creacion: "proponer", diseno: "proponer", funciones: "proponer", permisos: "votar", reglas: "votar" },
    obs:    { contenido: "denegar", creacion: "denegar",  diseno: "denegar",  funciones: "denegar",  permisos: "denegar", reglas: "denegar" },
    nadie:  { contenido: "denegar", creacion: "denegar",  diseno: "denegar",  funciones: "denegar",  permisos: "denegar", reglas: "denegar" },
  } as const;
  const actores: Record<keyof typeof R, ActorProto> = {
    dueno: duena(), gestor: humano("gestor"), colab: humano("colaborador"), miembro: humano("miembro"), obs: humano("observador"), nadie: humano(null),
  };
  for (const tipoEnt of ["grupo", "comunidad", "pagina"] as const) {
    for (const quien of Object.keys(R) as (keyof typeof R)[]) {
      it(`${tipoEnt} · ${quien}`, () => {
        for (const t of TIPOS_CAMBIO_PROTO) {
          const v = decide(actores[quien], t, {}, ctxEntidad(tipoEnt));
          expect(v.decision, `${quien}/${t}: ${v.motivo}`).toBe(R[quien][t]);
          expect(v.reglas).toBe("por-defecto");
          expect(v.transparente).toBe(true);
          if (v.decision === "votar" || v.decision === "proponer") expect(v.propuesta?.command.type).toBe("set_config");
          else expect(v.propuesta).toBeUndefined();
        }
      });
    }
  }
  it("los motivos hablan claro y avisan de que son las reglas por defecto", () => {
    const v = decide(humano("miembro"), "diseno");
    expect(v.motivo).toMatch(/quien gestiona/);
    expect(v.motivo).toMatch(/por defecto del OS/);
    expect(decide(humano("observador"), "contenido").motivo).toMatch(/observación/);
    expect(decide(humano(null), "contenido").motivo).toMatch(/formar parte/);
  });
});

describe("gobierno jerárquico", () => {
  const e = env({ modoGobierno: "hierarchical" });
  it("sin reglas guardadas, quien gestiona decide y el resto sigue teniendo la vía democrática", () => {
    expect(decide(humano("gestor"), "diseno", e, ctxEntidad("pagina")).decision).toBe("aplicar");
    expect(decide(humano("gestor"), "funciones", e, ctxEntidad("pagina")).decision).toBe("aplicar");
    const colab = decide(humano("colaborador"), "diseno", e, ctxEntidad("pagina"));
    expect(colab.decision).toBe("votar");
    expect(colab.motivo).toMatch(/vía democrática siempre está abierta/);
    expect(colab.propuesta).toBeDefined();
  });
  it("las reglas solo las cambia directamente la cuenta dueña; quien gestiona las lleva a votación", () => {
    expect(decide(duena(), "reglas", e, ctxEntidad("pagina")).decision).toBe("aplicar");
    expect(decide(humano("gestor"), "reglas", e, ctxEntidad("pagina")).decision).toBe("votar");
  });
});

describe("modos configurados", () => {
  it("directo exige rol: colaboración para contenido, gestión para diseño, dueña para reglas", () => {
    const reglas = conReglas({ contenido: "directo", diseno: "directo", reglas: "directo" });
    expect(decide(humano("colaborador"), "contenido", { reglas }).decision).toBe("aplicar");
    expect(decide(humano("miembro"), "contenido", { reglas }).decision).toBe("votar");
    expect(decide(humano("colaborador"), "diseno", { reglas }).decision).toBe("votar");
    expect(decide(humano("gestor"), "diseno", { reglas }).decision).toBe("aplicar");
    expect(decide(humano("gestor"), "reglas", { reglas }).decision).toBe("votar");
    expect(decide(duena(), "reglas", { reglas }).decision).toBe("aplicar");
    expect(RANGO_DIRECTO).toEqual({ contenido: 2, creacion: 2, diseno: 3, funciones: 3, permisos: 3, reglas: 4 });
  });
  it("propuesta: cualquiera propone y decide quien gestiona (aunque el contenido en directo lo hiciera una colaboradora)", () => {
    const reglas = conReglas({ contenido: "propuesta" });
    expect(decide(humano("colaborador"), "contenido", { reglas }).decision).toBe("proponer");
    expect(decide(humano("miembro"), "contenido", { reglas }).decision).toBe("proponer");
    expect(decide(humano("gestor"), "contenido", { reglas }).decision).toBe("aplicar");
    expect(decide(humano("observador"), "contenido", { reglas }).decision).toBe("denegar");
  });
  it("votación: todas las personas pasan por el voto, incluida la dueña; el borrador cita umbral y quórum", () => {
    const reglas = conReglas({ contenido: "votacion" });
    const e = { reglas, votacion: { umbral: 60, minParticipantes: 5, minPorcentaje: 20 } };
    for (const a of [duena(), humano("gestor"), humano("colaborador"), humano("miembro")]) {
      const v = decide(a, "contenido", e);
      expect(v.decision).toBe("votar");
      expect(v.motivo).toMatch(/umbral 60 %/);
      expect(v.motivo).toMatch(/al menos 5 participantes/);
      expect(v.motivo).toMatch(/participación mínima 20 %/);
      expect(v.propuesta?.description).toMatch(/umbral 60 %/);
    }
    expect(decide(humano("miembro"), "contenido", { reglas }).motivo).toMatch(/umbral y el quórum del gobierno de la entidad/);
  });
  it("las reglas guardadas mandan sobre las de por defecto y se dice", () => {
    const v = decide(humano("colaborador"), "contenido", { reglas: conReglas() });
    expect(v.reglas).toBe("entidad");
    expect(v.motivo).not.toMatch(/por defecto del OS/);
  });
});

describe("una solicitud de ingreso sin resolver no es membresía", () => {
  it.each(["pending", "Pendiente", "none"])("rol «%s»: no es miembro", (rol) => {
    expect(decide(humano(rol), "contenido").decision).toBe("denegar");
    expect(nivelDeActor(humano(rol))).toBe("cualquiera");
  });
});

describe("acceso a la Protomolécula de la entidad", () => {
  it("«usar» por encima de tu rol: denegado, y el motivo dice a quién le corresponde", () => {
    const reglas = conReglas({}, { acceso: { abrir: "miembros", usar: "gestion" } });
    const v = decide(humano("colaborador"), "contenido", { reglas });
    expect(v).toMatchObject({ decision: "denegar", via: "sin-acceso" });
    expect(v.motivo).toMatch(/Gestión o más/);
    expect(decide(humano("gestor"), "contenido", { reglas }).decision).toBe("aplicar");
  });
  it("un permiso directo abre el acceso aunque el rol no llegue", () => {
    const reglas = conReglas({}, { acceso: { abrir: "miembros", usar: "gestion" }, permisosDirectos: [permiso()] });
    expect(decide(humano("colaborador"), "contenido", { reglas }).decision).toBe("aplicar");
  });
  it("puedeAcceder: abrir y usar por nivel", () => {
    const r = conReglas({}, { visibilidad: "publica", acceso: { abrir: "cualquiera", usar: "colaboracion" } });
    expect(puedeAcceder(r, humano(null), "abrir", AHORA).permitido).toBe(true);
    expect(puedeAcceder(r, humano(null), "usar", AHORA).permitido).toBe(false);
    expect(puedeAcceder(r, humano("colaborador"), "usar", AHORA).permitido).toBe(true);
    expect(nivelDeActor(humano(null))).toBe("cualquiera");
    expect(nivelDeActor(humano("miembro"))).toBe("miembros");
    expect(nivelDeActor(humano("observador"))).toBe("miembros");
    expect(nivelDeActor(humano("colaborador"))).toBe("colaboracion");
    expect(nivelDeActor(humano("admin"))).toBe("gestion");
    expect(nivelDeActor(duena())).toBe("dueno");
  });
});

describe("permisos directos", () => {
  it("por persona: se salta la votación y devuelve el id del permiso para el registro", () => {
    const reglas = conReglas({ contenido: "votacion", diseno: "votacion" }, { permisosDirectos: [permiso()] });
    const v = decide(humano("miembro"), "diseno", { reglas });
    expect(v).toMatchObject({ decision: "aplicar", via: "permiso-directo", permisoId: "pd-1", confirmar: false });
    expect(v.motivo).toMatch(/permiso directo/);
    expect(v.motivo).toMatch(/registro/);
    expect(v.propuesta).toBeUndefined();
  });
  it("solo cubre los tipos para los que se dio", () => {
    const reglas = conReglas({ contenido: "votacion", diseno: "votacion" }, { permisosDirectos: [permiso({ tipos: ["contenido"] })] });
    expect(decide(humano("miembro"), "contenido", { reglas }).via).toBe("permiso-directo");
    expect(decide(humano("miembro"), "diseno", { reglas }).decision).toBe("votar");
  });
  it("es de una persona: otra con el mismo rol no lo tiene", () => {
    const reglas = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso()] });
    expect(decide(humano("miembro", { usuarioId: "u-2" }), "contenido", { reglas }).decision).toBe("votar");
  });
  it("por rol: desde colaboración hacia arriba, nunca el observador", () => {
    const reglas = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso({ id: "pd-rol", sujeto: { tipo: "rol", desde: "colaboracion" } })] });
    expect(decide(humano("colaborador"), "contenido", { reglas })).toMatchObject({ decision: "aplicar", permisoId: "pd-rol" });
    expect(decide(humano("gestor"), "contenido", { reglas })).toMatchObject({ decision: "aplicar", via: "permiso-directo" });
    expect(decide(humano("miembro"), "contenido", { reglas }).decision).toBe("votar");
    expect(decide(humano("observador"), "contenido", { reglas }).decision).toBe("denegar");
    expect(decide(humano(null), "contenido", { reglas }).decision).toBe("denegar");
  });
  it("por rol «miembros» llega a todas las personas miembro (menos observación)", () => {
    const reglas = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso({ sujeto: { tipo: "rol", desde: "miembros" } })] });
    expect(decide(humano("miembro", { usuarioId: "u-9" }), "contenido", { reglas }).via).toBe("permiso-directo");
    expect(decide(humano("observador", { usuarioId: "u-9" }), "contenido", { reglas }).decision).toBe("denegar");
  });
  it("nombrado a una persona con rol de observación, sí vale (lo decidió quien lo concedió)", () => {
    const reglas = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso()] });
    expect(decide(humano("observador"), "contenido", { reglas })).toMatchObject({ decision: "aplicar", via: "permiso-directo" });
  });
  it("también a una persona que no forma parte, si se la nombra", () => {
    const reglas = conReglas({ contenido: "votacion" }, { acceso: { abrir: "miembros", usar: "miembros" }, permisosDirectos: [permiso()] });
    expect(decide(humano(null), "contenido", { reglas })).toMatchObject({ decision: "aplicar", via: "permiso-directo" });
  });

  describe("caducidad", () => {
    const reglas = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso({ caduca: AHORA + 1000 })] });
    it("vigente hasta el último instante", () => {
      expect(decide(humano("miembro"), "contenido", { reglas, ahora: AHORA + 999 }).via).toBe("permiso-directo");
    });
    it("caducado: vuelve la regla general y el motivo lo explica", () => {
      const v = decide(humano("miembro"), "contenido", { reglas, ahora: AHORA + 1000 });
      expect(v.decision).toBe("votar");
      expect(v.motivo).toMatch(/permiso directo caducó/);
      expect(v.permisoId).toBeUndefined();
    });
    it("un permiso caducado no abre el acceso", () => {
      const r = conReglas({}, { acceso: { abrir: "miembros", usar: "gestion" }, permisosDirectos: [permiso({ caduca: AHORA - 1 })] });
      expect(decide(humano("colaborador"), "contenido", { reglas: r }).via).toBe("sin-acceso");
    });
    it("un permiso caducado no resucita aunque haya otro vigente de otra persona", () => {
      const r = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso({ caduca: AHORA - 1 }), permiso({ id: "pd-2", sujeto: { tipo: "persona", usuarioId: "u-otra" } })] });
      expect(decide(humano("miembro"), "contenido", { reglas: r }).decision).toBe("votar");
    });
  });

  it("jamás cubre «reglas» ni «permisos», ni aunque las reglas vengan manipuladas sin pasar por el saneado", () => {
    const manipulado = conReglas({}, { permisosDirectos: [permiso({ tipos: ["reglas", "permisos", "contenido"] as never })] });
    const a = humano("miembro");
    expect(decide(a, "reglas", { reglas: manipulado }).decision).toBe("votar");
    expect(decide(a, "permisos", { reglas: manipulado }).decision).toBe("votar");
    expect(decide(a, "reglas", { reglas: manipulado }).via).not.toBe("permiso-directo");
    expect(decide(a, "permisos", { reglas: manipulado }).via).not.toBe("permiso-directo");
  });

  it("si el rango ya basta no se cita el permiso (no se anota un uso que no hizo falta)", () => {
    const reglas = conReglas({}, { permisosDirectos: [permiso({ sujeto: { tipo: "persona", usuarioId: "u-d" } })] });
    expect(decide(duena(), "contenido", { reglas })).toMatchObject({ decision: "aplicar", via: "rango" });
  });
});

describe("una IA nunca aprueba sola", () => {
  it("aplica solo con confirmación de la persona, también con permiso directo", () => {
    const reglas = conReglas({ contenido: "votacion" }, { permisosDirectos: [permiso()] });
    const v = decide(ia(humano("miembro")), "contenido", { reglas });
    expect(v).toMatchObject({ decision: "aplicar", via: "permiso-directo", confirmar: true });
    expect(v.motivo).toMatch(/confirma la persona/);
    expect(decide(ia(humano("gestor")), "diseno")).toMatchObject({ decision: "aplicar", confirmar: true });
  });
  it("proponer y votar también piden la mano de una persona", () => {
    expect(decide(ia(humano("colaborador")), "diseno")).toMatchObject({ decision: "proponer", confirmar: true });
    expect(decide(ia(humano("miembro")), "reglas")).toMatchObject({ decision: "votar", confirmar: true });
  });
  it("denegar nunca pide confirmación", () => {
    expect(decide(ia(humano("observador")), "diseno")).toMatchObject({ decision: "denegar", confirmar: false });
  });
  it("propiedad: en CUALQUIER combinación de reglas, rol y modo, si el origen no es humano y se aplica, se confirma", () => {
    const modos = ["directo", "propuesta", "votacion"] as const;
    const roles = [duena(), humano("gestor"), humano("colaborador"), humano("miembro"), humano("observador"), humano(null)];
    const permisos = [[], [permiso()], [permiso({ sujeto: { tipo: "rol", desde: "miembros" } })]];
    let aplicadas = 0;
    for (const m of modos) for (const p of permisos) for (const a of roles) for (const t of TIPOS_CAMBIO_PROTO) for (const origen of ["ia", "agente"] as const) {
      const reglas = conReglas(Object.fromEntries(TIPOS_CAMBIO_PROTO.map((x) => [x, m])) as ReglasProtomolecula["cambios"], { permisosDirectos: p });
      const v = decide({ ...a, origen }, t, { reglas });
      if (v.decision !== "denegar") expect(v.confirmar, `${m}/${a.rol}/${t}/${origen}`).toBe(true);
      else expect(v.confirmar).toBe(false);
      if (v.decision === "aplicar") aplicadas++;
    }
    expect(aplicadas).toBeGreaterThan(0);
  });
  it("el veredicto de un humano que aplica no pide confirmación", () => {
    expect(decide(humano("gestor"), "diseno").confirmar).toBe(false);
  });
});

describe("sin entidad con gobierno propio", () => {
  const sinEntidad: ContextoProto = { ruta: "/x", ambito: "publica", entidad: { tipo: "molecula", id: "m-1" } };
  it("la persona dueña aplica", () => {
    expect(decidirCambioConReglas(sinEntidad, duena(), "diseno")).toMatchObject({ decision: "aplicar", reglas: "ninguna" });
  });
  it("democrático: quien colabora lleva el cambio a votación, sin borrador (no hay entidad donde votarlo)", () => {
    const v = decidirCambioConReglas(sinEntidad, humano("colaborador"), "diseno", env());
    expect(v.decision).toBe("votar");
    expect(v.propuesta).toBeUndefined();
    expect(v.motivo).toMatch(/Decisiones/);
  });
  it("jerárquico: quien gestiona aplica; sin rol, denegado", () => {
    expect(decidirCambioConReglas(sinEntidad, humano("gestor"), "diseno", env({ modoGobierno: "hierarchical" })).decision).toBe("aplicar");
    expect(decidirCambioConReglas(sinEntidad, humano(null), "diseno", env()).decision).toBe("denegar");
  });
  it("entidadGobernante: la que gobierna la pantalla, o la propia entidad si es un grupo", () => {
    expect(entidadGobernante(sinEntidad)).toBeNull();
    expect(entidadGobernante({ ruta: "/g", ambito: "grupo", entidad: { tipo: "grupo", id: "g" } })).toMatchObject({ tipo: "grupo", id: "g" });
    expect(entidadGobernante(ctxEntidad("pagina"))).toMatchObject({ tipo: "pagina", id: "semilla" });
    expect(entidadGobernante({ ruta: "/p", ambito: "perfil", gobernadaPor: { tipo: "perfil", id: "p" } })).toBeNull();
  });
});

describe("borrador de propuesta para el compositor existente", () => {
  it("reglas y permisos llevan las reglas nuevas en la clave de la configuración de la entidad", () => {
    const nuevas = serializarReglas(conPermiso(reglasPorDefecto("grupo"), permiso()));
    const v = decide(humano("colaborador"), "permisos", { cambio: { resumen: "Dar permiso a Ana", valor: nuevas } });
    expect(v.decision).toBe("votar");
    expect(v.propuesta?.command).toMatchObject({ type: "set_config", payload: { scope: "group", scope_ref: "semilla", key: CLAVE_REGLAS, value: nuevas } });
    expect(v.propuesta?.title).toMatch(/permisos de la Protomolécula/);
    expect(v.propuesta?.description).toMatch(/Dar permiso a Ana/);
    expect(v.propuesta?.description).toMatch(/se aplican solas/);
    expect(v.propuesta?.description).toMatch(/se aplicará automáticamente/);
  });
  it("un cambio que no son reglas no promete aplicarse solo", () => {
    const v = decide(humano("miembro"), "contenido", { reglas: conReglas({ contenido: "votacion" }) });
    expect(v.propuesta?.description).not.toMatch(/se aplicará automáticamente/);
    expect(v.propuesta?.description).toMatch(/se aplica desde la Protomolécula/);
  });
  it("sin valor de reglas, el borrador no toca la clave de las reglas", () => {
    const v = decide(humano("colaborador"), "reglas");
    expect(v.propuesta?.command.payload).toMatchObject({ key: "protomolecula.cambio.reglas" });
    expect(v.propuesta?.command.payload.key).not.toBe(CLAVE_REGLAS);
  });
  it("el ámbito del motor sale del tipo de entidad", () => {
    const sc = (t: "grupo" | "comunidad" | "pagina") => decide(humano("miembro"), "diseno", {}, ctxEntidad(t)).propuesta?.command.payload.scope;
    expect(sc("grupo")).toBe("group");
    expect(sc("comunidad")).toBe("community");
    expect(sc("pagina")).toBe("page");
  });
  it("en modo propuesta explica que decide quien gestiona", () => {
    const v = decide(humano("miembro"), "diseno", { cambio: { resumen: "Fondo verde" } });
    expect(v.decision).toBe("proponer");
    expect(v.propuesta?.description).toMatch(/decide quien gestiona/);
    expect(v.propuesta?.description).toMatch(/Fondo verde/);
  });
  it("borradorDeCambio es directamente utilizable", () => {
    const d = borradorDeCambio({ tipo: "grupo", id: "g", nombre: "Huerto" }, "contenido", "votacion", {});
    expect(d.title).toMatch(/contenido de la Protomolécula/);
    expect(d.title).toMatch(/Huerto/);
  });
});

describe("veredictosPara y veredictoMasEstricto", () => {
  it("devuelve un veredicto por tipo", () => {
    const v = veredictosPara(ctxEntidad(), humano("colaborador"), env());
    expect(Object.keys(v).sort()).toEqual([...TIPOS_CAMBIO_PROTO].sort());
  });
  it("un cambio que toca dos tipos sigue al más estricto", () => {
    const vs = [decide(duena(), "contenido"), decide(duena(), "reglas")];
    expect(veredictoMasEstricto(vs)?.decision).toBe("votar");
    expect(veredictoMasEstricto([decide(humano(null), "contenido"), ...vs])?.decision).toBe("denegar");
    expect(veredictoMasEstricto([])).toBeNull();
  });
});

describe("decidirCambio (firma del contrato) lee las reglas que la pantalla ya cargó", () => {
  it("sin nada cargado, rigen las de por defecto del OS", () => {
    olvidarTodo();
    const v = decidirCambio(ctxEntidad(), humano("miembro"), "diseno");
    expect(v.decision).toBe("proponer");
    expect(v.reglas).toBe("por-defecto");
  });
  it("con las reglas de la entidad en el almacén, mandan esas", () => {
    olvidarTodo();
    guardarEstado({ tipo: "grupo", id: "semilla" }, { reglas: conReglas({ diseno: "directo" }), modoGobierno: "democratic", origen: "cuenta", leidoEn: AHORA });
    const v = decidirCambio(ctxEntidad(), humano("gestor"), "diseno");
    expect(v.reglas).toBe("entidad");
    expect(v.decision).toBe("aplicar");
    olvidarTodo();
  });
  it("el cuarto parámetro opcional gana al almacén", () => {
    olvidarTodo();
    guardarEstado({ tipo: "grupo", id: "semilla" }, { reglas: conReglas({ diseno: "directo" }), modoGobierno: "democratic", origen: "cuenta", leidoEn: AHORA });
    const v = decidirCambio(ctxEntidad(), humano("gestor"), "diseno", { reglas: conReglas({ diseno: "votacion" }) });
    expect(v.decision).toBe("votar");
    olvidarTodo();
  });
  it("sigue siendo un VeredictoGobierno para quien solo conoce el contrato", () => {
    const v = decidirCambio({ ruta: "/p", ambito: "personal" }, duena(), "contenido");
    const comoContrato: { decision: string; motivo: string; confirmar: boolean } = v;
    expect(comoContrato.decision).toBe("aplicar");
  });
});
