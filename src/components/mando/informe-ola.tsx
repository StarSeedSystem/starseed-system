"use client";

/**
 * Informe de cierre de ola (Ola 231 · Centro de Mando)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pinta EXACTAMENTE el mismo markdown del informe de cierre que genera
 * `starseed-informe-ola` (`starseed_memory_root/relevo/informe-<cola>.md`) — el
 * mensaje que Alex lee también en Cowork y en Hermes — y que además se publica
 * en el bus como evento de tipo `informe`.
 *
 * Usa `react-markdown` (ya está en el catálogo del repo, sin plugin nuevo) con
 * un mapeo de componentes al estilo «Crystal Liquid Glass» del OS. Botón
 * «Copiar» para llevarse el markdown íntegro al portapapeles.
 */

import { useCallback, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Check, Copy, FileText } from "lucide-react";

import type { InformeOla } from "@/lib/mando/tipos";

/** Mapeo de nodos markdown al estilo visual del OS. */
const COMPONENTES: Components = {
    h1: ({ children }) => (
        <h1 className="mb-3 mt-1 text-lg font-semibold text-white">{children}</h1>
    ),
    h2: ({ children }) => (
        <h2 className="mb-2 mt-4 text-base font-semibold text-white">{children}</h2>
    ),
    h3: ({ children }) => (
        <h3 className="mb-2 mt-3 text-sm font-semibold text-white/90">{children}</h3>
    ),
    p: ({ children }) => (
        <p className="mb-2 text-sm leading-relaxed text-white/80">{children}</p>
    ),
    ul: ({ children }) => (
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm text-white/80">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm text-white/80">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    strong: ({ children }) => (
        <strong className="font-semibold text-white">{children}</strong>
    ),
    code: ({ className, children }) => {
        const esBloque = /language-/.test(className ?? "");
        if (esBloque) {
            return <code className="font-mono text-xs text-emerald-200">{children}</code>;
        }
        return (
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-emerald-200">
                {children}
            </code>
        );
    },
    pre: ({ children }) => (
        <pre className="mb-3 overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3">
            {children}
        </pre>
    ),
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="cursor-pointer text-sky-300 underline decoration-sky-300/40 underline-offset-2 hover:text-sky-200"
        >
            {children}
        </a>
    ),
    hr: () => <hr className="my-4 border-white/10" />,
    blockquote: ({ children }) => (
        <blockquote className="mb-2 border-l-2 border-white/20 pl-3 text-sm italic text-white/60">
            {children}
        </blockquote>
    ),
};

/**
 * Renderiza el informe de cierre de una ola con su botón «Copiar».
 */
export function InformeOla({ informe }: { informe: InformeOla }) {
    const [copiado, setCopiado] = useState(false);

    const copiar = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(informe.markdown);
            setCopiado(true);
            window.setTimeout(() => setCopiado(false), 2000);
        } catch {
            setCopiado(false);
        }
    }, [informe.markdown]);

    return (
        <article className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
            <header className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-white/60" />
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-white">
                            {informe.titulo}
                        </h3>
                        {informe.fecha && (
                            <p className="text-[11px] text-white/50">{informe.fecha}</p>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => void copiar()}
                    className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-white/70 transition-colors hover:bg-white/10"
                >
                    {copiado ? (
                        <>
                            <Check className="h-3.5 w-3.5 text-emerald-300" />
                            Copiado
                        </>
                    ) : (
                        <>
                            <Copy className="h-3.5 w-3.5" />
                            Copiar
                        </>
                    )}
                </button>
            </header>

            <div>
                <ReactMarkdown components={COMPONENTES}>{informe.markdown}</ReactMarkdown>
            </div>
        </article>
    );
}
