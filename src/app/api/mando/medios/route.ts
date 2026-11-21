import { cuotaDrive, detectarDrive, medirDisco } from "@/lib/mando/almacenamiento";
import { guardianMando } from "@/lib/mando/guardian";
import { avisosDeMediosUnicos, construirMapaAlmacenamiento, filaAlmacenamiento } from "@/lib/mando/mapa-medios";
import type { MedioVivo } from "@/lib/mando/mapa-medios";
import { sondearMedios } from "@/lib/mando/medios-computo";
import type { MedioComputo, ResumenMedios } from "@/lib/mando/medios-computo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GB_LIBRES = /(\d+(?:[.,]\d+)?)\s*GB\s*libres/i;
const GB_LIBRE_AHORA = /libre ahora:\s*(\d+(?:[.,]\d+)?)\s*GB/i;

function gbDe(texto: string, patron: RegExp): number {
    const coincidencia = patron.exec(texto);
    if (!coincidencia) return 0;
    const valor = Number(coincidencia[1].replace(",", "."));
    return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

function aMedioVivo(medio: MedioComputo, macLibreGb: number, drive: { montado: boolean; libreGb: number }): MedioVivo {
    const id = medio.id.trim() || medio.nombre;
    const esMac = id === "mac";
    const esMaggabox = id === "maggabox";
    const esA1 = id === "oracle" || id === "a1";
    const discos: MedioVivo["discos"] = [];

    if (esMac) {
        if (macLibreGb > 0) discos.push({ libreGb: macLibreGb, origen: "Mac (local)" });
        if (drive.montado) discos.push({ libreGb: drive.libreGb, origen: "Drive (espejo)" });
    } else {
        const libreGb = esMaggabox
            ? gbDe(medio.capacidad, GB_LIBRES)
            : esA1
              ? gbDe(medio.capacidad, GB_LIBRE_AHORA)
              : 0;
        if (libreGb > 0) discos.push({ libreGb, origen: esMaggabox ? "Maggabox (SSH)" : "A1 (Oracle)" });
    }

    return {
        id,
        nombre: medio.nombre,
        medio: esMac ? "mac" : esMaggabox ? "linux" : "nube",
        estado: medio.estado,
        capacidad: discos.reduce((suma, disco) => suma + disco.libreGb, 0),
        detalle: medio.detalle,
        discos,
        computo: { cpu: 0, ramMb: 0, contenedores: false },
        enjambre: { agentes: 0, tipo: "python" },
        capas: [],
        avisos: [],
    };
}

async function mapaDeMedios(resultado: ResumenMedios): Promise<{
    mapa: ReturnType<typeof construirMapaAlmacenamiento>;
    almacenamientoGlobal: ReturnType<typeof filaAlmacenamiento>;
    avisosMediosUnicos: string[];
}> {
    const [disco, drive, cuota] = await Promise.all([medirDisco(), detectarDrive(), cuotaDrive()]);
    const macLibreGb = disco ? Math.round((disco.libreMb / 1024) * 10) / 10 : 0;
    const driveLibreGb = cuota ? Math.round(cuota.libreGb * 10) / 10 : 0;
    const medios = resultado.medios.map((medio) => aMedioVivo(medio, macLibreGb, { montado: drive.montado, libreGb: driveLibreGb }));
    return {
        mapa: construirMapaAlmacenamiento(medios),
        almacenamientoGlobal: filaAlmacenamiento(medios),
        avisosMediosUnicos: avisosDeMediosUnicos(medios),
    };
}

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;

    const url = new URL(request.url);
    const paramForzar = url.searchParams.get("forzar");
    const forzar = paramForzar === "1" || paramForzar === "true";

    try {
        const resultado = await sondearMedios({ forzar });
        const mapa = await mapaDeMedios(resultado);
        return Response.json({ ...resultado, ...mapa }, {
            headers: { "Cache-Control": "no-store" },
        });
    } catch (err) {
        const msj = err instanceof Error ? err.message : String(err);
        return Response.json(
            {
                medios: [],
                resumen: { listos: 0, usables: 0, porHacer: 0, agentesAhora: 0 },
                error: `No se pudieron consultar los medios de cómputo: ${msj}`,
            },
            { headers: { "Cache-Control": "no-store" } },
        );
    }
}
