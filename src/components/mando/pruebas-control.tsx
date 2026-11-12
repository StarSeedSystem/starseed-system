"use client";

/**
 * Control de las pruebas (PRB1111V): «Compilar prueba ahora», «Cancelar», «Reintentar lo que falló», «Volver a
 * publicar el manifiesto» y «Pedir arreglo a la dirección». Ninguno ejecuta nada: cada uno, tras una confirmación que
 * dice exactamente qué pasará, escribe UNA petición para el director de pruebas (`POST …/pruebas/control`) y desde
 * entonces se enseña el estado de esa petición (escrita, atendida, hecha o rechazada con el motivo del director).
 * Si el director no corre, los botones lo dicen en vez de aceptar una pulsación que nadie leerá.
 */

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { estaEnMarcha } from "@/lib/mando/lanzamientos-pruebas";
import { textoDeConfirmacion, ultimaPublicada, versionEnFoco } from "@/lib/mando/pruebas-vivas";
import type { PeticionVista } from "@/lib/mando/pruebas-vivas-tipos";

import { Chip, estadoDePeticionTexto, fechaCorta, haceTexto, Seccion, usePruebas, type Seguimiento } from "./pruebas-contexto";

type Accion = "compilar" | "cancelar" | "reintentar" | "republicar";

const NOMBRE: Record<string, string> = {
    compilar: "Compilar prueba ahora",
    cancelar: "Cancelar la compilación",
    reintentar: "Reintentar lo que falló",
    republicar: "Volver a publicar el manifiesto",
    "pedir-arreglo": "Pedir arreglo a la dirección",
};

/** El estado de UNA petición que esta pantalla escribió (o de una reciente del director). */
export function EstadoPeticion({ s }: { s: Seguimiento }) {
    const c = usePruebas();
    if (!c) return null;
    const p = c.datos.peticiones.find((x) => x.id === s.id) ?? null;
    const e = estadoDePeticionTexto(p, s.tPedida, c.ahora);
    return (
        <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid={`peticion-${s.id}`}>
            <Chip tono={e.tono}>{NOMBRE[s.accion] ?? s.accion}</Chip>
            <span className="min-w-0 break-words text-white/75">{e.texto}</span>
            <span className="font-mono text-[10px] text-white/35">{s.id}</span>
        </li>
    );
}

function Reciente({ p }: { p: PeticionVista }) {
    const c = usePruebas();
    if (!c) return null;
    const e = estadoDePeticionTexto(p);
    return (
        <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" data-testid={`peticion-${p.id}`}>
            <Chip tono={e.tono}>{NOMBRE[p.accion] ?? p.accion}</Chip>
            <span className="min-w-0 break-words text-white/65">{e.texto}</span>
            <span className="text-[10px] text-white/35">{haceTexto(p.t, c.ahora) ?? "sin hora"} · {p.quien || "?"}</span>
        </li>
    );
}

/**
 * «Pedir arreglo a la dirección» para una comprobación que falla o una plataforma que no compila. Con nota opcional.
 * Después enseña que se pidió y cuándo (y lo que dice el director de esa petición).
 */
