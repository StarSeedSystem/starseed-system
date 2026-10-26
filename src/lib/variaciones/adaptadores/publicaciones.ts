// Adaptador de publicaciones y mensajes: captura estilos, plantillas y decoraciones
// del editor rico (src/components/messages/rico/) y del compositor de publicaciones
// (src/components/creation/), SIN el texto ni los destinatarios. Aplica sobre el
// borrador actual con deshacer. Contrato: architecture/variaciones-publicas.md §5.
import type { EstiloMensaje, DocRico, LienzoMensaje, FormatoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { PostBlock } from "@/lib/creation/post-blocks";
import { validarVariacion } from "../validar";
import { leerClave } from "../clave-elemento";
import { registrarFamilia, type AdaptadorFamilia } from "../familias";

/** Familias que cubre este adaptador. */
export type FamiliaPublicacion = "post" | "mensaje";

/** Partes captuables de cada familia. */
export type PartePublicacion = "estilo" | "plantilla" | "decoracion";

/** Estado que el anfitrión presta al adaptador; el adaptador nunca lo guarda. */
export interface DepsPublicaciones {
  /** Estilo activo del editor (mensaje o publicación). */
  leerEstilo: (familia: FamiliaPublicacion) => EstiloMensaje | null;
  /** Plantilla activa (bloques del compositor o doc/lienzo del editor rico). */
  leerPlantilla: (familia: FamiliaPublicacion) => { doc?: DocRico; lienzo?: LienzoMensaje; bloques?: PostBlock[] } | null;
  /** Decoración activa (fondos de lienzo, animaciones, presets de tamaño). */
  leerDecoracion: (familia: FamiliaPublicacion) => { fondoLienzo?: string; animacionFondo?: string; presetLienzo?: string } | null;
  /** Aplica un estilo; con null restaura el anterior. */
  escribirEstilo: (familia: FamiliaPublicacion, estilo: EstiloMensaje | null) => void;
  /** Aplica una plantilla; con null restaura la anterior. */
  escribirPlantilla: (familia: FamiliaPublicacion, plantilla: { doc?: DocRico; lienzo?: LienzoMensaje; bloques?: PostBlock[] } | null) => void;
  /** Aplica una decoración; con null restaura la anterior. */
  escribirDecoracion: (familia: FamiliaPublicacion, decoracion: { fondoLienzo?: string; animacionFondo?: string; presetLienzo?: string } | null) => void;
}

/** Payload de estilo capturable y publicable. */
export interface PayloadEstilo {
  tipo: "estilo";
  estilo: EstiloMensaje;
}

/** Payload de plantilla capturable y publicable. */
export interface PayloadPlantilla {
  tipo: "plantilla";
  /** Para mensajes: doc y/o lienzo. Para publicaciones: bloques del compositor. */
  doc?: DocRico;
  lienzo?: LienzoMensaje;
  bloques?: PostBlock[];
}

/** Payload de decoración capturable y publicable. */
export interface PayloadDecoracion {
  tipo: "decoracion";
  fondoLienzo?: string;
  animacionFondo?: string;
  presetLienzo?: string;
}

export type PayloadPublicacion = PayloadEstilo | PayloadPlantilla | PayloadDecoracion;

/** Comprueba si una clave pertenece a este adaptador y extrae familia y parte. */
function parsearClave(clave: string): { familia: FamiliaPublicacion; parte: PartePublicacion } | null {
  const leida = leerClave(clave);
  if (!leida) return null;
  const [familiaStr, resto] = leida.split(":");
  if (!familiaStr || !resto) return null;
  if (familiaStr !== "post" && familiaStr !== "mensaje") return null;
  const [id, parte] = resto.split("#");
  if (!id || !parte) return null;
  if (parte !== "estilo" && parte !== "plantilla" && parte !== "decoracion") return null;
  return { familia: familiaStr as FamiliaPublicacion, parte: parte as PartePublicacion };
}

/** Limpia un EstiloMensaje quitando campos vacíos o "ninguna". */
function limpiarEstilo(e: EstiloMensaje): EstiloMensaje {
  const out: EstiloMensaje = {};
  for (const k of Object.keys(e)) {
    const v = e[k as keyof EstiloMensaje];
    if (v === undefined || v === null || v === "" || v === false || v === "ninguna") continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : ({} as EstiloMensaje);
}

/** Serializa un DocRico a JSON plano para validación de tamaño. */
function docAJson(doc?: DocRico | null): unknown {
  return doc ?? null;
}

/** Serializa un LienzoMensaje a JSON plano para validación de tamaño. */
function lienzoAJson(lienzo?: LienzoMensaje | null): unknown {
  return lienzo ?? null;
}

/** Serializa bloques del compositor a JSON plano. */
function bloquesAJson(bloques?: PostBlock[] | null): unknown {
  return bloques ?? null;
}

/** Convierte el payload capturado en el ítem guardable de la Biblioteca. */
export function variacionAGuardado(payload: PayloadPublicacion): { type: "publicacion"; content: string } {
  return { type: "publicacion", content: JSON.stringify(payload) };
}

/** Reconstruye el payload desde un ítem guardado o publicado. */
export function variacionDesdeGuardado(item: { content?: string | null }): PayloadPublicacion | null {
  if (!item.content) return null;
  try {
    return JSON.parse(item.content) as PayloadPublicacion;
  } catch {
    return null;
  }
}

/** Crea el adaptador de una familia con las dependencias inyectadas. */
export function crearAdaptadorPublicaciones(
  familia: FamiliaPublicacion,
  deps: DepsPublicaciones,
): AdaptadorFamilia<PayloadPublicacion> {
  const adaptador: AdaptadorFamilia<PayloadPublicacion> = {
    familia,
    nombre: familia === "post" ? "Publicaciones" : "Mensajes",
    capturar: (clave) => {
      const parseada = parsearClave(clave);
      if (!parseada || parseada.familia !== familia) return null;

      switch (parseada.parte) {
        case "estilo": {
          const estilo = deps.leerEstilo(familia);
          return estilo ? { tipo: "estilo", estilo: limpiarEstilo(estilo) } : null;
        }
        case "plantilla": {
          const plantilla = deps.leerPlantilla(familia);
          if (!plantilla) return null;
          const { doc, lienzo, bloques } = plantilla;
          if (!doc && !lienzo && !bloques) return null;
          return { tipo: "plantilla", doc, lienzo, bloques };
        }
        case "decoracion": {
          const decoracion = deps.leerDecoracion(familia);
          if (!decoracion) return null;
          const { fondoLienzo, animacionFondo, presetLienzo } = decoracion;
          if (!fondoLienzo && !animacionFondo && !presetLienzo) return null;
          return { tipo: "decoracion", fondoLienzo, animacionFondo, presetLienzo };
        }
      }
    },
    validar: (raw) => {
      if (!raw || typeof raw !== "object") {
        return { ok: false, motivos: ["El payload no es un objeto válido"] };
      }
      const payload = raw as PayloadPublicacion;

      if (!payload.tipo || !["estilo", "plantilla", "decoracion"].includes(payload.tipo)) {
        return { ok: false, motivos: ["Tipo de payload desconocido"] };
      }

      // Validar tamaño y privacidad con el validador común
      const revision = validarVariacion(payload);
      if (revision.ok === false) {
        return { ok: false, motivos: revision.motivos };
      }

      // Validaciones específicas por tipo
      if (payload.tipo === "estilo") {
        const estilo = payload.estilo;
        if (!estilo || typeof estilo !== "object") {
          return { ok: false, motivos: ["Estilo inválido"] };
        }
        // El validador común ya revisa claves privadas y tokens
      } else if (payload.tipo === "plantilla") {
        // La plantilla debe tener al menos doc, lienzo o bloques
        if (!payload.doc && !payload.lienzo && !payload.bloques) {
          return { ok: false, motivos: ["Plantilla vacía: debe incluir doc, lienzo o bloques"] };
        }
        // Verificar que no hay texto privado en doc/lienzo/bloques
        if (payload.doc && typeof payload.doc === "object") {
          const docStr = JSON.stringify(payload.doc);
          if (docStr.includes("password") || docStr.includes("token") || docStr.includes("secret")) {
            return { ok: false, motivos: ["La plantilla parece contener datos privados"] };
          }
        }
        if (payload.lienzo && typeof payload.lienzo === "object") {
          const lienzoStr = JSON.stringify(payload.lienzo);
          if (lienzoStr.includes("password") || lienzoStr.includes("token") || lienzoStr.includes("secret")) {
            return { ok: false, motivos: ["La plantilla parece contener datos privados"] };
          }
        }
        if (payload.bloques && Array.isArray(payload.bloques)) {
          const bloquesStr = JSON.stringify(payload.bloques);
          if (bloquesStr.includes("password") || bloquesStr.includes("token") || bloquesStr.includes("secret")) {
            return { ok: false, motivos: ["La plantilla parece contener datos privados"] };
          }
        }
      } else if (payload.tipo === "decoracion") {
        // Validar valores conocidos
        if (payload.fondoLienzo && typeof payload.fondoLienzo !== "string") {
          return { ok: false, motivos: ["fondoLienzo debe ser una cadena"] };
        }
        if (payload.animacionFondo && typeof payload.animacionFondo !== "string") {
          return { ok: false, motivos: ["animacionFondo debe ser una cadena"] };
        }
        if (payload.presetLienzo && typeof payload.presetLienzo !== "string") {
          return { ok: false, motivos: ["presetLienzo debe ser una cadena"] };
        }
      }

      return { ok: true, payload };
    },
    aplicar: (clave, payload) => {
      const parseada = parsearClave(clave);
      if (!parseada || parseada.familia !== familia) {
        return { deshacer: () => undefined };
      }

      const revision = adaptador.validar(payload);
      if (!revision.ok) {
        return { deshacer: () => undefined };
      }

      // payload ya es válido (el adaptador.validar devuelve ok: true con el mismo payload)
      const validado = payload as PayloadPublicacion;

      // Guardar solo el estado anterior de la parte que se va a cambiar
      let deshacer: () => void;

      switch (validado.tipo) {
        case "estilo": {
          const estiloAnterior = deps.leerEstilo(familia);
          deps.escribirEstilo(familia, validado.estilo);
          deshacer = () => deps.escribirEstilo(familia, estiloAnterior);
          break;
        }
        case "plantilla": {
          const plantillaAnterior = deps.leerPlantilla(familia);
          deps.escribirPlantilla(familia, {
            doc: validado.doc,
            lienzo: validado.lienzo,
            bloques: validado.bloques,
          });
          deshacer = () => deps.escribirPlantilla(familia, plantillaAnterior);
          break;
        }
        case "decoracion": {
          const decoracionAnterior = deps.leerDecoracion(familia);
          deps.escribirDecoracion(familia, {
            fondoLienzo: validado.fondoLienzo,
            animacionFondo: validado.animacionFondo,
            presetLienzo: validado.presetLienzo,
          });
          deshacer = () => deps.escribirDecoracion(familia, decoracionAnterior);
          break;
        }
      }

      return { deshacer: deshacer! };
    },
  };

  return adaptador;
}

/** Registra `post:` y `mensaje:` en el registro compartido de familias. */
export function registrarAdaptadoresPublicaciones(deps: DepsPublicaciones): void {
  registrarFamilia(crearAdaptadorPublicaciones("post", deps));
  registrarFamilia(crearAdaptadorPublicaciones("mensaje", deps));
}