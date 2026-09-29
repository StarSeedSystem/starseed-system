"use client";
/**
 * Registro de recientes para el widget de accesos (ola 0929 · F) — NO está montado en ningún
 * sitio todavía. Si el coordinador lo monta una vez en el layout de la app
 * (`<RegistroRecientesAccesos />`), cada ruta que el usuario visite (por el dock, el lanzador o
 * un enlace) cuenta como reciente y alimenta los sugeridos. Sin él, el widget solo aprende de los
 * accesos que se abren desde él mismo. Local, sin red, una escritura por cambio de ruta.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { CLAVE_ACCESOS, ESTADO_INICIAL, registrarUso, type EstadoAccesos } from "./accesos-partes";
import { escribirJSON, leerJSON } from "./inicio-piezas";

/** Rutas que no son «apps» (el propio inicio, entrar, instalar…). */
const IGNORADAS = new Set(["/", "/dashboard", "/login", "/onboarding", "/bienvenida", "/instalar"]);

export function RegistroRecientesAccesos() {
    const ruta = usePathname();
    React.useEffect(() => {
        if (!ruta || IGNORADAS.has(ruta)) return;
        const estado = leerJSON<EstadoAccesos>(CLAVE_ACCESOS, ESTADO_INICIAL);
        escribirJSON(CLAVE_ACCESOS, { ...estado, uso: registrarUso(estado.uso ?? {}, ruta, Date.now()) });
    }, [ruta]);
    return null;
}

export default RegistroRecientesAccesos;
