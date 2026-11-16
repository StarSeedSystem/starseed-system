import { type CasoLaya, type RegistroAprendizaje, casosDe, MIN_CASOS_UMBRAL, umbralRecalibrado } from "./aprendizaje-laya";

export interface ResultadoCalibracionFaltanCasos {
  n: number;
  motivo: "faltan casos";
}

export interface CajaConfianza {
  rango: [number, number];
  tasa: number;
  casos: number;
}

export interface ResultadoCalibracionExitoso {
  cajas: readonly CajaConfianza[];
  umbralSugerido: number;
  n: number;
}

export type ResultadoCalibracion = ResultadoCalibracionFaltanCasos | ResultadoCalibracionExitoso;

export function esResultadoFaltanCasos(r: ResultadoCalibracion): r is ResultadoCalibracionFaltanCasos {
  return "motivo" in r && r.motivo === "faltan casos";
}

export function calibrar(registro: RegistroAprendizaje, punto: string, ambito: string): ResultadoCalibracion {
  const casos = casosDe(registro, punto, ambito);
  const n = casos.length;

  if (n < MIN_CASOS_UMBRAL) {
    return { n, motivo: "faltan casos" };
  }

  const umbralSugerido = umbralRecalibrado(registro, punto, ambito);
  const cajas = construirCajasConfianza(casos);

  return { cajas, umbralSugerido, n };
}

function construirCajasConfianza(casos: readonly CasoLaya[]): readonly CajaConfianza[] {
  const cajas: CajaConfianza[] = [];
  const pasos = 0.1;

  for (let i = 0; i < 10; i++) {
    const limiteInferior = i * pasos;
    const limiteSuperior = (i + 1) * pasos;
    const enRango = casos.filter((c) => c.p >= limiteInferior && c.p < limiteSuperior);
    const tasaAcierto = enRango.length > 0 ? enRango.reduce((sum, c) => sum + (c.resultado === "aceptada" ? 1 : 0), 0) / enRango.length : 0;
    cajas.push({ rango: [limiteInferior, limiteSuperior], tasa: tasaAcierto, casos: enRango.length });
  }

  return Object.freeze(cajas);
}

export function confianzaCalibrada(cal: ResultadoCalibracionExitoso, p: number): number {
  const indice = Math.min(9, Math.max(0, Math.floor(p * 10)));
  const caja = cal.cajas[indice];

  return Math.min(1, Math.max(0, caja.tasa));
}