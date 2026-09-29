'use client';

// ════════════════════════════════════════════════════════════════
// AiGeneratedWidget — lo que forjaste con IA (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Muestra el widget que La Fragua generó para ti (settings.customHtml), SIEMPRE aislado en un
// iframe con sandbox="allow-scripts" y sin allow-same-origin: su código corre, pero no ve tu
// sesión, tus cookies ni el resto del OS. Alrededor, lo útil: recargarlo, ver qué pediste para
// crearlo (settings.forgePrompt) y forjar otro — el botón abre la Fragua global
// ('starseed:open-forge'), que funciona en cualquier pantalla del OS.
// Sin nada forjado todavía, invita a crear uno y explica en tres pasos cómo.
// Composición: micro = emblema (lleno) o varita (vacío) · s = el widget a pantalla completa ·
// m = + barra al pasar o enfocar · l/xl = cabecera con acciones y panel de detalles ·
// panorámico = widget + detalles al lado · torre = columna.
// Estados: cargando (el iframe prepara el widget), vacío (nada forjado aún: invitación),
// error (no se pudo preparar el documento aislado: se dice y se ofrece forjarlo de nuevo).
// ════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { Sparkles, Pencil, Wand2, Code2, Image as ImageIcon, Music, RotateCw, Info, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { buildSandboxDoc } from '@/lib/creation/post-blocks';
import type { DashboardWidget, AiWidgetSettings } from '../dashboard-types';
import { useLienzoE, px, type LienzoE } from './paquete-e/lienzo';
import { BotonE, EncabezadoE, EnlaceE, ErrorE, RaizE, estilosE } from './paquete-e/piezas';

const TIPOS = [
    { icono: Code2, nombre: 'Código vivo', detalle: 'Herramientas interactivas hechas a tu medida', color: '#38bdf8' },
    { icono: ImageIcon, nombre: 'Visualización', detalle: 'Gráficos, paneles y mapas', color: '#a855f7' },
    { icono: Music, nombre: 'Audiomórfico', detalle: 'Interfaces que responden al sonido', color: '#10b981' },
];
const PASOS = ['Describe lo que quieres ver', 'La IA lo genera en La Fragua', 'Aparece aquí, aislado y seguro'];

interface AiGeneratedWidgetProps {
    widget: DashboardWidget;
    onEditRequest?: (widget: DashboardWidget) => void;
}

function abrirFragua() {
    window.dispatchEvent(new CustomEvent('starseed:open-forge'));
}

const limitar = (v: unknown, min: number, max: number, def: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def);

function prepararDoc(html: string): { doc: string | null; error: boolean } {
    if (!html) return { doc: null, error: false };
    try { return { doc: buildSandboxDoc({ code: html, language: 'html' }), error: false }; }
    catch { return { doc: null, error: true }; }
}

/** Varita dentro de un halo del color del widget (vacío y micro). */
function Varita({ lado, color, lienzo }: { lado: number; color: string; lienzo: LienzoE }) {
    return (
        <span aria-hidden className="relative grid place-items-center rounded-full" style={{ width: lado, height: lado, background: `radial-gradient(circle, ${conAlfa(color, 0.3)}, ${conAlfa(color, 0.05)} 65%, transparent 72%)` }}>
            <span className={cn('absolute inset-[12%] rounded-full border', lienzo.animar && 'ss-girar')} style={{ borderColor: conAlfa(color, 0.4), borderStyle: 'dashed', ['--ss-dur' as string]: '24s' } as React.CSSProperties} />
            <Wand2 style={{ color, width: lado * 0.36, height: lado * 0.36, filter: `drop-shadow(0 0 8px ${conAlfa(color, 0.8)})` }} />
        </span>
    );
}

