"use client";
/**
 * Catálogo de la Biblioteca para los widgets (Ola 0929-C): los paquetes REALES del OS (repos
 * integrados + los que añadiste por URL) y lo que tienes instalado, sin red — es código del
 * propio OS y el registro local `starseed.library.installed.v1`. El módulo del catálogo pesa,
 * así que se carga a demanda (import dinámico) y una sola vez para todas las instancias.
 */
import * as React from "react";

export interface PaqueteBiblioteca {
    id: string;
    kind: string;
    name: string;
    description: string;
    icon: string;
    tags: string[];
    version: string;
    author: string;
    featured?: boolean;
    comingSoon?: boolean;
    payload: Record<string, unknown>;
}

export interface CatalogoBiblioteca {
    paquetes: PaqueteBiblioteca[];
    /** id → momento de instalación. */
    instalados: Record<string, number>;
}

type Modulo = typeof import("@/lib/library/packages");
let promesa: Promise<Modulo> | null = null;
function cargarModulo(): Promise<Modulo> {
    if (!promesa) promesa = import("@/lib/library/packages").catch((e) => { promesa = null; throw e; });
    return promesa;
}

function leer(m: Modulo): CatalogoBiblioteca {
    const inst = m.getInstalledMap();
    const instalados: Record<string, number> = {};
    for (const [id, e] of Object.entries(inst)) instalados[id] = e.installedAt;
    return { paquetes: m.allPackages() as unknown as PaqueteBiblioteca[], instalados };
}

export function useCatalogoBiblioteca(): { datos: CatalogoBiblioteca | null; cargando: boolean; error: unknown; recargar: () => void } {
    const [datos, setDatos] = React.useState<CatalogoBiblioteca | null>(null);
    const [error, setError] = React.useState<unknown>(null);
    const [version, setVersion] = React.useState(0);
    React.useEffect(() => {
        let vivo = true;
        let quitar: (() => void) | null = null;
        cargarModulo().then((m) => {
            if (!vivo) return;
            setDatos(leer(m));
            setError(null);
            // Instalar o desinstalar desde la Biblioteca (u otra pestaña) se refleja aquí al momento.
            quitar = m.subscribeLibrary(() => { if (vivo) setDatos(leer(m)); });
        }).catch((e) => { if (vivo) setError(e ?? new Error("fallo")); });
        return () => { vivo = false; quitar?.(); };
    }, [version]);
    return { datos, cargando: !datos && !error, error, recargar: () => setVersion((v) => v + 1) };
}

/** Búsqueda local por nombre, descripción y etiquetas (sin tildes ni mayúsculas). */
export function buscarPaquetes(ps: PaqueteBiblioteca[], q: string, max = 6): PaqueteBiblioteca[] {
    const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const t = n(q.trim());
    if (t.length < 2) return [];
    return ps
        .map((p) => {
            const nombre = n(p.name), desc = n(p.description), tags = p.tags.map(n);
            const puntos = (nombre.startsWith(t) ? 6 : nombre.includes(t) ? 4 : 0) + (tags.some((x) => x.includes(t)) ? 2 : 0) + (desc.includes(t) ? 1 : 0);
            return { p, puntos };
        })
        .filter((x) => x.puntos > 0 && !x.p.comingSoon)
        .sort((a, b) => b.puntos - a.puntos || a.p.name.localeCompare(b.p.name, "es"))
        .slice(0, max)
        .map((x) => x.p);
}