export function PedirArreglo({ prueba, comprobacion, plataforma, antes }: { prueba: number; comprobacion?: string; plataforma?: string; antes?: { t: string; quien: string; nota: string } | null }) {
    const c = usePruebas();
    const [abierto, setAbierto] = useState(false);
    const [nota, setNota] = useState("");
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!c) return null;
    const mia = c.seguimiento.filter((s) => s.accion === "pedir-arreglo" && s.prueba === prueba && (s.comprobacion ?? null) === (comprobacion ?? null) && (s.plataforma ?? null) === (plataforma ?? null));
    const ultima = mia[mia.length - 1] ?? null;
    const enviar = async () => {
        setOcupado(true);
        setError(null);
        const r = await c.pedir(
            { accion: "pedir-arreglo", prueba, ...(comprobacion ? { comprobacion } : {}), ...(plataforma ? { plataforma } : {}), ...(nota.trim() ? { nota: nota.trim() } : {}) },
            comprobacion ? `arreglo de ${comprobacion}` : `arreglo de ${plataforma}`,
        );
        setOcupado(false);
        if (r.ok) {
            setAbierto(false);
            setNota("");
        } else setError(r.error ?? "No se pudo pedir.");
    };
    return (
        <div className="mt-2 space-y-1.5 text-xs" data-testid={`pedir-arreglo-${comprobacion ?? plataforma}`}>
            {antes ? (
                <p className="break-words text-amber-200/90">
                    Arreglo pedido el {fechaCorta(antes.t)} por {antes.quien || "?"}{antes.nota ? ` · «${antes.nota}»` : ""}.
                </p>
            ) : null}
            {ultima ? <ul className="space-y-1"><EstadoPeticion s={ultima} /></ul> : null}
            {!abierto ? (
                <Button size="sm" variant="outline" disabled={!c.puedePedir} onClick={() => setAbierto(true)} className="h-auto min-h-8 whitespace-normal py-1.5 text-left text-xs" title={c.puedePedir ? undefined : c.motivo}>
                    <Send className="h-3.5 w-3.5" aria-hidden />
                    {antes || ultima ? "Pedir arreglo otra vez" : "Pedir arreglo a la dirección"}
                </Button>
            ) : (
                <div className="space-y-1.5 rounded-md border border-white/10 bg-black/30 p-2">
                    <p className="break-words text-white/75">
                        Esto avisa a la dirección de que {comprobacion ? `la comprobación ${comprobacion} de la prueba.${prueba} falla` : `la plataforma ${plataforma} de la prueba.${prueba} no compila`}. No arregla nada por sí solo: queda
                        escrito para que lo atienda.
                    </p>
                    <textarea
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        maxLength={500}
                        rows={2}
                        aria-label="Nota para la dirección (opcional)"
                        placeholder="Nota (opcional): qué viste"
                        className="w-full rounded-md border border-white/15 bg-black/30 px-2 py-1 text-xs text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={ocupado} onClick={() => void enviar()} className="h-8 text-xs">
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Send className="h-3.5 w-3.5" aria-hidden />}
                            Enviar petición
                        </Button>
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setAbierto(false)} className="h-8 text-xs">
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}
            {!c.puedePedir ? <p className="break-words text-white/50">{c.motivo}</p> : null}
            {error ? <p className="break-words text-rose-200" role="alert">{error}</p> : null}
        </div>
    );
}