export function AiGeneratedWidget({ widget, onEditRequest }: AiGeneratedWidgetProps) {
    const ajustes = (widget.settings ?? {}) as Partial<AiWidgetSettings>;
    const color = /^#[0-9a-f]{6}$/i.test(ajustes.ontology?.themeColor ?? '') ? (ajustes.ontology?.themeColor as string) : '#8b5cf6';
    const titulo = ajustes.ontology?.title?.trim() || 'Widget IA';
    const descripcion = ajustes.ontology?.description?.trim() || '';
    const peticion = ajustes.forgePrompt?.trim() || '';
    const { ref, lienzo } = useLienzoE({ acento: color });
    const { base, clase, horizontal } = lienzo;
    const { doc, error } = useMemo(() => prepararDoc(ajustes.customHtml ?? ''), [ajustes.customHtml]);
    const [version, setVersion] = useState(0);
    const [cargado, setCargado] = useState(false);
    const [detalles, setDetalles] = useState(false);

    const cfg = ajustes.widgetConfig;
    const escala = limitar(cfg?.scale, 0.85, 1.05, 1);
    const giroX = limitar(cfg?.rotateX, -15, 15, 0);
    const giroY = limitar(cfg?.rotateY, -15, 15, 0);
    const brillo = limitar(cfg?.glowIntensity, 0, 40, 16);

    const estado = error ? 'no se pudo preparar' : doc ? (cargado ? 'listo' : 'cargando') : 'nada forjado aún';
    const raiz = { lienzo, refRaiz: ref, etiqueta: `${titulo}: ${estado}`, tipo: 'AI_GENERATED' } as const;
    const editar = onEditRequest ? () => onEditRequest(widget) : abrirFragua;
    const recargar = () => { setCargado(false); setVersion((v) => v + 1); };

    // ── Vacío: invitación a forjar ─────────────────────────────────
    if (!doc && !error) {
        const cta = <BotonE lienzo={lienzo} variante="primario" icono={Sparkles} onClick={abrirFragua}>Abrir La Fragua</BotonE>;
        if (base === 'micro') {
            return (
                <RaizE {...raiz}>
                    <button type="button" onClick={abrirFragua} aria-label="Forjar un widget con IA" title="Forjar un widget con IA" className="ss-redondo m-auto cursor-pointer rounded-full outline-none transition-transform duration-200 hover:scale-105 focus-visible:ring-2" style={{ ['--tw-ring-color' as string]: color } as React.CSSProperties}>
                        <Varita lado={Math.max(48, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.85)} color={color} lienzo={lienzo} />
                    </button>
                </RaizE>
            );
        }
        const tipos = (
            <ul className="flex w-full max-w-72 flex-col gap-1.5">
                {TIPOS.map((k) => (
                    <li key={k.nombre} className="flex items-center gap-2.5 rounded-2xl px-2.5 py-1.5" style={{ background: conAlfa(k.color, 0.08), boxShadow: `inset 0 0 0 1px ${conAlfa(k.color, 0.25)}` }}>
                        <k.icono aria-hidden className="size-4 shrink-0" style={{ color: k.color }} />
                        <span className="min-w-0">
                            <span className="block text-[12px] font-semibold" style={{ color: k.color }}>{k.nombre}</span>
                            <span className="block truncate text-[11px] text-white/55">{k.detalle}</span>
                        </span>
                    </li>
                ))}
            </ul>
        );
        const pasos = (
            <ol className="flex w-full max-w-72 flex-col gap-1">
                {PASOS.map((p, i) => (
                    <li key={p} className="flex items-center gap-2 text-[12px] text-white/70">
                        <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: conAlfa(color, 0.35) }}>{i + 1}</span>{p}
                    </li>
                ))}
            </ol>
        );
        const texto = <p className="max-w-[30ch] text-center text-[12px] leading-snug text-white/60">Aún no has forjado nada aquí. Describe un widget y la IA lo crea para ti.</p>;
        if (base === 's') {
            return (
                <RaizE {...raiz}>
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <button type="button" onClick={abrirFragua} aria-label="Forjar un widget con IA" className="ss-redondo cursor-pointer rounded-full outline-none focus-visible:ring-2" style={{ ['--tw-ring-color' as string]: color } as React.CSSProperties}>
                            <Varita lado={Math.max(56, Math.min(88, (lienzo.alto || 150) * 0.5))} color={color} lienzo={lienzo} />
                        </button>
                        <p className="text-[12px] font-semibold text-white/80">Forja un widget con IA</p>
                    </div>
                </RaizE>
            );
        }
        if (horizontal) {
            return (
                <RaizE {...raiz}>
                    <div className="flex h-full min-h-0 items-center gap-4 px-2">
                        <Varita lado={Math.max(56, Math.min(96, (lienzo.alto || 110) - 16))} color={color} lienzo={lienzo} />
                        <div className="flex min-w-0 flex-1 flex-col items-start gap-2">{texto}<div className="flex flex-wrap gap-1.5">{cta}<EnlaceE lienzo={lienzo} href="/crear?area=fragua" variante="fantasma">Centro de creación</EnlaceE></div></div>
                        <div className="hidden min-w-0 flex-1 md:block">{pasos}</div>
                    </div>
                </RaizE>
            );
        }
        const grande = base === 'l' || base === 'xl' || clase === 'torre';
        return (
            <RaizE {...raiz}>
                <div className={cn('flex h-full min-h-0 flex-col items-center justify-center gap-3 overflow-y-auto p-1', estilosE.entra)}>
                    {grande && <EncabezadoE lienzo={lienzo} icono={Wand2} titulo="La Fragua IA" className="w-full" />}
                    <Varita lado={grande ? 96 : 72} color={color} lienzo={lienzo} />
                    {texto}
                    {grande ? pasos : null}
                    {tipos}
                    <div className="flex flex-wrap items-center justify-center gap-1.5">{cta}{grande && <EnlaceE lienzo={lienzo} href="/crear?area=fragua" variante="fantasma">Centro de creación</EnlaceE>}</div>
                </div>
            </RaizE>
        );
    }

    // ── Error: el documento aislado no se pudo preparar ──────────────
    if (error || !doc) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-2">
                    <ErrorE lienzo={lienzo} texto={`No se pudo preparar «${titulo}».`} onReintentar={recargar} />
                    {base !== 'micro' && <BotonE lienzo={lienzo} variante="suave" compacto icono={Sparkles} onClick={abrirFragua}>Forjar de nuevo</BotonE>}
                </div>
            </RaizE>
        );
    }

    // ── Lleno: el widget forjado, aislado ────────────────────────────
    if (base === 'micro') {
        return (
            <RaizE {...raiz}>
                <div className="m-auto flex flex-col items-center gap-1" title={`${titulo}: agrándalo para verlo`}>
                    <Varita lado={Math.max(40, Math.min(lienzo.ancho || 80, lienzo.alto || 80) * 0.62)} color={color} lienzo={lienzo} />
                    <span className="max-w-full truncate text-[10px] font-semibold text-white/75">{titulo}</span>
                </div>
            </RaizE>
        );
    }

    const marco = (
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl" style={{
            transform: escala !== 1 || giroX || giroY ? `perspective(1200px) scale(${escala}) rotateX(${giroX}deg) rotateY(${giroY}deg)` : undefined,
            filter: lienzo.nivel === 'ligero' || !brillo ? undefined : `drop-shadow(0 0 ${Math.round(brillo * 0.6)}px ${conAlfa(color, 0.35)})`,
            transition: 'transform 250ms ease, filter 250ms ease',
        }}>
            <iframe
                key={version}
                title={titulo}
                sandbox="allow-scripts"
                referrerPolicy="no-referrer"
                srcDoc={doc}
                loading="lazy"
                onLoad={() => setCargado(true)}
                className="block h-full w-full bg-transparent"
                style={{ minHeight: base === 's' ? 80 : 140 }}
            />
            {!cargado && <div aria-hidden className={cn('pointer-events-none absolute inset-0 rounded-2xl', estilosE.brillo)} />}
            {!cargado && <span className="sr-only" role="status">Cargando {titulo}…</span>}
        </div>
    );
    const acciones = (compacto: boolean) => (
        <>
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={RotateCw} etiqueta={compacto ? 'Recargar el widget' : undefined} onClick={recargar} aria-label="Recargar el widget" title="Recargar el widget">{compacto ? undefined : 'Recargar'}</BotonE>
            <BotonE lienzo={lienzo} variante="fantasma" compacto icono={Info} aria-pressed={detalles} etiqueta={compacto ? 'Detalles' : undefined} onClick={() => setDetalles((d) => !d)} aria-label="Detalles" title="Detalles">{compacto ? undefined : 'Detalles'}</BotonE>
            <BotonE lienzo={lienzo} variante="suave" compacto icono={onEditRequest ? Pencil : Sparkles} etiqueta={compacto ? (onEditRequest ? 'Editar con IA' : 'Forjar otro') : undefined} onClick={editar} aria-label={onEditRequest ? 'Editar con IA' : 'Forjar otro'} title={onEditRequest ? 'Editar con IA' : 'Forjar otro widget'}>{compacto ? undefined : onEditRequest ? 'Editar' : 'Forjar otro'}</BotonE>
        </>
    );
    const panelDetalles = (
        <section aria-label={`Detalles de ${titulo}`} className={cn('flex flex-col gap-2 rounded-2xl p-3 text-[12px]', estilosE.entra)} style={{ background: 'rgba(255,255,255,.04)', boxShadow: `inset 0 0 0 1px ${conAlfa(color, 0.25)}` }}>
            <p className="font-semibold text-white/90" style={{ fontSize: px(lienzo, 13) }}>{titulo}</p>
            {descripcion && <p className="text-white/65">{descripcion}</p>}
            <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">Lo que pediste</p>
                <p className="mt-0.5 whitespace-pre-wrap text-white/75">{peticion || 'No se guardó la petición con la que se forjó.'}</p>
            </div>
            <p className="inline-flex items-start gap-1.5 text-[11px] text-emerald-200/80"><ShieldCheck aria-hidden className="mt-px size-3.5 shrink-0" /> Corre aislado: sin acceso a tu sesión, tus cookies ni el resto del OS.</p>
        </section>
    );

    if (base === 's') return <RaizE {...raiz}><div className="flex h-full min-h-0 flex-col">{marco}</div></RaizE>;

    if (base === 'm' && !horizontal && clase !== 'torre') {
        return (
            <RaizE {...raiz}>
                <div className="group relative flex h-full min-h-0 flex-col">
                    {marco}
                    <div className="pointer-events-none absolute inset-x-1 top-1 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100">
                        <span className="min-w-0 truncate rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: conAlfa('#05060f', 0.75), color }}>{titulo}</span>
                        <span className="flex-1" />
                        <span className="flex items-center gap-1 rounded-full p-0.5" style={{ background: conAlfa('#05060f', 0.75) }}>{acciones(true)}</span>
                    </div>
                    {detalles && <div className="absolute inset-x-1 bottom-1 max-h-[70%] overflow-y-auto">{panelDetalles}</div>}
                </div>
            </RaizE>
        );
    }

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 gap-3">
                    <div className="flex min-h-0 min-w-0 flex-[2] flex-col">{marco}</div>
                    <div className="flex min-h-0 w-56 shrink-0 flex-col gap-2 overflow-y-auto">
                        <EncabezadoE lienzo={lienzo} icono={Sparkles} titulo={titulo} />
                        <div className="flex flex-wrap gap-1">{acciones(false)}</div>
                        {detalles && panelDetalles}
                    </div>
                </div>
            </RaizE>
        );
    }

    return (
        <RaizE {...raiz}>
            <div className="flex h-full min-h-0 flex-col gap-2">
                <EncabezadoE lienzo={lienzo} icono={Sparkles} titulo={titulo} detalle={base === 'xl' && descripcion ? descripcion : undefined} acciones={acciones(clase === 'torre')} />
                <div className={cn('flex min-h-0 flex-1 gap-3', base === 'xl' ? 'flex-row' : 'flex-col')}>
                    {marco}
                    {detalles && <div className={cn('min-h-0 overflow-y-auto', base === 'xl' ? 'w-72 shrink-0' : 'max-h-[45%] shrink-0')}>{panelDetalles}</div>}
                </div>
            </div>
        </RaizE>
    );
}

export default AiGeneratedWidget;
