import type { TarjetaNeurona, TransporteNeurona } from "@/lib/nfc/tarjeta";
import type { PreferenciasNFC, PreferenciasRelacion, RelacionNFC, AccionCatalogo, AvisoNFC } from "@/lib/nfc/preferencias";

export interface DecisionNFC {
    perfilVisible: boolean;
    pedirPermisoPerfil: boolean;
    accionesOfrecidas: AccionCatalogo[];
    accionesAutomaticas: AccionCatalogo[];
    aviso: AvisoNFC;
    transporteRecomendado?: TransporteNeurona;
    registrarUbicacion: boolean;
    tipoRegistroUbicacion: "privado" | "publico" | "no";
}

function obtenerMejorTransporte(transportes: TransporteNeurona[]): TransporteNeurona | undefined {
    const prioridad: TransporteNeurona["tipo"][] = ["wifi-direct", "malla", "ble"];
    for (const tipo of prioridad) {
        const encontrado = transportes.find((t) => t.tipo === tipo);
        if (encontrado) return encontrado;
    }
    return transportes[0];
}

function filtrarAccionesPorOfertas(acciones: AccionCatalogo[], ofertas: TarjetaNeurona["ofertas"]): AccionCatalogo[] {
    const capacidadesOfrecidas = new Set(ofertas.map((o) => o.tipo));
    return acciones.filter((accion) => {
        switch (accion) {
            case "compartir-capacidades":
            case "vincular-capa":
                return capacidadesOfrecidas.has("capacidad") || capacidadesOfrecidas.has("capa");
            case "enviar-archivo":
                return capacidadesOfrecidas.has("almacenamiento");
            case "control-remoto":
                return capacidadesOfrecidas.has("senal");
            case "abrir-oferta-nodo":
                return true;
            case "registrar-ubicacion":
                return true;
            default:
                return true;
        }
    });
}

export function decidirEncuentro(
    tarjetaPropia: TarjetaNeurona,
    tarjetaAjena: TarjetaNeurona,
    relacion: RelacionNFC,
    preferencias: PreferenciasNFC
): DecisionNFC {
    const prefsRelacion = obtenerPreferenciasParaRelacion(preferencias, relacion, tarjetaAjena.neuronaId);

    if (prefsRelacion.aviso === "ignorar") {
        return {
            perfilVisible: false,
            pedirPermisoPerfil: false,
            accionesOfrecidas: [],
            accionesAutomaticas: [],
            aviso: "ignorar",
            transporteRecomendado: undefined,
            registrarUbicacion: false,
            tipoRegistroUbicacion: "no",
        };
    }

    let perfilVisible = false;
    let pedirPermisoPerfil = false;

    switch (prefsRelacion.perfil) {
        case "publico":
            perfilVisible = true;
            break;
        case "pedir-permiso":
            pedirPermisoPerfil = true;
            break;
        case "no-mostrar":
        default:
            perfilVisible = false;
            break;
    }

    const accionesOfrecidasFiltradas = filtrarAccionesPorOfertas(prefsRelacion.accionesOfrecidas, tarjetaAjena.ofertas);
    const accionesAutomaticasFiltradas = filtrarAccionesPorOfertas(prefsRelacion.accionesAutomaticas, tarjetaAjena.ofertas);

    const transporteRecomendado = obtenerMejorTransporte(tarjetaAjena.transportes);

    let registrarUbicacion = false;
    let tipoRegistroUbicacion: "privado" | "publico" | "no" = "no";

    if (prefsRelacion.ubicacion !== "no") {
        registrarUbicacion = true;
        tipoRegistroUbicacion = prefsRelacion.ubicacion;
    }

    return {
        perfilVisible,
        pedirPermisoPerfil,
        accionesOfrecidas: accionesOfrecidasFiltradas,
        accionesAutomaticas: accionesAutomaticasFiltradas,
        aviso: prefsRelacion.aviso,
        transporteRecomendado,
        registrarUbicacion,
        tipoRegistroUbicacion,
    };
}

function obtenerPreferenciasParaRelacion(
    prefs: PreferenciasNFC,
    relacion: RelacionNFC,
    neuronaId?: string
): PreferenciasRelacion {
    let base = { ...prefs.porRelacion[relacion] };
    if (neuronaId) {
        const excepcion = prefs.excepciones.find((e) => e.neuronaId === neuronaId);
        if (excepcion) {
            if (excepcion.perfil) base.perfil = excepcion.perfil;
            if (excepcion.accionesAutomaticas) base.accionesAutomaticas = [...excepcion.accionesAutomaticas];
            if (excepcion.accionesOfrecidas) base.accionesOfrecidas = [...excepcion.accionesOfrecidas];
            if (excepcion.aviso) base.aviso = excepcion.aviso;
            if (excepcion.ubicacion) base.ubicacion = excepcion.ubicacion;
        }
    }
    return base;
}