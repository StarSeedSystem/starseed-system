// Adaptador de publicaciones y mensajes: estilos del editor rico y del compositor.
// Familias: post:#estilo, post:#plantilla, post:#decoracion, mensaje:editor
// Captura SOLO estilos/plantillas/decoraciones, NUNCA texto ni destinatarios.
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { leerClave } from "../clave-elemento";
import {
  type DepsPublicaciones,
  type PayloadPostEstilo,
  type PayloadPostPlantilla,
  type PayloadPostDecoracion,
  type PayloadMensajeEditor,
  idDeClavePost,
  validarPayloadPostEstilo,
  validarPayloadPostPlantilla,
  validarPayloadPostDecoracion,
  validarPayloadMensaje,
} from "./publicaciones-tipos";

export function crearAdaptadorPostEstilo(deps: DepsPublicaciones): AdaptadorFamilia<PayloadPostEstilo> {
  return {
    familia: "post",
    nombre: "Estilo de publicación",
    capturar: (clave) => {
      const parsed = idDeClavePost(clave);
      if (!parsed || parsed.parte !== "estilo") return null;
      const estilo = deps.leerEstiloPost(parsed.postId);
      return estilo ? { estilo } : null;
    },
    validar: validarPayloadPostEstilo,
    aplicar: (_clave, payload) => {
      const r = validarPayloadPostEstilo(payload);
      if (!r.ok) throw new Error(`Variación de estilo de publicación rechazada: ${r.motivos.join(" · ")}`);
      return { deshacer: () => {} };
    },
  };
}

export function crearAdaptadorPostPlantilla(deps: DepsPublicaciones): AdaptadorFamilia<PayloadPostPlantilla> {
  return {
    familia: "post",
    nombre: "Plantilla de publicación",
    capturar: (clave) => {
      const parsed = idDeClavePost(clave);
      if (!parsed || parsed.parte !== "plantilla") return null;
      const plantilla = deps.leerPlantillaPost(parsed.postId);
      return plantilla ? { plantilla } : null;
    },
    validar: validarPayloadPostPlantilla,
    aplicar: (_clave, payload) => {
      const r = validarPayloadPostPlantilla(payload);
      if (!r.ok) throw new Error(`Variación de plantilla de publicación rechazada: ${r.motivos.join(" · ")}`);
      return { deshacer: () => {} };
    },
  };
}

export function crearAdaptadorPostDecoracion(deps: DepsPublicaciones): AdaptadorFamilia<PayloadPostDecoracion> {
  return {
    familia: "post",
    nombre: "Decoración de publicación",
    capturar: (clave) => {
      const parsed = idDeClavePost(clave);
      if (!parsed || parsed.parte !== "decoracion") return null;
      const decoracion = deps.leerDecoracionPost(parsed.postId);
      return decoracion ? { decoracion } : null;
    },
    validar: validarPayloadPostDecoracion,
    aplicar: (_clave, payload) => {
      const r = validarPayloadPostDecoracion(payload);
      if (!r.ok) throw new Error(`Variación de decoración de publicación rechazada: ${r.motivos.join(" · ")}`);
      return { deshacer: () => {} };
    },
  };
}

export function crearAdaptadorMensajeEditor(deps: DepsPublicaciones): AdaptadorFamilia<PayloadMensajeEditor> {
  return {
    familia: "mensaje",
    nombre: "Estilos del editor de mensajes",
    capturar: (clave) => {
      const l = leerClave(clave);
      if (l !== "mensaje:editor") return null;
      const estilo = deps.leerEstiloMensaje();
      const layout = deps.leerLayoutMensaje();
      if (!estilo && !layout) return null;
      return { estilo: estilo ?? {}, layout: layout ?? undefined };
    },
    validar: validarPayloadMensaje,
    aplicar: (_clave, payload) => {
      const r = validarPayloadMensaje(payload);
      if (!r.ok) throw new Error(`Variación del editor de mensajes rechazada: ${r.motivos.join(" · ")}`);
      return { deshacer: () => {} };
    },
  };
}

export function registrarAdaptadoresPublicaciones(deps: DepsPublicaciones): void {
  registrarFamilia(crearAdaptadorPostEstilo(deps));
  registrarFamilia(crearAdaptadorPostPlantilla(deps));
  registrarFamilia(crearAdaptadorPostDecoracion(deps));
  registrarFamilia(crearAdaptadorMensajeEditor(deps));
}

export { idDeClavePost, validarPayloadPostEstilo, validarPayloadPostPlantilla, validarPayloadPostDecoracion, validarPayloadMensaje } from "./publicaciones-tipos";
export type {
  FamiliaPublicacion,
  PayloadPostEstilo,
  PayloadPostPlantilla,
  PayloadPostDecoracion,
  PayloadPublicacion,
  PayloadMensajeEditor,
  DepsPublicaciones,
} from "./publicaciones-tipos";