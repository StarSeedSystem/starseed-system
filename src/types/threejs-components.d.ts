/**
 * Declaraciones de tipos para `threejs-components` (v0.0.30).
 *
 * El paquete es JS puro y no publica `types`, así que TypeScript no podía
 * resolverlo (TS2307) y los consumidores recurrían a `@ts-ignore`. Aquí
 * declaramos su superficie real: fábricas que reciben un <canvas> y devuelven
 * la "app" del efecto (objeto dinámico del propio motor, de ahí el `any`).
 */

/** App devuelta por cualquiera de las fábricas de fondos/cursores. */
interface ThreeJsComponentsApp {
    dispose?: () => void;
    destroy?: () => void;
    [key: string]: any;
}

type ThreeJsComponentsFactory = (
    canvas: HTMLCanvasElement,
    config?: Record<string, unknown>,
) => ThreeJsComponentsApp;

declare module "threejs-components" {
    export const Attraction1Cursor: ThreeJsComponentsFactory;
    export const Bokeh1Background: ThreeJsComponentsFactory;
    export const Grid1Background: ThreeJsComponentsFactory;
    export const Liquid1Background: ThreeJsComponentsFactory;
    export const Neon1Background: ThreeJsComponentsFactory;
    export const Neon1Cursor: ThreeJsComponentsFactory;
    export const Particles1Cursor: ThreeJsComponentsFactory;
    export const ShadertoyBackground: ThreeJsComponentsFactory;
    export const Spheres1Background: ThreeJsComponentsFactory;
    export const Spheres2Background: ThreeJsComponentsFactory;
    export const Starfield1Background: ThreeJsComponentsFactory;
    export const Tubes1Cursor: ThreeJsComponentsFactory;
    export const Three: any;
}

/** Builds sueltos (import directo del bundle de un efecto). */
declare module "threejs-components/build/backgrounds/liquid1.min.js" {
    const Liquid1Background: ThreeJsComponentsFactory;
    export default Liquid1Background;
}
