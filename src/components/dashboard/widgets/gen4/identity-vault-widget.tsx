'use client';

// ════════════════════════════════════════════════════════════════
// IdentityVaultWidget — Bóveda de Identidad (rediseño Ola 0929-C)
// ----------------------------------------------------------------
// Tu identidad soberana tal como es HOY en el OS: la cuenta (sesión de
// este navegador, sin red), sus facetas públicas (os_account_profiles,
// una lectura compartida cada 15 min y solo a la vista), cuál usa este
// dispositivo (se cambia aquí mismo) y la llave local de la neurona
// (PIN/contraseña/huella). La puerta de la bóveda se enciende anillo a
// anillo: cuenta · facetas · llave. Cada hueco lleva su acción (entrar,
// crear perfil, poner bloqueo, exportar tus datos).
// Estados honestos: cargando (sesión/facetas), vacío (sin sesión o sin
// facetas: qué hacer) y error de la fuente (se dice y se reintenta).
// ════════════════════════════════════════════════════════════════

import * as React from "react";
import { Check, Download, Fingerprint, KeyRound, LogIn, UserPlus } from "lucide-react";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { colorSalud } from "@/components/widgets-libres/familias/comun";
import { Lienzo, useIdSvg, useLienzo, type EstadoLienzo } from "../gen5/_catalogo/lienzo";
import { Accion, CargandoSilueta, ErrorHonesto, Rot, VacioHonesto, tinta } from "../gen5/_catalogo/piezas";
import { RUTA_SEGURIDAD_CUENTA, nombreMetodo, useSenalesSeguridad } from "../gen5/_catalogo/seguridad";
import { enmascararCorreo, etiquetaVisibilidad, nombreProveedor, useFacetas, usePerfilActivo, useSesionLocal, type Faceta } from "../gen5/_catalogo/identidad";

const COLOR_VIS: Record<Faceta["visibilidad"], string> = { public: "#23d5ab", contacts: "#FFBF00", private: "#b69cff" };

