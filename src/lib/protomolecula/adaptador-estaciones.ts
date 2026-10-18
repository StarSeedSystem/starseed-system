import type { Parametro, EstadoValores, ValorParametro } from "./tipos";
import type {
  ParametrosSesion,
  EntonacionParam,
  ValorVisual,
  FuenteTransmision,
  Onda,
} from "@/lib/estaciones/transmision-parametrica";

/**
 * Convierte los parámetros de una sesión de estación a la representación de Protomolécula.
 * @param p Los parámetros de la sesión (de omnifrecuencias o audiomorphic)
 * @returns Un arreglo de definiciones de parámetros y sus valores actuales
 */
export function parametrosDeSesion(p: ParametrosSesion): {
  parametros: Parametro[];
  valores: EstadoValores;
} {
  const parametros: Parametro[] = [];
  const valores: EstadoValores = {};

  if (p.tipo === "omnifrecuencias") {
    const { entonacion } = p;
    // Parámetro general de volumen
    parametros.push({
      id: "volumen",
      nombre: "Volumen general",
      tipo: "numero",
      min: 0,
      max: 1,
      defecto: entonacion.volumen,
    });
    valores["volumen"] = entonacion.volumen;

    // Parámetros de cada oscilador
    entonacion.osciladores.forEach((osc, idx) => {
      const baseId = `oscilador.${idx}`;
      // Frecuencia
      parametros.push({
        id: `${baseId}.f`,
        nombre: `Frecuencia ${idx + 1}`,
        tipo: "numero",
        min: 0.1,
        max: 24_000,
        unidad: "Hz",
        defecto: osc.f,
      });
      valores[`${baseId}.f`] = osc.f;
      // Volumen
      parametros.push({
        id: `${baseId}.vol`,
        nombre: `Volumen ${idx + 1}`,
        tipo: "numero",
        min: 0,
        max: 1,
        defecto: osc.vol,
      });
      valores[`${baseId}.vol`] = osc.vol;
      // Posición X
      parametros.push({
        id: `${baseId}.x`,
        nombre: `Posición X ${idx + 1}`,
        tipo: "numero",
        min: -1,
        max: 1,
        defecto: osc.x,
      });
      valores[`${baseId}.x`] = osc.x;
      // Posición Y
      parametros.push({
        id: `${baseId}.y`,
        nombre: `Posición Y ${idx + 1}`,
        tipo: "numero",
        min: -1,
        max: 1,
        defecto: osc.y,
      });
      valores[`${baseId}.y`] = osc.y;
      // Posición Z
      parametros.push({
        id: `${baseId}.z`,
        nombre: `Posición Z ${idx + 1}`,
        tipo: "numero",
        min: -1,
        max: 1,
        defecto: osc.z,
      });
      valores[`${baseId}.z`] = osc.z;
      // Segunda onda (opcional)
      if (osc.onda2 !== undefined) {
        parametros.push({
          id: `${baseId}.onda2`,
          nombre: `Segunda onda ${idx + 1}`,
          tipo: "opcion",
          opciones: ["sine", "square", "triangle", "sawtooth"],
          defecto: osc.onda2,
        });
        valores[`${baseId}.onda2`] = osc.onda2;
      }
      // Mezcla (opcional)
      if (osc.mezcla !== undefined) {
        parametros.push({
          id: `${baseId}.mezcla`,
          nombre: `Mezcla ${idx + 1}`,
          tipo: "numero",
          min: 0,
          max: 1,
          defecto: osc.mezcla,
        });
        valores[`${baseId}.mezcla`] = osc.mezcla;
      }
      // Pulso (opcional)
      if (osc.pulso !== undefined && osc.pulso > 0) {
        parametros.push({
          id: `${baseId}.pulso`,
          nombre: `Pulsos isocrónicos ${idx + 1}`,
          tipo: "numero",
          min: 0,
          max: 40,
          defecto: osc.pulso,
        });
        valores[`${baseId}.pulso`] = osc.pulso;
      }
      // Nombre (opcional, pero no es un parámetro que se anima, así que lo omitimos)
      // Transición (compleja, se omite por ahora)
    });
  } else if (p.tipo === "audiomorphic") {
    const { visual } = p;
    // Cada clave del visual se convierte en un parámetro
    Object.entries(visual).forEach(([clave, valor]) => {
      let tipo: Parametro["tipo"];
      let def: ValorParametro | undefined;
      let min: number | undefined;
      let max: number | undefined;
      let unidad: string | undefined;
      let paso: number | undefined;
      let opciones: string[] | undefined;

      if (typeof valor === "number") {
        tipo = "numero";
        def = valor;
        // Intentamos adivinar rango y unidad basado en el nombre de la clave
        // Esto es una simplificación; en una implementación real se tendría un mapeo específico
        if (clave.includes("freq") || clave.includes("hz")) {
          unidad = "Hz";
          min = 0;
          max = 24_000;
        } else if (clave.includes("vol") || clave.includes("gain")) {
          min = 0;
          max = 1;
        } else if (clave.includes("x") || clave.includes("pan")) {
          min = -1;
          max = 1;
        } else {
          // Por defecto, asumimos un rango amplio para números
          min = -1000;
          max = 1000;
        }
      } else if (typeof valor === "boolean") {
        tipo = "booleano";
        def = valor;
      } else if (typeof valor === "string") {
        tipo = "opcion";
        def = valor;
        // Las opciones se deberían conocer de antemano; aquí asumimos que el valor actual es la única opción
        // Esto no es ideal, pero para el propósito del adapter asumimos que las opciones son fijas y conocidas
        // En una implementación real, se tendría un mapa de claves a posibles opciones
        opciones = [valor];
      }

      parametros.push({
        id: clave,
        nombre: clave.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        tipo,
        min,
        max,
        unidad,
        paso,
        defecto: def,
      });
      valores[clave] = valor;
    });
  }

  return { parametros, valores };
}

