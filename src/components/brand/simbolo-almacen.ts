'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Almacén y ganchos del «Símbolo del escritorio» (ESC1110B)
// ----------------------------------------------------------------
// Local primero (copia en este aparato, `simbolo-registro.ts`) y nube por
// el mecanismo de siempre (`entity_state`, sin migraciones): el perfil bajo
// la fila del propio usuario, la página y el grupo bajo la suya (RLS de
// dueño/miembro). En tiempo real con `subscribeEntityState`.
// Protomolécula: «Abrir en la Protomolécula» guarda una molécula que CITA el
// símbolo y abre la orbe sobre ella; mientras está enlazada, los cambios que
// se guarden allí vuelven al símbolo (validados) solos.
// ════════════════════════════════════════════════════════════════

import React from "react";
import {
    getEntityState,
    setEntityStateChecked,
    subscribeEntityState,
    currentUserRef,
    type EntityRef,
} from "@/lib/sync/entity-state";
import { almacenNavegador as almacenMoleculas, cargarMolecula, guardarMolecula, PREFIJO_MOLECULA } from "@/lib/protomolecula/almacen-moleculas";
import { PROTO_ORB_ABRIR_EVENT } from "@/lib/protomolecula/orbe-bus";
import type { Molecula } from "@/lib/protomolecula/tipos";
import { ACTIVE_PROFILE_KEY, PROFILE_ACTIVE_EVENT, activeProfileId } from "@/lib/profiles/profiles";
import { archivoDesdeMolecula, moleculaDesdeSimbolo } from "@/lib/protomolecula/atomos/simbolo-escritorio";
import {
    SIMBOLO_OFICIAL,
    archivoDesdeRecurso,
    exportarArchivoSimbolo,
    tipoDeArchivoElegido,
    validarArchivoSimbolo,
    EXTENSION_SIMBOLO,
    MIME_SIMBOLO,
    TOPES_SIMBOLO,
    type ArchivoSimbolo,
    type ResultadoSimbolo,
} from "./simbolo-archivo";
import {
    EVENTO_SIMBOLO,
    REGISTRO_OFICIAL,
    claveDestino,
    claveEntidad,
    guardarLocal,
    leerLocal,
    migrarRegistro,
    nuevoRegistro,
    resolverSimbolo,
    rotuloSimbolo,
    type DestinoSimbolo,
    type RegistroSimbolo,
} from "./simbolo-registro";

/** Ref de `entity_state` del destino (el perfil vive bajo la fila del usuario). */
async function refNube(d: DestinoSimbolo): Promise<EntityRef | null> {
    if (d.ambito === "pagina") return { kind: "page", id: d.id };
    if (d.ambito === "grupo") return { kind: "group", id: d.id };
    return currentUserRef();
}

/** Lee el registro de la nube y lo deja en la copia local. Nunca lanza. */
export async function cargarSimboloNube(d: DestinoSimbolo): Promise<{ registro: RegistroSimbolo; motivo: string | null } | null> {
    try {
        const ref = await refNube(d);
        if (!ref) return null;
        const fila = await getEntityState<unknown>(ref, claveEntidad(d));
        if (!fila) return null;
        const m = migrarRegistro(fila.value);
        const local = leerLocal(d);
        // Gana el más reciente (la copia local puede llevar un cambio aún sin subir).
        if (m.registro.actualizado >= local.actualizado) guardarLocal(d, m.registro);
        return m;
    } catch {
        return null;
    }
}

/** Guarda en este aparato y en la nube. Devuelve el error de la nube, si lo hubo. */
export async function guardarSimbolo(d: DestinoSimbolo, r: RegistroSimbolo): Promise<string | null> {
    if (!guardarLocal(d, r)) return "Este navegador no deja guardar el ajuste en el aparato.";
    try {
        const ref = await refNube(d);
        if (!ref) return "Sin sesión: el símbolo queda solo en este aparato.";
        const res = await setEntityStateChecked(ref, claveEntidad(d), r);
        return res.error;
    } catch (e) {
        return (e as Error)?.message || "No se pudo guardar en la nube.";
    }
}

