/**
 * ficha-geo — la ficha de una marca del Mapa, sobre `FichaMapa` (MAP1114C).
 * Cada valor lleva su fuente y su estado (medido / declarado / no-medido) y, cuando se midió, su hora.
 * Lo desconocido se dice «desconocido» con el motivo. Puro: sin React, sin red, sin `node:*`.
 */

import type { Dato, FichaMapa, SeccionFicha } from "@/lib/senales/tipos-vivo";
import { TEXTO_ESTADO } from "@/lib/senales/aparatos";
import { CLASES_ALMACENAMIENTO, ETIQUETA_CHIP, ETIQUETA_CONCIENCIA, claseAlmacenamiento } from "./capas";
import type { MarcaGeo } from "./marcas";
import { haceCuanto, posicionEsViva } from "./modelo-geo";

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

const pct = (q: number) => `${Math.round(q * 100)} %`;

/** Banda de almacenamiento publicada, o null si la medida no cae en la tabla. */
function bandaDeAlmacenamiento(gb: number): string | null {
  const clase = claseAlmacenamiento(gb);
  return CLASES_ALMACENAMIENTO.find((c) => c === clase) ?? null;
}

/** GPU, almacenamiento libre y tipo de chip de la ficha; sin dato queda como hueco, nunca como cero. */
function datosHardware(m: MarcaGeo, hora: string | undefined): Dato[] {
  const h = m.hardware;
  const sinDato = (etiqueta: string, motivo: string): Dato => datoDesconocido(etiqueta, h.fuente, motivo);
  const filas: Dato[] = [];

  const gpu = typeof h.gpu === "string" ? h.gpu.trim() : "";
  filas.push(gpu
    ? { etiqueta: "GPU", valor: gpu, fuente: h.fuente, estado: "declarado", nota: hora }
    : sinDato("GPU", "esa neurona no anuncia su GPU"));

  const gb = h.almacenamientoLibreGb;
  if (typeof gb === "number" && Number.isFinite(gb) && gb >= 0) {
    const banda = bandaDeAlmacenamiento(gb);
    filas.push({
      etiqueta: "Almacenamiento libre",
      valor: `${gb} GB libres${banda ? ` · ${banda}` : ""}`,
      fuente: h.fuente,
      estado: "declarado",
      nota: hora,
    });
  } else {
    filas.push(sinDato("Almacenamiento libre", "esa neurona no anuncia su almacenamiento libre"));
  }

  const chip = h.chip ? (ETIQUETA_CHIP as Record<string, string | undefined>)[h.chip] : undefined;
  filas.push(chip
    ? { etiqueta: "Tipo de chip", valor: chip, fuente: h.fuente, estado: "declarado", nota: hora }
    : sinDato("Tipo de chip", "esa neurona no anuncia su tipo de chip"));

  return filas;
}

