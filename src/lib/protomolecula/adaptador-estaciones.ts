/**
 * adaptador-estaciones — la entonación de una estación se mueve con el panel de la Protomolécula.
 * Contrato: `architecture/protomolecula.md` §5 (estaciones). Traduce el `ParametrosSesion` de
 * `estaciones/transmision-parametrica.ts` al esquema `Parametro` del núcleo y su `EstadoValores`,
 * y el índice de vuelta. SANEADO HONESTO: solo se traducen los campos que el tipo declara
 * (frecuencia, volumen, onda, pulso y posición 3D de cada oscilador; cada clave de la visual);
 * lo que no sepa reconstruir no se inventa. Módulo PURO: sin audio, sin estación, sin red.
 */
import type { EstadoValores, Parametro, ValorParametro } from "./tipos";
import type { ParametrosSesion, OsciladorParam, Onda, ValorVisual } from "@/lib/estaciones/transmision-parametrica";
import { ONDAS } from "@/lib/estaciones/transmision-parametrica";

/** Un átomo por estación: todas sus claves viven bajo `estacion::`. */
const ATOMO = "estacion";
export const claveEstacion = (id: string): string => `${ATOMO}::${id}`;
const SUFIJOS = ["frecuencia", "volumen", "onda", "pulso", "posx", "posy", "posz"] as const;

const numero = (id: string, nombre: string, min?: number, max?: number): Parametro =>
  ({ id, nombre, tipo: "numero", ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) });

export function parametrosDeSesion(p: ParametrosSesion): { parametros: Parametro[]; valores: EstadoValores } {
  const parametros: Parametro[] = [];
  const valores: EstadoValores = {};
  if (p.tipo === "omnifrecuencias") {
    parametros.push(numero("volumen", "Volumen", 0, 1));
    valores[claveEstacion("volumen")] = p.entonacion.volumen;
    for (const o of p.entonacion.osciladores) {
      const id = o.id || "os";
      const pon = (sufijo: string, nombre: string, valor: number, min?: number, max?: number): void => {
        parametros.push(numero(`${id}.${sufijo}`, nombre, min, max));
        valores[claveEstacion(`${id}.${sufijo}`)] = valor;
      };
      pon("frecuencia", `Frecuencia ${id}`, o.f, 0.1, 24_000);
      pon("volumen", `Volumen ${id}`, o.vol, 0, 1);
      pon("posx", `Posición X ${id}`, o.x, -1, 1);
      pon("posy", `Posición Y ${id}`, o.y, -1, 1);
      pon("posz", `Posición Z ${id}`, o.z, -1, 1);
      if (o.pulso !== undefined) pon("pulso", `Pulsos ${id}`, o.pulso, 0);
      parametros.push({ id: `${id}.onda`, nombre: `Onda ${id}`, tipo: "opcion", opciones: [...ONDAS] });
      valores[claveEstacion(`${id}.onda`)] = o.onda;
    }
    return { parametros, valores };
  }
  for (const [clave, v] of Object.entries(p.visual)) {
    const parametro: Parametro =
      typeof v === "boolean"
        ? { id: clave, nombre: clave, tipo: "booleano" }
        : typeof v === "number"
          ? numero(clave, clave)
          : { id: clave, nombre: clave, tipo: "opcion", opciones: [v] };
    parametros.push(parametro);
    valores[claveEstacion(clave)] = v;
  }
  return { parametros, valores };
}

/** Inversa: reconstruye el `ParametrosSesion` a partir del panel y su estado. */
export function sesionDeParametros(parametros: Parametro[], valores: EstadoValores): ParametrosSesion {
  const val = (id: string): ValorParametro | undefined => valores[claveEstacion(id)];
  const numV = (id: string): number | undefined => {
    const v = val(id);
    return typeof v === "number" ? v : undefined;
  };
  const esOmnifrecuencias = parametros.some((p) => SUFIJOS.some((s) => p.id.endsWith(`.${s}`)));
  if (esOmnifrecuencias) {
    const prefijos: string[] = [];
    for (const p of parametros) {
      for (const s of SUFIJOS) {
        if (!p.id.endsWith(`.${s}`)) continue;
        const prefijo = p.id.slice(0, -(s.length + 1));
        if (prefijo && !prefijos.includes(prefijo)) prefijos.push(prefijo);
      }
    }
    const osciladores: OsciladorParam[] = [];
    for (const prefijo of prefijos) {
      const f = numV(`${prefijo}.frecuencia`);
      const ondaVal = val(`${prefijo}.onda`);
      if (f === undefined || typeof ondaVal !== "string" || !ONDAS.includes(ondaVal as Onda)) continue;
      const o: OsciladorParam = {
        id: prefijo, f, onda: ondaVal as Onda,
        vol: numV(`${prefijo}.volumen`) ?? 0,
        x: numV(`${prefijo}.posx`) ?? 0,
        y: numV(`${prefijo}.posy`) ?? 0,
        z: numV(`${prefijo}.posz`) ?? 0,
      };
      const pulso = numV(`${prefijo}.pulso`);
      if (pulso !== undefined) o.pulso = pulso;
      osciladores.push(o);
    }
    return { tipo: "omnifrecuencias", entonacion: { osciladores, volumen: numV("volumen") ?? 0 } };
  }
  const visual: Record<string, ValorVisual> = {};
  for (const p of parametros) {
    const v = val(p.id);
    if (v !== undefined) visual[p.id] = v as ValorVisual;
  }
  return { tipo: "audiomorphic", visual };
}
