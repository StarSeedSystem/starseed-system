'use client';

// ════════════════════════════════════════════════════════════════
// LiveDataWidget — telemetría de ESTA neurona (Ola 0929 · paquete E)
// ----------------------------------------------------------------
// Antes pintaba cifras simuladas («SEEDS», «Karma Flux»…) que bailaban cada 3 s como
// si fueran datos vivos. Ahora son medidas REALES y locales, sin una sola petición:
//   · Red: en línea, tipo, bajada y latencia que da el navegador (o «sin dato»).
//   · Nube: lo que el guardián de consumo ya cuenta — peticiones de hoy frente al
//     presupuesto del dispositivo, las de esta pestaña, pausas y las rutas que más
//     piden (para ver a simple vista si algo se desboca).
//   · Dispositivo: núcleos, memoria, montón de JS (Chrome) y nivel de render.
// Un semáforo resume la salud; se refresca cada 5 s solo con el widget a la vista.
// Composición: micro = semáforo · s = semáforo + latencia + % del día · m = medidor
// del día + tres cifras · l = + curva de peticiones y rutas · xl = + dispositivo ·
// panorámico = fila de cifras · torre = columna.
// Estados: cargando (primera medida), vacío (sin peticiones aún: se dice), error (el
// navegador no da el dato: «sin dato», nunca un número inventado).
// ════════════════════════════════════════════════════════════════

import { Activity, Wifi, WifiOff, Cloud, Cpu, Gauge, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conAlfa } from '@/components/widgets-libres/acentos-categoria';
import { colorSalud } from '@/components/widgets-libres/familias/comun';
import { useLienzoE, px, type LienzoE } from './paquete-e/lienzo';
import { CargandoE, EncabezadoE, EnlaceE, RaizE, SelloE, estilosE } from './paquete-e/piezas';
import { nombreRuta, saludDe, useTelemetriaE, type Telemetria } from './paquete-e/telemetria';

const NUM = new Intl.NumberFormat('es-ES');
const num = (n: number) => (n >= 1000 ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : NUM.format(n));

function Semaforo({ color, lado, lienzo }: { color: string; lado: number; lienzo: LienzoE }) {
    return (
        <span aria-hidden className="relative grid shrink-0 place-items-center" style={{ width: lado, height: lado }}>
            {lienzo.animar && <span className={cn('absolute inset-0 rounded-full', estilosE.onda)} style={{ background: conAlfa(color, 0.35), ['--e-dur' as string]: '2.6s' } as React.CSSProperties} />}
            <span className="rounded-full" style={{ width: lado * 0.5, height: lado * 0.5, background: `radial-gradient(circle at 35% 30%, #fff, ${color} 55%)`, boxShadow: `0 0 ${lado * 0.3}px ${color}` }} />
        </span>
    );
}

