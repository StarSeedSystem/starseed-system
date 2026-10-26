/**
 * Ventana de la Protomolécula · último contexto anunciado por una pantalla. Las pantallas anuncian su
 * contexto con `EVENTO_CONTEXTO_PROTO` al montarse o al cambiar la selección, normalmente ANTES de que la
 * ventana exista; por eso la orbe (que vive mientras está encendida) escucha siempre y guarda el último
 * aquí, y la ventana lo lee al abrirse. Escucha con cuenta de referencias: una sola para todos.
 */
import { EVENTO_CONTEXTO_PROTO } from "@/lib/protomolecula/peticion/contrato";
import { acumularAnuncio, normalizarAnuncio, type AnuncioContexto } from "./contexto";

let ultimo: AnuncioContexto | null = null;
let escuchas = 0;
const oyentes = new Set<() => void>();

const rutaAhora = (): string => (typeof window !== "undefined" ? window.location.pathname : "/");

function alAnunciar(e: Event) {
  const nuevo = normalizarAnuncio((e as CustomEvent).detail);
  if (!nuevo) return;
  ultimo = acumularAnuncio(ultimo, nuevo, nuevo.ruta ?? rutaAhora());
  oyentes.forEach((f) => f());
}

/** Empieza a escuchar (idempotente, con cuenta). Devuelve cómo dejar de hacerlo. */
export function iniciarEscuchaContexto(): () => void {
  if (typeof window === "undefined") return () => {};
  if (escuchas++ === 0) window.addEventListener(EVENTO_CONTEXTO_PROTO, alAnunciar);
  let activo = true;
  return () => {
    if (!activo) return;
    activo = false;
    if (--escuchas === 0) window.removeEventListener(EVENTO_CONTEXTO_PROTO, alAnunciar);
  };
}

export const ultimoAnuncio = (): AnuncioContexto | null => ultimo;

export function suscribirAnuncio(f: () => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

/** Solo para pruebas. */
export function olvidarAnuncio(): void { ultimo = null; }
