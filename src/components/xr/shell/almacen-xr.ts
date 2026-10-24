/**
 * StarSeed XR · ALMACÉN XR (`architecture/starseed-xr.md` §2.2, §3 c y d): UN solo almacén para abrir sesiones.
 * Envuelve `createXRStore` de `@react-three/xr` 6.6.31 (opciones reales: `@pmndrs/xr/dist/store.d.ts` e `init.d.ts`).
 * - `emulate: false` SIEMPRE, salvo desarrollo con `?emulador=1` (la librería emula un Quest 3 en localhost por defecto).
 * - `offerSession` y `enterGrantedSession` encendidos: el navegador puede poner su botón y `sessiongranted` entra solo.
 * - Foveación, refresco y escala del framebuffer salen del perfil de calidad (`aplicar-perfil.ts`).
 * - Cada función se pide EXPLÍCITA: los valores por defecto de la librería encienden `planeDetection`, `meshDetection`,
 *   `layers`, `hitTest`… como opcionales, y `plane-detection` solo puede ir requerida (y solo con «mi habitación»).
 * La librería se carga con `import()` dentro de `obtenerAlmacenXR`: el layout raíz no la arrastra.
 */
import type { XRStore, XRStoreOptions, createXRStore } from "@react-three/xr";
import type { CapacidadesXR } from "@/lib/xr/capacidades";
import type { PerfilCalidad } from "@/lib/xr/calidad-perfiles";
import type { FuncionXR } from "@/lib/xr/tipos";
import { ajustesDePerfil, escalaParaSesion, funcionesAPedir, type FuncionesPedidas } from "./aplicar-perfil";

export interface OpcionesAlmacenXR {
    perfil: PerfilCalidad; capacidades: CapacidadesXR;
    /** Si no se dice, todo lo que no sea `NODE_ENV=development` cuenta como producción (lo seguro). */
    produccion?: boolean;
    /** «Mundo AR con mi habitación»: `plane-detection` requerida (Quest solo la concede así). */
    habitacion?: boolean;
    busqueda?: string; // `location.search` inyectable (pruebas); si no se dice, el de la página
}
type ClaveFuncion = "anchors" | "handTracking" | "layers" | "meshDetection" | "planeDetection" | "depthSensing" | "domOverlay" | "hitTest";
type Peticion = NonNullable<XRStoreOptions["anchors"]>;
export type OpcionesFunciones = Record<ClaveFuncion | "bodyTracking", Peticion>;

/** Función WebXR → opción de la librería. `local-floor` la exige ella siempre (con `bounded` sin fijar). */
const CLAVES: Partial<Record<FuncionXR, ClaveFuncion>> = {
    anchors: "anchors", "hand-tracking": "handTracking", layers: "layers", "mesh-detection": "meshDetection",
    "plane-detection": "planeDetection", "depth-sensing": "depthSensing", "dom-overlay": "domOverlay", "hit-test": "hitTest",
};

/**
 * Traduce lo que hay que pedir a las opciones de la librería; todo lo no pedido va en `false` (incluido el cuerpo
 * entero, `bodyTracking`: biometría, §3 k). `sinTraducir` dice lo que la librería no deja pedir como opcional
 * (`bounded-floor`, `light-estimation`) para que `/xr/diagnostico` lo cuente en vez de callarlo.
 */
export function opcionesDeFunciones(f: FuncionesPedidas): { opciones: OpcionesFunciones; sinTraducir: FuncionXR[] } {
    const opciones: OpcionesFunciones = { anchors: false, handTracking: false, layers: false, meshDetection: false,
        planeDetection: false, depthSensing: false, domOverlay: false, hitTest: false, bodyTracking: false };
    const sinTraducir: FuncionXR[] = [];
    const poner = (funcion: FuncionXR, valor: Peticion) => {
        const clave = CLAVES[funcion];
        if (clave) opciones[clave] = valor;
        else if (funcion !== "local-floor") sinTraducir.push(funcion);
    };
    for (const funcion of f.opcionales) poner(funcion, true);
    for (const funcion of f.requeridas) poner(funcion, "required");
    return { opciones, sinTraducir };
}