export function ControlPruebas() {
    const c = usePruebas();
    const [pidiendo, setPidiendo] = useState<{ accion: Accion; sha: string | null } | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    if (!c) return null;
    const { datos } = c;
    const foco = versionEnFoco(datos.versiones);
    const enMarcha = datos.versiones.find(estaEnMarcha) ?? null;
    // PRB1111X: solo cuenta la más nueva: una fallida que otra ya sustituyó no se reintenta desde aquí.
    const masNueva = [...datos.versiones].sort((a, b) => b.numero - a.numero)[0] ?? null;
    const conFallo = masNueva && masNueva.plataformas.some((p) => p.estado === "fallo") ? masNueva : null;
    const publicada = ultimaPublicada(datos.versiones);
    const cola = datos.cola;
    const hayCola = (cola.sinPublicar ?? 0) > 0 && !!cola.local;

    // PRB1111X: el director rechaza compilar mientras algo compila; solo acepta sustituir una que aún espera a main.
    const compilando = datos.versiones.some((v) => v.plataformas.some((pl) => ["en-cola", "compilando", "publicando"].includes(pl.estado)));
    const razonCompilar = compilando ? "Ya hay una compilación en marcha: el director no acepta otra hasta que acabe (o la canceles)." : "";
    const razon: Record<Accion, string> = {
        compilar: razonCompilar,
        cancelar: enMarcha ? "" : "No hay ninguna compilación en marcha que cancelar.",
        reintentar: conFallo ? "" : "Ninguna prueba tiene un job fallido.",
        republicar: publicada ? "" : "Aún no hay ninguna prueba publicada en todas sus plataformas.",
    };
    const nombreDe = (v: typeof foco) => ({ numero: v?.numero ?? null, version: v?.version ?? null });
    const objetivo = (a: Accion) => (a === "cancelar" ? enMarcha : a === "reintentar" ? conFallo : a === "republicar" ? publicada : foco);

    const confirmar = (accion: Accion, sha: string | null) => {
        setError(null);
        setPidiendo({ accion, sha });
    };
    const textos = pidiendo
        ? (() => {
              const t = textoDeConfirmacion({ accion: pidiendo.accion }, { cola, enCurso: enMarcha ? nombreDe(enMarcha) : null, objetivo: nombreDe(objetivo(pidiendo.accion)), ultimaPublicada: publicada?.version ?? null });
              if (pidiendo.accion === "compilar" && pidiendo.sha) {
                  return {
                      ...t,
                      titulo: "Compilar cuando se publique lo que está en cola",
                      efectos: [
                          `Pide al director que espere (hasta 4 h) a que origin/main contenga tu commit local ${pidiendo.sha.slice(0, 10)} y entonces lance la compilación de una prueba con él.`,
                          `Tu main local tiene ${cola.sinPublicar} commit${cola.sinPublicar === 1 ? "" : "s"} sin publicar: esta pulsación NO los publica, solo espera a que la autopublicación o tú lo hagáis.`,
                          enMarcha ? `Ya hay una en marcha (${enMarcha.version ?? enMarcha.etiqueta}): GitHub las pone en fila.` : "No hay ninguna en marcha.",
                      ],
                      boton: "Compilar cuando se publique",
                  };
              }
              return t;
          })()
        : null;

    const enviar = async () => {
        if (!pidiendo) return;
        setOcupado(true);
        setError(null);
        const cuerpo: Record<string, unknown> = { accion: pidiendo.accion };
        if (pidiendo.accion === "compilar") cuerpo.sha = pidiendo.sha;
        if (pidiendo.accion === "cancelar") cuerpo.numero = enMarcha?.numero ?? null;
        if (pidiendo.accion === "reintentar") cuerpo.numero = conFallo?.numero ?? null;
        const r = await c.pedir(cuerpo, NOMBRE[pidiendo.accion]);
        setOcupado(false);
        if (r.ok) setPidiendo(null);
        else setError(r.error ?? "No se pudo pedir.");
    };

    const botones: { accion: Accion; sha: string | null; texto: string }[] = [
        { accion: "compilar", sha: null, texto: "Compilar prueba ahora" },
        ...(hayCola ? [{ accion: "compilar" as const, sha: cola.local, texto: `Compilar cuando se publique lo que está en cola (${cola.sinPublicar})` }] : []),
        { accion: "cancelar", sha: null, texto: "Cancelar" },
        { accion: "reintentar", sha: null, texto: "Reintentar lo que falló" },
        { accion: "republicar", sha: null, texto: "Volver a publicar el manifiesto" },
    ];

    const mias = c.seguimiento.slice(-4).reverse();
    const idsMios = new Set(mias.map((m) => m.id));
    const recientes = datos.peticiones.filter((p) => !idsMios.has(p.id)).slice(0, 3);

    return (
        <Seccion titulo="Control (pide al director de pruebas)" id="control">
            <p className={`break-words text-xs ${c.puedePedir ? "text-white/60" : "text-amber-200"}`} data-testid="director-texto">
                {c.director.texto}
                {c.puedePedir ? " Cada botón escribe una petición; el director la lee en su próxima pasada." : ""}
            </p>
            {!datos.controlAqui ? <p className="text-xs text-white/55">Los botones solo funcionan desde Genesis en la Mac: desde aquí se ve, no se pide.</p> : null}
            <div className="flex flex-wrap gap-2" role="group" aria-label="Acciones sobre las pruebas">
                {botones.map((b) => {
                    const sinRazon = razon[b.accion];
                    const deshabilitado = !c.puedePedir || !!sinRazon || ocupado;
                    return (
                        <div key={b.texto} className="flex min-w-0 max-w-full flex-col gap-0.5">
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={deshabilitado}
                                onClick={() => confirmar(b.accion, b.sha)}
                                className="mc-alzar h-auto min-h-9 whitespace-normal py-1.5 text-left text-xs"
                            >
                                {b.texto}
                            </Button>
                            {sinRazon ? <span className="max-w-[16rem] break-words text-[11px] text-white/40">{sinRazon}</span> : null}
                        </div>
                    );
                })}
            </div>
            {!c.puedePedir ? <p className="break-words text-xs text-amber-200/90" data-testid="botones-sin-director">{c.motivo}</p> : null}

            {pidiendo && textos ? (
                <div role="dialog" aria-label={textos.titulo} className="space-y-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.06] p-3 text-xs text-white/80" data-testid="confirmacion-control">
                    <p className="text-sm font-semibold text-white">{textos.titulo}</p>
                    <ul className="list-disc space-y-0.5 pl-4">
                        {textos.efectos.map((e) => <li key={e} className="break-words">{e}</li>)}
                    </ul>
                    <p className="break-words text-white/55">Esto solo escribe la petición; no ejecuta nada desde aquí. Después verás aquí su estado.</p>
                    {error ? <p className="break-words text-rose-200" role="alert">{error}</p> : null}
                    <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={ocupado} onClick={() => void enviar()} className="mc-alzar h-auto min-h-8 whitespace-normal py-1.5 text-left">
                            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                            {ocupado ? "Escribiendo la petición…" : textos.boton}
                        </Button>
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setPidiendo(null)}>No, volver</Button>
                    </div>
                </div>
            ) : null}

            {mias.length || recientes.length || datos.director === null || datos.director === "ilegible" ? (
                <div className="space-y-1.5">
                    {mias.length || recientes.length ? <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Peticiones</p> : null}
                    <ul className="space-y-1.5" data-testid="peticiones">
                        {mias.map((s) => <EstadoPeticion key={s.id} s={s} />)}
                        {recientes.map((p) => <Reciente key={p.id} p={p} />)}
                    </ul>
                </div>
            ) : null}
        </Seccion>
    );
}
