import type { Estacion, EstadoDirecto, TipoEstacion } from "./tipos";

export const LATIDO_VIVO_MS = 2 * 60_000;

export interface FiltroEstaciones {
  tipo?: TipoEstacion | "todas";
  categoria?: string;
  idioma?: string;
  texto?: string;
  soloEnDirecto?: boolean;
  ambito?: string;
}

function ms(fecha: string | null): number | null {
  if (!fecha) return null;
  const t = new Date(fecha).getTime();
  return isNaN(t) ? null : t;
}

export function sinAcentos(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

}

export function estadoDirecto(e: Estacion, ahora: number): EstadoDirecto {
  if (e.pausada) return "pausada";
  const termina = ms(e.termina_en);
  if (termina !== null && termina <= ahora) return "terminada";
  const latido = ms(e.ultimo_latido);
  if (latido !== null && ahora - latido < LATIDO_VIVO_MS) return "en-directo";
  const empieza = ms(e.empieza_en);
  if (e.fuente === "enlace" && latido === null) {
    if (empieza === null || empieza <= ahora) return "en-directo";
  }
  if (empieza !== null && empieza > ahora) return "programada";
  return "terminada";
}

export function ordenarEstaciones(lista: Estacion[], ahora: number): Estacion[] {
  const grupos: Record<EstadoDirecto, Estacion[]> = {
    "en-directo": [],
    programada: [],
    pausada: [],
    terminada: [],
  };
  for (const e of lista) grupos[estadoDirecto(e, ahora)].push(e);
  const reciente = (e: Estacion) => ms(e.updated_at) ?? 0;
  grupos["en-directo"].sort(
    (a, b) => b.espectadores - a.espectadores || reciente(b) - reciente(a),
  );
  grupos.programada.sort(
    (a, b) =>
      (ms(a.empieza_en) ?? Infinity) - (ms(b.empieza_en) ?? Infinity) ||
      reciente(b) - reciente(a),
  );
  const resto = [...grupos.pausada, ...grupos.terminada].sort(
    (a, b) => reciente(b) - reciente(a),
  );
  return [...grupos["en-directo"], ...grupos.programada, ...resto];
}

export function filtrarEstaciones(
  lista: Estacion[],
  f: FiltroEstaciones,
  ahora: number,
): Estacion[] {
  const texto = f.texto ? sinAcentos(f.texto.trim()) : "";
  const categoria = f.categoria ? sinAcentos(f.categoria) : "";
  return lista.filter((e) => {
    if (f.tipo && f.tipo !== "todas" && e.tipo !== f.tipo) return false;
    if (categoria) {
      const cats = (e.categorias ?? []).map(sinAcentos);
      if (!cats.includes(categoria)) return false;
    }
    if (f.idioma && f.idioma !== "todos" && e.idioma !== f.idioma) return false;
    if (texto) {
      const fardo = sinAcentos(
        `${e.titulo} ${e.descripcion} ${(e.categorias ?? []).join(" ")}`,
      );
      if (!fardo.includes(texto)) return false;
    }
    if (f.soloEnDirecto && estadoDirecto(e, ahora) !== "en-directo") return false;
    if (f.ambito) {
      if (f.ambito.startsWith("persona:")) {
        const uid = f.ambito.slice("persona:".length);
        if (!(e.ambito_tipo === "persona" && e.owner_id === uid)) return false;
      } else if (e.entidad_ref !== f.ambito) {
        return false;
      }
    }
    return true;
  });
}

export function categoriasPopulares(
  lista: Estacion[],
  max = 12,
): { categoria: string; cuenta: number }[] {
  const cuenta = new Map<string, number>();
  for (const e of lista) {
    for (const c of e.categorias ?? []) {
      if (!c) continue;
      cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    }
  }
  return Array.from(cuenta.entries())
    .map(([categoria, n]) => ({ categoria, cuenta: n }))
    .sort((a, b) => b.cuenta - a.cuenta || a.categoria.localeCompare(b.categoria))
    .slice(0, max);
}
