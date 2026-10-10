/**
 * centro — ESTA neurona en el centro del radar: nombre, cara y datos reales (2026-10-10).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `construirCentro` junta lo que el mapa sabe de «Tú» y devuelve lo que se dibuja y se escribe en el
 * centro (3D y plano) y en su tarjeta. Cada dato lleva su fuente; lo que no se midió se llama «no
 * medido» y dice por qué. Puro: sin React, sin red, sin `node:*`.
 */

import type { MeshPrivacySettings } from "@/ai/astraura/mesh/privacy";
import { dato, noMedido } from "./fichas-base";
import { decidirAvatar, iniciales, type DecisionAvatar, type PerfilCentro } from "./perfil-centro";
import { datosDeRadar, describirRadarPublico, type ResumenRadarPublico } from "./radar-publico";
import type { Dato, EntradaYo, MedioMapa } from "./tipos-vivo";

export const NOMBRE_NEURONA_POR_DEFECTO = "Esta neurona";

export interface EntradaCentro {
  yo: EntradaYo;
  perfil: PerfilCentro | null;
  /** Nombre que la persona acaba de poner (aún no ha llegado al registro): manda sobre el del registro. */
  nombreLocal?: string | null;
  /** Medios abiertos ahora (de todos los aparatos): se filtran los de este aparato. */
  medios: readonly MedioMapa[];
  /** false = la presencia en vivo no está conectada: los OTROS medios abiertos no se pueden saber. */
  presenciaConectada?: boolean;
  /** Señales que oye ESTE medio (lista del mapa, sin contar los aparatos de la cuenta). */
  senalesOidas: number;
  /** Señales que comparten tus otros aparatos por la malla. */
  senalesCompartidas: number;
  privacidad: MeshPrivacySettings;
  internetPublico: boolean;
  ligero: boolean;
  reducido: boolean;
}

export interface CentroNeurona {
  /** Nombre de la neurona (el aparato). */
  nombreNeurona: string;
  /** true = es el nombre por defecto (la neurona aún no tiene uno propio). */
  sinNombre: boolean;
  /** Nombre del perfil activo, o null sin perfil. */
  nombrePerfil: string | null;
  usuario: string | null;
  iniciales: string;
  avatar: DecisionAvatar;
  /** Línea corta bajo el nombre: aparato · medio. */
  subtitulo: string;
  /** Medios abiertos en ESTE aparato, contando el actual (si no hay presencia en vivo, solo el actual). */
  mediosAbiertos: number;
  /** Texto corto y honesto de los medios: «2 medios abiertos» o «otros medios no medidos». */
  textoMedios: string;
  datos: Dato[];
  radar: ResumenRadarPublico;
}

const PLATAFORMA: Record<string, string> = { mobile: "móvil", tablet: "tablet", laptop: "portátil", desktop: "equipo de escritorio", server: "servidor" };

export function construirCentro(e: EntradaCentro): CentroNeurona {
  const nombreReal = (e.nombreLocal ?? e.yo.nombre ?? "").trim();
  const nombreNeurona = nombreReal || NOMBRE_NEURONA_POR_DEFECTO;
  const avatar = decidirAvatar(e.perfil, { ligero: e.ligero, reducido: e.reducido });
  const propios = e.medios.filter((m) => m.propio).length;
  const mediosAbiertos = (e.yo.medio ? 1 : 0) + propios;
  const presencia = e.presenciaConectada !== false;
  const textoMedios = presencia
    ? `${mediosAbiertos} ${mediosAbiertos === 1 ? "medio abierto" : "medios abiertos"}`
    : "otros medios no medidos";
  const radar = describirRadarPublico({ privacidad: e.privacidad, internetPublico: e.internetPublico, hayFoto: !!e.perfil?.fotoUrl });
  const medio = e.yo.medio?.etiqueta ?? null;
  const subtitulo = [e.yo.plataforma, medio].filter(Boolean).join(" · ") || "este aparato";

  const datos: Dato[] = [
    nombreReal
      ? dato("Nombre de la neurona", nombreReal, "registro de neuronas de tu cuenta (lo editas en «Ajustes de mi neurona»)", "declarado")
      : noMedido("Nombre de la neurona", "registro de neuronas de tu cuenta", "esta neurona aún no tiene nombre propio: ponle uno en «Ajustes de mi neurona»"),
    e.perfil
      ? dato("Perfil activo", e.perfil.usuario ? `${e.perfil.nombre} · @${e.perfil.usuario.replace(/^@/, "")}` : e.perfil.nombre, "tu perfil de StarSeed (cuenta)", "declarado")
      : noMedido("Perfil activo", "tu perfil de StarSeed (cuenta)", "no hay sesión o el perfil aún no cargó"),
    dato("Imagen del centro", avatar.modo === "avatar3d" ? "avatar 3D" : avatar.modo === "foto" ? "foto del perfil" : "iniciales", "decisión del mapa según el peso medido del avatar 3D y el modo de pantalla", "declarado", avatar.motivo),
    e.yo.plataforma
      ? dato("Aparato", PLATAFORMA[e.yo.plataforma] ?? e.yo.plataforma, "registro de neuronas de tu cuenta", "declarado")
      : noMedido("Aparato", "registro de neuronas de tu cuenta", "no declara plataforma"),
    !presencia
      ? noMedido("Medios abiertos en este aparato", "presencia en vivo de tu cuenta", "la presencia en vivo no está conectada: solo se sabe de este medio, no de los demás")
      : e.yo.medio
        ? dato("Medios abiertos en este aparato", `${mediosAbiertos} ${mediosAbiertos === 1 ? "medio" : "medios"}`, "presencia en vivo de tu cuenta (este medio + los otros abiertos aquí)", "medido")
        : noMedido("Medios abiertos en este aparato", "presencia en vivo de tu cuenta", "no se pudo identificar el medio actual"),
    dato("Señales que oye este medio", `${e.senalesOidas}`, "lista de señales detectadas ahora (radio, BLE, Wi-Fi, relé, serie)", "medido"),
    dato("Señales que comparten tus otros aparatos", e.senalesCompartidas > 0 ? `${e.senalesCompartidas}` : "ninguna ahora", "radar compartido por la malla de tu cuenta", "medido"),
    ...datosDeRadar(radar),
  ];

  return {
    nombreNeurona, sinNombre: !nombreReal,
    nombrePerfil: e.perfil?.nombre ?? null, usuario: e.perfil?.usuario ?? null,
    iniciales: iniciales(e.perfil?.nombre ?? nombreNeurona),
    avatar, subtitulo, mediosAbiertos, textoMedios, datos, radar,
  };
}
