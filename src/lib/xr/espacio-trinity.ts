/**
 * StarSeed XR · ESPACIO TRINITY. Dónde va cada nodo de la Trinity en el espacio, en METROS, según la
 * altura de los ojos, la postura, la mano dominante y el modo. Eje y arriba, -z al frente, origen en el
 * suelo bajo la persona (referencia `local-floor`). Los cardinales NO se espejan para zurdos: Horizon
 * es siempre el oeste y Logic el este; lo que cambia con la mano es el menú de la muñeca (§3 del contrato).
 * Módulo PURO.
 */
import type { Mano, ModoXR, NodoTrinity, Postura, Vec3 } from "./tipos";
import { acotar, aGrados, aRadianes, mm } from "./tipos";

export interface EntradaEspacio {
    /** Altura de los ojos sobre el suelo (m), medida de la pose del visor al centrar. */
    alturaOjos: number;
    postura: Postura;
    manoDominante: Mano;
    modo: ModoXR;
    /** Hacia dónde mira la persona al (re)centrar (rad, 0 = hacia -z). */
    yawBase?: number;
    /** Preferencia de tamaño 0.8–1.5 (accesibilidad). */
    escala?: number;
    /** Altura del techo si se conoce (detección de planos o malla de la sala), en m. */
    techo?: number;
}

export interface NodoEspacial {
    id: NodoTrinity;
    capa: "cercana" | "media";
    anclaje: "cuerpo" | "mundo" | "muneca" | "pantalla";
    visible: boolean;
    /** Posición (m). Para `muneca`: desplazamiento local desde la muñeca. */
    posicion: Vec3;
    /** Euler en orden YXZ (rad): primero giro, luego cabeceo. */
    rotacion: { pitch: number; yaw: number; roll: number };
    ancho: number;
    alto: number;
    distancia: number;
    azimutDeg: number;
    elevacionDeg: number;
    /** Radio de curvatura del panel (m), o `null` si es plano. */
    curvatura: number | null;
    /** Con quién comparte panel en postura de una mano (pestañas). */
    agrupadoCon?: NodoTrinity;
    borde?: "arriba" | "izquierda" | "derecha" | "abajo";
}

export interface DisposicionTrinity {
    nodos: Record<NodoTrinity, NodoEspacial>;
    mano: Mano;
    /** Qué abre el menú de mano: con manos, la palma hacia la cara (nunca el pellizco de palma, reservado por el sistema). */
    activacionMenu: { manos: string; mandos: string; cosenoPalma: number };
    opacidadMinima: number;
}

export const OBJETIVO_MIN_TACTO_M = 0.03;
export const OBJETIVO_MIN_RAYO_DEG = 2;
export const TEXTO_MIN_DEG = 1;

const POSTURAS = {
    "de-pie": { dist: 1.8, zenithEl: 24, lateralAz: 48, lateralEl: -2, dockDy: -0.55, dockR: 0.62 },
    sentado: { dist: 1.6, zenithEl: 20, lateralAz: 42, lateralEl: -4, dockDy: -0.4, dockR: 0.58 },
    "una-mano": { dist: 1.2, zenithEl: 16, lateralAz: 30, lateralEl: -4, dockDy: -0.4, dockR: 0.5 },
} as const;
const PHI = 1.618;

function colocar(ojos: Vec3, dist: number, azDeg: number, elDeg: number, yawBase: number): { posicion: Vec3; rotacion: NodoEspacial["rotacion"] } {
    const az = aRadianes(azDeg) + yawBase;
    const el = aRadianes(elDeg);
    const posicion: Vec3 = [mm(ojos[0] + dist * Math.cos(el) * Math.sin(az)), mm(ojos[1] + dist * Math.sin(el)), mm(ojos[2] - dist * Math.cos(el) * Math.cos(az))];
    return { posicion, rotacion: { pitch: mm(el), yaw: mm(-az), roll: 0 } };
}

/** Normal (hacia donde mira la cara) de un panel con esa rotación YXZ. Sirve para probar que mira a los ojos. */
export function normalDePanel(r: NodoEspacial["rotacion"]): Vec3 {
    return [mm(Math.sin(r.yaw) * Math.cos(r.pitch)), mm(-Math.sin(r.pitch)), mm(Math.cos(r.yaw) * Math.cos(r.pitch))];
}