/**
 * Convierte una representación de Protomolécula a los parámetros de una sesión de estación.
 * @param parametros Definiciones de parámetros
 * @param valores Valores actuales de los parámetros
 * @returns Los parámetros de la sesión o null si no se pudo convertir (por falta de datos esenciales)
 */
export function sesionDeParametros(
  parametros: Parametro[],
  valores: EstadoValores
): ParametrosSesion | null {
  // Agrupamos por prefijo para determinar el tipo de estación
  const esOmnifrecuencias = parametros.some((p) => p.id.startsWith("oscilador.") || p.id === "volumen");
  const esAudiomorphic = parametros.some((p) => !p.id.startsWith("oscilador.") && p.id !== "volumen");

  // Si hay indicios de ambos, priorizamos omnifrecuencias si hay osciladores
  if (esOmnifrecuencias) {
    // Reconstruir entonacion de omnifrecuencias
    const volumen = valores["volumen"] ?? 0.7;
    const osciladores: EntonacionParam["osciladores"] = [];

    // Agrupar parámetros por índice de oscilador
    const indiceMap = new Map<number, Record<string, unknown>>();
    parametros.forEach((p) => {
      if (p.id.startsWith("oscilador.")) {
        const partes = p.id.split(".");
        if (partes.length >= 3) {
          const idx = parseInt(partes[1], 10);
          const attr = partes.slice(2).join(".");
          if (!isNaN(idx)) {
            if (!indiceMap.has(idx)) indiceMap.set(idx, {});
            const obj = indiceMap.get(idx)!;
            obj[attr] = valores[p.id];
          }
        }
      }
    });

    // Ordenar por índice y crear osciladores
    const indices = Array.from(indiceMap.keys()).sort((a, b) => a - b);
    for (const idx of indices) {
      const obj = indiceMap.get(idx)!;
      const osc: EntonacionParam["osciladores"][number] = {
        f: Number(obj["f"] ?? 432),
        vol: Number(obj["vol"] ?? 0.5),
        x: Number(obj["x"] ?? 0),
        y: Number(obj["y"] ?? 0),
        z: Number(obj["z"] ?? 0),
      };
      if (obj["onda2"] !== undefined) osc.onda2 = obj["onda2"] as Onda;
      if (obj["mezcla"] !== undefined) osc.mezcla = Number(obj["mezcla"]);
      if (obj["pulso"] !== undefined && Number(obj["pulso"]) > 0) osc.pulso = Number(obj["pulso"]);
      if (obj["nombre"] !== undefined) osc.nombre = String(obj["nombre"]);
      // Transición se omite por complejidad
      osciladores.push(osc);
    }

    return {
      tipo: "omnifrecuencias",
      entonacion: {
        osciladores,
        volumen,
      },
    };
  } else if (esAudiomorphic) {
    // Reconstruir visual de audiomorphic
    const visual: Record<string, ValorVisual> = {};
    parametros.forEach((p) => {
      if (p.id === "volumen") return; // Ignorar el parámetro de volumen si está presente (pero debería estar en omnifrecuencias)
      const val = valores[p.id];
      if (val !== undefined) {
        visual[p.id] = val;
      }
    });
    return {
      tipo: "audiomorphic",
      visual,
    };
  }

  // Si no se reconoce ningún tipo, devolver null
  return null;
}