// Adaptador de publicaciones y mensajes para variaciones públicas (estilos del editor)
import { registrarFamilia, type AdaptadorFamilia } from "../familias";
import { validarVariacion } from "../validar";

export type Parte = "estilo" | "plantilla" | "decoracion";
const PARTES = ["estilo", "plantilla", "decoracion"] as const;

export interface DepsPublicaciones {
  leer: (clave: string) => unknown | null;
  escribir: (clave: string, valor: unknown) => void;
}

function parseClave(clave: string) {
  const m = clave.match(/^([^:]+):([^#]+)(?:#([^#]+))?$/);
  if (!m) return null;
  return { familia: m[1], id: m[2], parte: m[3] ?? null };
}

function sinDatosPrivados(payload: unknown): string[] {
  const motivos: string[] = [];
  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;
    for (const k of Object.keys(obj)) {
      if (/^(texto|body|content|destinatarios|mensaje)$/i.test(k)) {
        motivos.push(`Privacidad: la variación no puede llevar «${k}»`);
      }
    }
  }
  return motivos;
}

export function validarPayload(payload: unknown): { ok: true; payload: unknown } | { ok: false; motivos: string[] } {
  const base = validarVariacion(payload);
  if (!base.ok) {
    const motivos = (base as { ok: false; motivos: string[] }).motivos;
    return { ok: false, motivos };
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, motivos: ["El payload debe ser un objeto JSON plano"] };
  }
  const motivos = sinDatosPrivados(payload);
  return motivos.length ? { ok: false, motivos } : { ok: true, payload };
}

function crearAdaptador(familia: "post" | "mensaje", deps: DepsPublicaciones): AdaptadorFamilia<unknown> {
  const nombre = familia === "post" ? "Publicaciones" : "Mensajes";
  return {
    familia,
    nombre,
    capturar: (clave) => {
      const p = parseClave(clave);
      if (!p || p.familia !== familia) return null;
      if (!p.parte || !PARTES.includes(p.parte as Parte)) return null;
      return deps.leer(clave);
    },
    validar: (payload) => validarPayload(payload),
    aplicar: (clave, payload) => {
      const p = parseClave(clave);
      if (!p || p.familia !== familia || !PARTES.includes(p.parte as Parte)) {
        return { deshacer: () => {} };
      }
      const prev = deps.leer(clave);
      deps.escribir(clave, payload);
      return { deshacer: () => deps.escribir(clave, prev) };
    },
  };
}

export function registrarAdaptadoresPublicaciones(deps: DepsPublicaciones): void {
  registrarFamilia(crearAdaptador("post", deps));
  registrarFamilia(crearAdaptador("mensaje", deps));
}
