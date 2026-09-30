"use client";
/**
 * Pila ajustable (pulido 0929) — «nada apretado, nada que se pise».
 *
 * Una columna que ocupa su caja y, si lo que lleva no cabe, va retirando las piezas
 * PRESCINDIBLES por orden (nivel 1 primero, luego 2…) hasta que cabe. Así una composición
 * pensada para una tarjeta alta no se desborda ni se monta sobre la cabecera en una baja:
 * pierde lo secundario (la fila de días, las barras de horas, el sello) y conserva el foco.
 *
 *   <PilaAjustable className="gap-2 p-3.5">
 *     {cabecera}
 *     <Encajar minimo={72}>{({ ancho, alto }) => <Gota lado={Math.min(alto, 118)} />}</Encajar>
 *     <Prescindible nivel={1}>{barras}</Prescindible>
 *   </PilaAjustable>
 *
 * Mide solo con ResizeObserver y un efecto de maquetación (sin temporizadores ni bucles):
 * al cambiar el tamaño vuelve a mostrarlo todo y recorta lo que no quepa. Sin layout (jsdom,
 * SSR) no recorta nada.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

const ContextoCorte = React.createContext<number>(0);

/** ¿El contenido se sale de la caja (o de alguna de sus filas directas)? */
export function desbordaAlto(el: HTMLElement, tolerancia = 1): boolean {
    if (el.clientHeight <= 0) return false;
    if (el.scrollHeight > el.clientHeight + tolerancia) return true;
    for (const hijo of Array.from(el.children) as HTMLElement[]) {
        if (hijo.clientHeight > 0 && hijo.scrollHeight > hijo.clientHeight + tolerancia) return true;
    }
    return false;
}

export interface PilaAjustableProps extends React.HTMLAttributes<HTMLDivElement> {
    /** Cuántos niveles de piezas prescindibles hay (por defecto 3). */
    niveles?: number;
    /** Cambia la clave para volver a evaluar desde cero (p. ej. al llegar datos nuevos). */
    clave?: string | number;
}

export function PilaAjustable({ niveles = 3, clave, className, children, ...resto }: PilaAjustableProps) {
    const ref = React.useRef<HTMLDivElement | null>(null);
    const [corte, setCorte] = React.useState(0);

    // Al cambiar la clave: todo visible otra vez y se vuelve a medir.
    React.useEffect(() => { setCorte(0); }, [clave]);
    // Vigila la caja Y sus filas: si la caja cambia de tamaño se empieza de cero; si una fila
    // crece (llegan datos, se re-maqueta un texto) y ya no cabe, se retira el siguiente nivel.
    React.useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        let w = el.clientWidth, h = el.clientHeight;
        const revisar = () => {
            if (Math.abs(el.clientWidth - w) >= 1 || Math.abs(el.clientHeight - h) >= 1) {
                w = el.clientWidth; h = el.clientHeight;
                // Se empieza de cero; si ya estaba en cero no habrá repintado (React no repinta un
                // estado igual) y nadie volvería a medir: se mide aquí mismo con lo que hay pintado.
                setCorte((c) => (c === 0 ? (desbordaAlto(el) ? Math.min(niveles, 1) : 0) : 0));
                return;
            }
            if (desbordaAlto(el)) setCorte((c) => Math.min(niveles, c + 1));
        };
        const ro = new ResizeObserver(revisar);
        const observarFilas = () => { ro.observe(el); for (const hijo of Array.from(el.children)) ro.observe(hijo); };
        observarFilas();
        const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(observarFilas);
        mo?.observe(el, { childList: true });
        return () => { ro.disconnect(); mo?.disconnect(); };
    }, [niveles]);
    // Tras cada pintado propio: si no cabe, se retira el siguiente nivel (termina en `niveles`).
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (el && corte < niveles && desbordaAlto(el)) setCorte((c) => Math.min(niveles, c + 1));
    });

    return (
        <ContextoCorte.Provider value={corte}>
            <div ref={ref} data-pila-ajustable={corte} className={cn("flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden", className)} {...resto}>
                {children}
            </div>
        </ContextoCorte.Provider>
    );
}

/** Pieza que se retira cuando no cabe (nivel 1 = la primera en irse; 0 o menos = nunca). */
export function Prescindible({ nivel = 1, children }: { nivel?: number; children: React.ReactNode }) {
    const corte = React.useContext(ContextoCorte);
    return nivel > 0 && nivel <= corte ? null : <>{children}</>;
}

/** ¿Se está mostrando el nivel `nivel`? (para variar una pieza en vez de quitarla). */
export function useNivelVisible(nivel: number): boolean {
    return nivel > React.useContext(ContextoCorte);
}

/**
 * Fila que ocupa el alto libre de la pila y da su medida al contenido, para que la pieza
 * protagonista (una gota, una brújula, un arco) se dibuje del tamaño que CABE y no del que
 * se pensó. `minimo`: alto por debajo del cual la fila ya no encoge (la pila retirará antes
 * lo prescindible).
 */
export function Encajar({ minimo = 0, className, children, porDefecto = { ancho: 160, alto: 120 } }: {
    minimo?: number;
    className?: string;
    /** Medida mientras no hay maquetación (SSR, jsdom): el pintado real ya llega medido. */
    porDefecto?: { ancho: number; alto: number };
    children: (caja: { ancho: number; alto: number }) => React.ReactNode;
}) {
    const ref = React.useRef<HTMLDivElement | null>(null);
    const [caja, setCaja] = React.useState({ ancho: 0, alto: 0 });
    React.useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const medir = () => {
            const r = el.getBoundingClientRect();
            setCaja((c) => (Math.abs(c.ancho - r.width) < 1 && Math.abs(c.alto - r.height) < 1 ? c : { ancho: r.width, alto: r.height }));
        };
        medir();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    return (
        <div ref={ref} className={cn("relative min-h-0 min-w-0 flex-1", className)} style={minimo ? { minHeight: minimo } : undefined}>
            {children(caja.alto > 0 && caja.ancho > 0 ? caja : porDefecto)}
        </div>
    );
}

/** Muestra `children` mientras quepa y, cuando la pila retira el nivel `nivel`, la versión `corto`. */
export function Alterna({ nivel, corto, children }: { nivel: number; corto: React.ReactNode; children: React.ReactNode }) {
    const corte = React.useContext(ContextoCorte);
    return <>{nivel <= corte ? corto : children}</>;
}
