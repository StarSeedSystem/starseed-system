/**
 * (NEU1107B) Reglas de la ventana «Esta neurona»: una vez por cuenta × aparato y solo sola en las apps
 * instaladas; la carga de la fusión que se manda; el resumen de los ajustes que cambian.
 *   NODE_ENV=test npx vitest run src/lib/neurons/__tests__/neurona-bienvenida.test.ts
 */
import { describe, expect, it } from "vitest";
import {
  bienvenidaVista,
  conBienvenidaVista,
  decidirBienvenida,
  leerRegistroBienvenida,
  limpiarNombre,
  planFusionBienvenida,
  resumenCambios,
  type BorradorAjustes,
  type EntradaDecisionBienvenida,
} from "../neurona-bienvenida";
import { INFO_MEDIOS, MEDIOS_TRANSMISION, type MedioTransmision } from "@/lib/mensajeria/medios/tipos";

const UID = "1f0c2d3e-aaaa-4bbb-8ccc-000000000001";
const OTRA_CUENTA = "1f0c2d3e-aaaa-4bbb-8ccc-000000000002";
const YO = "9370fd33-0000-4000-8000-000000000004";
const VIEJA = "659d5e03-0000-4000-8000-000000000003";
const WEB = "d3abf6fa-0000-4000-8000-000000000006";

const base = (p: Partial<EntradaDecisionBienvenida> = {}): EntradaDecisionBienvenida => ({
  uid: UID,
  medio: "android",
  registro: leerRegistroBienvenida(null),
  hayCandidatas: true,
  configurada: false,
  manual: false,
  ...p,
});

describe("una vez por cuenta × aparato", () => {
  it("sola tras iniciar sesión en escritorio y Android, con la fusión primero si hay candidatas", () => {
    expect(decidirBienvenida(base())).toEqual({ mostrar: true, pasos: ["fusion", "ajustes", "resumen"] });
    expect(decidirBienvenida(base({ medio: "escritorio" }))).toEqual({ mostrar: true, pasos: ["fusion", "ajustes", "resumen"] });
  });

  it("en la web, la app web instalada e iOS no se abre sola (sí a mano)", () => {
    for (const medio of ["web", "pwa", "ios"] as const) {
      expect(decidirBienvenida(base({ medio }))).toEqual({ mostrar: false, motivo: "medio-no-automatico" });
      expect(decidirBienvenida(base({ medio, manual: true }))).toEqual({ mostrar: true, pasos: ["fusion", "ajustes", "resumen"] });
    }
    expect(decidirBienvenida(base({ medio: null }))).toEqual({ mostrar: false, motivo: "medio-no-automatico" });
  });

  it("vista una vez (completada u omitida) ya no se abre sola para ESA cuenta; otra cuenta en el mismo aparato, sí", () => {
    for (const resultado of ["completada", "omitida"] as const) {
      const reg = conBienvenidaVista(leerRegistroBienvenida(null), UID, YO, resultado, 1_000);
      expect(bienvenidaVista(reg, UID)).toBe(true);
      expect(decidirBienvenida(base({ registro: reg }))).toEqual({ mostrar: false, motivo: "ya-vista" });
      expect(decidirBienvenida(base({ registro: reg, uid: OTRA_CUENTA }))).toMatchObject({ mostrar: true });
      // A mano, siempre.
      expect(decidirBienvenida(base({ registro: reg, manual: true }))).toMatchObject({ mostrar: true });
    }
  });

  it("el registro sobrevive a ida y vuelta por texto y no se rompe con basura", () => {
    const reg = conBienvenidaVista(leerRegistroBienvenida(null), UID, YO, "omitida", 42);
    const vuelta = leerRegistroBienvenida(JSON.stringify(reg));
    expect(vuelta).toEqual({ v: 1, cuentas: { [UID]: { ts: 42, neurona: YO, resultado: "omitida" } } });
    expect(leerRegistroBienvenida("{no es json")).toEqual({ v: 1, cuentas: {} });
    expect(leerRegistroBienvenida(JSON.stringify({ cuentas: { [UID]: "x", "": {} } }))).toEqual({ v: 1, cuentas: {} });
    expect(conBienvenidaVista(reg, "", YO, "completada", 1)).toBe(reg);
  });

  it("sin candidatas: solo los ajustes, y nada si la neurona ya estaba configurada", () => {
    expect(decidirBienvenida(base({ hayCandidatas: false }))).toEqual({ mostrar: true, pasos: ["ajustes", "resumen"] });
    expect(decidirBienvenida(base({ hayCandidatas: false, configurada: true }))).toEqual({ mostrar: false, motivo: "configurada" });
    // Con candidatas se abre aunque ya estuviera configurada: hay registros que fusionar.
    expect(decidirBienvenida(base({ configurada: true }))).toMatchObject({ mostrar: true });
  });

  it("sin sesión, nunca", () => {
    expect(decidirBienvenida(base({ uid: null, manual: true }))).toEqual({ mostrar: false, motivo: "sin-sesion" });
  });
});