function useRegistro(d: DestinoSimbolo | null | undefined): { registro: RegistroSimbolo; motivo: string | null } {
    const clave = d ? claveDestino(d) : null;
    const [estado, setEstado] = React.useState<{ registro: RegistroSimbolo; motivo: string | null }>(() => ({ registro: d ? leerLocal(d) : REGISTRO_OFICIAL, motivo: null }));
    React.useEffect(() => {
        if (!d) { setEstado({ registro: REGISTRO_OFICIAL, motivo: null }); return; }
        let vivo = true;
        const releer = () => { if (vivo) setEstado((e) => ({ registro: leerLocal(d), motivo: e.motivo })); };
        releer();
        void cargarSimboloNube(d).then((m) => { if (vivo && m) setEstado({ registro: leerLocal(d), motivo: m.motivo }); });
        const alEvento = (e: Event) => { const c = (e as CustomEvent<{ clave?: string }>).detail?.clave; if (!c || c === clave) releer(); };
        window.addEventListener(EVENTO_SIMBOLO, alEvento);
        const alAlmacen = (e: StorageEvent) => { if (e.key === null || e.key.startsWith("starseed.escritorio.simbolo")) releer(); };
        window.addEventListener("storage", alAlmacen);
        let quitarNube: (() => void) | null = null;
        void refNube(d).then((ref) => {
            if (!vivo || !ref) return;
            quitarNube = subscribeEntityState(ref, claveEntidad(d), (c) => {
                if (c.self) return;
                const m = migrarRegistro(c.value);
                guardarLocal(d, m.registro);
                if (vivo) setEstado(m);
            });
        });
        return () => {
            vivo = false;
            window.removeEventListener(EVENTO_SIMBOLO, alEvento);
            window.removeEventListener("storage", alAlmacen);
            quitarNube?.();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave]);
    return estado;
}

/** Vuelta automática desde la Protomolécula mientras el símbolo está enlazado a una molécula. */
function useVueltaProtomolecula(d: DestinoSimbolo | null | undefined, registro: RegistroSimbolo): void {
    const id = registro.protomolecula;
    const clave = d ? claveDestino(d) : null;
    const ref = React.useRef({ d, registro });
    ref.current = { d, registro };
    React.useEffect(() => {
        if (!clave || !id) return;
        const almacen = almacenMoleculas();
        if (!almacen) return;
        let ultima = 0;
        const revisar = () => {
            if (typeof document !== "undefined" && document.hidden) return;
            const { d, registro } = ref.current;
            if (!d) return;
            const m = cargarMolecula(almacen, id) as Molecula | null;
            if (!m || typeof m.actualizadaEn !== "number" || m.actualizadaEn <= Math.max(ultima, registro.actualizado)) return;
            ultima = m.actualizadaEn;
            const base = registro.archivo ?? SIMBOLO_OFICIAL;
            const r = archivoDesdeMolecula(m, base);
            if (!r.ok) return;
            const oficialIntacto = base.fuente.tipo === "oficial" && JSON.stringify(r.archivo) === JSON.stringify(SIMBOLO_OFICIAL);
            void guardarSimbolo(d, nuevoRegistro(oficialIntacto ? null : r.archivo, m.actualizadaEn, id));
        };
        const alAlmacen = (e: StorageEvent) => { if (e.key === PREFIJO_MOLECULA + id) revisar(); };
        window.addEventListener("storage", alAlmacen);
        // La sesión de la Protomolécula guarda en esta misma pestaña (sin evento «storage»): un vistazo barato cada 1,5 s.
        const t = window.setInterval(revisar, 1500);
        return () => { window.removeEventListener("storage", alAlmacen); window.clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clave, id]);
}

/** Id del perfil activo de ESTE aparato (sin cargar la lista de perfiles). */
export function usePerfilActivoId(): string | null {
    const [id, setId] = React.useState<string | null>(null);
    React.useEffect(() => {
        const leer = () => setId(activeProfileId());
        leer();
        const alAlmacen = (e: StorageEvent) => { if (e.key === ACTIVE_PROFILE_KEY) leer(); };
        window.addEventListener(PROFILE_ACTIVE_EVENT, leer);
        window.addEventListener("storage", alAlmacen);
        return () => { window.removeEventListener(PROFILE_ACTIVE_EVENT, leer); window.removeEventListener("storage", alAlmacen); };
    }, []);
    return id;
}

/**
 * El símbolo que pinta un escritorio: el de la entidad (página o grupo) si lo
 * tiene, si no el del perfil, si no el oficial.
 */
export function useSimboloEscritorio(destinos: { perfil?: DestinoSimbolo | null; entidad?: DestinoSimbolo | null }): {
    archivo: ArchivoSimbolo;
    rotulo: string | null;
    motivo: string | null;
} {
    const perfil = useRegistro(destinos.perfil);
    const entidad = useRegistro(destinos.entidad);
    useVueltaProtomolecula(destinos.perfil, perfil.registro);
    useVueltaProtomolecula(destinos.entidad, entidad.registro);
    const r = resolverSimbolo({ perfil: perfil.registro, entidad: entidad.registro });
    const dueno = r.de === "entidad" ? destinos.entidad : destinos.perfil;
    return React.useMemo(
        () => ({ archivo: r.archivo, rotulo: rotuloSimbolo(r.archivo, dueno), motivo: entidad.motivo ?? perfil.motivo }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [r.archivo, dueno?.ambito, dueno?.nombre, entidad.motivo, perfil.motivo],
    );
}

/** Lee un `File` elegido y lo convierte en archivo de símbolo (validado). */
export async function leerArchivoElegido(f: File): Promise<ResultadoSimbolo> {
    const tipo = tipoDeArchivoElegido(f.name, f.type);
    const nombre = f.name.replace(/\.(simbolo\.)?(json|glb|gltf|svg|png|jpe?g|webp)$/i, "").slice(0, TOPES_SIMBOLO.nombre) || "Símbolo propio";
    if (!tipo) return { ok: false, motivo: "formato no admitido (usa .simbolo.json, .glb, .gltf, .svg, .png, .jpg o .webp)", archivo: SIMBOLO_OFICIAL, avisos: [] };
    if (f.size > TOPES_SIMBOLO.archivo) return { ok: false, motivo: `el archivo pesa más de ${TOPES_SIMBOLO.archivo / 1024} KB`, archivo: SIMBOLO_OFICIAL, avisos: [] };
    if (tipo === "simbolo") return validarArchivoSimbolo(await f.text());
    if (tipo === "svg") return archivoDesdeRecurso("svg", await f.text(), nombre);
    const datos = await new Promise<string>((ok, mal) => {
        const lector = new FileReader();
        lector.onload = () => ok(String(lector.result));
        lector.onerror = () => mal(lector.error);
        lector.readAsDataURL(f);
    });
    if (tipo === "gltf") {
        const mime = f.name.toLowerCase().endsWith(".gltf") ? "model/gltf+json" : "model/gltf-binary";
        return archivoDesdeRecurso("gltf", datos.replace(/^data:[^;,]*/, `data:${mime}`), nombre);
    }
    return archivoDesdeRecurso("imagen", datos, nombre);
}

/** Descarga el archivo de símbolo como `.simbolo.json`. */
export function descargarArchivoSimbolo(a: ArchivoSimbolo): void {
    try {
        const blob = new Blob([exportarArchivoSimbolo(a)], { type: MIME_SIMBOLO });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `${a.nombre.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "simbolo"}${EXTENSION_SIMBOLO}`;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* sin DOM */ }
}

/** Ajuste completo de un destino, para los paneles de ajustes. */
export function useAjusteSimbolo(d: DestinoSimbolo | null | undefined) {
    const { registro, motivo } = useRegistro(d);
    useVueltaProtomolecula(d, registro);
    const [aviso, setAviso] = React.useState<string | null>(null);
    const [ocupado, setOcupado] = React.useState(false);
    const archivo = registro.archivo ?? SIMBOLO_OFICIAL;

    const guardar = React.useCallback(async (a: ArchivoSimbolo | null, protomolecula?: string) => {
        if (!d) return;
        setOcupado(true);
        const err = await guardarSimbolo(d, nuevoRegistro(a, Date.now(), protomolecula));
        setOcupado(false);
        setAviso(err ? `Guardado en este aparato. Nube: ${err}` : a ? "Símbolo guardado." : "Vuelve el símbolo oficial.");
    }, [d]);

    const elegir = React.useCallback(async (f: File) => {
        const r = await leerArchivoElegido(f);
        if (!r.ok) { setAviso(`No se usó el archivo: ${r.motivo}. Se mantiene el símbolo actual.`); return; }
        await guardar(r.archivo);
        if (r.avisos.length) setAviso(`Símbolo guardado. Ajustes: ${r.avisos.join("; ")}.`);
    }, [guardar]);

    const abrirEnProtomolecula = React.useCallback(() => {
        if (!d) return;
        const almacen = almacenMoleculas();
        const m = moleculaDesdeSimbolo(archivo, claveDestino(d), Date.now(), d.ambito === "grupo" ? "grupo" : "perfil");
        if (!almacen || !guardarMolecula(almacen, m)) { setAviso("Este navegador no deja guardar la molécula."); return; }
        void guardar(registro.archivo, m.id);
        let atendido = false;
        try { atendido = !window.dispatchEvent(new CustomEvent(PROTO_ORB_ABRIR_EVENT, { cancelable: true, detail: { molecula: m.id } })); } catch { /* sin ventana */ }
        setAviso(atendido
            ? "Abierto en la Protomolécula: lo que cambies allí vuelve a este símbolo."
            : "La orbe de la Protomolécula está apagada: actívala en Ajustes y vuelve a intentarlo. La molécula ya está guardada.");
    }, [d, archivo, registro.archivo, guardar]);

    return {
        archivo,
        registro,
        propio: registro.archivo !== null,
        enlazado: !!registro.protomolecula,
        aviso: aviso ?? (motivo ? `El ajuste guardado no era válido (${motivo}): se muestra el símbolo oficial.` : null),
        ocupado,
        elegir,
        usarOficial: () => guardar(null),
        exportar: () => descargarArchivoSimbolo(archivo),
        abrirEnProtomolecula,
        desenlazar: () => guardar(registro.archivo),
    };
}
