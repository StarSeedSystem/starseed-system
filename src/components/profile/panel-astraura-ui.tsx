"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
    AlertTriangle,
    Check,
    Clock,
    History,
    Sparkles,
    Undo2,
    X,
} from "lucide-react";

import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { CURVA, DURACION } from "@/lib/design/movimiento";
import {
    CAMPOS_PERMITIDOS,
    describirAccion,
    esAccionDestructiva,
    type AccionUi,
    type TipoAccionUi,
} from "@/lib/astraura/ui-acciones";
import {
    AMBITOS_POR_DEFECTO,
    NIVEL_POR_DEFECTO,
    decidirUi,
    guardarPermisos,
    leerPermisos,
    type NivelUi,
    type PermisoUi,
} from "@/lib/astraura/ui-permisos";
import type { EntradaBitacora } from "@/lib/astraura/ui-aplicador";

/**
 * Astraura · Panel del perfil: qué puede tocar de tu interfaz (Ola 304 · zU7)
 * ============================================================================
 * Aquí el usuario VE y MANDA: quién puede cambiar su interfaz, en qué nivel,
 * qué está pidiendo ahora mismo y qué cambió ya (con su deshacer). El panel no
 * decide nada por su cuenta: la decisión vive en `ui-permisos` (`decidirUi`) y
 * la reversión en `ui-aplicador` (`deshacer`); esto es solo la ventana.
 *
 * Por qué existe (Tríada §3): la IA es el exocórtex del usuario, leal al
 * usuario y nunca al sistema. Un exocórtex que retoca la interfaz a espaldas
 * de su dueño no es exocórtex, es intrusión. De ahí que todo permiso se pueda
 * revocar de un clic y que todo cambio tenga su «Deshacer» a la vista.
 */

/** Un actor que puede pedir cambios de interfaz, tal y como se muestra. */
export interface ActorUi {
    /** Identidad canónica: `agente:<id>` · `personalidad:<id>` · `proceso:<id>`. */
    actor: string;
    /** Nombre legible; si falta se deduce del identificador. */
    nombre?: string;
    /** Una línea de qué es y para qué sirve. */
    descripcion?: string;
}

export interface PanelAstrauraUiProps {
    /** Actores gobernables desde el panel. */
    actores?: ActorUi[];
    /** Lo que Astraura quiere cambiar y aún no has decidido. */
    propuestas?: AccionUi[];
    /** Bitácora del aplicador, las más nuevas primero. */
    bitacora?: EntradaBitacora[];
    /** Puente con `deshacer` de `@/lib/astraura/ui-aplicador` (lo cablea la página). */
    alDeshacer?: (entrada: EntradaBitacora) => void;
    /** Confirmación humana de una propuesta. */
    alAplicar?: (accion: AccionUi) => void;
    /** Rechazo de una propuesta. */
    alDescartar?: (accion: AccionUi) => void;
    /** Reloj inyectable: mantiene deterministas la caducidad y los tests. */
    ahora?: number;
    className?: string;
}

/* ── Vocabulario visible ──────────────────────────────────────────────── */

/** Los tipos salen del vocabulario cerrado de la gramática, nunca de una
 *  lista copiada aquí: si `ui-acciones` añade uno, el panel lo muestra solo. */
const TIPOS: TipoAccionUi[] = Object.keys(CAMPOS_PERMITIDOS) as TipoAccionUi[];

const ETIQUETA_TIPO: Record<TipoAccionUi, string> = {
    apariencia: "Apariencia",
    fondo: "Fondo",
    tipografia: "Tipografía",
    distribucion: "Distribución",
    preset: "Preset",
    movimiento: "Movimiento",
    restaurar: "Restaurar",
};

const NIVELES: NivelUi[] = ["nada", "proponer", "aplicar"];

const ETIQUETA_NIVEL: Record<NivelUi, string> = {
    nada: "Nada",
    proponer: "Propone",
    aplicar: "Aplica",
};

/** El «qué gana el usuario» de cada nivel, en su idioma y sin rodeos. */
const AYUDA_NIVEL: Record<NivelUi, string> = {
    nada: "No puede tocar tu interfaz de ninguna manera.",
    proponer: "Te sugiere cambios; los aplicas tú.",
    aplicar: "Puede retocar por su cuenta, salvo lo destructivo y la cuenta.",
};

