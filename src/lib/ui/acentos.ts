/**
 * Acentos Trinity (Ola 227) — paleta ampliada para pasos y tarjetas.
 * Menos morado/verde dominante: cada acento rota por índice o se asigna
 * por clave de paso. Todas las clases son LITERALES para que el JIT de
 * Tailwind las vea (nada de interpolación de nombres).
 */

export const ACENTOS = [
  "azure",
  "cyan",
  "amber",
  "lime",
  "magenta",
  "emerald",
  "rose",
  "indigo",
  "crimson",
  "violet",
] as const;

export type Acento = (typeof ACENTOS)[number];

/** Acento por posición: rota la paleta completa en orden. */
export function acentoDeIndice(i: number): Acento {
  const n = Math.trunc(i);
  return ACENTOS[((n % ACENTOS.length) + ACENTOS.length) % ACENTOS.length];
}

/** Mapa fijo de acento por paso del rito de bienvenida. */
const ACENTO_POR_PASO: Record<string, Acento> = {
  bienvenida: "violet",
  identidad: "azure",
  correos: "cyan",
  permisos: "lime",
  cerebros: "magenta",
  neurona: "emerald",
  guia: "amber",
};

/** Acento de un paso por su clave; desconocida → rota por hash sencillo. */
export function acentoDePaso(key: string): Acento {
  const fijo = ACENTO_POR_PASO[key];
  if (fijo) return fijo;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return acentoDeIndice(Math.abs(h));
}

export interface ClasesAcento {
  texto: string;
  borde: string;
  fondo: string;
  anillo: string;
  /** Par `from-… to-…` listo para `bg-gradient-to-r`. */
  degradado: string;
}

/** Clases Tailwind concretas por acento (literales, visibles para el JIT). */
export function clasesAcento(a: Acento): ClasesAcento {
  switch (a) {
    case "azure":
      return { texto: "text-trinity-azure", borde: "border-trinity-azure/40", fondo: "bg-trinity-azure/15", anillo: "ring-trinity-azure/40", degradado: "from-trinity-azure to-trinity-cyan" };
    case "cyan":
      return { texto: "text-trinity-cyan", borde: "border-trinity-cyan/40", fondo: "bg-trinity-cyan/15", anillo: "ring-trinity-cyan/40", degradado: "from-trinity-cyan to-trinity-azure" };
    case "amber":
      return { texto: "text-trinity-amber", borde: "border-trinity-amber/40", fondo: "bg-trinity-amber/15", anillo: "ring-trinity-amber/40", degradado: "from-trinity-amber to-trinity-rose" };
    case "lime":
      return { texto: "text-trinity-lime", borde: "border-trinity-lime/40", fondo: "bg-trinity-lime/15", anillo: "ring-trinity-lime/40", degradado: "from-trinity-lime to-trinity-emerald" };
    case "magenta":
      return { texto: "text-trinity-magenta", borde: "border-trinity-magenta/40", fondo: "bg-trinity-magenta/15", anillo: "ring-trinity-magenta/40", degradado: "from-trinity-magenta to-trinity-violet" };
    case "emerald":
      return { texto: "text-trinity-emerald", borde: "border-trinity-emerald/40", fondo: "bg-trinity-emerald/15", anillo: "ring-trinity-emerald/40", degradado: "from-trinity-emerald to-trinity-cyan" };
    case "rose":
      return { texto: "text-trinity-rose", borde: "border-trinity-rose/40", fondo: "bg-trinity-rose/15", anillo: "ring-trinity-rose/40", degradado: "from-trinity-rose to-trinity-magenta" };
    case "indigo":
      return { texto: "text-trinity-indigo", borde: "border-trinity-indigo/40", fondo: "bg-trinity-indigo/15", anillo: "ring-trinity-indigo/40", degradado: "from-trinity-indigo to-trinity-azure" };
    case "crimson":
      return { texto: "text-trinity-crimson", borde: "border-trinity-crimson/40", fondo: "bg-trinity-crimson/15", anillo: "ring-trinity-crimson/40", degradado: "from-trinity-crimson to-trinity-rose" };
    case "violet":
      return { texto: "text-trinity-violet", borde: "border-trinity-violet/40", fondo: "bg-trinity-violet/15", anillo: "ring-trinity-violet/40", degradado: "from-trinity-violet to-trinity-indigo" };
  }
}
