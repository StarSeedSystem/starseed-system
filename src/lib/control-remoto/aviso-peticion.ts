/**
 * CTL1117J · S3 · el AVISO de que otra neurona pide ver o controlar ESTA (decisión 2 del dueño, 17-11).
 *
 * Cuándo se avisa (lo decide la puerta, `sesion.ts`, solo con la orden verificada: misma cuenta, firma válida con la clave
 * fijada o presentada, dirigida a esta neurona y en hora): un `presentarse` o una `abrir-sesion`, también con el permiso APAGADO.
 * Si quien manda no se puede verificar, no hay aviso.
 *
 * El aviso NUNCA enciende, acepta ni concede nada: solo dice quién pide, qué pide y en qué estado está, y un botón lleva al
 * ajuste local donde SOLO la persona, en este aparato, lo decide. Sale por tres sitios (`SalidasAviso`): la ventana de la app,
 * el aviso del sistema y el centro de notificaciones de StarSeed.
 *
 * Topes (por quien manda): uno cada 60 s y seis por hora; lo demás se cuenta y UNA línea de registro dice cuántos fueron.
 * Nada de contenido en el registro: nombre corto, código y estados.
 *
 * Puro salvo lo inyectado (reloj, salidas, registro, resolución de lo local).
 */

export type EstadoPeticion = "apagado" | "por-aceptar" | "abierta";
export type AlcanceControl = "total" | "protegido";

/** Lo que la puerta sabe de la petición (ya verificada). */
export interface PeticionControl {
    /** Huella entera de quien pide (clave de los topes). */
    de: string;
    nombre: string;
    tipo: "presentarse" | "abrir-sesion";
    /** Lo que pide (en `presentarse`, lo que concedería aceptarla: el nivel local). */
    nivel: "ver" | "controlar";
    estado: EstadoPeticion;
    /** Epoch ms: desde cuándo (en «abierta», cuándo empezó la sesión). */
    desde: number;
}

/** El aviso listo para enseñar. */
export interface AvisoPeticion {
    id: string;
    de8: string;
    nombre: string;
    codigo: string | null;
    tipo: PeticionControl["tipo"];
    nivel: PeticionControl["nivel"];
    estado: EstadoPeticion;
    alcance: AlcanceControl;
    desde: number;
    titulo: string;
    cuerpo: string;
    /** Texto del botón que abre el ajuste local (null si no hay botón). */
    boton: string | null;
    /** Ruta del ajuste local. */
    ruta: string;
}

/** Dónde vive el ajuste «Control entre mis neuronas» (Señales › Permisos de antenas). */
export const RUTA_AJUSTE_CONTROL = "/senales#control-entre-neuronas";
export const AVISO_CADA_MS = 60_000;
export const AVISO_POR_HORA = 6;
const HORA_MS = 3_600_000;

function hhmm(t: number): string {
    try {
        return new Date(t).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
    } catch {
        return "";
    }
}

