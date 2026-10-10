"use client";

/**
 * crear-sesion — publicar una estación EN VIVO de Omnifrecuencias o Audiomorphic (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════
 * SOP: `architecture/estaciones-en-vivo-parametricas.md` (§3).
 *
 * Crea las llaves de la sesión (su id es la huella de la pública), la ficha con la entonación o la
 * espiral, la guarda como «mía» en este aparato (este medio es el reloj de referencia) y, si es
 * PÚBLICA, la publica en el directorio de Transmisiones (`os_estaciones`, fuente «starseed», enlace
 * `/estaciones/vivo/<id>?f=…`). Las PRIVADAS no salen en el directorio: se comparten con el enlace de
 * invitación, que lleva el token en el fragmento (`#…&k=`), y su canal va cifrado con él.
 * Sin tablas nuevas.
 */

import { crearLlaves, crearToken, exportarPrivada, idDeLlave } from "./cripto-estacion";
import { anotarFila, guardarSesion } from "./llaves-locales";
import {
  enlaceDeSesion,
  sanearFicha,
  type FichaSesion,
  type FuenteTransmision,
  type ParametrosSesion,
} from "./transmision-parametrica";
import type { Estacion, LicenciaEstacion } from "./tipos";

export interface DatosNuevaSesion {
  fuente: FuenteTransmision;
  titulo: string;
  /** Enlace de la entonación/espiral en su app (https o ruta del OS). */
  enlace: string;
  params: ParametrosSesion;
  privada: boolean;
  descripcion?: string;
  licencia?: LicenciaEstacion;
  categorias?: string[];
  idioma?: string;
  ambito?: { tipo: "persona" | "entidad"; ref: string | null };
  enMalla?: boolean;
}

export type ResultadoNuevaSesion =
  | {
      ok: true;
      ficha: FichaSesion;
      /** Enlace para escuchar (el de la invitación si es privada). */
      enlace: string;
      /** Enlace para controlarla desde OTRO aparato tuyo (lleva la llave: no lo compartas). */
      enlaceControl: string;
      estacion: Estacion | null;
      /** Si era pública y no se pudo publicar en el directorio, por qué. */
      avisoDirectorio?: string;
    }
  | { ok: false; error: string };

export async function crearSesionEnVivo(d: DatosNuevaSesion): Promise<ResultadoNuevaSesion> {
  let llaves;
  try {
    llaves = await crearLlaves();
  } catch {
    return { ok: false, error: "Este navegador no puede crear las llaves de la estación (WebCrypto)." };
  }
  const id = await idDeLlave(llaves.publica);
  const ficha = sanearFicha({
    v: 1,
    id,
    fuente: d.fuente,
    titulo: d.titulo,
    enlace: d.enlace,
    pk: llaves.publica,
    privada: d.privada,
    params: d.params,
    creada: Date.now(),
  });
  if (!ficha) {
    return { ok: false, error: "Revisa el título (2–100 letras), el enlace (https o ruta del OS) y los parámetros." };
  }
  const token = d.privada ? crearToken() : undefined;
  const enlace = enlaceDeSesion(ficha, { token });
  const enlaceControl = enlaceDeSesion(ficha, { token, control: await exportarPrivada(llaves.privada) });
  await guardarSesion(id, llaves.privada, { token, enlace, titulo: ficha.titulo, referencia: true, creada: ficha.creada });

  if (d.privada) return { ok: true, ficha, enlace, enlaceControl, estacion: null };

  const { publicarEstacion } = await import("./datos");
  const r = await publicarEstacion({
    titulo: ficha.titulo,
    descripcion: d.descripcion ?? "",
    tipo: d.fuente === "omnifrecuencias" ? "audio" : "mixto",
    fuente: "starseed",
    enlace,
    licencia: d.licencia ?? "cc-by",
    categorias: d.categorias ?? [d.fuente],
    idioma: d.idioma ?? "es",
    visibilidad: "publica",
    en_malla: !!d.enMalla,
    ambito_tipo: d.ambito?.tipo ?? "persona",
    entidad_ref: d.ambito?.tipo === "entidad" ? d.ambito.ref : null,
  });
  if (!r.ok) {
    return { ok: true, ficha, enlace, enlaceControl, estacion: null, avisoDirectorio: r.error };
  }
  anotarFila(id, r.estacion.id);
  if (d.enMalla) {
    void import("./malla").then((m) => m.anunciarEnMalla(r.estacion)).catch(() => undefined);
  }
  return { ok: true, ficha, enlace, enlaceControl, estacion: r.estacion };
}