/** Transición única del panel: dentro de los 150-300 ms del OS (§8). */
const TRANSICION: React.CSSProperties = {
    transitionDuration: `${DURACION.normal}ms`,
    transitionTimingFunction: CURVA.entrada,
};

/* ── Utilidades de presentación ───────────────────────────────────────── */

function nombreDeActor(a: ActorUi): string {
    if (a.nombre) return a.nombre;
    const indice = a.actor.indexOf(":");
    const bruto = indice >= 0 ? a.actor.slice(indice + 1) : a.actor;
    return bruto.charAt(0).toUpperCase() + bruto.slice(1);
}

/** Cuánto le queda al permiso, redondeado a la unidad que se entiende de un
 *  vistazo. Devuelve `null` si no caduca (o si ya caducó: entonces no hay
 *  permiso que mostrar y manda el reparto de fábrica). */
function restanteLegible(expiraEn: number | undefined, ahora: number): string | null {
    if (expiraEn === undefined) return null;
    const ms = expiraEn - ahora;
    if (ms <= 0) return null;
    const minutos = Math.round(ms / 60000);
    if (minutos < 60) return `Caduca en ${Math.max(1, minutos)} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `Caduca en ${horas} h`;
    return `Caduca en ${Math.round(horas / 24)} días`;
}

function fechaLegible(at: number): string {
    return new Date(at).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

/* ── Lectura del reparto vigente ──────────────────────────────────────── */

/** El permiso PROPIO y vivo de un actor (el comodín `"*"` no se edita desde
 *  aquí: el panel gobierna actor a actor para que revocar sea inequívoco). */
function permisoDe(
    permisos: PermisoUi[],
    actor: string,
    ahora: number,
): PermisoUi | undefined {
    return permisos.find(
        (p) => p.actor === actor && (p.expiraEn === undefined || p.expiraEn > ahora),
    );
}

function nivelDe(permisos: PermisoUi[], actor: string, ahora: number): NivelUi {
    return permisoDe(permisos, actor, ahora)?.nivel ?? NIVEL_POR_DEFECTO;
}

function cubreTipo(permiso: PermisoUi | undefined, tipo: TipoAccionUi): boolean {
    // Sin permiso propio manda el reparto de fábrica, que no restringe tipos.
    if (!permiso) return true;
    return permiso.tipos.includes("*") || permiso.tipos.includes(tipo);
}

/** Inserta o reemplaza el permiso de un actor conservando el resto intacto. */
function conPermiso(permisos: PermisoUi[], siguiente: PermisoUi): PermisoUi[] {
    const indice = permisos.findIndex((p) => p.actor === siguiente.actor);
    if (indice < 0) return [...permisos, siguiente];
    const copia = [...permisos];
    copia[indice] = siguiente;
    return copia;
}

/** Base con la que nace el permiso de un actor que aún no tenía ninguno. */
function permisoBase(actor: string): PermisoUi {
    return {
        actor,
        nivel: NIVEL_POR_DEFECTO,
        tipos: ["*"],
        ambitos: [...AMBITOS_POR_DEFECTO],
    };
}

/** Los tipos explícitos de un permiso; `"*"` se despliega al vocabulario
 *  entero para poder apagar uno solo sin perder los demás. */
function tiposExplicitos(permiso: PermisoUi): TipoAccionUi[] {
    if (permiso.tipos.includes("*")) return [...TIPOS];
    return TIPOS.filter((t) => permiso.tipos.includes(t));
}

/* ── Panel ────────────────────────────────────────────────────────────── */

export function PanelAstrauraUi({
    actores = [],
    propuestas = [],
    bitacora = [],
    alDeshacer,
    alAplicar,
    alDescartar,
    ahora,
    className,
}: PanelAstrauraUiProps) {
    // Arranca vacío y lee en el cliente: `leerPermisos` es SSR-safe, pero
    // sembrar el estado con él en el primer render descuadraría la hidratación.
    const [permisos, setPermisos] = useState<PermisoUi[]>([]);
    const [reloj, setReloj] = useState<number>(() => ahora ?? 0);

    useEffect(() => {
        setPermisos(leerPermisos());
        if (ahora === undefined) setReloj(Date.now());
    }, [ahora]);

    const instante = ahora ?? reloj;

    /** Escribe el reparto y lo persiste: el estado de la pantalla y el
     *  almacenamiento cambian a la vez, nunca uno sin el otro. */
    const escribir = useCallback((siguiente: PermisoUi[]) => {
        setPermisos(siguiente);
        guardarPermisos(siguiente);
    }, []);

    const cambiarNivel = useCallback(
        (actor: string, nivel: NivelUi) => {
            const actual = permisoDe(permisos, actor, instante) ?? permisoBase(actor);
            escribir(conPermiso(permisos, { ...actual, nivel }));
        },
        [permisos, instante, escribir],
    );

    const alternarTipo = useCallback(
        (actor: string, tipo: TipoAccionUi) => {
            const actual = permisoDe(permisos, actor, instante) ?? permisoBase(actor);
            const vigentes = tiposExplicitos(actual);
            const siguientes = vigentes.includes(tipo)
                ? vigentes.filter((t) => t !== tipo)
                : [...vigentes, tipo];
            escribir(conPermiso(permisos, { ...actual, tipos: siguientes }));
        },
        [permisos, instante, escribir],
    );

    const vacio =
        actores.length === 0 && propuestas.length === 0 && bitacora.length === 0;

    return (
        <section
            data-testid="panel-astraura-ui"
            aria-label="Lo que Astraura puede tocar de tu interfaz"
            className={cn("flex w-full flex-col gap-4", className)}
        >
            <header className="flex items-start gap-3">
                <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                    <h2 className="text-base font-semibold leading-tight">
                        Lo que Astraura puede tocar de tu interfaz
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Tú repartes el permiso, actor por actor, y lo retiras cuando quieras.
                    </p>
                </div>
            </header>

            {vacio && (
                <GlassCard data-testid="panel-astraura-vacio" className="p-5">
                    <p className="text-sm text-muted-foreground">
                        Aún no has dejado que nadie vista tu perfil. Cuando enciendas a un
                        actor, Astraura te propondrá fondos, tipografías y ritmos que encajen
                        con lo que estés haciendo —y cada cambio quedará aquí, con su motivo
                        y su «Deshacer».
                    </p>
                </GlassCard>
            )}

            {actores.length > 0 && (
                <div
                    data-testid="panel-astraura-actores"
                    className="grid grid-cols-1 gap-3 md:grid-cols-2"
                >
                    {actores.map((a) => {
                        const permiso = permisoDe(permisos, a.actor, instante);
                        const nivel = nivelDe(permisos, a.actor, instante);
                        const restante = restanteLegible(permiso?.expiraEn, instante);
                        return (
                            <GlassCard
                                key={a.actor}
                                data-testid={`actor-${a.actor}`}
                                className="flex flex-col gap-3 p-4"
                            >
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold">
                                        {nombreDeActor(a)}
                                    </h3>
                                    {a.descripcion && (
                                        <p className="text-xs text-muted-foreground">{a.descripcion}</p>
                                    )}
                                </div>

                                <div
                                    role="group"
                                    aria-label={`Nivel de ${nombreDeActor(a)}`}
                                    className="flex flex-wrap gap-1.5"
                                >
                                    {NIVELES.map((n) => (
                                        <button
                                            key={n}
                                            type="button"
                                            data-testid={`nivel-${a.actor}-${n}`}
                                            aria-pressed={nivel === n}
                                            title={AYUDA_NIVEL[n]}
                                            onClick={() => cambiarNivel(a.actor, n)}
                                            style={TRANSICION}
                                            className={cn(
                                                "cursor-pointer rounded-lg border px-2.5 py-1 text-xs transition-colors",
                                                nivel === n
                                                    ? "border-primary/40 bg-primary/15 text-foreground"
                                                    : "border-white/10 text-muted-foreground hover:border-white/20",
                                            )}
                                        >
                                            {ETIQUETA_NIVEL[n]}
                                        </button>
                                    ))}
                                </div>

                                <p className="text-xs text-muted-foreground">{AYUDA_NIVEL[nivel]}</p>

                                <div
                                    role="group"
                                    aria-label={`Tipos de acción de ${nombreDeActor(a)}`}
                                    className="flex flex-wrap gap-1.5"
                                >
                                    {TIPOS.map((t) => {
                                        const activo = cubreTipo(permiso, t);
                                        return (
                                            <button
                                                key={t}
                                                type="button"
                                                data-testid={`tipo-${a.actor}-${t}`}
                                                aria-pressed={activo}
                                                onClick={() => alternarTipo(a.actor, t)}
                                                style={TRANSICION}
                                                className={cn(
                                                    "cursor-pointer rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                                                    activo
                                                        ? "border-primary/30 bg-primary/10 text-foreground"
                                                        : "border-white/10 text-muted-foreground line-through hover:border-white/20",
                                                )}
                                            >
                                                {ETIQUETA_TIPO[t]}
                                            </button>
                                        );
                                    })}
                                </div>

                                {restante && (
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                        <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                        {restante}
                                    </p>
                                )}
                            </GlassCard>
                        );
                    })}
                </div>
            )}

            {propuestas.length > 0 && (
                <div data-testid="panel-astraura-propuestas" className="flex flex-col gap-2">
                    <h3 className="text-sm font-semibold">Propuestas pendientes</h3>
                    {propuestas.map((p, i) => {
                        const destructiva = esAccionDestructiva(p);
                        // El motivo lo firma `decidirUi`, no el panel: así la frase que
                        // lee el usuario es exactamente la que aplicó la regla.
                        const decision = decidirUi(permisos, p, instante);
                        return (
                            <GlassCard
                                key={`${p.actor}-${p.tipo}-${i}`}
                                data-testid={`propuesta-${i}`}
                                className="flex flex-col gap-3 p-4"
                            >
                                <p className="text-sm">{describirAccion(p)}</p>
                                <p className="text-xs text-muted-foreground">{decision.motivo}</p>

                                {destructiva && (
                                    <p
                                        data-testid={`propuesta-destructiva-${i}`}
                                        className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 p-2 text-xs text-amber-200"
                                    >
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                                        Cambio destructivo: se pierden valores que hoy tienes. Míralo
                                        antes de aplicarlo.
                                    </p>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        data-testid={`aplicar-${i}`}
                                        onClick={() => alAplicar?.(p)}
                                        style={TRANSICION}
                                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs transition-colors hover:bg-primary/25"
                                    >
                                        <Check className="h-3.5 w-3.5" aria-hidden />
                                        Aplicar
                                    </button>
                                    <button
                                        type="button"
                                        data-testid={`descartar-${i}`}
                                        onClick={() => alDescartar?.(p)}
                                        style={TRANSICION}
                                        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-white/20"
                                    >
                                        <X className="h-3.5 w-3.5" aria-hidden />
                                        Descartar
                                    </button>
                                </div>
                            </GlassCard>
                        );
                    })}
                </div>
            )}

            {bitacora.length > 0 && (
                <div data-testid="panel-astraura-bitacora" className="flex flex-col gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                        <History className="h-4 w-4" aria-hidden />
                        Últimos cambios
                    </h3>
                    {bitacora.map((e) => (
                        <GlassCard
                            key={e.id}
                            data-testid={`bitacora-${e.id}`}
                            className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                        >
                            <div className="min-w-0">
                                <p className="text-sm">{e.resumen}</p>
                                <p className="text-xs text-muted-foreground">
                                    {nombreDeActor({ actor: e.actor })} · {ETIQUETA_TIPO[e.tipo]} ·{" "}
                                    {fechaLegible(e.at)} — {e.motivo}
                                </p>
                            </div>
                            <button
                                type="button"
                                data-testid={`deshacer-${e.id}`}
                                onClick={() => alDeshacer?.(e)}
                                style={TRANSICION}
                                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs transition-colors hover:border-white/25"
                            >
                                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                                Deshacer
                            </button>
                        </GlassCard>
                    ))}
                </div>
            )}
        </section>
    );
}
