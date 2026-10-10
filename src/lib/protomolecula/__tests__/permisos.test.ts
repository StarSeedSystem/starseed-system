import { describe, expect, it } from "vitest";
import {
  crearConsentimiento, decidir, decidirOperacion, decidirSalud, esAutomatico, metricaDeFuente, puedeCambiarAmbito,
  referenciasRotas, revocarConsentimiento,
} from "../permisos";
import type { AccionProto } from "../permisos";
import { AMBITOS, METRICAS_SALUD, ORIGENES, ROLES } from "../tipos";
import type { Ambito, Capa, Consentimiento, Operacion, Origen, Rol } from "../tipos";

const ok = (rol: Rol | null, origen: Origen, ambito: Ambito, accion: AccionProto, nativo?: boolean) => decidir({ rol, origen, ambito, accion, nativo });

describe("quién puede mover un parámetro", () => {
  it("editor y dueño, desde cualquier origen y en cualquier ámbito", () => {
    for (const rol of ["dueno", "editor"] as Rol[]) for (const origen of ORIGENES) for (const ambito of AMBITOS) {
      expect(ok(rol, origen, ambito, "mover-parametro")).toMatchObject({ permitido: true, confirmar: false });
    }
  });
  it("comentarista y observador miran; quien no es miembro, solo mira una sesión pública", () => {
    for (const rol of ["comentarista", "observador"] as Rol[]) {
      expect(ok(rol, "mano", "grupo", "mover-parametro").permitido).toBe(false);
      expect(ok(rol, "mano", "grupo", "ver").permitido).toBe(true);
    }
    expect(ok(null, "mano", "publica", "ver").permitido).toBe(true);
    expect(ok(null, "mano", "grupo", "ver").permitido).toBe(false);
    expect(ok(null, "mano", "publica", "mover-parametro").permitido).toBe(false);
  });
  it("el cambio de una IA se dice como tal", () => {
    expect(ok("editor", "ia", "publica", "mover-parametro").motivo).toMatch(/IA/);
    expect(esAutomatico("agente")).toBe(true);
    expect(esAutomatico("dictado")).toBe(false);
  });
});

describe("estructura, mandos, herramientas ajenas e invitaciones", () => {
  it("una IA edita la estructura sin preguntar en su espacio, y con confirmación en uno compartido", () => {
    expect(ok("editor", "ia", "personal", "editar-estructura").confirmar).toBe(false);
    expect(ok("editor", "agente", "grupo", "editar-estructura").confirmar).toBe(true);
    expect(ok("editor", "mano", "publica", "editar-estructura").confirmar).toBe(false);
  });
  it("un agente no vincula un mando sin que la persona lo apruebe", () => {
    expect(ok("editor", "agente", "personal", "vincular-control")).toMatchObject({ permitido: true, confirmar: true });
    expect(ok("editor", "midi", "personal", "vincular-control").confirmar).toBe(false);
  });
  it("lo aislado se lanza; lo nativo siempre confirma y nunca lo arranca una IA sola", () => {
    expect(ok("editor", "mano", "personal", "lanzar-externo", false)).toMatchObject({ permitido: true, confirmar: false });
    expect(ok("editor", "ia", "personal", "lanzar-externo", false).confirmar).toBe(true);
    expect(ok("editor", "mano", "personal", "lanzar-externo", true).confirmar).toBe(true);
    expect(ok("dueno", "agente", "personal", "lanzar-externo", true).permitido).toBe(false);
  });
  it("en una sesión reservada solo invita su dueño", () => {
    expect(ok("editor", "mano", "personal", "invitar").permitido).toBe(false);
    expect(ok("editor", "mano", "grupo", "invitar").permitido).toBe(true);
    expect(ok("dueno", "mano", "personal", "invitar").permitido).toBe(true);
  });
});

describe("código: se propone, no se ejecuta", () => {
  it("cualquiera que no sea observador propone; queda como candidato", () => {
    for (const origen of ORIGENES) expect(ok("comentarista", origen, "publica", "proponer-codigo").permitido).toBe(true);
    expect(ok("observador", "mano", "publica", "proponer-codigo").permitido).toBe(false);
    expect(ok("editor", "ia", "personal", "proponer-codigo").motivo).toMatch(/CANDIDATO/);
  });
  it("aceptarlo es cosa de una persona con la mano, tras confirmar; ningún otro origen puede", () => {
    expect(ok("editor", "mano", "personal", "aplicar-codigo")).toMatchObject({ permitido: true, confirmar: true });
    for (const origen of ORIGENES.filter((o) => o !== "mano")) {
      for (const rol of ROLES) expect(ok(rol, origen, "personal", "aplicar-codigo").permitido, `${origen}/${rol}`).toBe(false);
    }
  });
});

describe("ámbito y publicación", () => {
  it("solo el dueño, con la mano; abrir más pide confirmar y cerrar no", () => {
    expect(puedeCambiarAmbito("dueno", "mano", "personal", "publica")).toMatchObject({ permitido: true, confirmar: true });
    expect(puedeCambiarAmbito("dueno", "mano", "publica", "grupo")).toMatchObject({ permitido: true, confirmar: false });
    expect(puedeCambiarAmbito("editor", "mano", "personal", "publica").permitido).toBe(false);
    expect(puedeCambiarAmbito("dueno", "dictado", "personal", "publica").permitido).toBe(false);
    expect(puedeCambiarAmbito("dueno", "ia", "personal", "grupo").permitido).toBe(false);
    expect(puedeCambiarAmbito("dueno", "mano", "grupo", "grupo").permitido).toBe(false);
  });
  it("publicar es del dueño y con la mano", () => {
    expect(ok("dueno", "mano", "perfil", "publicar")).toMatchObject({ permitido: true, confirmar: true });
    expect(ok("dueno", "agente", "perfil", "publicar").permitido).toBe(false);
    expect(ok("editor", "mano", "perfil", "publicar").permitido).toBe(false);
  });
  it("al abrir una molécula avisa de las capas que citan algo más reservado", () => {
    const capa = (id: string, tipo: string | null): Capa => ({ id, tipo: "datos", titulo: id, formato: "json", orden: 0, visible: true, bloqueada: false, referencia: tipo ? { tipo, id } : null });
    const ambitoDe = (tipo: string): Ambito => (tipo === "nota-privada" ? "personal" : "publica");
    expect(referenciasRotas([capa("c1", "nota-privada"), capa("c2", "post"), capa("c3", null)], "publica", ambitoDe)).toEqual(["c1"]);
    expect(referenciasRotas([capa("c1", "nota-privada")], "personal", ambitoDe)).toEqual([]);
  });
});

