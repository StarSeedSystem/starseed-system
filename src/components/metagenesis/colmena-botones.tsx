"use client";

import { Button } from "@/components/ui/button";
import { type NodoVista } from "@/lib/metagenesis/remoto-nodos";
import { textoHace } from "@/lib/metagenesis/remoto";
import { type AccionOrden } from "@/lib/metagenesis/remoto-nodos";

interface ColmenaBotonesProps {
    nodo: NodoVista;
    enVuelo: boolean;
    mandarOrden: (accion: AccionOrden, nodo?: string) => Promise<void>;
}

function ColmenaBotones({ nodo, enVuelo, mandarOrden }: ColmenaBotonesProps) {
    const enCurso = nodo.enCurso?.length > 0;
    const contenedorActivo = nodo.contenedor?.activo;
    const sinTrabajador = nodo.trabajo ? Object.keys(nodo.trabajo).length === 0 : false;
    const hayTrabajador = nodo.trabajo ? Object.keys(nodo.trabajo).length > 0 : false;

    const enviarDesconectar = async () => {
        await mandarOrden("desconectar", nodo.nodo);
    };

    const enviarContenedor = async () => {
        await mandarOrden("contenedor", nodo.nodo);
    };

    const enviarInstalarTrabajador = async () => {
        await mandarOrden("instalar_trabajador", nodo.nodo);
    };

    const sePuedeDesconectar = enCurso;
    const sePuedeConfigurarContenedor = !contenedorActivo && nodo.vivo;
    const sePuedeInstalarTrabajador = sinTrabajador && nodo.vivo && !enCurso;

    const enCursoLength = nodo.en_curso?.length || 0;
    const haceMsTrabajo = nodo.en_curso?.[0]?.punto?.t ? Date.now() - nodo.en_curso[0].punto.t : null;
    const textoHaceTrabajo = haceMsTrabajo ? `Último punto hace ${Math.round(haceMsTrabajo / 60000)} min` : null;

    return (
        <div className="flex flex-wrap gap-2">
            {textoHaceTrabajo ? (
                <span className="text-xs text-white/40 ml-2">
                    {textoHaceTrabajo}
                </span>
            ) : null}
            {sePuedeDesconectar ? (
                <Button
                    size="sm"
                    variant="destructive"
                    className="cursor-pointer"
                    disabled={enVuelo}
                    onClick={enviarDesconectar}
                    title="Guarda el trabajo a medias de sus 1 agente(s) y lo pasa a otro contenedor antes de que este aparato se quede sin internet."
                    data-testid={`mg-nodo-oracle-${nodo.nodo}-desconectar`}
                >
                    Desconectar
                </Button>
            ) : null}

            {sePuedeConfigurarContenedor ? (
                <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={enVuelo}
                    onClick={enviarContenedor}
                    title="Termina lo que lleva y no coge más."
                    data-testid={`mg-nodo-oracle-${nodo.nodo}-contenedor`}
                >
                    Dejar de usar como contenedor
                </Button>
            ) : null}

            {sePuedeInstalarTrabajador ? (
                <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    disabled={enVuelo}
                    onClick={enviarInstalarTrabajador}
                    title="Instala un trabajador (agente) en este contenedor."
                    data-testid={`mg-nodo-oracle-${nodo.nodo}-trabajador`}
                >
                    Instalar trabajador
                </Button>
            ) : null}
        </div>
    );
}

export { ColmenaBotones };