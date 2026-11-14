/**
 * ficha-geo — la ficha de una marca del Mapa, sobre `FichaMapa` (MAP1114B).
 * Cada valor lleva su fuente y su estado (medido / declarado / no-medido) y, cuando se midió, su hora.
 * Lo desconocido se dice «desconocido» con el motivo. Puro: sin React, sin red, sin `node:*`.
 */

import type { Dato, FichaMapa, SeccionFicha } from "@/lib/senales/tipos-vivo";
import { TEXTO_ESTADO } from "@/lib/senales/aparatos";
import { ETIQUETA_CONCIENCIA } from "./capas";
import type { MarcaGeo } from "./marcas";
import { FRASE_NIVEL, type PreferenciaPosicion } from "./modelo-geo";

export const DESCONOCIDO = "desconocido";

/** «14:32» en hora local; vacío si la hora no es válida. */
export function horaDe(t: number | null | undefined): string {
  if (typeof t !== "number" || !Number.isFinite(t)) return "";
  const d = new Date(t);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

function conHora(base: string, t: number | null): string {
  const h = horaDe(t);
  return h ? `${base} · medido a las ${h}` : base;
}

export function datoDesconocido(etiqueta: string, fuente: string, nota: string): Dato {
  return { etiqueta, valor: DESCONOCIDO, fuente, estado: "no-medido", nota };
}

function seccionPosicion(m: MarcaGeo, pref: PreferenciaPosicion | null): SeccionFicha {
  const p = m.posicion;
  const datos: Dato[] = [];
  if (p.tipo === "exacta") {
    datos.push({
      etiqueta: "Posición", valor: "punto exacto (solo lo ves tú)",
      fuente: m.esYo ? "ubicación de este aparato, con tu permiso" : "la propia neurona, que decidió compartirla con tu cuenta",
      estado: "medido", nota: [p.precisionM !== undefined ? `precisión ≈${p.precisionM} m` : "", horaDe(p.t) ? `medido a las ${horaDe(p.t)}` : ""].filter(Boolean).join(" · ") || undefined,
    });
  } else if (p.tipo === "zona") {
    datos.push({
      etiqueta: "Posición", valor: "zona aproximada de ≈1 km",
      fuente: "la propia neurona, que solo comparte la zona, no el punto", estado: "declarado",
      nota: horaDe(p.t) ? `anunciada a las ${horaDe(p.t)}` : undefined,
    });
  } else {
    datos.push(datoDesconocido("Posición", "ninguna fuente de posición", p.motivo));
  }
  if (m.esYo && pref) {
    datos.push({ etiqueta: "Mis otras neuronas ven", valor: FRASE_NIVEL[pref.cuenta], fuente: "tu preferencia en este aparato", estado: "declarado" });
    datos.push({ etiqueta: "El radar público ve", valor: FRASE_NIVEL[pref.publica], fuente: "tu preferencia en este aparato", estado: "declarado" });
  }
  return { id: "posicion", titulo: "Posición", datos };
}

export function fichaDeMarca(m: MarcaGeo, pref: PreferenciaPosicion | null = null): FichaMapa {
  const aparatoTxt = m.aparato
    ? [m.aparato.equipo, [m.aparato.so, m.aparato.soV].filter(Boolean).join(" "), m.aparato.arq, m.aparato.medio !== m.aparato.so ? m.aparato.medio : undefined].filter(Boolean).join(" · ")
    : "";
  const secciones: SeccionFicha[] = [];

  secciones.push({
    id: "aparato", titulo: "Aparato",
    datos: [
      aparatoTxt
        ? { etiqueta: "Aparato y sistema", valor: aparatoTxt, fuente: "lo que la propia neurona anuncia de sí misma", estado: "declarado" }
        : m.plataforma
          ? { etiqueta: "Aparato y sistema", valor: m.plataforma, fuente: "registro de neuronas de tu cuenta", estado: "declarado" }
          : datoDesconocido("Aparato y sistema", "registro de neuronas", "la neurona no anunció su aparato"),
      m.versionWeb
        ? { etiqueta: "Versión de la interfaz", valor: m.versionWeb, fuente: "lo que la propia neurona anuncia de sí misma", estado: "declarado" }
        : datoDesconocido("Versión de la interfaz", "presencia de la cuenta", "esa neurona no anunció su versión"),
      { etiqueta: "Estado", valor: TEXTO_ESTADO[m.estado], fuente: "presencia en vivo y latido de la cuenta", estado: "medido" },
    ],
  });

  secciones.push(seccionPosicion(m, pref));

  const enlace: Dato = m.calidad.valor !== null && m.enlace.latenciaMs !== null
    ? { etiqueta: "Enlace con este aparato", valor: conHora(`latencia ${Math.round(m.enlace.latenciaMs)} ms · calidad ${Math.round(m.calidad.valor * 100)} %`, m.calidad.t), fuente: m.calidad.fuente, estado: "medido" }
    : datoDesconocido("Enlace con este aparato", m.calidad.fuente, m.calidad.nota ?? "no se midió");
  secciones.push({ id: "enlace", titulo: "Calidad del enlace", datos: [enlace] });

  secciones.push({
    id: "antenas", titulo: "Antenas y medios",
    datos: m.antenas.map((a): Dato => a.medida
      ? { etiqueta: a.etiqueta, valor: conHora(a.valor, a.t), fuente: a.fuente, estado: "medido" }
      : datoDesconocido(a.etiqueta, a.fuente, "no se midió en ese medio")),
  });

  secciones.push({
    id: "conciencia", titulo: "Capas de conciencia",
    datos: [
      m.capas.lista
        ? { etiqueta: "Capas encendidas", valor: m.capas.lista.length ? m.capas.lista.map((c) => ETIQUETA_CONCIENCIA[c]).join(" · ") : "ninguna", fuente: m.capas.fuente, estado: "declarado", nota: horaDe(m.capas.t) ? `anunciadas a las ${horaDe(m.capas.t)}` : undefined }
        : datoDesconocido("Capas encendidas", m.capas.fuente, "esa neurona aún no anuncia sus capas"),
    ],
  });

  const resumenPos = m.posicion.tipo === "desconocida" ? "posición desconocida" : m.posicion.tipo === "zona" ? "zona aproximada" : "posición exacta (solo tuya)";
  return {
    titulo: m.nombre,
    subtitulo: `${m.esYo ? "Este aparato" : "Neurona de tu cuenta"} · ${TEXTO_ESTADO[m.estado]}`,
    resumen: `${resumenPos[0].toUpperCase()}${resumenPos.slice(1)}. Solo se muestra lo medido, con su hora; lo demás figura como desconocido.`,
    secciones,
  };
}

export interface AccionFicha {
  id: "ver" | "pedir-acceso" | "configurar";
  etiqueta: string;
  habilitada: boolean;
  nota: string;
}

/** Los botones que dependen de permisos (control remoto entre neuronas) aún no existen: próximamente. */
export function accionesDeMarca(): AccionFicha[] {
  const nota = "próximamente";
  return [
    { id: "ver", etiqueta: "Ver", habilitada: false, nota },
    { id: "pedir-acceso", etiqueta: "Pedir acceso", habilitada: false, nota },
    { id: "configurar", etiqueta: "Configurar", habilitada: false, nota },
  ];
}
