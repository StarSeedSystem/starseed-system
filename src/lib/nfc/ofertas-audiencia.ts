// Perfil de ofertas por audiencia (contrato: architecture/nfc-neuronas.md §15).
// Qué ofrece y automatiza una neurona a cada audiencia. El mismo modelo vale para NFC, BLE, Wi‑Fi, LoRa o cable:
// `aPreferencias` lo traduce a las preferencias que `decidir.ts` ya consulta. Módulo puro: sin red, disco ni Node.

import {
  establecerRelacion,
  type Accion,
  type PerfilVisible,
  type PreferenciasNfc,
  type Relacion,
} from "./preferencias";

export const AUDIENCIAS = ["mis_neuronas", "contactos", "cuentas_starseed", "otras_senales"] as const;
export type Audiencia = (typeof AUDIENCIAS)[number];

/** Relaciones del encuentro que cubre cada audiencia. */
export const RELACIONES_DE: Record<Audiencia, readonly Relacion[]> = {
  mis_neuronas: ["misma_cuenta", "nodo_propio"],
  contactos: ["cuenta_reconocida"],
  cuentas_starseed: ["cuenta_nueva"],
  otras_senales: ["nodo_publico", "etiqueta"],
};

export type NivelOferta = "no" | "pedir" | "si";
export type NivelEscaneo = "basico" | "normal" | "estricto";

/** Recursos que dan poder o datos: solo mis neuronas pueden tenerlos en «sí». */
export const RECURSOS = ["capacidades", "almacenamiento", "senales", "internet"] as const;
export type Recurso = (typeof RECURSOS)[number];

export interface PerfilAudiencia {
  perfil: PerfilVisible;
  tarjetas: NivelOferta;
  capacidades: NivelOferta;
  almacenamiento: NivelOferta;
  senales: NivelOferta;
  internet: NivelOferta;
  salaSonido: NivelOferta;
  /** Acciones que se hacen solas con esta audiencia (se saneen igual que en las preferencias). */
  automaticas: Accion[];
  escaneo: NivelEscaneo;
}

export type OfertasAudiencia = Record<Audiencia, PerfilAudiencia>;

const ACCION_DE: Record<Recurso, Accion> = {
  capacidades: "compartir_capacidades", almacenamiento: "compartir_almacenamiento",
  senales: "compartir_senales", internet: "compartir_internet",
};
const ORDEN_ESCANEO: readonly NivelEscaneo[] = ["basico", "normal", "estricto"];
const ORDEN_OFERTA: readonly NivelOferta[] = ["no", "pedir", "si"];

const base = (): PerfilAudiencia => ({
  perfil: "pedir", tarjetas: "pedir", capacidades: "no", almacenamiento: "no", senales: "no", internet: "no",
  salaSonido: "no", automaticas: [], escaneo: "normal",
});

/** Valores por defecto seguros: con lo ajeno nada se da sin permiso y el escaneo sube con la desconfianza. */
export function ofertasPorDefecto(): OfertasAudiencia {
  return {
    mis_neuronas: { ...base(), perfil: "mostrar", tarjetas: "si", capacidades: "si", almacenamiento: "si", senales: "si", internet: "pedir", salaSonido: "si", escaneo: "basico" },
    contactos: { ...base(), perfil: "mostrar", tarjetas: "si", salaSonido: "pedir" },
    cuentas_starseed: { ...base(), tarjetas: "pedir", escaneo: "normal" },
    otras_senales: { ...base(), perfil: "ocultar", tarjetas: "no", escaneo: "estricto" },
  };
}

const tope = (n: NivelOferta, max: NivelOferta): NivelOferta =>
  ORDEN_OFERTA.indexOf(n) > ORDEN_OFERTA.indexOf(max) ? max : n;

/** Aplica los límites de seguridad: lo ajeno nunca recibe recursos en «sí» ni baja el escaneo mínimo. */
export function sanearAudiencia(a: Audiencia, p: PerfilAudiencia): PerfilAudiencia {
  const propia = a === "mis_neuronas";
  const r = (n: NivelOferta) => (propia ? n : tope(n, "pedir"));
  const minimo: NivelEscaneo = propia ? "basico" : a === "otras_senales" ? "estricto" : "normal";
  const escaneo = ORDEN_ESCANEO.indexOf(p.escaneo) < ORDEN_ESCANEO.indexOf(minimo) ? minimo : p.escaneo;
  const sinAuto = a === "cuentas_starseed" || a === "otras_senales";
  return {
    ...p, capacidades: r(p.capacidades), almacenamiento: r(p.almacenamiento), senales: r(p.senales), internet: r(p.internet),
    salaSonido: a === "otras_senales" ? "no" : p.salaSonido, tarjetas: a === "otras_senales" ? "no" : p.tarjetas,
    automaticas: sinAuto ? [] : [...new Set(p.automaticas)], escaneo,
  };
}

export function audienciaDe(relacion: Relacion): Audiencia {
  return AUDIENCIAS.find((a) => RELACIONES_DE[a].includes(relacion)) ?? "otras_senales";
}

export function establecerOferta(o: OfertasAudiencia, a: Audiencia, cambios: Partial<PerfilAudiencia>): OfertasAudiencia {
  return { ...o, [a]: sanearAudiencia(a, { ...o[a], ...cambios }) };
}

/** Traduce las ofertas a las preferencias de NFC: `decidir` las consulta tal cual, sea cual sea la señal. */
export function aPreferencias(prefs: PreferenciasNfc, o: OfertasAudiencia): PreferenciasNfc {
  let sig = prefs;
  for (const a of AUDIENCIAS) {
    const p = sanearAudiencia(a, o[a]);
    const dadas = RECURSOS.filter((r) => p[r] !== "no").map((r) => ACCION_DE[r]);
    const solas = RECURSOS.filter((r) => p[r] === "si").map((r) => ACCION_DE[r]);
    for (const rel of RELACIONES_DE[a]) {
      const actual = sig.porRelacion[rel];
      const fuera = Object.values(ACCION_DE);
      sig = establecerRelacion(sig, rel, {
        perfil: p.perfil,
        ofrecidas: [...actual.ofrecidas.filter((x) => !fuera.includes(x)), ...dadas],
        automaticas: [...actual.automaticas.filter((x) => !fuera.includes(x)), ...solas, ...p.automaticas],
      });
    }
  }
  return sig;
}
