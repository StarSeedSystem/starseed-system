/**
 * Medidor de los créditos completos de Antigravity (`agy`) para el pulso de MetaGenesis.
 *
 * Módulo PURO: no toca disco ni red. La ruta `/api/mando/medidores` lee
 * `~/.starseed/antigravity-modelos.json` y `~/.starseed/antigravity-uso.json` (los escribe
 * `scripts/puente/antigravity_flota.py`, GEM1119C) y se los pasa ya parseados. Así la lógica
 * se prueba sin `vi.mock` de `node:fs` y el navegador puede importar los tipos sin romper.
 *
 * Nunca devuelve claves ni datos de la cuenta de Google: solo nombres de modelo, cifras y
 * los papeles del sistema que los usan.
 */
import type { DatoDeFicha, DetalleMedidor, FilaMedidor } from "./medidores";

/** El 20 % de la cuota estimada que no se gasta (regla de economía de Alex). */
export const RESERVA_PORCENTAJE = 0.2;
/** Tokens de entrada base por turno medidos en GEM1118A; el uso no guarda tokens. */
export const TOKENS_BASE_POR_TURNO = 24_000;

export type EstadoAntigravity = "verde" | "ambar" | "rojo";

export interface UltimoErrorCuota {
    texto: string;
    /** Fecha del día del error (YYYY-MM-DD) o instante ISO si el medidor lo anotó. */
    cuando: string;
    /** HH:MM si el archivo trae hora; `null` cuando solo consta el día. */
    hora: string | null;
}

export interface ModeloAntigravityMedido {
    modelo: string;
    familia: string;
    nivel: string;
    llamadasHoy: number;
    tokensHoy: number;
    cuotaDiaria: number;
    reserva: number;
    queda: number;
    ultimoErrorCuota: UltimoErrorCuota | null;
    tiempoMedioSeg: number | null;
    papeles: string[];
    estado: EstadoAntigravity;
    motivo: string;
}

export interface TotalesAntigravity {
    llamadasHoy: number;
    tokensHoy: number;
    cuotaDiaria: number;
    reserva: number;
    queda: number;
}

export interface ResumenAntigravity {
    sinMedir: boolean;
    sinSesion: boolean;
    estado: EstadoAntigravity;
    resumen: string;
    aviso: string | null;
    modelos: ModeloAntigravityMedido[];
    total: TotalesAntigravity;
}

interface EntradaUso {
    fecha: string;
    llamadas: number;
    tiempoTotalSeg: number;
    erroresCuota: number;
    textos: string[];
    ultimoErrorIso: string | null;
}

interface PapelAgy {
    nombre: string;
    principal: string;
    alternativa?: string;
}

/** La misma tabla de `scripts/puente/antigravity_flota.py`: quién usa cada modelo. */
const PAPELES: readonly PapelAgy[] = [
    { nombre: "Dirección", principal: "gemini-4-hydrogen-high", alternativa: "claude-opus-5-5-high" },
    { nombre: "Producción y pruebas", principal: "gemini-4-neon-medium" },
    { nombre: "Escritores del enjambre", principal: "gemini-3.8-flash-medium" },
    { nombre: "Revisores", principal: "claude-sonnet-5-5-medium" },
    { nombre: "Tareas mecánicas", principal: "gemini-3.8-flash-low" },
];

