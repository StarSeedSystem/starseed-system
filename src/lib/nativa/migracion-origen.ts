/*
 * Migración del origen web al origen local — el aviso (APP1107B · T4, 2026-11-07). Lógica pura.
 * Contrato: architecture/apps-autonomas-sin-internet.md §2.1.
 *
 * La app de escritorio abre ahora su servidor local (`http://127.0.0.1:<puerto>`). La primera vez,
 * la página `/__starseed/migracion` (native/servidor-local/migracion-origen.js) trae lo que la app
 * tenía en el origen de la web publicada y deja un marcador en el localStorage del origen local.
 * Aquí se decide qué dice el aviso a partir de ese marcador; el componente es
 * src/components/nativa/aviso-migracion-origen.tsx. El marcador es de esta neurona: no viaja con la
 * cuenta (no está en SYNCED_KEYS ni en SYNCED_PREFIXES).
 */

/** Mismo valor que `CLAVE_MARCADOR` de native/servidor-local/migracion-origen.js (lo vigila una prueba). */
export const CLAVE_MARCADOR_MIGRACION = "starseed.migracion-origen.v1";

/**
 * (NEU1107B) Id de neurona que la app usaba en el origen de la web publicada, cuando el origen local ya
 * tenía otro (conflicto en la migración). Mismo valor que `CLAVE_NEURONA_ANTERIOR` del .js (lo vigila una
 * prueba). Lo usa la ventana de bienvenida de la neurona como la pista más fuerte para sugerir fusionar.
 */
export const CLAVE_NEURONA_ANTERIOR = "starseed.migracion-origen.neurona-anterior.v1";

/** El id anterior apuntado por la migración, si parece un id de neurona válido; si no, null. Pura. */
export function leerNeuronaAnterior(crudo: string | null | undefined): string | null {
  const v = typeof crudo === "string" ? crudo.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{5,79}$/.test(v) ? v : null;
}

export type ResultadoMigracion = "hecha" | "pospuesta" | "abandonada";

export interface ResumenMigracion {
  ajustes: { traidos: number; iguales: number; conflictos: number; errores: number };
  registros: { traidos: number; yaEstaban: number; errores: number };
  exportacion: { sesionesNoCopiadas: number; registrosNoCopiados: number; basesNoCopiadas: string[] };
}

export interface MarcadorMigracion {
  resultado: ResultadoMigracion;
  fecha: string | null;
  resumen: ResumenMigracion | null;
  motivo: string | null;
  copia: string | null;
  visto: boolean;
}

export type TonoMigracion = "ok" | "aviso" | "error";

export interface AvisoMigracion {
  mostrar: boolean;
  tono: TonoMigracion;
  titulo: string;
  detalle: string;
}

const NADA: AvisoMigracion = { mostrar: false, tono: "ok", titulo: "", detalle: "" };
export const TITULO_HECHA = "Tus datos de la versión anterior ya están aquí";
export const TITULO_NO_SE_PUDO = "Aún no están aquí tus datos de la versión anterior";
export const FRASE_SESION = "La sesión no se copia por seguridad: si te la pide, vuelve a iniciarla en esta app.";

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function leerResumen(r: unknown): ResumenMigracion | null {
  if (!r || typeof r !== "object") return null;
  const o = r as Record<string, Record<string, unknown> | undefined>;
  const a = o.ajustes ?? {};
  const g = o.registros ?? {};
  const e = o.exportacion ?? {};
  const bases = Array.isArray(e.basesNoCopiadas) ? e.basesNoCopiadas.filter((b): b is string => typeof b === "string") : [];
  return {
    ajustes: { traidos: num(a.traidos), iguales: num(a.iguales), conflictos: num(a.conflictos), errores: num(a.errores) },
    registros: { traidos: num(g.traidos), yaEstaban: num(g.yaEstaban), errores: num(g.errores) },
    exportacion: { sesionesNoCopiadas: num(e.sesionesNoCopiadas), registrosNoCopiados: num(e.registrosNoCopiados), basesNoCopiadas: bases },
  };
}

/** Lee el marcador crudo del localStorage; null si no hay o no se entiende. */
export function leerMarcadorMigracion(crudo: string | null | undefined): MarcadorMigracion | null {
  if (!crudo) return null;
  let v: unknown;
  try {
    v = JSON.parse(crudo);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const resultado = o.resultado;
  if (resultado !== "hecha" && resultado !== "pospuesta" && resultado !== "abandonada") return null;
  return {
    resultado,
    fecha: texto(o.fecha),
    resumen: leerResumen(o.resumen),
    motivo: texto(o.motivo),
    copia: texto(o.copia),
    visto: o.visto === true,
  };
}

/** El marcador con `visto: true` (para guardar al cerrar el aviso). Conserva el resto tal cual. */
export function marcarVisto(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  try {
    const v = JSON.parse(crudo) as Record<string, unknown>;
    if (!v || typeof v !== "object") return null;
    return JSON.stringify({ ...v, visto: true });
  } catch {
    return null;
  }
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Qué enseñar. Solo en la página del servidor local de la app (ahí vive el marcador). */
export function decidirAvisoMigracion(m: MarcadorMigracion | null, enServidorLocal: boolean): AvisoMigracion {
  if (!enServidorLocal || !m || m.visto) return NADA;
  if (m.resultado === "hecha") {
    const r = m.resumen;
    const ajustes = r?.ajustes.traidos ?? 0;
    const registros = r?.registros.traidos ?? 0;
    // Instalación nueva (no había nada que traer): nada que contar.
    if (ajustes + registros === 0 && (r?.ajustes.conflictos ?? 0) === 0) return NADA;
    const partes = [`Se trajeron ${plural(ajustes, "ajuste", "ajustes")} y ${plural(registros, "registro", "registros")} de la versión que abría la web publicada; allí sigue todo intacto.`];
    if (r && r.ajustes.conflictos > 0) partes.push(`${plural(r.ajustes.conflictos, "ajuste ya existía", "ajustes ya existían")} aquí y se dejaron como estaban.`);
    if (r && r.exportacion.registrosNoCopiados > 0) {
      partes.push(
        `${plural(r.exportacion.registrosNoCopiados, "registro se quedó", "registros se quedaron")} en la versión anterior (demasiado grandes o imposibles de copiar, como la clave privada de los vínculos entre cuentas, que se crea de nuevo).`,
      );
    }
    partes.push(FRASE_SESION);
    return { mostrar: true, tono: "ok", titulo: TITULO_HECHA, detalle: partes.join(" ") };
  }
  const motivo = m.motivo ? `${m.motivo.replace(/[.\s]+$/, "")}.` : "No se pudieron leer.";
  if (m.resultado === "abandonada") {
    const copia = m.copia ? ` Hay una copia sin secretos en la carpeta de datos de la app (migracion-origen/${m.copia}).` : "";
    return {
      mostrar: true,
      tono: "error",
      titulo: TITULO_NO_SE_PUDO,
      detalle: `${motivo} Se dejó de intentar tras varios intentos; tus datos siguen intactos en la versión anterior.${copia}`,
    };
  }
  return {
    mostrar: true,
    tono: "aviso",
    titulo: TITULO_NO_SE_PUDO,
    detalle: `${motivo} Siguen intactos: se volverá a intentar al abrir la app con internet.`,
  };
}
