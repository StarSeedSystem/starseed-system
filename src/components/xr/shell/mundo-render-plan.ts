/**
 * StarSeed XR · PLAN DE RENDER de un MundoSpec (XR1010Vs · contrato `architecture/starseed-xr.md` §3 g).
 * De BRAVO (el mundo como llega: IA, red, entidad guardada) y del nivel de calidad sale el plan que pintará
 * `mundo-render.tsx`: paleta del cielo, terreno PROCEDURAL por `semilla`, objetos, luces y spawns recortados
 * con `adaptarANivel`; los recortes y los problemas viajan, para decirlos con honestidad (§0.4).
 * Todo determinista y PURO: sin three, sin React, sin DOM, sin `Math.random` (ruido de valor firmado por seno).
 */
import type { NivelCalidad } from "@/lib/xr/tipos";
import { LIMITES, TERRENOS, type CieloMundo, type LuzMundo, type MundoSpec, type SpawnMundo } from "@/lib/xr/mundo-tipos";
import { PERFILES, type MaterialCristal } from "@/lib/xr/calidad-perfiles";
import { validarMundo, adaptarANivel, type ProblemaMundo } from "@/lib/xr/mundo-spec";
import { CRISTAL } from "@/lib/xr/tokens-3d";

export interface PaletaCielo { arriba: string; abajo: string; sinFondo?: boolean }

/** Paletas del cielo (§3 b): cénit y horizonte; `ninguno` es AR passthrough: el cielo es TU cuarto (§3 k). */
export const PALETAS_CIELO: Record<CieloMundo, PaletaCielo> = {
    nebulosa: { arriba: "#241a4d", abajo: "#181436" },
    amanecer: { arriba: "#453470", abajo: "#ef9f6b" },
    mediodia: { arriba: "#4d7fc4", abajo: "#b9d0e8" },
    atardecer: { arriba: "#2b2043", abajo: "#c2703e" },
    noche: { arriba: "#060814", abajo: "#131633" },
    estudio: { arriba: "#171a2b", abajo: "#0e101e" },
    ninguno: { arriba: "#000000", abajo: "#000000", sinFondo: true },
};

/** Dato del plan: superficie del mar a y=0 (`agua` e `islas`); el lecho baja a −alturaMax/4. */
export const COLOR_AGUA = "#2c5b7a";
/** Marcador honesto para lo que aún no se puede cargar (Biblioteca/texto): token de texto secundario. */
export const COLOR_MARCADOR = CRISTAL.textoSecundario;

/** Vértices del terreno por nivel: (s+1)² deben caber en el presupuesto de triángulos (LIMITES[n].triangulos). */
export const SEGMENTOS_TERRENO: Record<NivelCalidad, number> = {
    minima: 16, baja: 32, media: 48, alta: 64, maxima: 84,
};

export interface TerrenoPlan { tipo: Exclude<(typeof TERRENOS)[number], "vacio">; tamano: number; segmentos: number }

export interface MundoPlano {
    /** El mundo YA VALIDADO y recortado al nivel (nada muta al original, §2.2). */
    mundo: MundoSpec;
    /** Qué se quitó para este aparato, en palabras. */
    recortes: string[];
    cielo: PaletaCielo;
    terreno: TerrenoPlan | null;
    mar: boolean;
    /** Sin los `oculto` y dentro del límite del nivel (LIMITES). */
    objetos: MundoSpec["objetos"];
    luces: LuzMundo[];
    spawns: SpawnMundo[];
    sombras: { activas: boolean; resolucion: number };
    /** Radio de la cúpula de cielo y techo de la niebla; nunca menor que el mundo. */
    radioCielo: number;
    /** Cristal del nivel, por si quien monta añade paneles de la Trinity sobre el mundo. */
    cristal: MaterialCristal;
}

export interface PlanMundoRender { plan: MundoPlano | null; problemas: ProblemaMundo[] }

/** Latícula determinista por seno: mismo `semilla`, mismo terreno; nunca `Math.random` (núcleo puro, §0). */
const ruidoValor = (s: number, x: number, z: number): number => {
    const v = Math.sin(x * 127.1 + z * 311.7 + s * 0.017) * 43758.5453;
    return v - Math.floor(v);
};
const suave = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Altura del terreno procedural (m) en (x, z), determinista por `semilla`: `colinas` ondula entre
 * −0,35 × alturaMax y +0,65 × alturaMax; `islas` lo centra y baja el borde al lecho (−alturaMax/4);
 * `vacio` y `plano` quedan a 0, y `agua` a la profundidad del lecho.
 */
export function alturaTerreno(e: MundoSpec["entorno"], x: number, z: number): number {
    if (e.terreno === "vacio" || e.terreno === "plano") return 0;
    const lecho = -Math.max(0.5, e.alturaMax) / 4;
    if (e.terreno === "agua") return lecho;
    const f = 0.22;
    const x0 = Math.floor(x * f);
    const z0 = Math.floor(z * f);
    const tx = suave(x * f - x0);
    const tz = suave(z * f - z0);
    const v = lerp(
        lerp(ruidoValor(e.semilla, x0, z0), ruidoValor(e.semilla + 1, x0 + 1, z0), tx),
        lerp(ruidoValor(e.semilla + 2, x0, z0 + 1), ruidoValor(e.semilla + 3, x0 + 1, z0 + 1), tx),
        tz,
    );
    let h = e.alturaMax * (v - 0.35);
    if (e.terreno === "islas") {
        const r = Math.min(1, Math.hypot(x, z) / Math.max(1, e.tamano * 0.45));
        h = lerp(h + e.alturaMax * 0.45, lecho, suave(r));
    }
    return h;
}

/**
 * Valida (TODA entrada), recorta al nivel con `adaptarANivel` y calcula el plan: un mundo inválido
 * NO se pinta y los problemas suben para que la tarjeta de confirmación los cuente (§3 f y g).
 */
export function planificarMundo(bruto: unknown, nivel: NivelCalidad): PlanMundoRender {
    const v = validarMundo(bruto);
    if (!v.ok || v.mundo === null) return { plan: null, problemas: v.problemas };
    const adaptado = adaptarANivel(v.mundo, nivel);
    const tope = LIMITES[nivel];
    const tipo = adaptado.mundo.entorno.terreno;
    return {
        plan: {
            mundo: adaptado.mundo,
            recortes: adaptado.recortes,
            cielo: PALETAS_CIELO[adaptado.mundo.entorno.cielo],
            terreno: tipo === "vacio" ? null : { tipo, tamano: adaptado.mundo.entorno.tamano, segmentos: SEGMENTOS_TERRENO[nivel] },
            mar: tipo === "agua" || tipo === "islas",
            objetos: adaptado.mundo.objetos.filter((o) => !o.oculto).slice(0, tope.objetos),
            luces: adaptado.mundo.luces.slice(0, tope.luces),
            spawns: adaptado.mundo.spawns.length > 0 ? adaptado.mundo.spawns : [{ id: "entrada", pos: [0, 0, 0], yaw: 0 }],
            sombras: { activas: PERFILES[nivel].sombras.activas, resolucion: PERFILES[nivel].sombras.resolucion },
            radioCielo: Math.max(40, adaptado.mundo.entorno.tamano * 1.6),
            cristal: PERFILES[nivel].material,
        },
        problemas: v.problemas,
    };
}