/** El emulador de @pmndrs/xr solo existe en desarrollo y si la persona lo pide con `?emulador=1`. */
export function emuladorPermitido(produccion: boolean, busqueda: string): boolean {
    return !produccion && new URLSearchParams(busqueda).get("emulador") === "1";
}

/** Opciones de `createXRStore`. `perfil` se lee al ARRANCAR cada sesión: el nivel guardado entra en la siguiente. */
export function opcionesAlmacenXR(o: OpcionesAlmacenXR, perfil: () => PerfilCalidad = () => o.perfil): { opciones: XRStoreOptions; sinTraducir: FuncionXR[] } {
    const produccion = o.produccion ?? process.env.NODE_ENV !== "development";
    const busqueda = o.busqueda ?? (typeof location === "undefined" ? "" : location.search);
    const { opciones: funciones, sinTraducir } = opcionesDeFunciones(funcionesAPedir(o.capacidades, { habitacion: o.habitacion }));
    const opciones: XRStoreOptions = {
        ...funciones,
        emulate: emuladorPermitido(produccion, busqueda) ? { type: "metaQuest3", inject: true } : false,
        offerSession: true,
        enterGrantedSession: true,
        secondaryInputSources: false,
        foveation: ajustesDePerfil(perfil()).foveacion,
        frameRate: (soportados) => ajustesDePerfil(perfil(), Array.from(soportados)).frameRate ?? false,
        frameBufferScaling: (maxNativa) => escalaParaSesion(ajustesDePerfil(perfil()).escala, maxNativa),
    };
    return { opciones, sinTraducir };
}

export type CrearXRStore = typeof createXRStore;
/** Crea un almacén con la fábrica que se le pase (la de `@react-three/xr` o una de prueba). */
export function crearAlmacenXR(o: OpcionesAlmacenXR, crear: CrearXRStore, perfil?: () => PerfilCalidad): XRStore {
    return crear(opcionesAlmacenXR(o, perfil).opciones);
}

interface Unico { firma: string; perfil: { actual: PerfilCalidad }; promesa: Promise<XRStore> }
let unico: Unico | null = null;
const firmaDe = (o: OpcionesAlmacenXR): string =>
    JSON.stringify([o.habitacion === true, o.produccion ?? null, o.busqueda ?? null, o.capacidades.plataforma, o.capacidades.funciones]);

/**
 * El almacén de la página (singleton perezoso). Cada llamada actualiza el perfil para la próxima sesión. Si cambian
 * las funciones (p. ej. «mi habitación») y no hay sesión abierta, se rehace; con una sesión abierta se conserva:
 * las funciones de una sesión no cambian en caliente. Si la carga de la librería falla, la próxima llamada reintenta.
 */
export async function obtenerAlmacenXR(o: OpcionesAlmacenXR): Promise<XRStore> {
    const firma = firmaDe(o);
    const previo = unico;
    if (previo) {
        previo.perfil.actual = o.perfil;
        if (previo.firma === firma) return previo.promesa;
        const almacen = await previo.promesa.catch(() => null);
        if (unico !== previo) return obtenerAlmacenXR(o); // otra llamada ya lo rehízo (o falló la carga)
        if (almacen?.getState().session) return almacen;
        unico = null;
        almacen?.destroy();
    }
    const perfil = { actual: o.perfil };
    const promesa = import("@react-three/xr").then(({ createXRStore: crear }) => crearAlmacenXR(o, crear, () => perfil.actual));
    const nuevo: Unico = { firma, perfil, promesa };
    unico = nuevo;
    promesa.catch(() => { if (unico === nuevo) unico = null; });
    return promesa;
}

/** Suelta el almacén (cierra la sesión si la hay y lo destruye). Para las pruebas y para quien cierre `/xr/os`. */
export async function soltarAlmacenXR(): Promise<void> {
    const previo = unico;
    unico = null;
    const almacen = await previo?.promesa.catch(() => null);
    await almacen?.getState().session?.end().catch(() => undefined);
    almacen?.destroy();
}
