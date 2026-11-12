"use client";

/**
 * Accesos (PRB1111V): el enlace de instalación de cada plataforma de la prueba en marcha y de la última publicada,
 * directo del prerelease `canal-pruebas`, con su QR (el mismo `qrcode` que ya usa el OS para vincular sin internet) y una
 * línea sobre actualizar desde dentro de la app.
 */

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { URL_PAGINA_PRUEBAS } from "@/lib/mando/pruebas-vivas";

import { Seccion, usePruebas } from "./pruebas-contexto";

function CodigoQr({ url }: { url: string }) {
    const [src, setSrc] = useState<string | null>(null);
    const [fallo, setFallo] = useState(false);
    useEffect(() => {
        let vivo = true;
        import(/* @vite-ignore */ "qrcode")
            .then((m) => (m.default ?? m).toDataURL(url, { margin: 1, width: 220 }))
            .then((u: string) => vivo && setSrc(u))
            .catch(() => vivo && setFallo(true));
        return () => {
            vivo = false;
        };
    }, [url]);
    if (fallo) return <p className="text-[11px] text-amber-200/80">No se pudo dibujar el QR: usa el enlace.</p>;
    if (!src) return <p className="text-[11px] text-white/45">Dibujando el QR…</p>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="Código QR del instalador" className="h-auto w-44 max-w-full rounded-lg bg-white" />;
}

function tamano(b: number | null): string {
    return b === null ? "" : b > 1e6 ? ` · ${(b / 1e6).toFixed(1)} MB` : ` · ${Math.max(1, Math.round(b / 1e3))} kB`;
}

export function AccesosDePrueba() {
    const c = usePruebas();
    const [qr, setQr] = useState<string | null>(null);
    if (!c) return null;
    const { accesos, prereleaseLeido } = c.datos;
    return (
        <Seccion titulo="Accesos para instalar" id="accesos">
            {!prereleaseLeido ? (
                <p className="break-words text-xs text-amber-200/90" data-testid="sin-prerelease">
                    No pude leer los archivos del prerelease de GitHub: no sé qué instaladores hay ahora. La página del canal es{" "}
                    <a href={URL_PAGINA_PRUEBAS} target="_blank" rel="noreferrer" className="cursor-pointer text-sky-300 hover:underline">canal-pruebas</a>.
                </p>
            ) : accesos.length === 0 ? (
                <p className="break-words text-xs text-white/55">No hay ninguna prueba en marcha ni publicada de la que dar el instalador.</p>
            ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {accesos.map((a) => (
                        <div key={a.version} className="min-w-0 space-y-1.5 rounded-lg border border-white/10 bg-black/25 p-2 text-xs" data-testid={`acceso-${a.numero}`}>
                            <p className="font-mono font-semibold text-white/90">
                                {a.version} <span className="font-sans text-[11px] font-normal text-white/50">· {a.rol === "en-marcha" ? "en marcha" : "última publicada"}</span>
                            </p>
                            {a.enlaces.length ? (
                                <ul className="space-y-1">
                                    {a.enlaces.map((e) => (
                                        <li key={e.url} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className="min-w-[4.5rem] font-medium text-white/80">{e.titulo}</span>
                                            <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 cursor-pointer items-center gap-1 break-all text-sky-300 hover:underline">
                                                <Download className="h-3 w-3 shrink-0" aria-hidden />
                                                {e.nombre}
                                                {tamano(e.bytes)}
                                            </a>
                                            <button type="button" className="cursor-pointer rounded border border-white/15 px-1.5 py-0.5 text-[11px] text-white/70 hover:bg-white/10" onClick={() => setQr(qr === e.url ? null : e.url)} aria-expanded={qr === e.url}>
                                                QR
                                            </button>
                                            {qr === e.url ? <div className="basis-full"><CodigoQr url={e.url} /></div> : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="break-words text-white/55">El prerelease aún no tiene ningún instalador con esta versión en el nombre.</p>
                            )}
                            {a.sinArchivo.length && a.enlaces.length ? <p className="break-words text-white/45">Aún sin archivo en el prerelease: {a.sinArchivo.map((p) => ({ macos: "macOS", windows: "Windows", linux: "Linux", android: "Android" })[p]).join(", ")}.</p> : null}
                        </div>
                    ))}
                </div>
            )}
            <p className="break-words text-xs text-white/55">
                Una app de pruebas que ya tienes instalada se actualiza sola desde dentro, con el mismo canal; solo hace falta descargar el instalador la primera vez o si la app no abre.
            </p>
        </Seccion>
    );
}