function limpiarNombre(n: string): string {
    // CTL1118G: el nombre va ENTERO en el aviso; solo por encima de 40 caracteres se corta, y con puntos suspensivos.
    const letras = [...String(n ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim()];
    return letras.length === 0 ? "Otra neurona" : letras.length > 40 ? `${letras.slice(0, 40).join("").trim()}…` : letras.join("");
}

/** Las palabras del aviso (en español llano; el «control total» solo cuando de verdad es `total`). */
export function textosPeticion(p: { nombre: string; de8: string; codigo: string | null; tipo: PeticionControl["tipo"]; nivel: PeticionControl["nivel"]; estado: EstadoPeticion; alcance: AlcanceControl; desde: number }): {
    titulo: string;
    cuerpo: string;
    boton: string | null;
} {
    const quien = `${p.nombre} (aparato ${p.de8})`;
    const total = p.nivel === "controlar" && p.alcance === "total";
    const que = p.nivel === "ver" ? "ver esta neurona" : total ? "el control total de esta neurona" : "controlar esta neurona";
    const alcance = total
        ? "Con el control total puede ver la pantalla y operar todo el aparato, apps incluidas (también los ajustes y los permisos)."
        : p.nivel === "controlar"
          ? "Quedaría en «Protegido»: puede ver y tocar, pero no las ventanas de permisos, instalador ni ajustes."
          : "Solo podría ver la pantalla.";
    if (p.estado === "abierta") {
        return {
            titulo: `${p.nombre} controla esta neurona`,
            cuerpo: `${quien} controla esta neurona desde las ${hhmm(p.desde)}. ${total ? "Control total: ve la pantalla y opera todo el aparato, apps incluidas." : p.nivel === "controlar" ? "Ve la pantalla y la toca (modo «Protegido»)." : "Solo ve la pantalla."} Puedes terminarlo desde el aviso o desde el ajuste.`,
            boton: "Ver quién controla",
        };
    }
    if (p.estado === "apagado") {
        return {
            titulo: `${p.nombre} pide ${que}`,
            cuerpo: `${quien} lo pide. Esta neurona tiene apagado “Control entre mis neuronas”. Solo tú puedes encenderlo, aquí. ${alcance}`,
            boton: "Abrir el ajuste",
        };
    }
    const codigo = p.codigo ? ` Compara el código ${p.codigo} con el que enseña ${p.nombre}.` : "";
    return {
        titulo: `${p.nombre} pide ${que}`,
        cuerpo: `${quien} lo pide. Para aceptarla, abre “Control entre mis neuronas” en esta neurona y acéptala tú, aquí.${codigo} ${alcance}`,
        boton: "Abrir el ajuste",
    };
}

export function armarAviso(p: PeticionControl, extra: { codigo: string | null; alcance: AlcanceControl; id: string }): AvisoPeticion {
    const nombre = limpiarNombre(p.nombre);
    const de8 = p.de.slice(0, 8);
    const t = textosPeticion({ nombre, de8, codigo: extra.codigo, tipo: p.tipo, nivel: p.nivel, estado: p.estado, alcance: extra.alcance, desde: p.desde });
    return { id: extra.id, de8, nombre, codigo: extra.codigo, tipo: p.tipo, nivel: p.nivel, estado: p.estado, alcance: extra.alcance, desde: p.desde, ...t, ruta: RUTA_AJUSTE_CONTROL };
}

// ── topes ────────────────────────────────────────────────────────────────────────────────────

type Programar = (f: () => void, ms: number) => unknown;

/** Uno cada 60 s y seis por hora, por quien manda. Lo que se calla se cuenta y una línea de registro dice cuántos fueron. */
export class LimiteAvisos {
    private avisados = new Map<string, number[]>();
    private callados = new Map<string, number>();
    private programado = new Set<string>();

    constructor(
        private readonly ahora: () => number,
        private readonly anotar: (linea: string) => void,
        private readonly programar: Programar = (f, ms) => setTimeout(f, ms),
    ) {}

    /** ¿Se avisa ahora de esta petición? Si no, se cuenta como callada. */
    permitir(de: string): boolean {
        const t = this.ahora();
        const lista = (this.avisados.get(de) ?? []).filter((x) => t - x < HORA_MS);
        const ultimo = lista[lista.length - 1];
        if ((ultimo !== undefined && t - ultimo < AVISO_CADA_MS) || lista.length >= AVISO_POR_HORA) {
            this.avisados.set(de, lista);
            this.callar(de);
            return false;
        }
        lista.push(t);
        this.avisados.set(de, lista);
        if (this.avisados.size > 64) this.avisados.delete(this.avisados.keys().next().value as string);
        this.volcar(de); // si antes se callaron algunos, se dice cuántos
        return true;
    }

    private callar(de: string): void {
        this.callados.set(de, (this.callados.get(de) ?? 0) + 1);
        if (this.programado.has(de)) return;
        this.programado.add(de);
        // Pasado un minuto sin avisar, la línea sale aunque no llegue otra petición.
        this.programar(() => {
            this.programado.delete(de);
            this.volcar(de);
        }, AVISO_CADA_MS);
    }

    private volcar(de: string): void {
        const n = this.callados.get(de) ?? 0;
        if (n <= 0) return;
        this.callados.delete(de);
        this.anotar(`control-aviso suprimidos=${n} de=${de.slice(0, 8)} tope=60s-6h`);
    }
}

// ── el avisador: topes + tres salidas ────────────────────────────────────────────────────────

export interface SalidasAviso {
    /** La ventana dentro de la app. */
    dentro(a: AvisoPeticion): void | Promise<void>;
    /** El aviso del sistema (con el permiso del sistema; en Android, con la sesión abierta, ya lo dice la notificación nativa). */
    sistema(a: AvisoPeticion): Promise<{ ok: boolean; motivo?: string } | null | void> | void;
    /** El centro de notificaciones de StarSeed. */
    centro(a: AvisoPeticion): { ok: boolean; motivo?: string } | void | Promise<{ ok: boolean; motivo?: string } | void>;
}

export interface DepsAvisador {
    ahora: () => number;
    anotar: (linea: string) => void;
    salidas: SalidasAviso;
    /** Lo local que hace falta para las palabras: el código del aparato que pide y el alcance de ESTE aparato. */
    resolver: (p: PeticionControl) => Promise<{ codigo: string | null; alcance: AlcanceControl }>;
    programar?: Programar;
}

/**
 * Devuelve la función que la puerta llama con cada petición verificada: contesta ENSEGUIDA «si» (se avisa ahora) o «ya»
 * (hace poco que se avisó de este aparato: tope) y deja que las tres salidas trabajen aparte. Nunca lanza.
 */
export function crearAvisador(d: DepsAvisador): (p: PeticionControl) => "si" | "ya" {
    const limite = new LimiteAvisos(d.ahora, d.anotar, d.programar);
    let n = 0;
    return (p) => {
        let cupo = false;
        try {
            cupo = limite.permitir(p.de);
        } catch {
            cupo = false;
        }
        if (!cupo) return "ya";
        void (async () => {
            try {
                const r = await d.resolver(p).catch(() => ({ codigo: null, alcance: "total" as AlcanceControl }));
                const a = armarAviso(p, { ...r, id: `control-${p.de.slice(0, 8)}-${d.ahora()}-${++n}` });
                const sal = async <T>(f: () => T | Promise<T>): Promise<{ ok: boolean; motivo?: string }> => {
                    try {
                        const x = (await f()) as { ok?: boolean; motivo?: string } | null | undefined | void;
                        return x && typeof x === "object" ? { ok: x.ok !== false, motivo: x.motivo } : { ok: true };
                    } catch (e) {
                        return { ok: false, motivo: e instanceof Error ? e.message.slice(0, 40) : "fallo" };
                    }
                };
                const [dentro, centro, sistema] = await Promise.all([sal(() => d.salidas.dentro(a)), sal(() => d.salidas.centro(a)), sal(() => d.salidas.sistema(a))]);
                const dice = (x: { ok: boolean; motivo?: string }) => (x.ok ? "si" : `no:${String(x.motivo ?? "fallo").replace(/[^a-z0-9-]/gi, "-").slice(0, 30)}`);
                d.anotar(`control-aviso de=${a.de8} tipo=${a.tipo} estado=${a.estado} nivel=${a.nivel} alcance=${a.alcance} dentro=${dice(dentro)} centro=${dice(centro)} sistema=${dice(sistema)}`);
            } catch {
                /* un aviso que falla nunca toca la puerta */
            }
        })();
        return "si";
    };
}

// ── la ventana de dentro de la app: un almacén mínimo ────────────────────────────────────────

let abiertos: readonly AvisoPeticion[] = [];
const oyentes = new Set<() => void>();
const MAX_VENTANAS = 3;

export function mostrarAvisoPeticion(a: AvisoPeticion): void {
    // De cada aparato solo queda el último aviso (el estado nuevo reemplaza al viejo).
    abiertos = [a, ...abiertos.filter((x) => x.de8 !== a.de8)].slice(0, MAX_VENTANAS);
    oyentes.forEach((f) => f());
}

export function cerrarAvisoPeticion(id: string): void {
    const n = abiertos.filter((x) => x.id !== id);
    if (n.length === abiertos.length) return;
    abiertos = n;
    oyentes.forEach((f) => f());
}

export function avisosPeticionAbiertos(): readonly AvisoPeticion[] {
    return abiertos;
}

export function suscribirAvisosPeticion(cb: () => void): () => void {
    oyentes.add(cb);
    return () => void oyentes.delete(cb);
}

/** Solo para pruebas. */
export function _vaciarAvisosPeticion(): void {
    abiertos = [];
    oyentes.forEach((f) => f());
}
