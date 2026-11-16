/**
 * publicacion — qué fila puede salir de esta neurona hacia las capas pública y de comunidad (MRA5b/MAP1116B).
 * ════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Puro: sin React, sin red, sin `node:*`.
 */

import type { MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import { emisionDeRadar } from "../radar-publico";
import type { SenalEspectro, Medio, OrigenDato, CapaRed } from "./tipos";

/** Lo que el usuario eligió publicar por medio. */
export type EleccionPublicar = Partial<Record<Medio, "no" | "comunidad" | "publica">>;

/** Entrada para decidir qué filas publican. */
export interface EntradaPublicacion {
  /** Privacidad de la malla de esta neurona. */
  privacidad: MeshPrivacySettings;
  /** `getConnectivitySettings().publicInternet`: la sesión pública está encendida. */
  internetPublico: boolean;
  /** Elección del usuario: qué medios publica y en qué capa. */
  eleccion: {
    publicar: EleccionPublicar;
    /** Slugs de comunidades a las que el usuario pertenece y permite publicar. */
    comunidades: string[];
    /** Si incluye zona gruesa (≤5 caracteres) en las filas. */
    incluirZona: boolean;
  };
  /** Lo que ESTA neurona emite u ofrece: su antena LoRa, su malla, su oferta de internet, sus estaciones. */
  propias: SenalEspectro[];
  /** Lo que esta neurona oye (señales de otras neuronas/nodos). */
  ocupacion: SenalEspectro[];
  /** Zona gruesa ya calculada (≤5 caracteres, nunca lat/lon). Null si no hay zona. */
  zonaGruesa: string | null;
  /** Id de esta neurona (deviceId). */
  deviceId: string;
  /** Epoch ms actual. */
  ahora: number;
}

/** Fila que puede publicarse (pública o comunidad). */
export interface FilaPublicable {
  /** Id único de la fila. */
  id: string;
  /** Medio de la señal. */
  medio: Medio;
  /** Banda (etiqueta legible). */
  banda: string;
  /** Frecuencia central en kHz. */
  frecuenciaKhz: number | null;
  /** Ancho de banda en kHz. */
  anchoKhz: number | null;
  /** Fuerza en dBm (para señales propias medidas). */
  fuerzaDbm: number | null;
  /** Calidad 0..1 (para señales propias medidas). */
  calidad: number | null;
  /** Origen del dato: medida | declarada | estimada. */
  origen: OrigenDato;
  /** Capa a la que va: "publica" | "comunidad". */
  capa: "publica" | "comunidad";
  /** Para capa "comunidad": slug de la comunidad. */
  comunidad: string | null;
  /** Zona gruesa (≤5 caracteres) si se incluye. */
  zona: string | null;
  /** Hora de la medición (epoch ms). */
  medidoEn: number;
  /** Fuente humana legible. */
  fuente: string;
}

/** Límite de antigüedad: 3 minutos = 180_000 ms. */
const ANTIGUEDAD_MAX_MS = 3 * 60_000;

/** Tope de filas por tanda. */
const TOPE_FILAS = 40;

/**
 * Decide qué filas pueden salir de esta neurona hacia las capas pública y de comunidad.
 * Reglas:
 * 1. Usa `emisionDeRadar`: sin sesión pública o con radar en `off` no sale NADA a la capa pública (la privada del propio dueño sí).
 * 2. Solo medios con elección distinta de "no".
 * 3. De lo que ESTA neurona OYE se publica únicamente ocupación agregada por banda (conteo y fuerza máxima), SIN SSID, MAC, nombres de vecinas ni posiciones de nadie.
 * 4. `zona` solo si `incluirZona` y la zona ya viene gruesa (≤5 caracteres); sin zona, la fila sale sin ella; jamás se recibe ni se escribe lat/lon.
 * 5. Cada fila lleva `origen` correcto (medida/declarada/estimada), `medidoEn`, capa y, para comunidad, el slug de una comunidad de `eleccion.comunidades`.
 * 6. Filas con más de 3 min de antigüedad no salen; tope de 40 filas por tanda.
 */
export function filasAPublicar(entrada: EntradaPublicacion): FilaPublicable[] {
  const { privacidad, internetPublico, eleccion, propias, ocupacion, zonaGruesa, deviceId, ahora } = entrada;

  const { emision } = emisionDeRadar(privacidad, internetPublico);
  const esPublica = emision === "publica";
  const esAnonima = emision === "anonima";

  const filas: FilaPublicable[] = [];

  // 1. Señales PROPIAS (lo que esta neurona emite/u ofrece)
  for (const senal of propias) {
    const eleccionMedio = eleccion.publicar[senal.medio];
    if (!eleccionMedio || eleccionMedio === "no") continue;

    const antigüedad = ahora - (senal.medidoEn ?? 0);
    if (!Number.isFinite(antigüedad) || antigüedad > ANTIGUEDAD_MAX_MS) continue;

    const capa: "publica" | "comunidad" = eleccionMedio === "publica" && esPublica ? "publica" : "comunidad";
    if (capa === "comunidad" && eleccion.comunidades.length === 0) continue;

    const comunidad = capa === "comunidad" ? eleccion.comunidades[0] : null;
    // En modo anónimo no se publica zona (privacidad: radar anónimo no comparte posición)
    const zona = !esAnonima && eleccion.incluirZona && zonaGruesa && zonaGruesa.length <= 5 ? zonaGruesa : null;

    filas.push({
      id: `${deviceId}:${senal.id}`,
      medio: senal.medio,
      banda: senal.banda,
      frecuenciaKhz: senal.frecuenciaKhz,
      anchoKhz: senal.anchoKhz,
      fuerzaDbm: senal.fuerzaDbm,
      calidad: senal.calidad,
      origen: senal.origen,
      capa,
      comunidad,
      zona,
      medidoEn: senal.medidoEn ?? ahora,
      fuente: senal.fuente,
    });
  }

  // 2. OCUPACIÓN (lo que esta neurona oye) — agregada por banda
  if (ocupacion.length > 0) {
    const porBanda = new Map<string, SenalEspectro[]>();
    for (const senal of ocupacion) {
      const eleccionMedio = eleccion.publicar[senal.medio];
      if (!eleccionMedio || eleccionMedio === "no") continue;

      const antigüedad = ahora - (senal.medidoEn ?? 0);
      if (!Number.isFinite(antigüedad) || antigüedad > ANTIGUEDAD_MAX_MS) continue;

      const clave = `${senal.medio}|${senal.banda}`;
      const arr = porBanda.get(clave) ?? [];
      arr.push(senal);
      porBanda.set(clave, arr);
    }

    for (const [, senales] of porBanda) {
      const primera = senales[0];
      const eleccionMedio = eleccion.publicar[primera.medio];
      if (!eleccionMedio || eleccionMedio === "no") continue;

      const capa: "publica" | "comunidad" = eleccionMedio === "publica" && esPublica ? "publica" : "comunidad";
      if (capa === "comunidad" && eleccion.comunidades.length === 0) continue;

      const comunidad = capa === "comunidad" ? eleccion.comunidades[0] : null;
      // En modo anónimo no se publica zona (privacidad: radar anónimo no comparte posición)
      const zona = !esAnonima && eleccion.incluirZona && zonaGruesa && zonaGruesa.length <= 5 ? zonaGruesa : null;

      // Agregar: conteo y fuerza máxima
      const conteo = senales.length;
      const fuerzaMax = Math.max(...senales.map((s) => s.fuerzaDbm ?? -Infinity));

      filas.push({
        id: `${deviceId}:ocupacion:${primera.medio}:${primera.banda}`,
        medio: primera.medio,
        banda: primera.banda,
        frecuenciaKhz: primera.frecuenciaKhz,
        anchoKhz: primera.anchoKhz,
        fuerzaDbm: Number.isFinite(fuerzaMax) ? fuerzaMax : null,
        calidad: null,
        origen: "estimada",
        capa,
        comunidad,
        zona,
        medidoEn: Math.max(...senales.map((s) => s.medidoEn ?? 0)),
        fuente: `ocupación agregada de ${conteo} señales oídas en ${primera.banda}`,
      });
    }
  }

  // Ordenar por medidoEn descendente (más recientes primero) y limitar a TOPE_FILAS
  filas.sort((a, b) => b.medidoEn - a.medidoEn);
  return filas.slice(0, TOPE_FILAS);
}