function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
    const p = (a: number) => [cx + Math.sin(a) * r, cy - Math.cos(a) * r];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function Puerta({ D, cuenta, facetas, activa, llave, l, centro }: { D: number; cuenta: boolean; facetas: Faceta[]; activa: string | null; llave: boolean; l: EstadoLienzo; centro: string }) {
    const id = useIdSvg("boveda");
    const c = D / 2;
    const r1 = D * 0.46, r2 = D * 0.36, r3 = D * 0.26;
    const n = Math.max(1, facetas.length);
    const hueco = n > 1 ? 0.12 : 0;
    const paso = (Math.PI * 2) / n;
    return (
        <svg width={D} height={D} viewBox={`0 0 ${D} ${D}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`${id}-m`} cx="40%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity={0.12} />
                    <stop offset="100%" stopColor="#0c0e22" stopOpacity={0.6} />
                </radialGradient>
                <linearGradient id={`${id}-c`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={tinta(l.acento2, 0.3)} />
                    <stop offset="100%" stopColor={l.acento2} stopOpacity={0.5} />
                </linearGradient>
            </defs>
            {/* cuerpo metálico de la puerta */}
            <circle cx={c} cy={c} r={r1 + D * 0.03} fill={`url(#${id}-m)`} stroke="#fff" strokeOpacity={0.12} />
            {/* anillo de la cuenta */}
            <circle cx={c} cy={c} r={r1} fill="none" stroke={cuenta ? `url(#${id}-c)` : "#fff"} strokeOpacity={cuenta ? 1 : 0.15} strokeWidth={D * 0.022}
                strokeDasharray={cuenta ? undefined : `${D * 0.02} ${D * 0.03}`} />
            {/* pernos del cierre */}
            {Array.from({ length: 12 }, (_, i) => {
                const a = (i / 12) * Math.PI * 2;
                return <circle key={i} cx={c + Math.sin(a) * (r1 + D * 0.015)} cy={c - Math.cos(a) * (r1 + D * 0.015)} r={D * 0.008} fill="#fff" opacity={0.3} />;
            })}
            {/* facetas: un arco por perfil, del color de su visibilidad */}
            {facetas.length ? facetas.map((f, i) => {
                const a0 = i * paso + hueco / 2, a1 = (i + 1) * paso - hueco / 2;
                const activo = f.id === activa;
                return <path key={f.id} d={arco(c, c, r2, a0, n === 1 ? a0 + Math.PI * 1.999 : a1)} fill="none" stroke={COLOR_VIS[f.visibilidad]} strokeWidth={activo ? D * 0.05 : D * 0.028}
                    strokeLinecap="round" opacity={activo ? 1 : 0.6} />;
            }) : <circle cx={c} cy={c} r={r2} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={D * 0.02} strokeDasharray={`${D * 0.02} ${D * 0.03}`} />}
            {/* llave local de la neurona */}
            <circle cx={c} cy={c} r={r3} fill="none" stroke={llave ? colorSalud("bien") : colorSalud("atencion")} strokeOpacity={llave ? 0.9 : 0.55} strokeWidth={D * 0.018}
                strokeDasharray={llave ? undefined : `${D * 0.015} ${D * 0.025}`} className={l.animar && !llave ? "ss-girar" : undefined}
                style={{ ["--ss-dur" as string]: "40s", transformOrigin: `${c}px ${c}px` }} />
            {/* centro: el monograma del perfil activo */}
            <circle cx={c} cy={c} r={r3 - D * 0.04} fill={conAlfa(l.acento2, 0.12)} />
            <text x={c} y={c + D * 0.012} textAnchor="middle" dominantBaseline="middle" fill="#fff" style={{ fontSize: D * (centro.length > 2 ? 0.1 : 0.14), fontWeight: 300 }}>{centro}</text>
        </svg>
    );
}

function iniciales(nombre: string): string {
    const p = nombre.trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "·";
}

export function IdentityVaultWidget() {
    const l = useLienzo("#94a3b8", "#23d5ab");
    const { listo, sesion } = useSesionLocal();
    const facetas = useFacetas(sesion?.id ?? null, l.visible);
    const { activo, usar } = usePerfilActivo();
    const seg = useSenalesSeguridad();

    const lista = facetas.datos ?? [];
    const activa = lista.find((f) => f.id === activo) ?? lista.find((f) => f.principal) ?? lista[0] ?? null;
    const llave = seg.metodo !== "ninguno";
    const publicas = lista.filter((f) => f.visibilidad === "public").length;
    const cambiar = () => {
        if (lista.length < 2 || !activa) return;
        const i = lista.findIndex((f) => f.id === activa.id);
        usar(lista[(i + 1) % lista.length].id);
    };

    const etiqueta = !listo ? "Bóveda de identidad: cargando la sesión"
        : !sesion ? "Bóveda de identidad: sin sesión en este navegador"
            : `Bóveda de identidad: cuenta con ${nombreProveedor(sesion.proveedor)}, ${lista.length} faceta${lista.length === 1 ? "" : "s"} (${publicas} pública${publicas === 1 ? "" : "s"})${activa ? `, usando «${activa.nombre}»` : ""}. Llave local: ${nombreMetodo(seg.metodo)}.`;

    if (!listo) {
        return (
            <Lienzo l={l} titulo="Bóveda de Identidad" icono={KeyRound} etiqueta={etiqueta}>
                <CargandoSilueta color={l.acento2} etiqueta="Cargando tu sesión…" />
            </Lienzo>
        );
    }

    const puerta = (D: number) => <Puerta D={D} cuenta={!!sesion} facetas={lista} activa={activa?.id ?? null} llave={llave} l={l} centro={activa ? iniciales(activa.nombre) : sesion ? "·" : "?"} />;

    if (l.base === "micro") {
        return (
            <Lienzo l={l} titulo="Bóveda de Identidad" etiqueta={etiqueta} sinCabecera>
                <div className="grid h-full place-items-center">{puerta(l.lado - 12)}</div>
            </Lienzo>
        );
    }

    if (!sesion) {
        return (
            <Lienzo l={l} titulo="Bóveda de Identidad" icono={KeyRound} etiqueta={etiqueta} sinCabecera={l.base === "s"}>
                <VacioHonesto icono={LogIn} color={l.acento2} compacto={l.base === "s"} titulo="Sin sesión en este navegador"
                    ayuda="Entra para ver tu cuenta soberana y sus facetas. Tus datos locales siguen aquí."
                    accion={<Accion color={l.acento2} solida alto={l.toque} icono={LogIn} href="/login?next=/dashboard">Entrar</Accion>} />
            </Lienzo>
        );
    }

    if (l.base === "s") {
        const D = Math.max(70, Math.min(l.ancho - 24, l.alto - 48));
        return (
            <Lienzo l={l} titulo="Bóveda de Identidad" etiqueta={etiqueta} sinCabecera>
                <div className="flex h-full flex-col items-center justify-center gap-1">
                    {puerta(D)}
                    <p className="max-w-full truncate text-[12px] text-white/80" title={activa?.nombre}>{activa ? activa.nombre : "Sin facetas"}</p>
                </div>
            </Lienzo>
        );
    }

    const grande = l.base === "l" || l.base === "xl";
    const fila = l.horizontal || l.ancho >= l.alto * 1.05;
    const cab = 52;
    const D = fila ? Math.max(90, Math.min(l.alto - cab - 20, l.ancho * (l.horizontal ? 0.22 : 0.4))) : Math.max(90, Math.min(l.ancho * 0.6, (l.alto - cab) * 0.4));

    const cuenta = (
        <div className="min-w-0">
            <Rot>Cuenta</Rot>
            <p className="truncate text-[12.5px] text-white/85" title={sesion.correo ?? undefined}>{enmascararCorreo(sesion.correo) || "Cuenta sin correo"} · {nombreProveedor(sesion.proveedor)}</p>
            {sesion.alta && grande && <p className="text-[11px] text-white/50">Desde {new Date(sesion.alta).toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</p>}
        </div>
    );

    const facetaActiva = facetas.cargando && !facetas.datos ? <CargandoSilueta color={l.acento2} filas={2} etiqueta="Cargando tus facetas…" />
        : facetas.error && !facetas.datos ? <ErrorHonesto error={facetas.error} color={l.acento2} onReintentar={facetas.recargar} compacto />
            : !lista.length ? (
                <VacioHonesto icono={UserPlus} color={l.acento2} compacto llenar={false} titulo="Tu cuenta aún no tiene facetas (perfiles públicos vacíos)"
                    accion={<Accion color={l.acento2} alto={l.toque} icono={UserPlus} href="/cuenta?createProfile=true">Crear perfil</Accion>} />
            ) : activa && (
                <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                        <Rot>Usando</Rot>
                        <p className="truncate text-[15px] font-medium text-white" title={activa.nombre}>{activa.nombre}</p>
                        <p className="truncate text-[11.5px]" style={{ color: tinta(COLOR_VIS[activa.visibilidad], 0.3) }}>{activa.handle ? `@${activa.handle} · ` : ""}{etiquetaVisibilidad(activa.visibilidad)}{activa.principal ? " · principal" : ""}</p>
                    </div>
                    {lista.length > 1 && !grande && !l.torre && <Accion color={l.acento2} alto={l.toque} onClick={cambiar} etiqueta="Usar la siguiente faceta en este dispositivo">Cambiar</Accion>}
                </div>
            );
    const cambiarAbajo = l.torre && lista.length > 1 && <Accion color={l.acento2} alto={l.toque} onClick={cambiar} etiqueta="Usar la siguiente faceta en este dispositivo">Cambiar de faceta</Accion>;

    const listaFacetas = (max: number) => lista.length > 1 && (
        <ul className="flex min-w-0 flex-col gap-1" aria-label="Tus facetas">
            {lista.slice(0, max).map((f) => {
                const esta = f.id === activa?.id;
                return (
                    <li key={f.id}>
                        <button type="button" onClick={() => usar(f.id)} aria-pressed={esta} aria-label={`Usar la faceta ${f.nombre} en este dispositivo`}
                            className="flex w-full min-w-0 cursor-pointer items-center gap-2 text-left text-[12.5px] transition-colors duration-200 hover:text-white" style={{ minHeight: Math.min(l.toque, 32), color: esta ? "#fff" : "rgba(255,255,255,.72)" }}>
                            <span aria-hidden className="ss-redondo size-2.5 shrink-0 rounded-full" style={{ background: COLOR_VIS[f.visibilidad], opacity: esta ? 1 : 0.55 }} />
                            <span className="min-w-0 flex-1 truncate" title={f.nombre}>{f.nombre}</span>
                            <span className="shrink-0 text-[10.5px] text-white/45">{etiquetaVisibilidad(f.visibilidad)}</span>
                            {esta && <Check aria-hidden className="size-3.5 shrink-0" style={{ color: tinta(l.acento2) }} />}
                        </button>
                    </li>
                );
            })}
        </ul>
    );

    const llaveLinea = (
        <p className="flex items-center gap-1.5 text-[12px]" style={{ color: llave ? "rgba(255,255,255,.72)" : tinta(colorSalud("atencion"), 0.2) }}>
            <Fingerprint aria-hidden className="size-3.5 shrink-0" />
            {llave ? `Llave local: ${seg.metodo === "pin" ? "PIN" : nombreMetodo(seg.metodo).toLowerCase()}` : "Sin llave local"}
            {!llave && <Accion color={colorSalud("atencion")} alto={Math.min(l.toque, 28)} href={RUTA_SEGURIDAD_CUENTA} etiqueta="Poner un bloqueo en este dispositivo">Poner</Accion>}
        </p>
    );

    const pie = (
        <div className="flex flex-wrap gap-1.5">
            <Accion color={l.acento2} alto={l.toque} href="/cuenta?section=info-personal" etiqueta="Gestionar tu identidad y tus perfiles">Identidad</Accion>
            <Accion color={l.acento2} alto={l.toque} icono={Download} href="/cuenta?section=datos-privacidad" etiqueta="Exportar o importar tus datos">Tus datos</Accion>
        </div>
    );

    return (
        <Lienzo l={l} titulo="Bóveda de Identidad" subtitulo={`${lista.length} faceta${lista.length === 1 ? "" : "s"} · ${publicas} pública${publicas === 1 ? "" : "s"}`} icono={KeyRound} etiqueta={etiqueta}>
            {l.horizontal ? (
                <div className="flex h-full min-h-0 items-center gap-4">
                    {puerta(D)}
                    <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">{facetaActiva}{listaFacetas(3)}</div>
                    <div className="flex w-[34%] min-w-0 flex-col justify-center gap-2">{cuenta}{llaveLinea}</div>
                </div>
            ) : (
                <div className={`flex h-full min-h-0 gap-4 ${fila ? "flex-row items-center" : "flex-col items-center justify-center"}`}>
                    {puerta(D)}
                    <div className={`flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-2.5 ${fila ? "" : "w-full"}`}>
                        {/* En «l» la lista ya marca la faceta en uso: sin bloque «Usando» duplicado. */}
                        {(l.base !== "l" || lista.length < 2) && facetaActiva}
                        {grande && (l.base === "l" && lista.length > 1 ? <><Rot>Tus facetas</Rot>{listaFacetas(4)}</> : listaFacetas(5))}
                        {cambiarAbajo}
                        {(grande || l.torre) && llaveLinea}
                        {l.base === "xl" && cuenta}
                        {l.base === "xl" && pie}
                    </div>
                </div>
            )}
        </Lienzo>
    );
}
