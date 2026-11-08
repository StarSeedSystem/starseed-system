/**
 * mapa-vias-datos — tabla ESTÁTICA del «Mapa de vías» (MED1108B · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Copia de la tabla del §2 de `architecture/red-sin-dependencias.md` («Dónde estamos»). Es el ÚNICO
 * sitio donde se anota qué sistema funciona sin internet: cada fase posterior (F1…F7) cambia aquí su
 * entrada cuando aterriza, y el panel lo refleja sin tocar nada más. `mapa-vias.ts` la cruza con los
 * conectores vivos.
 */

import type { ClaseEnvio } from "@/lib/malla/eleccion-enlace";

/** Sin internet hoy, según el contrato: «si» funciona, «parcial» a medias, «no» depende de la nube. */
export type SinInternetHoy = "si" | "parcial" | "no";

export interface SistemaVias {
  id: string;
  nombre: string;
  /** Qué clase de envío necesita para viajar por la malla (decide qué medios cuentan). */
  clase: ClaseEnvio;
  sinInternet: SinInternetHoy;
  /** Por qué (frase corta del contrato). */
  porQue: string;
  /** Qué falta para que funcione sin internet (vacío si ya funciona). */
  falta: string[];
  /** Fase del contrato (§10) que lo resuelve. */
  fase?: string;
  /** Si es true, el sistema usa internet/servidor mientras lo haya, aunque la malla no esté lista. */
  usaServidor: boolean;
}

export const SISTEMAS_VIAS: SistemaVias[] = [
  {
    id: "mensajes", nombre: "Mensajes", clase: "mensaje", sinInternet: "si", usaServidor: true,
    porQue: "Entre neuronas por red local nativa, Bluetooth y WebRTC; los de cuenta con almacén local (sin probar en aparatos).",
    falta: ["Probar los 18 formatos por cada medio en dos aparatos reales"], fase: "F1",
  },
  {
    id: "llamadas", nombre: "Llamadas", clase: "flujo", sinInternet: "si", usaServidor: true,
    porQue: "Llamadas 1:1 y de grupo (hasta 6) sin servidores de ICE; vídeo y pantalla por el canal de datos (sin probar en aparatos).",
    falta: ["Elegir el medio con el planificador único (hoy lo decide la propia llamada)"], fase: "F1",
  },
  {
    id: "archivos", nombre: "Archivos", clase: "archivo", sinInternet: "si", usaServidor: true,
    porQue: "Trozos con SHA y reanudación; unos 550 KB/s por la red local nativa, más con Wi‑Fi directo.",
    falta: [], fase: "F1",
  },
  {
    id: "publicaciones", nombre: "Publicaciones y feed", clase: "mensaje", sinInternet: "no", usaServidor: true,
    porQue: "Se escribe primero en Supabase y solo después se difunde; el feed lee la tabla.",
    falta: ["Registro vivo firmado y almacén local", "Réplicas por ámbito"], fase: "F2",
  },
  {
    id: "paginas", nombre: "Páginas", clase: "mensaje", sinInternet: "no", usaServidor: true,
    porQue: "Viven solo en Supabase.", falta: ["Registro vivo firmado y almacén local"], fase: "F2",
  },
  {
    id: "comunidades", nombre: "Comunidades", clase: "mensaje", sinInternet: "no", usaServidor: true,
    porQue: "Viven solo en Supabase.", falta: ["Registro vivo firmado y almacén local"], fase: "F2",
  },
  {
    id: "grupos", nombre: "Grupos y gobierno", clase: "mensaje", sinInternet: "no", usaServidor: true,
    porQue: "Membresías y votos en Supabase; el resultado lo sella el servidor.",
    falta: ["Papeletas firmadas, quórum y notarios"], fase: "F3",
  },
  {
    id: "canales", nombre: "Canales", clase: "mensaje", sinInternet: "no", usaServidor: true,
    porQue: "Viven solo en Supabase.", falta: ["Registro vivo firmado y anuncio por la malla"], fase: "F2",
  },
  {
    id: "transmisiones", nombre: "Transmisiones y estaciones", clase: "flujo", sinInternet: "parcial", usaServidor: true,
    porQue: "Los espectadores se pasan los segmentos, pero hace falta el origen y el directorio está en Supabase.",
    falta: ["Directorio de estaciones por la malla", "Escalones de calidad por medio"], fase: "F4",
  },
  {
    id: "biblioteca", nombre: "Biblioteca", clase: "archivo", sinInternet: "parcial", usaServidor: true,
    porQue: "Lo instalado funciona; el catálogo y las instalaciones nuevas, no.",
    falta: ["Catálogo e instalaciones nuevas por la malla"], fase: "F7",
  },
  {
    id: "conciencia", nombre: "Capas de conciencia", clase: "mensaje", sinInternet: "parcial", usaServidor: true,
    porQue: "Un modelo local o Ollama en la LAN sirve; WebLLM y transformers.js se cargan de CDNs.",
    falta: ["Motores empaquetados", "Capas por la malla sin señalizar por Supabase"], fase: "F5",
  },
  {
    id: "cuenta", nombre: "Cuenta y acceso", clase: "mensaje", sinInternet: "parcial", usaServidor: true,
    porQue: "Con sesión guardada se sigue dentro sin internet, con certificado de neurona; otra neurona se enrola por QR (código 6 cifras).",
    falta: ["Probar en dos aparatos reales", "Crear una cuenta nueva sin ninguna neurona de confianza cerca (necesita un ancla: QR de otra persona o internet)"], fase: "F0",
  },
  {
    id: "avisos", nombre: "Avisos", clase: "mensaje", sinInternet: "parcial", usaServidor: true,
    porQue: "Los de mensajes de la malla son locales; los demás vienen de Supabase o de ntfy.sh.",
    falta: ["Avisos de todas las entidades por la malla"], fase: "F7",
  },
  {
    id: "actualizaciones", nombre: "Actualizaciones", clase: "archivo", sinInternet: "no", usaServidor: true,
    porQue: "Solo desde GitHub; por la malla viaja la petición, no los archivos.",
    falta: ["Espejo en la LAN y entre pares con firma verificada"], fase: "F7",
  },
];
