"use client"; // StarSeed XR · FLUJO COMPLETO DE VOZ (XR1010T, contrato architecture/starseed-xr.md §3 f): une useVozXR (P), TarjetaVoz (Q),
// ejecutarMundo (R) y ejecutarCompartir (S) con la MÁQUINA PURA maquina-voz: confirmación ÚNICA, primer fallo detiene avisando lo hecho, deshacer en orden inverso. La cablea XR1010AS.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Container } from "@react-three/uikit";
import { astrauraChat } from "@/ai/astraura/router";
import { crearSesionEnVivo } from "@/lib/estaciones/crear-sesion";
import type { ParametrosSesion } from "@/lib/estaciones/transmision-parametrica";
import { saveItem } from "@/lib/library/entity-library";
import { enviarChatDirecto } from "@/lib/mensajeria/chat-directo";
import { createPost } from "@/lib/os-social";
import { currentUserRef } from "@/lib/sync/entity-state";
import type { Consentimiento } from "@/lib/xr/privacidad";
import type { ContextoVoz, TipoRef } from "@/lib/xr/intenciones-tipos";
import { fallo } from "@/lib/xr/intenciones-destinos";
import { entenderVoz } from "@/lib/xr/intenciones-voz";
import { concederAccesoEscena } from "@/lib/vivo/escena3d";
import { leerMundo } from "@/lib/vivo/xr-mundo";
import { miembrosDeGrupo } from "./resolver-miembros";
import { NivelCalidadContext, PanelCristal, Texto3D } from "./panel-cristal";
import { ejecutarCompartir, type DepsCompartir } from "./ejecutor-compartir";
import { ejecutarMundo, refSalaDeUrl, type MundoEnContexto } from "./ejecutor-mundo";
import { TarjetaVoz } from "./tarjeta-voz";
import { useVozXR } from "./use-voz-xr";
import type { Reparto } from "./voz-xr";
import { REPOSO, siguiente, type Efecto, type EstadoFlujo, type EventoFlujo } from "./maquina-voz";

/** Props de la escena (los trae XR1010AS). */
export interface PropsFlujoVoz {
    distancia?: number; // metros de la tarjeta y del aviso; 1,2 por defecto (§3 f)
    enfoque?: { tipo: TipoRef; id: string } | null; // «este grupo» / lo señalado con el rayo
    moleculaConFoco?: boolean; // lo no entendido va a dictado de la Protomolécula (XR1010X)
    consentimientos?: Consentimiento[];
    deps?: Partial<DepsCompartir>;
}

/** Entonación mínima para una estación nueva (7,83 Hz Schumann). */
const PARAMS_OMNI = { tipo: "omnifrecuencias", entonacion: { osciladores: [{ id: "xr", f: 7.83, onda: "sine", vol: 0.7, x: 0, y: 0, z: 0 }], volumen: 0.7 } } satisfies ParametrosSesion;
const enlaceActual = (): string => (typeof window === "undefined" ? "/xr/os" : `${window.location.pathname}${window.location.search}`);
const SIN_CANDIDATOS: ContextoVoz = { grupos: [], contactos: [], estaciones: [], servidores: [] };

