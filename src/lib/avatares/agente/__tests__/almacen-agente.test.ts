// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ASTRAURA_BONSAI_LOCAL_SOURCE_ID } from "@/ai/astraura/free-catalog";
import { ajustesCapasEntidadGuardados } from "@/lib/astraura/use-capas-entidad";
import { getPrimaryChoice } from "@/lib/astraura/primary-system";
import { crearAgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import {
  PREFIJO_AGENTE, aplicarEfectos, claveConfigAgente, claveRecuerdosAgente, deshacerPasoEvolucion, guardarConfigAgente,
  leerConfigAgente, leerRecuerdosAgente, registrarExperiencia, registrarRecuerdo, restablecerAgente,
} from "../almacen-agente";
import { conectarCapa, configPorDefecto, elegirMotor, quitarCapa, type ConfigAgente } from "../config-agente";

const agente = crearAgenteMundoRef({ origen: "personalidad", idOrigen: "aurora", nombre: "Aurora", dueno: { tipo: "perfil", id: "p1" } });
const otro = crearAgenteMundoRef({ origen: "bot", idOrigen: "b9", nombre: "Otro", dueno: { tipo: "pagina", id: "pg" } });
const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("claves", () => {
  it("una clave por agente, con el prefijo del almacén", () => {
    expect(claveConfigAgente(agente.id)).toBe("starseed.mundo.agente.personalidad:aurora.v1");
    expect(claveRecuerdosAgente(agente.id)).toBe("starseed.mundo.agente.personalidad:aurora.recuerdos.v1");
    expect(claveConfigAgente(agente.id).startsWith(PREFIJO_AGENTE)).toBe(true);
  });
});

describe("leer y guardar", () => {
  it("sin nada guardado da la configuración por defecto", () => {
    expect(leerConfigAgente(agente)).toEqual(configPorDefecto(agente));
  });

  it("guarda, sella la fecha y lo vuelve a leer igual; cada agente por separado", () => {
    const c = configPorDefecto(agente);
    const guardado = guardarConfigAgente(agente, { ...c, percepcion: { ...c.percepcion, temas: ["música"] } }, T0);
    expect(guardado.actualizado).toBe(T0);
    expect(leerConfigAgente(agente)).toEqual(guardado);
    expect(leerConfigAgente(otro).percepcion.temas).toEqual([]);
  });

  it("un JSON roto o con basura no lanza y devuelve lo de por defecto", () => {
    window.localStorage.setItem(claveConfigAgente(agente.id), "{no es json");
    expect(leerConfigAgente(agente)).toEqual(configPorDefecto(agente));
    window.localStorage.setItem(claveConfigAgente(agente.id), JSON.stringify({ motores: { roles: { palabra: { motor: "externo", fuente: "openai-paid" } } } }));
    expect(leerConfigAgente(agente).motores.roles.palabra).toEqual({ motor: "heredar" });
  });

  it("los recuerdos guardados se saneán al leer", () => {
    window.localStorage.setItem(claveRecuerdosAgente(agente.id), JSON.stringify([{ id: "a", texto: "ok", alcance: "publica", at: T0 }, { id: "b", texto: "mal", alcance: "xx", at: T0 }]));
    expect(leerRecuerdosAgente(agente).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("aplicarEfectos: solo lo que cambió", () => {
  it("quitar la capa Mesh la devuelve a «hereda»; conectar/desconectar fija el valor del ámbito agente", () => {
    const base = configPorDefecto(agente);
    aplicarEfectos(agente.id, base, { ...base, capas: base.capas.map((c) => (c.id === "nube" ? { ...c, conectada: false } : c)) });
    expect(ajustesCapasEntidadGuardados().agentes[agente.id]).toMatchObject({ nube: false });
    aplicarEfectos(agente.id, base, { ...base, capas: quitarCapa(base.capas, "mesh") });
    const ajustes = ajustesCapasEntidadGuardados().agentes[agente.id] ?? {};
    expect(ajustes.mesh).toBeUndefined();
  });

  it("no toca lo que no cambió: otra parte del OS puede haber ajustado el sistema primario", () => {
    const base = configPorDefecto(agente);
    aplicarEfectos(agente.id, base, { ...base, percepcion: { ...base.percepcion, temas: ["x"] } });
    expect(getPrimaryChoice("agente", agente.id)).toBeNull();
  });

  it("el papel «palabra» se aplica al sistema primario del ámbito agente y «heredar» lo borra", () => {
    const base = configPorDefecto(agente);
    const r = elegirMotor(base.motores, "palabra", { motor: "bonsai" });
    if (!r.ok) throw new Error(r.motivo);
    const conBonsai: ConfigAgente = { ...base, motores: r.motores };
    aplicarEfectos(agente.id, base, conBonsai);
    expect(getPrimaryChoice("agente", agente.id)).toEqual({ modo: "fuente", fuente: ASTRAURA_BONSAI_LOCAL_SOURCE_ID });
    const h = elegirMotor(conBonsai.motores, "palabra", { motor: "heredar" });
    if (!h.ok) throw new Error(h.motivo);
    aplicarEfectos(agente.id, conBonsai, { ...conBonsai, motores: h.motores });
    expect(getPrimaryChoice("agente", agente.id)).toBeNull();
  });

  it("restablecerAgente borra la ficha y lo que aplicó", () => {
    const base = configPorDefecto(agente);
    const r = elegirMotor(base.motores, "palabra", { motor: "bitnet-158" });
    if (!r.ok) throw new Error(r.motivo);
    const c = { ...base, motores: r.motores, capas: conectarCapa(base.capas, "nube", false) };
    guardarConfigAgente(agente, c, T0);
    aplicarEfectos(agente.id, base, c);
    expect(getPrimaryChoice("agente", agente.id)).not.toBeNull();
    const vuelta = restablecerAgente(agente);
    expect(vuelta).toEqual(configPorDefecto(agente));
    expect(window.localStorage.getItem(claveConfigAgente(agente.id))).toBeNull();
    expect(getPrimaryChoice("agente", agente.id)).toBeNull();
    expect(ajustesCapasEntidadGuardados().agentes[agente.id]?.nube).toBeUndefined();
  });
});

describe("quien vive la experiencia escribe; la ficha lee y deshace", () => {
  it("registrarRecuerdo respeta el alcance: un agente público no guarda memoria personal", () => {
    expect(registrarRecuerdo(otro, { texto: "dato íntimo", alcance: "personal" }, T0).ok).toBe(false);
    expect(leerRecuerdosAgente(otro)).toEqual([]);
    expect(registrarRecuerdo(otro, { texto: "dato público", alcance: "publica" }, T0).ok).toBe(true);
    expect(leerRecuerdosAgente(otro)).toHaveLength(1);
    expect(leerRecuerdosAgente(agente)).toEqual([]);
  });

  it("registrarExperiencia mueve la deriva con tope diario, la guarda y se puede deshacer", () => {
    const r = registrarExperiencia(agente, { curiosidad: 0.5 }, "descubrió algo", T0);
    expect(r.aplicadas).toHaveLength(1);
    const c = leerConfigAgente(agente);
    expect(c.desarrollo.deriva.curiosidad).toBe(0.05);
    expect(c.percepcion.rasgos.curiosidad).toBe(0.6); // lo que fijó la persona no se toca
    expect(c.actualizado).toBe(0); // la experiencia no cuenta como cambio de la persona
    const otra = registrarExperiencia(agente, { curiosidad: 0.5 }, "otra vez", T0 + 1000);
    expect(otra.aplicadas).toHaveLength(0);
    expect(deshacerPasoEvolucion(agente, r.aplicadas[0].id)).toBe(true);
    expect(leerConfigAgente(agente).desarrollo.deriva.curiosidad).toBeUndefined();
    expect(deshacerPasoEvolucion(agente, r.aplicadas[0].id)).toBe(false);
  });
});
