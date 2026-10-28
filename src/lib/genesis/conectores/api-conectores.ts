import type { Papel } from "./catalogo-opciones";

const PAPELES: readonly Papel[] = ["escritor", "revisor", "chat", "visión", "voz", "imagen", "código"];

export type PeticionOpciones =
  | { accion: "vincular"; proveedor: string; valor: string }
  | { accion: "asignar"; clave: Papel; cadena: string };

export type LecturaPeticion = { ok: true; peticion: PeticionOpciones } | { ok: false; error: string };

export function esPapel(valor: unknown): valor is Papel {
  return typeof valor === "string" && (PAPELES as readonly string[]).includes(valor);
}

export function leerAmbito(bruto: string | null): string | null {
  const valor = (bruto ?? "").trim();
  return valor.length > 0 && valor.length <= 120 ? valor : null;
}

function texto(valor: unknown, max: number): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, max) : null;
}

export function leerPeticionOpciones(crudo: unknown): LecturaPeticion {
  if (!crudo || typeof crudo !== "object") return { ok: false, error: "El cuerpo debe ser un objeto JSON." };
  const cuerpo = crudo as Record<string, unknown>;
  if (cuerpo.accion === "vincular") {
    const proveedor = texto(cuerpo.proveedor, 100);
    const valor = texto(cuerpo.valor, 4096);
    if (!proveedor || !valor) return { ok: false, error: "Faltan proveedor y valor para vincular." };
    return { ok: true, peticion: { accion: "vincular", proveedor, valor } };
  }
  if (cuerpo.accion === "asignar") {
    if (!esPapel(cuerpo.clave)) return { ok: false, error: "La clave no es un papel conocido." };
    const cadena = texto(cuerpo.cadena, 200);
    if (!cadena) return { ok: false, error: "Falta la cadena que asignar." };
    return { ok: true, peticion: { accion: "asignar", clave: cuerpo.clave, cadena } };
  }
  return { ok: false, error: "La acción debe ser «vincular» o «asignar»." };
}

export async function huellaDe(valor: string): Promise<string> {
  const datos = new TextEncoder().encode(valor);
  const resumen = await globalThis.crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(resumen)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
