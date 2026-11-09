"use client";

/**
 * CompatibilidadNeuronas — Ajustes › Neuronas › Medios: «Compatibilidad entre tus neuronas» (2026-11-09 · MTZ1109A).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/matriz-enlaces-directos.md` §6. Una fila por pareja de TUS neuronas (las de la cuenta), con los
 * carriles directos que caben ahora entre las dos —en el orden en que se usan— y una línea con el límite («Mac ↔ Windows:
 * solo Bluetooth (macOS no tiene Wi‑Fi Direct)»). Accesible: tabla real con título y cabeceras, nada depende del color,
 * se desplaza en horizontal en móvil sin romper la página.
 */

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Network } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { filasCompatibilidad, nombrePlataforma, plataformaMatriz, lanasInferidas, type Lana, type NeuronaDeCuenta, type PlataformaMatriz } from "@/lib/malla/matriz-enlaces";
import { lanasCaidas, fallosEnlaces, suscribirFallosEnlaces } from "@/lib/malla/fallos-enlaces";
import { lanasPropiasYa, suscribirLanasVecinas, vecinasConLanas } from "@/lib/malla/lanas-propias";
import { listNeurons, NEURON_EVENT, thisDeviceId, type Neuron } from "@/lib/neurons/neurons";

/** Las neuronas de la cuenta como las ve la matriz: lo que anuncian (o lo inferido) y, para esta, lo medido ahora. Puro. */
export function neuronasParaMatriz(
  lista: readonly Neuron[],
  vivas: ReadonlyMap<string, { plataforma: PlataformaMatriz; lanas: NeuronaDeCuenta["lanas"]; anunciadas: boolean }>,
  propia: { id: string; plataforma: PlataformaMatriz; lanas: NeuronaDeCuenta["lanas"] } | null,
): NeuronaDeCuenta[] {
  return lista.map((n) => {
    if (propia && n.id === propia.id && (n.isThisDevice || n.id === propia.id)) {
      return { id: n.id, nombre: n.name || "Esta neurona", plataforma: propia.plataforma, lanas: propia.lanas, esta: true, anunciadas: true };
    }
    const viva = vivas.get(n.id);
    if (viva) return { id: n.id, nombre: n.name, plataforma: viva.plataforma, lanas: viva.lanas, anunciadas: viva.anunciadas };
    const caps = n.capabilities;
    const plataforma = plataformaMatriz(caps?.plataformaLanas ?? caps?.platform);
    if (caps?.lanas) return { id: n.id, nombre: n.name, plataforma, lanas: caps.lanas, anunciadas: true };
    return { id: n.id, nombre: n.name, plataforma, lanas: lanasInferidas(plataforma, { nativo: false }), anunciadas: false };
  });
}

export interface PropiedadesTabla {
  neuronas: readonly NeuronaDeCuenta[];
  /** Carriles en espera por un fallo reciente, por pareja. */
  caidas?: (a: string, b: string) => readonly Lana[];
  /** Si se sabe que están en la misma red. */
  mismaRed?: boolean;
}

export function TablaCompatibilidad({ neuronas, caidas, mismaRed }: PropiedadesTabla) {
  const filas = useMemo(() => filasCompatibilidad(neuronas, { caidas, mismaRed }), [neuronas, caidas, mismaRed]);
  if (neuronas.length < 2) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="compatibilidad-vacia">
        Con una sola neurona vinculada no hay parejas que comparar. Añade otra (Ajustes › Neuronas) y aquí verás cómo se hablan.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto" role="region" aria-label="Compatibilidad entre tus neuronas, tabla desplazable" tabIndex={0}>
      <table className="w-full min-w-[34rem] border-collapse text-left text-xs" data-testid="tabla-compatibilidad">
        <caption className="sr-only">Carriles directos disponibles ahora entre cada pareja de tus neuronas, en el orden en que se usan</caption>
        <thead>
          <tr className="border-b border-white/10 text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Pareja</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Carriles ahora (en orden)</th>
            <th scope="col" className="py-1.5 font-medium">Límite</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={`${f.a.id}|${f.b.id}`} className="border-b border-white/5 align-top" data-testid="fila-compatibilidad">
              <th scope="row" className="py-2 pr-3 font-normal">
                <span className="font-medium text-foreground">{f.a.nombre}</span> <span aria-hidden>↔</span>
                <span className="sr-only"> con </span> <span className="font-medium text-foreground">{f.b.nombre}</span>
                <span className="block text-muted-foreground">
                  {nombrePlataforma(f.a.plataforma)} ↔ {nombrePlataforma(f.b.plataforma)}
                </span>
              </th>
              <td className="py-2 pr-3">
                {f.carriles.length ? (
                  <ol className="flex flex-wrap gap-1" aria-label="Carriles en orden de uso">
                    {f.carriles.map((c, i) => (
                      <li key={c}>
                        <Badge variant="outline">{i + 1} · {c}</Badge>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <span className="text-muted-foreground">ninguno directo: usa la malla de la cuenta</span>
                )}
                {f.enEspera.length > 0 && <p className="mt-1 text-amber-300/90">En espera por un fallo reciente: {f.enEspera.join(", ")}</p>}
                {f.decision.puntoAcceso && <p className="mt-1 text-muted-foreground">Punto de acceso permitido por ti en las dos (aparte, no es directo).</p>}
              </td>
              <td className="py-2 text-muted-foreground">
                {f.decision.limite}
                {f.aviso && <span className="block text-amber-300/90">{f.aviso}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AjusteCompatibilidadNeuronas() {
  const [lista, setLista] = useState<Neuron[] | null>(null);
  const vivas = useSyncExternalStore(suscribirLanasVecinas, vecinasConLanas, vecinasConLanas);
  // Los fallos entran por la suscripción; la lectura de carriles en espera se hace al pintar.
  const fallos = useSyncExternalStore(suscribirFallosEnlaces, fallosEnlaces, fallosEnlaces);

  useEffect(() => {
    let vivo = true;
    const cargar = () => {
      void listNeurons()
        .then((l) => vivo && setLista(l))
        .catch(() => vivo && setLista([]));
    };
    cargar();
    window.addEventListener(NEURON_EVENT, cargar);
    return () => {
      vivo = false;
      window.removeEventListener(NEURON_EVENT, cargar);
    };
  }, []);

  const neuronas = useMemo(() => {
    const yo = thisDeviceId();
    const propia = lanasPropiasYa();
    return neuronasParaMatriz(lista ?? [], vivas, { id: yo, ...propia });
  }, [lista, vivas]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Los fallos son de ESTE aparato con otra neurona: solo cuentan en las parejas donde entra este aparato.
  const caidas = useMemo(() => {
    const yo = thisDeviceId();
    return (a: string, b: string): readonly Lana[] => (a === yo ? lanasCaidas(b) : b === yo ? lanasCaidas(a) : []);
  }, [fallos]);

  if (lista === null) return null;
  return (
    <Card className="bg-background/40 backdrop-blur-sm" data-testid="ajuste-compatibilidad-neuronas">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="h-4 w-4 text-[#39FF14]" aria-hidden /> Compatibilidad entre tus neuronas
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Cada pareja de tus aparatos usa, sin router ni hotspot, todos los carriles que entiendan los dos: Wi‑Fi P2P, Wi‑Fi Direct, Bluetooth y red local. Si uno
          falla, sigue por el siguiente y lo reintenta más tarde.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TablaCompatibilidad neuronas={neuronas} caidas={caidas} />
      </CardContent>
    </Card>
  );
}
