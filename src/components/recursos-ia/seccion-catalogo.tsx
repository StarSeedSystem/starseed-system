"use client";

/**
 * «Catálogo de modelos» (con su mejor encaje en tus neuronas) y «Almacenes declarados»
 * (un disco externo o un servidor de almacenamiento que la detección no ve sola).
 */

import { useMemo, useState } from "react";
import { ExternalLink, Gauge, Plus, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { BTN as BTN_SUAVE, BTN_DANGER, BTN_PRIMARY, Empty, Field, INPUT, LABEL, MONO, PILL, PILL_OFF, PILL_ON, SELECT, SUB } from "@/components/astraura/s158/shared";
import { cn } from "@/lib/utils";
import {
    CAPACIDADES,
    NOMBRE_CAPACIDAD,
    ORDEN_NIVEL,
    VIAS,
    type Capacidad,
    type InventarioRecursos,
    type MedioAlmacen,
    type MedioApp,
    type Procesador,
    type RequisitosModelo,
    type TipoAlmacen,
    type TipoDisco,
    type Via,
} from "@/lib/recursos-ia/tipos";
import { ListaMotivos } from "./seccion-capacidades";
import {
    BitsBadge,
    FOCO,
    ICONO_ALMACEN,
    Linea,
    NOMBRE_TIPO_ALMACEN,
    NivelBadge,
    fmtGb,
    fmtLibre,
    fmtNum,
    mejorEncaje,
    nombreNeurona,
    nombreVia,
    requisitosLegibles,
    tamanoConocido,
    type Encaje,
} from "./piezas";

const POR_PAGINA = 12;

const NOMBRE_MEDIO: Record<MedioApp, string> = { web: "web", pwa: "app instalada", nativo: "app nativa", servidor: "servidor" };

/* ── Catálogo ──────────────────────────────────────────────────────────────── */

export function SeccionCatalogo({
    catalogo,
    inv,
    procesadores,
    almacenes,
    tamanos,
    privado,
}: {
    catalogo: RequisitosModelo[];
    inv: InventarioRecursos;
    procesadores: Procesador[];
    almacenes: MedioAlmacen[];
    tamanos: Record<string, number>;
    privado: boolean;
}) {
    const [capacidad, setCapacidad] = useState<Capacidad | "">("");
    const [solo158, setSolo158] = useState(false);
    const [corre, setCorre] = useState(false);
    const [cuantos, setCuantos] = useState(POR_PAGINA);

    const encajes = useMemo(() => {
        const m = new Map<string, Encaje | null>();
        for (const mod of catalogo) m.set(mod.id, mejorEncaje(mod, procesadores, almacenes, { privado, tamanoConfirmadoGb: tamanos[mod.id] }));
        return m;
    }, [catalogo, procesadores, almacenes, privado, tamanos]);

    const lista = catalogo.filter((m) => {
        if (capacidad && !m.capacidades.includes(capacidad)) return false;
        if (solo158 && m.bits !== 1.58) return false;
        if (corre) {
            const e = encajes.get(m.id);
            if (!e || ORDEN_NIVEL[e.compat.nivel] > ORDEN_NIVEL.preguntar) return false;
        }
        return true;
    });

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <Field label="Capacidad" className="sm:w-56">
                    <select aria-label="Filtrar por capacidad" className={SELECT} value={capacidad} onChange={(e) => setCapacidad(e.target.value as Capacidad | "")}>
                        <option value="">Todas</option>
                        {CAPACIDADES.map((c) => (
                            <option key={c} value={c}>
                                {NOMBRE_CAPACIDAD[c]}
                            </option>
                        ))}
                    </select>
                </Field>
                <button type="button" aria-pressed={solo158} className={cn(PILL, solo158 ? PILL_ON : PILL_OFF, FOCO)} onClick={() => setSolo158((v) => !v)}>
                    Solo 1.58-bit
                </button>
                <button type="button" aria-pressed={corre} className={cn(PILL, corre ? PILL_ON : PILL_OFF, FOCO)} onClick={() => setCorre((v) => !v)}>
                    Corre en alguna de mis neuronas
                </button>
                <span className={cn(MONO, "sm:ml-auto")}>{lista.length} modelos</span>
            </div>
            {lista.length === 0 ? (
                <Empty text={catalogo.length ? "Ningún modelo cumple estos filtros." : "El catálogo aún está vacío en esta neurona."} />
            ) : (
                <>
                    <ul className="grid gap-2 lg:grid-cols-2" aria-label="Catálogo de modelos">
                        {lista.slice(0, cuantos).map((m) => (
                            <TarjetaModelo key={m.id} m={m} inv={inv} encaje={encajes.get(m.id) ?? null} tamanos={tamanos} />
                        ))}
                    </ul>
                    {lista.length > cuantos && (
                        <button type="button" className={cn(BTN_SUAVE, "self-center")} onClick={() => setCuantos((n) => n + POR_PAGINA)}>
                            Mostrar {Math.min(POR_PAGINA, lista.length - cuantos)} más de {lista.length - cuantos}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

function TarjetaModelo({ m, inv, encaje, tamanos }: { m: RequisitosModelo; inv: InventarioRecursos; encaje: Encaje | null; tamanos: Record<string, number> }) {
    const tam = tamanoConocido(m, tamanos);
    const streaming = m.almacenamiento.modo === "streaming-ssd";
    return (
        <li data-modelo={m.id} className={cn(SUB, "flex min-w-0 flex-col gap-2 p-3", m.bits === 1.58 && "border-[#39FF14]/25")}>
            <div className="flex min-w-0 items-start gap-2">
                <div className="min-w-0 flex-1">
                    <Linea className="text-[12px] font-semibold text-white/90">{m.nombre}</Linea>
                    <Linea className="text-[10px] text-white/50">
                        {[
                            m.familia,
                            m.parametrosB > 0 ? `${fmtNum(m.parametrosB)} B parámetros${typeof m.activosB === "number" ? ` (${fmtNum(m.activosB)} B activos)` : ""}` : null,
                            m.formato,
                            m.runtime,
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </Linea>
                </div>
                <BitsBadge bits={m.bits} />
            </div>
            <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className={cn("rounded-full border px-1.5 py-0.5 leading-none", tam === null ? "border-[#FFBF00]/45 text-amber-100" : "border-white/15 text-white/75")}>
                    {tam === null ? "tamaño por confirmar" : `${fmtGb(tam)} en disco${tamanos[m.id] ? " (confirmado)" : m.disco.verificado ? " (verificado)" : ""}`}
                </span>
                {typeof m.disco.descargaGb === "number" && <span className="rounded-full border border-white/15 px-1.5 py-0.5 leading-none text-white/75">descarga {fmtGb(m.disco.descargaGb)}</span>}
                <span className="rounded-full border border-white/15 px-1.5 py-0.5 leading-none text-white/75">RAM {fmtGb(m.ramMinGb)}</span>
                <span className="rounded-full border border-white/15 px-1.5 py-0.5 leading-none text-white/75">{m.medios.map((x) => NOMBRE_MEDIO[x] ?? x).join(" · ")}</span>
                <span className="rounded-full border border-white/15 px-1.5 py-0.5 leading-none text-white/60">{m.estado}</span>
                {m.capacidades.map((c) => (
                    <span key={c} className="rounded-full border border-[#007FFF]/35 px-1.5 py-0.5 leading-none text-sky-100/90">
                        {NOMBRE_CAPACIDAD[c]}
                    </span>
                ))}
            </div>
            {streaming && (
                <p className="flex items-start gap-1.5 rounded-lg border border-[#FFBF00]/30 bg-[#FFBF00]/[0.06] p-2 text-[10px] leading-snug text-amber-100/90">
                    <Gauge className="mt-0.5 h-3 w-3 shrink-0 text-[#FFBF00]" aria-hidden="true" />
                    <span>
                        Mantiene el núcleo en memoria y lee del SSD solo lo que necesita cada token: así cabe un modelo grande en poca RAM. Por eso exige un SSD rápido
                        conectado a la neurona que procesa (interno o externo USB-C/Thunderbolt) y nunca funciona desde la nube ni por red.
                    </span>
                </p>
            )}
            <ul className="flex flex-col gap-0.5 text-[10px] leading-snug text-white/65" aria-label={`Requisitos de ${m.nombre}`}>
                {requisitosLegibles(m).map((r) => (
                    <li key={r} className="flex gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/35" aria-hidden="true" />
                        {r}
                    </li>
                ))}
            </ul>
            {m.tokSRef && m.tokSRef.length > 0 && (
                <p className="text-[10px] text-white/55">
                    Medido: {m.tokSRef.map((t) => `${fmtNum(t.tokS)} tok/s en ${t.equipo}`).join(" · ")}
                </p>
            )}
            {m.notas && <p className="text-[10px] leading-snug text-white/55">{m.notas}</p>}

            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2" data-testid={`encaje-${m.id}`}>
                <p className={LABEL}>Mejor encaje en tus neuronas</p>
                {encaje ? (
                    <div className="mt-1 flex flex-col gap-1.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <NivelBadge nivel={encaje.compat.nivel} />
                            <Linea className="min-w-0 flex-1 text-[11px] text-white/85">
                                {encaje.procesador.nombre}
                                {nombreNeurona(inv, encaje.procesador.neuronaId) ? ` · ${nombreNeurona(inv, encaje.procesador.neuronaId)}` : ""} → {encaje.almacen.etiqueta}
                            </Linea>
                            {typeof encaje.compat.tokSEstimado === "number" && <span className={MONO}>≈ {fmtNum(encaje.compat.tokSEstimado)} tok/s</span>}
                        </div>
                        {encaje.compat.motivos.length > 0 && <ListaMotivos motivos={encaje.compat.motivos} />}
                    </div>
                ) : (
                    <p className="mt-1 text-[10px] text-white/50">Sin procesadores o almacenes detectados con los que comprobarlo.</p>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/50">
                <span>Licencia {m.licencia}</span>
                {/^https?:\/\//.test(m.upstream) && (
                    <a href={m.upstream} target="_blank" rel="noreferrer noopener" className={cn("inline-flex cursor-pointer items-center gap-1 text-[#7fb8ff] transition-colors duration-200 hover:text-sky-100", FOCO)}>
                        Proyecto original <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                )}
            </div>
        </li>
    );
}

/* ── Almacenes declarados ──────────────────────────────────────────────────── */

const TIPOS_DECLARABLES: TipoAlmacen[] = ["disco-externo", "servidor-externo", "nube", "carpeta-cerebro"];

/** true si la ruta o URL lleva credenciales (usuario:clave@, token=…, claves con forma conocida). */
export function llevaCredenciales(s: string): boolean {
    const t = s.trim();
    if (!t) return false;
    if (/\/\/[^/\s:@]+:[^/\s@]+@/.test(t)) return true;
    if (/[?&#](token|key|apikey|api_key|secret|password|pass|pwd|auth|sig|signature|access_token)=/i.test(t)) return true;
    if (/bearer\s+\S/i.test(t)) return true;
    return /\b(sk|gsk|ghp|xoxb|xoxp)[-_][A-Za-z0-9]{6,}/.test(t);
}

function slug(s: string): string {
    return (
        s
            .normalize("NFD")
            .replace(/[̀-ͯ]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 32) || "almacen"
    );
}

export function SeccionAlmacenes({
    inv,
    declarados,
    alDeclarar,
    alQuitar,
}: {
    inv: InventarioRecursos;
    declarados: MedioAlmacen[];
    alDeclarar: (m: MedioAlmacen) => void;
    alQuitar: (id: string) => void;
}) {
    const esta = inv.neuronas.find((n) => n.esEsta) ?? inv.neuronas[0];
    const [nombre, setNombre] = useState("");
    const [tipo, setTipo] = useState<TipoAlmacen>("disco-externo");
    const [ruta, setRuta] = useState("");
    const [total, setTotal] = useState("");
    const [libre, setLibre] = useState("");
    const [via, setVia] = useState<Via>("local");
    const [neuronaId, setNeuronaId] = useState(esta?.id ?? "");
    const [tipoDisco, setTipoDisco] = useState<TipoDisco>("ssd");
    const [conexion, setConexion] = useState<"usb" | "thunderbolt">("usb");
    const [privado, setPrivado] = useState(true);
    const [error, setError] = useState("");

    const enviar = () => {
        const n = nombre.trim();
        if (!n) return setError("Ponle un nombre (por ejemplo «SSD externo de 500 GB»).");
        if (llevaCredenciales(ruta)) return setError("Sin credenciales: pon solo la ruta o la URL. Las claves se guardan aparte, nunca aquí.");
        const t = Number(total.replace(",", "."));
        const l = libre.trim() ? Number(libre.replace(",", ".")) : t;
        if (!Number.isFinite(t) || t <= 0) return setError("Indica la capacidad total en GB.");
        if (!Number.isFinite(l) || l < 0 || l > t) return setError("El espacio libre debe estar entre 0 y la capacidad total.");
        const esDisco = tipo === "disco-externo";
        const id = esDisco && neuronaId ? `${neuronaId}:ext:${slug(n)}` : `declarado:${slug(n)}-${Date.now().toString(36)}`;
        alDeclarar({
            id,
            tipo,
            etiqueta: n,
            neuronaId: esDisco ? neuronaId || undefined : undefined,
            ruta: ruta.trim() || undefined,
            totalGb: t,
            libreGb: l,
            tipoDisco: esDisco ? tipoDisco : tipo === "servidor-externo" ? "red" : undefined,
            conexion: esDisco ? conexion : tipo === "nube" ? "nube" : "red",
            via: esDisco ? "local" : via,
            persistente: true,
            privado,
            disponible: true,
            fuente: "declarado",
        });
        toast.success(`Almacenamiento declarado: ${n}`);
        setNombre("");
        setRuta("");
        setTotal("");
        setLibre("");
        setError("");
    };

    return (
        <div className="flex flex-col gap-3">
            <form
                className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
                aria-label="Declarar un almacenamiento"
                onSubmit={(e) => {
                    e.preventDefault();
                    enviar();
                }}
            >
                <Field label="Nombre">
                    <input className={INPUT} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="SSD externo de 500 GB" aria-label="Nombre del almacenamiento" />
                </Field>
                <Field label="Tipo">
                    <select className={SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAlmacen)} aria-label="Tipo de almacenamiento">
                        {TIPOS_DECLARABLES.map((t) => (
                            <option key={t} value={t}>
                                {NOMBRE_TIPO_ALMACEN[t]}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Ruta o URL (sin credenciales)">
                    <input className={INPUT} value={ruta} onChange={(e) => setRuta(e.target.value)} placeholder={tipo === "disco-externo" ? "/Volumes/SSD" : "https://nas.local/modelos"} aria-label="Ruta o URL" />
                </Field>
                <Field label="Capacidad total (GB)">
                    <input className={INPUT} inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="500" aria-label="Capacidad total en GB" />
                </Field>
                <Field label="Libre (GB, opcional)">
                    <input className={INPUT} inputMode="decimal" value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="igual que el total" aria-label="Espacio libre en GB" />
                </Field>
                {tipo === "disco-externo" ? (
                    <>
                        <Field label="Conectado a">
                            <select className={SELECT} value={neuronaId} onChange={(e) => setNeuronaId(e.target.value)} aria-label="Neurona donde se conecta">
                                {inv.neuronas.map((n) => (
                                    <option key={n.id} value={n.id}>
                                        {n.nombre}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Disco y conexión">
                            <div className="flex gap-1.5">
                                <select className={cn(SELECT, "flex-1")} value={tipoDisco} onChange={(e) => setTipoDisco(e.target.value as TipoDisco)} aria-label="Tipo de disco">
                                    <option value="nvme">NVMe</option>
                                    <option value="ssd">SSD</option>
                                    <option value="hdd">Disco duro</option>
                                    <option value="sd">Tarjeta SD</option>
                                </select>
                                <select className={cn(SELECT, "flex-1")} value={conexion} onChange={(e) => setConexion(e.target.value as "usb" | "thunderbolt")} aria-label="Conexión">
                                    <option value="usb">USB</option>
                                    <option value="thunderbolt">Thunderbolt</option>
                                </select>
                            </div>
                        </Field>
                    </>
                ) : (
                    <Field label="Vía">
                        <select className={SELECT} value={via} onChange={(e) => setVia(e.target.value as Via)} aria-label="Vía">
                            {VIAS.filter((v) => v !== "antena").map((v) => (
                                <option key={v} value={v}>
                                    {nombreVia(v)}
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                <div className="flex flex-col justify-end gap-2 sm:col-span-2 lg:col-span-3 sm:flex-row sm:items-center sm:justify-between">
                    <button type="button" aria-pressed={privado} className={cn(PILL, privado ? PILL_ON : PILL_OFF, FOCO)} onClick={() => setPrivado((v) => !v)}>
                        {privado ? "Privado: los datos no salen de la cuenta" : "Compartido con el grupo o la comunidad"}
                    </button>
                    <button type="submit" className={BTN_PRIMARY}>
                        <Plus className="h-3 w-3" aria-hidden="true" /> Declarar almacenamiento
                    </button>
                </div>
                {error && (
                    <p role="alert" className="flex items-start gap-1.5 text-[11px] text-rose-100 sm:col-span-2 lg:col-span-3">
                        <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-[#DC143C]" aria-hidden="true" /> {error}
                    </p>
                )}
            </form>

            {declarados.length === 0 ? (
                <Empty text="Aún no has declarado ningún almacenamiento a mano." />
            ) : (
                <ul className="flex flex-col gap-2" aria-label="Almacenes declarados">
                    {declarados.map((a) => {
                        const Icono = ICONO_ALMACEN[a.tipo];
                        return (
                            <li key={a.id} className={cn(SUB, "flex min-w-0 flex-col gap-1.5 p-2.5 sm:flex-row sm:items-center")}>
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <Icono className="h-3.5 w-3.5 shrink-0 text-white/55" aria-hidden="true" />
                                    <div className="min-w-0 flex-1">
                                        <Linea className="text-[11px] font-medium text-white/90">{a.etiqueta}</Linea>
                                        <Linea className="text-[10px] text-white/50">
                                            {[NOMBRE_TIPO_ALMACEN[a.tipo], fmtLibre(a), a.neuronaId ? `en ${nombreNeurona(inv, a.neuronaId) || a.neuronaId}` : nombreVia(a.via), a.privado ? "privado" : "compartido", a.ruta].filter(Boolean).join(" · ")}
                                        </Linea>
                                    </div>
                                </div>
                                <button type="button" className={cn(BTN_DANGER, "self-start sm:self-auto")} onClick={() => alQuitar(a.id)} aria-label={`Quitar ${a.etiqueta}`}>
                                    <Trash2 className="h-3 w-3" aria-hidden="true" /> Quitar
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
            <p className={cn(MONO, "leading-snug")}>Lo declarado viaja con tu cuenta. Nunca guardes aquí contraseñas ni tokens: solo la ruta y la capacidad.</p>
        </div>
    );
}