describe("la carga de la fusión", () => {
  const ofrecidas = [VIEJA, WEB];

  it("se queda esta: absorbe las marcadas, con el nombre limpio, sin cambiar de id", () => {
    const r = planFusionBienvenida({ yo: YO, seleccionadas: [VIEJA], principal: YO, nombre: "  Maggadroid \n phone ", ofrecidas });
    expect(r).toEqual({ ok: true, plan: { principal: YO, absorbidas: [VIEJA], nombre: "Maggadroid phone", esteMedioCambiaDeId: false } });
  });

  it("se queda la vieja: este medio se absorbe y pasa a usar su id (hay que recargar)", () => {
    const r = planFusionBienvenida({ yo: YO, seleccionadas: [VIEJA, VIEJA, YO], principal: VIEJA, nombre: "Maggadroid", ofrecidas });
    expect(r).toEqual({ ok: true, plan: { principal: VIEJA, absorbidas: [YO], nombre: "Maggadroid", esteMedioCambiaDeId: true } });
  });

  it("varias marcadas: todas menos la que se queda", () => {
    const r = planFusionBienvenida({ yo: YO, seleccionadas: [VIEJA, WEB], principal: VIEJA, nombre: "Maggadroid", ofrecidas });
    expect(r.ok && r.plan.absorbidas).toEqual([YO, WEB]);
  });

  it("nunca fusiona lo que no se enseñó, ni sin nada marcado, ni sin nombre, ni con una que se queda ajena", () => {
    expect(planFusionBienvenida({ yo: YO, seleccionadas: [], principal: YO, nombre: "X", ofrecidas })).toMatchObject({ ok: false });
    expect(planFusionBienvenida({ yo: YO, seleccionadas: ["e0b9faf2-tableta-en-linea"], principal: YO, nombre: "X", ofrecidas })).toEqual({
      ok: false,
      motivo: "Solo se pueden fusionar las neuronas que aparecen en la lista.",
    });
    expect(planFusionBienvenida({ yo: YO, seleccionadas: [VIEJA], principal: WEB, nombre: "X", ofrecidas })).toMatchObject({ ok: false });
    expect(planFusionBienvenida({ yo: YO, seleccionadas: [VIEJA], principal: YO, nombre: " \u0007 ", ofrecidas })).toEqual({
      ok: false,
      motivo: "Ponle un nombre a la neurona que se queda.",
    });
    expect(planFusionBienvenida({ yo: "", seleccionadas: [VIEJA], principal: VIEJA, nombre: "X", ofrecidas })).toMatchObject({ ok: false });
  });

  it("el nombre se corta a 60 caracteres", () => {
    expect(limpiarNombre("a".repeat(80))).toHaveLength(60);
  });
});

describe("resumen de los ajustes", () => {
  const NOMBRES = Object.fromEntries(MEDIOS_TRANSMISION.map((m) => [m, INFO_MEDIOS[m].corto])) as Record<MedioTransmision, string>;
  const antes: BorradorAjustes = {
    nombre: "Maggadroid phone",
    funcion: "ambos",
    capas: { local: true, mesh: true, nube: true, colectiva: true },
    motorLocal: true,
    mediosPropios: false,
    medios: { modo: "auto", elegidos: [], siNinguno: "esperar" },
    escuchaFondo: true,
    compartirComputo: true,
    compartirAlmacen: true,
    solicitudesArchivos: true,
    nas: false,
    actualizaPrimero: false,
    icono: "mobile",
  };

  it("sin cambios, nada", () => {
    expect(resumenCambios(antes, { ...antes, medios: { ...antes.medios } }, NOMBRES)).toEqual([]);
  });

  it("cada cambio en una frase, con los medios en su orden", () => {
    const despues: BorradorAjustes = {
      ...antes,
      nombre: "Maggadroid",
      funcion: "servidor",
      capas: { ...antes.capas, nube: false },
      motorLocal: false,
      mediosPropios: true,
      medios: { modo: "elegidos", elegidos: ["local", "wifi-local", "servidor"], siNinguno: "avisar" },
      nas: true,
      actualizaPrimero: true,
      icono: "tablet",
    };
    expect(resumenCambios(antes, despues, NOMBRES)).toEqual([
      "Nombre: «Maggadroid»",
      "Función principal: Servidor",
      "Capas de conciencia: Nube apagada",
      "Motor 1.58 local en esta neurona: no",
      "Medios de transmisión de esta neurona: Sin internet → Wi-Fi local → Servidor StarSeed",
      "Compartir carpetas (NAS) con tus neuronas: sí",
      "Recibe primero las actualizaciones automáticas",
      "Icono: Tableta",
    ]);
  });

  it("volver a los medios generales se dice; el NAS que este medio no conoce no se cuenta", () => {
    const propios = { ...antes, mediosPropios: true, medios: { modo: "elegidos" as const, elegidos: ["lora" as const], siNinguno: "esperar" as const } };
    expect(resumenCambios(propios, { ...propios, mediosPropios: false }, NOMBRES)).toEqual(["Medios de transmisión: los generales de Mensajería"]);
    expect(resumenCambios({ ...antes, nas: null }, { ...antes, nas: null }, NOMBRES)).toEqual([]);
  });
});