export function disponerTrinity(e: EntradaEspacio): DisposicionTrinity {
    const altura = acotar(Number.isFinite(e.alturaOjos) ? e.alturaOjos : 1.6, 0.8, 2.1);
    const k = acotar(e.escala ?? 1, 0.8, 1.5);
    const yaw = e.yawBase ?? 0;
    const g = POSTURAS[e.postura];
    const ojos: Vec3 = [0, altura, 0];
    const pantalla = e.modo === "2d" || e.modo === "ar-mano";
    const enAR = e.modo === "ar-passthrough";
    const dist = g.dist * (e.modo === "3d-pantalla" ? 1.35 : 1);
    const reduccion = enAR ? 0.9 : 1;
    const anclaje: NodoEspacial["anclaje"] = pantalla ? "pantalla" : enAR ? "mundo" : "cuerpo";
    const unaMano = e.postura === "una-mano";
    const lado = e.manoDominante === "derecha" ? 1 : -1;

    const panel = (id: NodoTrinity, ancho: number, alto: number, az: number, el: number, borde: NodoEspacial["borde"]): NodoEspacial => {
        const { posicion, rotacion } = colocar(ojos, dist, az, el, yaw);
        if (e.techo !== undefined && posicion[1] + (alto * k * reduccion) / 2 > e.techo - 0.1) {
            posicion[1] = mm(Math.max(altura, e.techo - 0.1 - (alto * k * reduccion) / 2));
        }
        return { id, capa: "media", anclaje, visible: true, posicion, rotacion, ancho: mm(ancho * k * reduccion), alto: mm(alto * k * reduccion), distancia: dist, azimutDeg: az, elevacionDeg: el, curvatura: dist, borde };
    };
    const zenith = panel("zenith", 1.1, 1.1 / PHI, 0, g.zenithEl, "arriba");
    const lateral = (id: "horizon" | "logic", signo: 1 | -1) => {
        const az = unaMano ? lado * g.lateralAz : signo * g.lateralAz;
        const n = panel(id, 0.7, 0.7 * PHI, az, g.lateralEl, signo === -1 ? "izquierda" : "derecha");
        return n;
    };
    const horizon = lateral("horizon", -1);
    const logic = lateral("logic", 1);
    if (unaMano) {
        logic.agrupadoCon = "horizon";
        logic.visible = false;
    }

    const dockEl = aGrados(Math.atan2(g.dockDy, g.dockR));
    const dock = colocar(ojos, Math.hypot(g.dockDy, g.dockR), 0, dockEl, yaw);
    const anchor: NodoEspacial = {
        id: "anchor", capa: "cercana", anclaje: pantalla ? "pantalla" : "cuerpo", visible: true,
        posicion: dock.posicion, rotacion: { ...dock.rotacion, pitch: mm(dock.rotacion.pitch * 0.85) },
        ancho: mm(2 * g.dockR * Math.sin(aRadianes(50)) * k), alto: mm(0.09 * k), distancia: mm(Math.hypot(g.dockDy, g.dockR)),
        azimutDeg: 0, elevacionDeg: mm(dockEl), curvatura: g.dockR, borde: "abajo",
    };
    const mano: Mano = e.manoDominante === "derecha" ? "izquierda" : "derecha";
    const menuMano: NodoEspacial = {
        id: "menuMano", capa: "cercana", anclaje: "muneca", visible: !pantalla,
        posicion: [0, 0.09, -0.02], rotacion: { pitch: -Math.PI / 2, yaw: 0, roll: 0 },
        ancho: mm(0.14 * k), alto: mm(0.14 * k), distancia: 0.3, azimutDeg: 0, elevacionDeg: 0, curvatura: null,
    };
    return {
        nodos: { zenith, horizon, logic, anchor, menuMano },
        mano,
        activacionMenu: { manos: "palma hacia la cara; se toca con la punta del dedo", mandos: "botón X o Y del mando de la mano no dominante", cosenoPalma: 0.55 },
        opacidadMinima: enAR ? 0.82 : 0.6,
    };
}

/** Posiciones de los botones del dock a lo largo de su arco (equidistantes del pecho). */
export function posicionesDock(n: number, e: EntradaEspacio): { posicion: Vec3; yaw: number }[] {
    const g = POSTURAS[e.postura];
    const altura = acotar(e.alturaOjos, 0.8, 2.1);
    const yaw = e.yawBase ?? 0;
    const paso = aRadianes(6.5);
    const total = Math.max(1, Math.min(n, Math.floor(aRadianes(100) / paso) + 1));
    return Array.from({ length: total }, (_, i) => {
        const a = (i - (total - 1) / 2) * paso + yaw;
        return { posicion: [mm(g.dockR * Math.sin(a)), mm(altura + g.dockDy), mm(-g.dockR * Math.cos(a))] as Vec3, yaw: mm(-a) };
    });
}

/** ¿Hay que recentrar? Sólo si la persona lleva tiempo mirando muy lejos de la disposición (nunca de golpe). */
export function debeRecentrar(yawCabeza: number, yawBase: number, segundosFuera: number): boolean {
    const d = Math.abs(Math.atan2(Math.sin(yawCabeza - yawBase), Math.cos(yawCabeza - yawBase)));
    return d > aRadianes(70) && segundosFuera >= 3;
}