/** Medidor semicircular del presupuesto de hoy (0 → presupuesto). */
function MedidorDia({ hoy, presupuesto, ancho, lienzo }: { hoy: number; presupuesto: number; ancho: number; lienzo: LienzoE }) {
    const pct = presupuesto > 0 ? Math.min(1, hoy / presupuesto) : 0;
    const r = ancho / 2 - 6, cx = ancho / 2, cy = ancho / 2;
    const arco = (f: number) => {
        const a = Math.PI * (1 - f);
        return `${cx + Math.cos(a) * r} ${cy - Math.sin(a) * r}`;
    };
    const color = pct >= 1 ? '#dc143c' : pct >= 0.7 ? '#ffbf00' : lienzo.acento;
    return (
        <svg width={ancho} height={ancho / 2 + 16} viewBox={`0 0 ${ancho} ${ancho / 2 + 16}`} role="img" aria-label={`Peticiones a la nube hoy: ${hoy} de ${presupuesto}`} className="block max-w-full">
            <path d={`M${arco(0)} A${r} ${r} 0 0 1 ${arco(1)}`} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={8} strokeLinecap="round" />
            {pct > 0 && <path d={`M${arco(0)} A${r} ${r} 0 0 1 ${arco(pct)}`} fill="none" stroke={color} strokeWidth={8} strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${conAlfa(color, 0.7)})`, transition: 'all 600ms ease' }} />}
            {/* Cifra y leyenda con aire entre ambas (antes la leyenda rozaba el «%»). */}
            <text x={cx} y={cy - 9} textAnchor="middle" fill="#fff" fontSize={Math.max(16, ancho * 0.15)} fontWeight={250}>{Math.round(pct * 100)} %</text>
            <text x={cx} y={cy + 13} textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize={10}>{num(hoy)} / {num(presupuesto)} hoy</text>
        </svg>
    );
}

function Curva({ serie, ancho, alto, color }: { serie: number[]; ancho: number; alto: number; color: string }) {
    if (serie.length < 2) return <div style={{ height: alto }} className="grid place-items-center text-[11px] text-white/45">Midiendo…</div>;
    const max = Math.max(1, ...serie);
    const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * ancho},${alto - 2 - (v / max) * (alto - 4)}`);
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Peticiones de esta pestaña cada 5 s; máximo ${max}`} className="block max-w-full">
            <polygon points={`0,${alto} ${pts.join(' ')} ${ancho},${alto}`} fill={conAlfa(color, 0.15)} />
            <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
        </svg>
    );
}

function Cifra({ etiqueta, valor, unidad, lienzo, icono: Icono }: { etiqueta: string; valor: string; unidad?: string; lienzo: LienzoE; icono: typeof Wifi }) {
    return (
        <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50"><Icono aria-hidden className="size-3" />{etiqueta}</span>
            <span className="truncate tabular-nums text-white" style={{ fontSize: px(lienzo, 18), fontWeight: 300 }}>{valor}{unidad && valor !== 'sin dato' && <span className="ml-0.5 text-[11px] text-white/50">{unidad}</span>}</span>
        </div>
    );
}

export function LiveDataWidget() {
    const { ref, lienzo } = useLienzoE();
    const t: Telemetria | null = useTelemetriaE(lienzo.visible);
    const { base, clase, horizontal } = lienzo;
    const raizBase = { lienzo, refRaiz: ref, tipo: 'LIVE_DATA' } as const;

    if (!t) return <RaizE {...raizBase} etiqueta="Telemetría de esta neurona"><CargandoE etiqueta="Midiendo esta neurona…" filas={2} /></RaizE>;

    const salud = saludDe(t.red, t.nube);
    const color = colorSalud(salud.nivel);
    const lat = t.red.latenciaMs !== null ? String(t.red.latenciaMs) : 'sin dato';
    const baj = t.red.bajadaMbps !== null ? String(t.red.bajadaMbps).replace('.', ',') : 'sin dato';
    const pct = t.nube.presupuesto > 0 ? Math.round((t.nube.hoy / t.nube.presupuesto) * 100) : 0;
    const raiz = { ...raizBase, etiqueta: `Telemetría de esta neurona: ${salud.texto}. ${t.red.enLinea ? 'En línea' : 'Sin conexión'}, ${t.nube.hoy} peticiones a la nube hoy.` };
    const IconoRed = t.red.enLinea ? Wifi : WifiOff;

    if (base === 'micro') {
        return <RaizE {...raiz}><div className="m-auto flex flex-col items-center gap-1" title={salud.texto}><Semaforo color={color} lado={44} lienzo={lienzo} /><span className="text-[10px] text-white/70">{t.red.enLinea ? 'en línea' : 'sin red'}</span></div></RaizE>;
    }

    if (base === 's') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
                    <Semaforo color={color} lado={48} lienzo={lienzo} />
                    <span className="line-clamp-2 text-[12px] font-medium text-white/85">{salud.texto}</span>
                    <span className="text-[11px] tabular-nums text-white/55">{lat !== 'sin dato' ? `${lat} ms · ` : ''}{pct} % de hoy</span>
                </div>
            </RaizE>
        );
    }

    const cabecera = (
        <EncabezadoE lienzo={lienzo} icono={Activity} titulo="Esta neurona" vivo
            detalle={<span className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />{salud.texto}</span>}
            acciones={<EnlaceE lienzo={lienzo} href="/servidores" compacto variante="fantasma" icono={ArrowUpRight}>Servidores</EnlaceE>} />
    );
    const cifras = (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))' }}>
            <Cifra etiqueta="Latencia" valor={lat} unidad="ms" lienzo={lienzo} icono={IconoRed} />
            <Cifra etiqueta="Bajada" valor={baj} unidad="Mbps" lienzo={lienzo} icono={Gauge} />
            <Cifra etiqueta="Pestaña" valor={num(t.nube.pestana)} unidad="pet." lienzo={lienzo} icono={Cloud} />
            {(base === 'xl' || horizontal) && <Cifra etiqueta="Memoria JS" valor={t.disp.montonMB !== null ? String(t.disp.montonMB) : 'sin dato'} unidad="MB" lienzo={lienzo} icono={Cpu} />}
        </div>
    );
    const rutas = (
        <section aria-label="Rutas que más piden" className="flex min-h-0 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Lo que más pide</span>
            {t.nube.rutas.length === 0 ? <p className="text-[12px] text-white/50">Vacío: esta pestaña aún no ha pedido nada a la nube.</p> : (
                <ul className="flex flex-col gap-1">
                    {t.nube.rutas.slice(0, base === 'xl' ? 5 : 3).map((r) => {
                        const max = t.nube.rutas[0]?.n || 1;
                        return (
                            <li key={r.ruta} className="flex min-w-0 items-center gap-2" title={r.ruta}>
                                <span className="w-28 shrink-0 truncate text-[11px] text-white/75">{nombreRuta(r.ruta)}</span>
                                <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${(r.n / max) * 100}%`, background: `linear-gradient(90deg, ${lienzo.acento}, ${lienzo.acento2})` }} /></span>
                                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/60">{num(r.n)}</span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
    const pausas = (t.nube.bloqueadas > 0 || t.nube.frenos > 0) ? <SelloE color="#ffbf00" title="Respuestas servidas sin tocar la red por el guardián de consumo">{t.nube.bloqueadas} en pausa · {t.nube.frenos} frenos</SelloE> : null;

    if (horizontal) {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 items-center gap-4 px-1">
                    <Semaforo color={color} lado={Math.min(56, (lienzo.alto || 100) - 20)} lienzo={lienzo} />
                    <div className="w-40 shrink-0"><MedidorDia hoy={t.nube.hoy} presupuesto={t.nube.presupuesto} ancho={150} lienzo={lienzo} /></div>
                    <div className="min-w-0 flex-1">{cifras}</div>
                </div>
            </RaizE>
        );
    }

    const anchoMedidor = Math.max(120, Math.min(220, (lienzo.ancho || 240) * (base === 'm' ? 0.7 : 0.45)));
    if (base === 'm' && clase !== 'torre') {
        return (
            <RaizE {...raiz}>
                <div className="flex h-full min-h-0 flex-col gap-2 p-1">
                    {cabecera}
                    <div className="flex justify-center"><MedidorDia hoy={t.nube.hoy} presupuesto={t.nube.presupuesto} ancho={anchoMedidor} lienzo={lienzo} /></div>
                    {cifras}
                </div>
            </RaizE>
        );
    }

    const anchoCurva = Math.max(140, (lienzo.ancho || 320) - (base === 'xl' ? 260 : 24));
    return (
        <RaizE {...raiz}>
            <div className={cn('flex h-full min-h-0 flex-col gap-2.5 p-1', estilosE.desliza)}>
                {cabecera}
                <div className={cn('flex min-w-0 gap-4', base === 'xl' ? 'items-start' : 'flex-col')}>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                        <MedidorDia hoy={t.nube.hoy} presupuesto={t.nube.presupuesto} ancho={anchoMedidor} lienzo={lienzo} />
                        {pausas}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                        {cifras}
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Peticiones de esta pestaña · cada 5 s</span>
                            <Curva serie={t.serie} ancho={anchoCurva} alto={base === 'xl' ? 64 : 44} color={lienzo.acento} />
                        </div>
                    </div>
                </div>
                {rutas}
                {base === 'xl' && (
                    <p className="text-[11px] text-white/50">
                        {t.disp.nucleos ?? '—'} núcleos · {t.disp.memoriaGB !== null ? `${t.disp.memoriaGB} GB` : 'memoria sin dato'} · render {lienzo.nivel}{t.red.tipo ? ` · red ${t.red.tipo}` : ''}{t.red.ahorro ? ' · ahorro de datos' : ''}
                    </p>
                )}
            </div>
        </RaizE>
    );
}