describe("salud de wearables", () => {
  const AHORA = 1_000;
  const sesionDe = (ambito: Ambito, consentimientos: Consentimiento[] = []) => ({ ambito, consentimientos });
  const opSensor = (fuente: string | undefined, origen: Origen = "sensor"): Operacion => ({ id: "o", objetivo: { atomoId: "a", parametroId: "p" }, accion: { tipo: "exacta", valor: 0.5 }, autor: { tipo: "persona", id: "ana" }, origen, t: AHORA, fuente });

  it("reconoce de qué métrica viene una fuente", () => {
    expect(metricaDeFuente("wearable:pulso")).toBe("pulso");
    expect(metricaDeFuente("wearable:algo-raro")).toBeNull();
    expect(metricaDeFuente("movil:luz")).toBeUndefined();
    expect(metricaDeFuente(undefined)).toBeUndefined();
  });
  it("por defecto es solo local: sin consentimiento no viaja a ninguna sesión compartida", () => {
    for (const ambito of ["perfil", "grupo", "publica"] as Ambito[]) {
      for (const m of METRICAS_SALUD) expect(decidirSalud(m, ambito, [], "ana", AHORA)).toMatchObject({ local: true, difundir: false });
    }
    expect(decidirSalud("pulso", "personal", [], "ana", AHORA).difundir).toBe(true);
  });
  it("una métrica sin identificar tampoco viaja, aunque haya consentimientos", () => {
    const todos = METRICAS_SALUD.map((m) => crearConsentimiento(m, "grupo", "ana", 0));
    expect(decidirSalud(null, "grupo", todos, "ana", AHORA).difundir).toBe(false);
  });
  it("el consentimiento es por métrica, de esa persona, vigente y del ámbito justo", () => {
    const c = crearConsentimiento("pulso", "grupo", "ana", 0, { duracionMs: 5_000 });
    expect(decidirSalud("pulso", "grupo", [c], "ana", AHORA).difundir).toBe(true);
    expect(decidirSalud("oxigeno", "grupo", [c], "ana", AHORA).difundir).toBe(false);
    expect(decidirSalud("pulso", "grupo", [c], "luis", AHORA).difundir).toBe(false);
    expect(decidirSalud("pulso", "grupo", [c], "ana", 6_000).difundir).toBe(false);
    expect(decidirSalud("pulso", "publica", [c], "ana", AHORA).difundir).toBe(false);
  });
  it("en sesión pública hace falta permiso EXPRESO; ámbitoMax pública sin expreso no basta", () => {
    expect(crearConsentimiento("pulso", "publica", "ana", 0).expreso).toBe(false);
    expect(decidirSalud("pulso", "publica", [crearConsentimiento("pulso", "publica", "ana", 0)], "ana", AHORA).difundir).toBe(false);
    const expreso = crearConsentimiento("pulso", "publica", "ana", 0, { expreso: true });
    expect(decidirSalud("pulso", "publica", [expreso], "ana", AHORA).difundir).toBe(true);
    expect(crearConsentimiento("pulso", "grupo", "ana", 0, { expreso: true }).expreso).toBeUndefined();
  });
  it("revocar quita solo esa métrica de esa persona", () => {
    const cs = [crearConsentimiento("pulso", "grupo", "ana", 0), crearConsentimiento("oxigeno", "grupo", "ana", 0), crearConsentimiento("pulso", "grupo", "luis", 0)];
    expect(revocarConsentimiento(cs, "pulso", "ana").map((c) => `${c.metrica}/${c.concedidoPor}`)).toEqual(["oxigeno/ana", "pulso/luis"]);
  });
  it("la operación de un wearable mueve el parámetro en local pero no se difunde sin consentimiento", () => {
    const sin = decidirOperacion(opSensor("wearable:pulso"), "editor", sesionDe("grupo"), AHORA);
    expect(sin).toMatchObject({ permitido: true, difundir: false });
    const con = decidirOperacion(opSensor("wearable:pulso"), "editor", sesionDe("grupo", [crearConsentimiento("pulso", "grupo", "ana", 0)]), AHORA);
    expect(con.difundir).toBe(true);
    expect(decidirOperacion(opSensor("wearable:pulso"), "editor", sesionDe("publica"), AHORA).difundir).toBe(false);
  });
  it("un sensor que no es de salud, o una orden de otro origen, se difunde como cualquier operación", () => {
    expect(decidirOperacion(opSensor("movil:luz"), "editor", sesionDe("publica"), AHORA).difundir).toBe(true);
    expect(decidirOperacion(opSensor("wearable:pulso", "mano"), "editor", sesionDe("publica"), AHORA).difundir).toBe(true);
  });
  it("sin permiso de rol no se difunde nada", () => {
    expect(decidirOperacion(opSensor("movil:luz"), "observador", sesionDe("grupo"), AHORA)).toMatchObject({ permitido: false, difundir: false });
  });
});