export function FlujoVoz({ distancia = 1.2, enfoque = null, moleculaConFoco = false, consentimientos = [], deps: extra }: PropsFlujoVoz) {
    const nivel = useContext(NivelCalidadContext); const voz = useVozXR({ enfoque, moleculaConFoco });
    const [par, setPar] = useState<{ estado: EstadoFlujo; efectos: Efecto[] }>({ estado: REPOSO, efectos: [] });
    const [aviso, setAviso] = useState<string | null>(null);
    const creado = useRef<MundoEnContexto | null>(null);
    const mundo = useRef<MundoEnContexto | null>(null);
    const uid = useRef<string | null>(null); const ciega = useRef(0); const cancelando = useRef(false);
    const deps = useMemo((): DepsCompartir => ({ sala: null, miembrosDeGrupo,
        concederAcceso: (refId, ids, permiso) => concederAccesoEscena(refId, ids, [permiso]),
        enviarMensaje: async (ids, texto) => { let n = 0; for (const id of ids) n += (await enviarChatDirecto({ uidDestino: id, hiloId: `xr-escena-${id}`, texto }).catch(() => null))?.ok ? 1 : 0; return n; },
        guardarBiblioteca: async (t, r) => { const ref = await currentUserRef(); return ref ? saveItem(ref, { type: "route", route: `/escena/${r}`, title: t }) : { ok: false, error: "No hay sesión abierta: no puedo guardar en tu biblioteca." }; },
        subirEstacion: (d) => d.nueva
            ? crearSesionEnVivo({ fuente: "omnifrecuencias", titulo: d.titulo ?? "Mundo StarSeed", enlace: enlaceActual(), params: PARAMS_OMNI, privada: true })
                .then((x) => (x.ok ? { ok: true, id: x.ficha.id } : { ok: false, error: x.error }))
            : Promise.resolve({ ok: false, error: "La unión a una estación ya viva se hace desde su panel (pendiente XR1010AS)." }),
        publicar: (d) => createPost({ entityType: d.visibilidad === "grupo" ? "group" : "page", entitySlug: d.grupoId ?? "perfil-mi-perfil", body: `Mundo StarSeed: ${enlaceActual()}` }),
        ...(extra ?? {}) }), [extra]);
    const despachar = useCallback((ev: EventoFlujo) => setPar((p) => siguiente(p.estado, ev)), []);
    useEffect(() => {
        void currentUserRef().then((r) => { uid.current = r?.id ?? null; });
        const refId = refSalaDeUrl(window.location.pathname, window.location.search);
        if (refId) void leerMundo(refId).then((m) => { if (m) mundo.current = { refId, mundo: m }; });
    }, []);

    // Correr UN paso: compartir vía ejecutor-compartir o tocar el mundo vía ejecutor-mundo; sistema → fallo honesto.
    const correr = useCallback(async (ef: Extract<Efecto, { tipo: "ejecutar-paso" }>) => {
        const i = ef.paso.intencion;
        if (i.tipo === "sistema") { despachar({ tipo: "paso-fallo", motivo: `La orden «${i.orden}» se aplica desde el menú de muñeca; de voz la cablea XR1010AS.` }); return; }
        const refId = creado.current?.refId ?? refSalaDeUrl(window.location.pathname, window.location.search) ?? "";
        const salida = i.tipo === "invitar" || i.tipo === "subir"
            ? await ejecutarCompartir(ef.paso, { refId, usuario: uid.current ?? "yo", ahora: Date.now(), consentimientos, confirmado: ef.confirmado, deps })
            : await ejecutarMundo(ef.paso, { nivel, razonar: (p) => astrauraChat({ messages: [{ role: "user", content: p }], taskHint: "reasoning", temperature: 0.2 }).then((a) => a.text), creado: creado.current, mundoActual: mundo.current });
        if (!salida.ok) { despachar({ tipo: "paso-fallo", motivo: salida.motivo }); return; }
        if (cancelando.current && "deshacer" in salida && salida.deshacer) { void salida.deshacer(); return; }
        if (i.tipo === "crear-mundo") { const nuevo = await leerMundo(salida.refId).catch(() => null); if (nuevo) creado.current = { refId: salida.refId, mundo: nuevo }; }
        despachar({ tipo: "paso-ok", resumen: salida.resumen, deshacer: "deshacer" in salida ? salida.deshacer : undefined });
    }, [nivel, despachar, deps, consentimientos]);

    // Voz ya entendida entra a la MÁQUINA; el parcial va antes para que la FRASE quede al re-entender tras elegir.
    const previa = useRef<Reparto | null>(null);
    useEffect(() => {
        const r = voz.resultado;
        if (!r || previa.current === r) return;
        previa.current = r; cancelando.current = false;
        if (voz.parcial.trim()) despachar({ tipo: "frase", frase: voz.parcial });
        if (r.via === "intencion") despachar({ tipo: "resultado", resultado: r.resultado });
        else if (r.via === "preguntar") despachar({ tipo: "resultado", resultado: fallo("no-entendido", r.pregunta, []) });
        // via «dictado»: la conduce la Protomolécula (XR1010X), no este flujo.
    }, [voz.resultado, voz.parcial, despachar]);

    // Aplicar EFECTOS de la máquina: correr pasos, avisar en 3D (6 s, salvo en «hecho»), entender, deshacer.
    useEffect(() => {
        void (async () => {
            for (const ef of par.efectos) {
                if (ef.tipo === "ejecutar-paso") await correr(ef);
                else if (ef.tipo === "avisar") {
                    setAviso(ef.texto); window.clearTimeout(ciega.current);
                    if (par.estado.fase !== "hecho") ciega.current = window.setTimeout(() => setAviso(null), 6000);
                } else if (ef.tipo === "entender") despachar({ tipo: "resultado", resultado: entenderVoz(ef.frase, ef.ctx ?? SIN_CANDIDATOS) });
                else if (ef.tipo === "deshacer") await ef.deshacer().catch(() => setAviso("No pude deshacerlo completo."));
            } // «mostrar-tarjeta» se pinta del estado (JSX), no es efecto imperativo.
        })();
    }, [par, correr, despachar]);

    return (
        <group>
            {par.estado.fase === "tarjeta" && <TarjetaVoz modelo={par.estado.modelo} distancia={distancia} nivel={nivel} alResponder={(r) => despachar({ tipo: "respuesta", respuesta: r })} />}
            {aviso && (
                <group position={[0, 0.5, -(distancia + 0.15)]}>
                    <PanelCristal nodo="anchor" ancho={0.42} alto={0.17}>
                        <Container flexDirection="column" gap={8} paddingX={18} paddingY={12} alignItems="center">
                            <Texto3D distancia={distancia} fontSize={20}>{aviso}</Texto3D>
                            <Container onClick={() => despachar({ tipo: "deshacer" })} cursor="pointer" backgroundColor="rgba(255,255,255,0.12)" paddingX={12} paddingY={6}
                                visible={par.estado.fase === "hecho" && par.estado.deshacer !== undefined}>
                                <Texto3D distancia={distancia} fontSize={18}>Deshacer</Texto3D>
                            </Container>
                        </Container>
                    </PanelCristal>
                </group>
            )}
        </group>
    );
}

export default FlujoVoz;
