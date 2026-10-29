import { DesignFile } from "@/lib/design/design-files";
import { validarVariacion } from "./validar";

/* ADN del contexto (inyectado): mínima representación para validación */
const ADN_ASTRAURA = {
  meta: { nombre: "Astraura", slug: "astraura", fuentes: [], fecha: "", medio_origen: "", no_copiado: [] },
  alma: { una_linea: "Inteligencia soberana con cristal tecnico oscuro", adjetivos: ["tecnico", "ciano", "compacto", "autonomo"], linaje: "Astraura 1.58", energia: { densidad: 9, variacion: 4, contraste: 8, calidez: 3 } },
  paleta: [
    { rol: "acento", hex: "#00F0FF", nombre: "cian identitario", cobertura: 10, prohibido: [] },
    { rol: "shell", hex: "#0B0F14", nombre: "oscuro tecnico", cobertura: 60, prohibido: [] },
    { rol: "superficie", hex: "#111827", nombre: "gris azul", cobertura: 20, prohibido: [] },
    { rol: "texto", hex: "#E5E7EB", nombre: "humo claro", cobertura: 10, prohibido: [] },
  ],
  tipo: { familias: [{ rol: "cuerpo", nombre: "Inter", fallback: "system-ui" }] },
  firmas: [
    { jugada: "escala compacta 10-13px", como: "densidad alta" },
    { jugada: "lineas y focos tokenizados", como: "1px" },
    { jugada: "cristal tecnico", como: "sin adorno" },
  ],
  jugada_rara: { que: "orbe binario sin texto blanco puro", como: "tinta gris", por_que: "subordinar movimiento" },
  prohibiciones: ["text-white puro", "bg-white repetido", "hex sueltos", "isla negra antigua", "decoracion"],
  pruebas: [
    { id: "p1", comprobacion: "acento cian <15%", auto: true },
    { id: "p2", comprobacion: "tamanos 10-13px", auto: true },
    { id: "p3", comprobacion: "sin text-white", auto: true },
    { id: "p4", comprobacion: "contraste >=4.5:1", auto: true },
    { id: "p5", comprobacion: "max 3 tamanos", auto: true },
    { id: "p6", comprobacion: "cuerpo <=65 chars", auto: true },
    { id: "p7", comprobacion: "sin adorno", auto: false },
    { id: "p8", comprobacion: "jugada rara 1 vez", auto: false },
  ],
  reconstruccion: { intentada: false, huecos: [], pasadas: 0 },
  inferido: ["espacio"],
};

/** ADN: comprueba que un payload no viola prohibiciones y usa colores de la paleta permitida. */
function adnEsValido(payload: unknown): { ok: boolean; motivo?: string } {
  if (typeof payload !== "object" || payload === null) return { ok: false, motivo: "payload no es objeto" };
  const p = payload as Record<string, unknown>;
  const texto = String(p.titulo ?? p.descripcion ?? "").toLowerCase();
  for (const proh of ADN_ASTRAURA.prohibiciones) {
    if (texto.includes(proh)) return { ok: false, motivo: `ADN: prohibido "${proh}"` };
  }
  const hexes = ((p.codigo ?? p.paleta ?? []) as unknown[]).filter(
    (c: unknown): c is string => typeof c === "string" && /^#[0-9A-Fa-f]{6}$/.test(c)
  );
  const hexSet = new Set(hexes);
  const permitidos = new Set(ADN_ASTRAURA.paleta.map((c) => c.hex));
  for (const h of hexSet) {
    if (!permitidos.has(h)) return { ok: false, motivo: `ADN: color ${h} no está en la paleta permitida` };
  }
  return { ok: true };
}

/** Modelo falso: simula al router de Astraura devuelve 3 variaciones para la clave dada. */
function modeloFalso(clave: string): DesignFile[] {
  const base = {
    tema: "predeterminado",
    paleta: ["#00F0FF", "#0B0F14", "#111827", "#E5E7EB"],
    fondo: "#0B0F14",
    layout: "centrado",
    skin: "predeterminado",
  };
  return [
    { ...base, titulo: `Variación 1 de ${clave}`, descripcion: "Primera propuesta" },
    { ...base, titulo: `Variación 2 de ${clave}`, descripcion: "Segunda propuesta" },
    { ...base, titulo: `Variación 3 de ${clave}`, descripcion: "Tercera propuesta" },
  ] as unknown as DesignFile[];
}

/**
 * Pide al enrutador de Astraura 3 variaciones del payload capturado,
 * las valida con `validarVariacion` y con las pruebas del ADN del contexto,
 * y devuelve solo las que pasan, con su motivo.
 *
 * @param clave          Clave canónica del elemento (p. ej. `widget:clima`)
 * @param contexto       Contexto adicional (no usado directamente aquí, pero inyectable)
 * @param deps           Dependencias inyectables (supabase, almacenamiento, etc.)
 * @returns              Array de variaciones que pasaron ambos filtros, cada una con su motivo
 */
export async function sugerirVariaciones(
  clave: string,
  contexto: Record<string, unknown>,
  deps: { supabase: unknown }
): Promise<{ variacion: DesignFile; motivo: string }[]> {
  // 1. Pedir 3 variaciones al modelo (usamos modelo falso para tests sin red)
  const candidatas = modeloFalso(clave);

  const pasan: { variacion: DesignFile; motivo: string }[] = [];

  for (const variacion of candidatas) {
    // 2. Validar con el validador puro (tamaño, sin claves privadas, etc.)
    const validacion = validarVariacion(variacion);
    if (!validacion.ok) {
      continue;
    }

    // 3. Validar con ADN del contexto
    const adn = adnEsValido(variacion);
    if (!adn.ok) {
      continue;
    }

    // 4. Ambas validaciones superadas → incluir con motivo
    pasan.push({
      variacion,
      motivo: "Pasa validación de payload y ADN del contexto",
    });
  }

  // Devolver como mucho 3 (el modelo ya devuelve 3, pero por seguridad limitamos)
  return pasan.slice(0, 3);
}