function numero(valor: unknown): number {
    return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function redondear(valor: number): number {
    return Math.round(valor * 10) / 10;
}

/** Fecha local del día (la misma que usa `date.today()` del medidor de Python). */
function fechaLocal(ms: number): string {
    const d = new Date(ms);
    const dos = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

function normalizarCatalogo(crudo: unknown): { nombre: string; familia: string; nivel: string }[] {
    if (!Array.isArray(crudo)) return [];
    const salida: { nombre: string; familia: string; nivel: string }[] = [];
    for (const item of crudo) {
        if (!item || typeof item !== "object") continue;
        const m = item as { nombre?: unknown; familia?: unknown; nivel?: unknown };
        if (typeof m.nombre !== "string" || !m.nombre) continue;
        salida.push({
            nombre: m.nombre,
            familia: typeof m.familia === "string" ? m.familia : "",
            nivel: typeof m.nivel === "string" ? m.nivel : "",
        });
    }
    return salida;
}

function normalizarUso(crudo: unknown): Map<string, EntradaUso[]> {
    const salida = new Map<string, EntradaUso[]>();
    if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return salida;
    for (const [modelo, lista] of Object.entries(crudo as Record<string, unknown>)) {
        if (!modelo || !Array.isArray(lista)) continue;
        const entradas: EntradaUso[] = [];
        for (const item of lista) {
            if (!item || typeof item !== "object") continue;
            const e = item as Record<string, unknown>;
            if (typeof e.fecha !== "string" || !e.fecha) continue;
            entradas.push({
                fecha: e.fecha,
                llamadas: numero(e.llamadas),
                tiempoTotalSeg: numero(e.tiempo_total_seg),
                erroresCuota: numero(e.errores_cuota),
                textos: Array.isArray(e.textos_errores_cuota)
                    ? e.textos_errores_cuota.filter((t): t is string => typeof t === "string")
                    : [],
                ultimoErrorIso: typeof e.ultimo_error_cuota === "string" ? e.ultimo_error_cuota : null,
            });
        }
        entradas.sort((a, b) => a.fecha.localeCompare(b.fecha));
        salida.set(modelo, entradas);
    }
    return salida;
}

/** Cuota diaria estimada: promedio de los últimos 7 días × 1,5, o el máximo si hubo cuota. */
function estimarCuota(entradas: EntradaUso[], hoy: string): number {
    const historicas = entradas
        .filter((e) => e.fecha !== hoy)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .slice(-7);
    if (historicas.length === 0) return 0;
    const llamadas = historicas.map((e) => e.llamadas);
    const maximo = Math.max(...llamadas);
    const promedio = llamadas.reduce((a, b) => a + b, 0) / llamadas.length;
    const erroresRecientes = historicas.slice(-3).some((e) => e.erroresCuota > 0);
    return redondear(erroresRecientes ? maximo : promedio * 1.5);
}

function horaDe(iso: string | null): string | null {
    if (!iso) return null;
    const m = /[T ](\d{2}):(\d{2})/.exec(iso);
    return m ? `${m[1]}:${m[2]}` : null;
}

function ultimoError(entradas: EntradaUso[]): UltimoErrorCuota | null {
    let mejor: { orden: string; error: UltimoErrorCuota } | null = null;
    for (const e of entradas) {
        if (e.erroresCuota <= 0) continue;
        const texto = e.textos[e.textos.length - 1] ?? "cuota agotada";
        const cuando = e.ultimoErrorIso ?? e.fecha;
        const orden = e.ultimoErrorIso ?? `${e.fecha}T00:00`;
        if (!mejor || orden > mejor.orden) {
            mejor = { orden, error: { texto, cuando, hora: horaDe(e.ultimoErrorIso) } };
        }
    }
    return mejor?.error ?? null;
}

function papelesDe(modelo: string): string[] {
    const papeles: string[] = [];
    for (const p of PAPELES) {
        if (p.principal === modelo) papeles.push(p.nombre);
        else if (p.alternativa === modelo) papeles.push(`${p.nombre} (alternativa)`);
    }
    return papeles;
}

function estadoDe(llamadasHoy: number, cuotaDiaria: number): { estado: EstadoAntigravity; motivo: string } {
    if (cuotaDiaria > 0) {
        const reserva = cuotaDiaria * RESERVA_PORCENTAJE;
        const tope = redondear(cuotaDiaria);
        if (llamadasHoy >= cuotaDiaria) {
            return { estado: "rojo", motivo: `sin cuota: ${llamadasHoy} de ${tope} llamadas hoy` };
        }
        if (llamadasHoy >= cuotaDiaria - reserva) {
            return { estado: "ambar", motivo: `en reserva: ${llamadasHoy} de ${tope} llamadas hoy` };
        }
        return {
            estado: "verde",
            motivo: `${llamadasHoy} de ${tope} llamadas hoy · queda ${redondear(cuotaDiaria - reserva - llamadasHoy)}`,
        };
    }
    return { estado: "verde", motivo: `${llamadasHoy} llamada${llamadasHoy === 1 ? "" : "s"} hoy · cuota aún sin estimar` };
}

const ESTADO_FILA: Record<EstadoAntigravity, string> = { verde: "ok", ambar: "aviso", rojo: "peligro" };
const TONO_MEDIDOR: Record<EstadoAntigravity, "normal" | "aviso" | "peligro"> = {
    verde: "normal",
    ambar: "aviso",
    rojo: "peligro",
};
const PESO: Record<EstadoAntigravity, number> = { verde: 0, ambar: 1, rojo: 2 };

export function resumirAntigravity(modelosCrudo: unknown, usoCrudo: unknown, ahoraMs: number): ResumenAntigravity {
    const catalogo = normalizarCatalogo(modelosCrudo);
    const uso = normalizarUso(usoCrudo);
    const vacio: TotalesAntigravity = { llamadasHoy: 0, tokensHoy: 0, cuotaDiaria: 0, reserva: 0, queda: 0 };
    if (modelosCrudo === null && usoCrudo === null) {
        return { sinMedir: true, sinSesion: false, estado: "verde", resumen: "sin medir aún", aviso: null, modelos: [], total: vacio };
    }
    const sinSesion = Array.isArray(modelosCrudo) && modelosCrudo.length === 0;
    const hoy = fechaLocal(ahoraMs);
    const nombres = [...new Set([...catalogo.map((m) => m.nombre), ...uso.keys()])];
    const modelos: ModeloAntigravityMedido[] = nombres.map((nombre) => {
        const meta = catalogo.find((m) => m.nombre === nombre);
        const entradas = uso.get(nombre) ?? [];
        const delDia = entradas.filter((e) => e.fecha === hoy);
        const llamadasHoy = delDia.reduce((n, e) => n + e.llamadas, 0);
        const tiempoHoy = delDia.reduce((n, e) => n + e.tiempoTotalSeg, 0);
        const cuotaDiaria = estimarCuota(entradas, hoy);
        const reserva = redondear(cuotaDiaria * RESERVA_PORCENTAJE);
        const queda = redondear(Math.max(0, cuotaDiaria - reserva - llamadasHoy));
        const { estado, motivo } = estadoDe(llamadasHoy, cuotaDiaria);
        return {
            modelo: nombre,
            familia: meta?.familia ?? "",
            nivel: meta?.nivel ?? "",
            llamadasHoy,
            tokensHoy: llamadasHoy * TOKENS_BASE_POR_TURNO,
            cuotaDiaria,
            reserva,
            queda,
            ultimoErrorCuota: ultimoError(entradas),
            tiempoMedioSeg: llamadasHoy > 0 ? redondear(tiempoHoy / llamadasHoy) : null,
            papeles: papelesDe(nombre),
            estado,
            motivo,
        };
    });
    const total: TotalesAntigravity = modelos.reduce<TotalesAntigravity>(
        (t, m) => ({
            llamadasHoy: t.llamadasHoy + m.llamadasHoy,
            tokensHoy: t.tokensHoy + m.tokensHoy,
            cuotaDiaria: redondear(t.cuotaDiaria + m.cuotaDiaria),
            reserva: redondear(t.reserva + m.reserva),
            queda: redondear(t.queda + m.queda),
        }),
        { ...vacio },
    );
    const peor = modelos.reduce<EstadoAntigravity>((e, m) => (PESO[m.estado] > PESO[e] ? m.estado : e), "verde");
    const estado: EstadoAntigravity = sinSesion ? "rojo" : peor;
    const aviso = sinSesion
        ? "sin sesión de Google: inicia sesión con `agy`"
        : modelos.find((m) => m.estado === "rojo")
          ? `${modelos.find((m) => m.estado === "rojo")?.modelo}: sin cuota`
          : modelos.some((m) => m.estado === "ambar")
            ? "hay modelos entrando en la reserva del 20 %"
            : null;
    const resumen = sinSesion
        ? "sin sesión de Google: inicia sesión con `agy`"
        : `${modelos.length} modelo${modelos.length === 1 ? "" : "s"} · ${total.llamadasHoy} llamada${
              total.llamadasHoy === 1 ? "" : "s"
          } hoy · quedan ${total.queda}`;
    return { sinMedir: false, sinSesion, estado, resumen, aviso, modelos, total };
}

function formatoTokens(n: number): string {
    if (n >= 1_000_000) return `${redondear(n / 1_000_000)} M`;
    if (n >= 1_000) return `${redondear(n / 1_000)} k`;
    return String(n);
}

export function detalleAntigravity(resumen: ResumenAntigravity): DetalleMedidor {
    const filas: FilaMedidor[] = resumen.modelos.map((m) => {
        const ficha: DatoDeFicha[] = [
            { etiqueta: "Llamadas hoy", valor: String(m.llamadasHoy) },
            { etiqueta: "Tokens hoy (estimados)", valor: formatoTokens(m.tokensHoy) },
            { etiqueta: "Cuota diaria estimada", valor: String(m.cuotaDiaria) },
            { etiqueta: "Queda", valor: String(m.queda) },
            { etiqueta: "Reserva (no se gasta)", valor: String(m.reserva) },
            { etiqueta: "Tiempo medio por turno", valor: m.tiempoMedioSeg === null ? "—" : `${m.tiempoMedioSeg} s` },
        ];
        if (m.ultimoErrorCuota) {
            const hora = m.ultimoErrorCuota.hora ? ` ${m.ultimoErrorCuota.hora}` : "";
            ficha.push({
                etiqueta: "Último error de cuota",
                valor: `${m.ultimoErrorCuota.texto} · ${m.ultimoErrorCuota.cuando}${hora}`,
                aviso: true,
            });
        }
        if (m.papeles.length) ficha.push({ etiqueta: "Papeles que lo usan", valor: m.papeles.join(", ") });
        return {
            id: m.modelo,
            titulo: m.modelo,
            estado: ESTADO_FILA[m.estado],
            porque: m.motivo,
            ficha,
            acciones: [],
        };
    });
    return {
        clave: "antigravity",
        titulo: "Antigravity",
        resumen: resumen.resumen,
        filas,
        acciones: [],
        // La cifra de la pastilla: las llamadas de hoy. Sin medir o sin sesión no se inventa un 0.
        cuenta: resumen.sinMedir || resumen.sinSesion ? undefined : resumen.total.llamadasHoy,
        tono: TONO_MEDIDOR[resumen.estado],
        vacio: resumen.sinMedir
            ? "sin medir aún"
            : resumen.sinSesion
              ? "sin sesión de Google: inicia sesión con `agy`"
              : "sin modelos medidos todavía",
    };
}
