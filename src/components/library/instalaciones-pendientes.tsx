"use client";

/**
 * Instalaciones pendientes — «<Neurona> pidió instalar <App> aquí».
 *
 * Cuando alguien instala una app desde otra neurona de la cuenta y marca ESTE dispositivo,
 * el pedido llega aquí (lista sincronizada por la cuenta + aviso en vivo por su canal).
 * Un navegador no debe instalar nada sin que la persona lo acepte en este dispositivo, así
 * que se muestra una tarjeta discreta, sin bloquear nada, con «Instalar aquí» (el mismo
 * camino que «Este dispositivo» en el diálogo) y «Ahora no».
 *
 * Sin sondeos: sincroniza al montar, al recibir un aviso para esta neurona y, como mucho
 * cada 5 minutos, al volver a la pestaña. Montado una sola vez en AppGlobals.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mejorInstalable, tamanoLegible } from "@/lib/apps-oficiales/apps-oficiales";
import { useUltimaVersion } from "@/lib/apps-oficiales/ultima-version";
import { esAppNativa, useDispositivoActual } from "@/lib/apps-oficiales/dispositivo-actual";
import { thisDeviceId } from "@/lib/neurons/neurons";
import { pendientesPara, type DestinoInstalacion } from "@/lib/instalaciones/destinos";
import { alPedirInstalacion, marcarDestino, sincronizarInstalaciones, useInstalaciones } from "@/lib/instalaciones/instalaciones-store";
import { appPorId, planAceptarPedido, type AppParaInstalar } from "@/lib/instalaciones/plan";
import { ejecutarAcciones } from "@/lib/instalaciones/ejecutar";

export const RESINCRONIZAR_MS = 5 * 60_000;
const MAX_TARJETAS = 3;

export function InstalacionesPendientes() {
    const lista = useInstalaciones();
    const [yo, setYo] = useState("");

    useEffect(() => {
        const id = thisDeviceId();
        setYo(id);
        if (!id) return;
        let ultima = 0;
        const sincronizar = () => {
            ultima = Date.now();
            void sincronizarInstalaciones();
        };
        sincronizar();
        const off = alPedirInstalacion((ids) => {
            if (ids.includes(id)) sincronizar();
        });
        const alVolver = () => {
            if (document.visibilityState === "visible" && Date.now() - ultima > RESINCRONIZAR_MS) sincronizar();
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            off();
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    const pendientes = useMemo(() => (yo ? pendientesPara(yo, lista) : []), [yo, lista]);
    if (!pendientes.length) return null;

    const resto = pendientes.length - MAX_TARJETAS;
    return (
        <section
            aria-label="Instalaciones pedidas desde otras neuronas"
            className="pointer-events-none fixed bottom-24 right-3 z-[95] flex w-[min(92vw,22rem)] flex-col gap-2"
        >
            <p aria-live="polite" className="sr-only">
                {pendientes.length === 1 ? "Hay 1 instalación pedida para este dispositivo." : `Hay ${pendientes.length} instalaciones pedidas para este dispositivo.`}
            </p>
            {pendientes.slice(0, MAX_TARJETAS).map((d) => (
                <TarjetaPendiente key={d.id} destino={d} />
            ))}
            {resto > 0 && (
                <p className="pointer-events-auto rounded-xl bg-black/70 px-3 py-1.5 text-right text-[11px] text-white/70 backdrop-blur">
                    …y {resto} más esperando
                </p>
            )}
        </section>
    );
}

function TarjetaPendiente({ destino }: { destino: DestinoInstalacion }) {
    const app: AppParaInstalar = useMemo(
        () => appPorId(destino.appId) ?? { id: destino.appId, nombre: destino.appNombre },
        [destino.appId, destino.appNombre],
    );
    // La versión se pide al mostrar la tarjeta, no al pulsar: así la descarga sale dentro
    // del clic (los navegadores bloquean descargas y ventanas que llegan tarde).
    const version = useUltimaVersion(app.oficialId ?? "");
    const dispositivo = useDispositivoActual();
    const instalable = app.oficialId ? mejorInstalable(version.instalables, dispositivo) : null;
    const buscando = Boolean(app.oficialId) && version.cargando;
    const idTitulo = `pendiente-${destino.id}`;

    const aceptar = () => {
        const plan = planAceptarPedido(destino, instalable, {
            version: app.oficialId ? version.release?.tag : undefined,
            esNativa: esAppNativa(),
        });
        const res = ejecutarAcciones(app, plan.acciones);
        if (res.errores.length) {
            marcarDestino(destino.id, "fallida", plan.extra);
            toast.error(`No se pudo instalar ${app.nombre}`, { description: res.errores.join(" ") });
            return;
        }
        marcarDestino(destino.id, plan.estado, plan.extra);
        toast.success(res.descargaIniciada ? `Descargando ${app.nombre}` : `${app.nombre} en tu Lanzador`, {
            description: res.descargaIniciada
                ? "El instalador va a tu carpeta de Descargas; ábrelo desde ahí para terminar."
                : "Se abre desde el menú de apps de este dispositivo.",
        });
    };

    const detalle = buscando
        ? "Buscando la última versión…"
        : instalable
          ? `Se descargará el ${instalable.formato}${instalable.bytes ? ` (${tamanoLegible(instalable.bytes)})` : ""}.`
          : "Se añadirá a tu Lanzador y se usará su versión web.";

    return (
        <article
            aria-labelledby={idTitulo}
            className="pointer-events-auto rounded-2xl border border-cyan-400/30 bg-black/80 p-3 text-white shadow-2xl backdrop-blur-md"
        >
            <p id={idTitulo} className="text-sm font-semibold leading-snug">
                {destino.pedidaDesde || "Otra neurona de tu cuenta"} pidió instalar {destino.appNombre} aquí
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
                {detalle}
                {destino.perfilNombre ? ` Perfil: ${destino.perfilNombre}.` : ""}
            </p>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => marcarDestino(destino.id, "cancelada")}
                    className="h-8 gap-1.5 text-xs cursor-pointer"
                >
                    <X className="h-3.5 w-3.5" aria-hidden /> Ahora no
                </Button>
                <Button
                    type="button"
                    size="sm"
                    onClick={aceptar}
                    disabled={buscando}
                    className="h-8 gap-1.5 bg-cyan-600 text-xs font-semibold text-white hover:bg-cyan-500 cursor-pointer"
                >
                    <Download className="h-3.5 w-3.5" aria-hidden /> Instalar aquí
                </Button>
            </div>
        </article>
    );
}

export default InstalacionesPendientes;