function seccionPosicion(m: MarcaGeo, ahora: number): SeccionFicha {
  const p = m.posicion;
  if (p.tipo === "desconocida") return { id: "posicion", titulo: "Posición", datos: [datoDesconocido("Posición", "ninguna fuente de posición", p.motivo)] };
  const viva = posicionEsViva(p.t, ahora);
  const coords = `${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
  const notas = [typeof p.precisionM === "number" ? `precisión ≈${Math.round(p.precisionM)} m` : "precisión no informada", `medida a las ${horaDe(p.t)} (${haceCuanto(p.t, ahora)})`];
  return {
    id: "posicion", titulo: "Posición",
    datos: [{
      etiqueta: viva ? "Posición exacta" : "Última posición conocida (ya no es en vivo)",
      valor: coords,
      fuente: m.esYo ? "ubicación de este aparato, con tu permiso" : "la propia neurona, por el canal privado de posición de tu cuenta",
      estado: "medido", nota: notas.join(" · "),
    }],
  };
}

export function fichaDeMarca(m: MarcaGeo, ahora: number): FichaMapa {
  const aparatoTxt = m.aparato
    ? [m.aparato.equipo, [m.aparato.so, m.aparato.soV].filter(Boolean).join(" "), m.aparato.arq, m.aparato.medio !== m.aparato.so ? m.aparato.medio : undefined].filter(Boolean).join(" · ")
    : "";
  const secciones: SeccionFicha[] = [];

  const versiones = [m.versionWeb ? `interfaz ${m.versionWeb}` : "", m.versionNativa ? `app nativa ${m.versionNativa}` : ""].filter(Boolean).join(" · ");
  secciones.push({
    id: "aparato", titulo: "Aparato y sistema",
    datos: [
      aparatoTxt
        ? { etiqueta: "Aparato y sistema", valor: aparatoTxt, fuente: "lo que la propia neurona anuncia de sí misma", estado: "declarado" }
        : m.plataforma
          ? { etiqueta: "Aparato y sistema", valor: m.plataforma, fuente: "registro de neuronas de tu cuenta", estado: "declarado" }
          : datoDesconocido("Aparato y sistema", "registro de neuronas", "la neurona no anunció su aparato"),
      versiones
        ? { etiqueta: "Versión de StarSeed OS", valor: versiones, fuente: "lo que la propia neurona anuncia de sí misma", estado: "declarado" }
        : datoDesconocido("Versión de StarSeed OS", "presencia de la cuenta", "esa neurona no anunció su versión"),
      { etiqueta: "Estado", valor: TEXTO_ESTADO[m.estado], fuente: "presencia en vivo y latido de la cuenta", estado: "medido" },
    ],
  });

  secciones.push(seccionPosicion(m, ahora));

  secciones.push({
    id: "antenas", titulo: "Antenas y calidad medida",
    datos: m.antenas.map((a): Dato => {
      if (!a.medida) return datoDesconocido(a.etiqueta, a.fuente, "no se midió en ese medio");
      const calidad = a.calidad !== null ? ` · calidad ${pct(a.calidad)}` : " · calidad sin medir";
      return { etiqueta: a.etiqueta, valor: conHora(a.valor + calidad, a.t), fuente: a.fuente, estado: "medido", ...(a.nota && a.calidad === null ? { nota: a.nota } : {}) };
    }),
  });

  secciones.push({
    id: "conciencia", titulo: "Capas de conciencia",
    datos: [
      m.capas.lista
        ? { etiqueta: "Capas encendidas", valor: m.capas.lista.length ? m.capas.lista.map((c) => ETIQUETA_CONCIENCIA[c]).join(" · ") : "ninguna", fuente: m.capas.fuente, estado: "declarado", nota: horaDe(m.capas.t) ? `anunciadas a las ${horaDe(m.capas.t)}` : undefined }
        : datoDesconocido("Capas encendidas", m.capas.fuente, "esa neurona aún no anuncia sus capas"),
    ],
  });

  const h = m.hardware;
  const sinFicha = (etiqueta: string) => datoDesconocido(etiqueta, h.fuente, "no hay ficha de esa neurona");
  const hora = h.t ? `ficha de las ${horaDe(h.t)}` : undefined;
  secciones.push({
    id: "ofrece", titulo: "Qué ofrece y hardware",
    datos: [
      h.sirveAstraura === null ? sinFicha("Modelos de Astraura")
        : { etiqueta: "Modelos de Astraura", valor: h.sirveAstraura ? `sirve modelos${h.fuentesServibles ? ` · ${h.fuentesServibles} fuentes listas` : ""}` : "no sirve modelos", fuente: h.fuente, estado: "declarado", nota: hora },
      h.ramClase && h.ramClase !== "desconocida"
        ? { etiqueta: "Memoria (RAM)", valor: h.ramClase, fuente: h.fuente, estado: "declarado", nota: hora }
        : sinFicha("Memoria (RAM)"),
      ...datosHardware(m, hora),
      h.backendLocal === null ? sinFicha("Modelo local")
        : { etiqueta: "Modelo local", valor: h.backendLocal ? "tiene un motor local" : "sin motor local", fuente: h.fuente, estado: "declarado", nota: hora },
      datoDesconocido("Cómputo, almacenamiento e internet compartido", "ajustes locales de cada aparato", "aún no se anuncian a la cuenta"),
    ],
  });

  const pos = m.posicion.tipo === "desconocida" ? "Posición desconocida" : posicionEsViva(m.posicion.t, ahora) ? "Posición exacta en vivo" : `Última posición conocida ${haceCuanto(m.posicion.t, ahora)}`;
  return {
    titulo: m.nombre,
    subtitulo: `${m.esYo ? "Este aparato" : "Neurona de tu cuenta"} · ${TEXTO_ESTADO[m.estado]}`,
    resumen: `${pos}. Solo se muestra lo medido, con su hora; lo demás figura como desconocido.`,
    secciones,
  };
}
