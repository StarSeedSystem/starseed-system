import type {
  DetectedSignal,
  SignalMetric,
} from "./signals";

const CINCO_MINUTOS_MS = 5 * 60_000;
const PICTOGRAMA_INICIAL = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\uFE0F|\u200D|\s)+/gu;

export function nombreLimpio(nombre: string): string {
  const original = nombre.trim();
  const limpio = original.replace(PICTOGRAMA_INICIAL, "").trimStart();
  return limpio || original;
}

function copiarSenal(senal: DetectedSignal): DetectedSignal {
  return {
    ...senal,
    metrics: senal.metrics.map((metrica) => ({ ...metrica })),
    starseed: senal.starseed
      ? { ...senal.starseed, capabilities: [...senal.starseed.capabilities] }
      : null,
    placement: { ...senal.placement },
    actions: senal.actions.map((accion) => ({ ...accion })),
  };
}

function ponerMetrica(
  metricas: SignalMetric[],
  label: string,
  value: string,
): SignalMetric[] {
  const indice = metricas.findIndex((metrica) => metrica.label === label);
  if (indice < 0) return [...metricas, { label, value }];
  return metricas.map((metrica, i) => i === indice ? { label, value } : metrica);
}

export function fusionarRadar(
  senales: DetectedSignal[],
  ahora: number = Date.now(),
): DetectedSignal[] {
  const copias = senales.map((senal) => {
    const copia = copiarSenal(senal);
    if (copia.antenna !== "account" && copia.antenna !== "relay") return copia;
    return {
      ...copia,
      label: nombreLimpio(copia.label),
      starseed: copia.starseed
        ? {
            ...copia.starseed,
            name: copia.starseed.name == null
              ? null
              : nombreLimpio(copia.starseed.name),
          }
        : null,
    };
  });
  const cuentas = new Map<string, number>();
  copias.forEach((senal, indice) => {
    if (senal.antenna === "account" && senal.starseed) {
      cuentas.set(senal.starseed.sourceId, indice);
    }
  });
  const omitidas = new Set<number>();

  copias.forEach((faro, indiceFaro) => {
    const identidad = faro.starseed;
    if (faro.antenna !== "relay" || !identidad?.ownAccount || !identidad.neuronId) return;
    const indiceCuenta = cuentas.get(identidad.neuronId);
    if (indiceCuenta == null) return;
    const cuenta = copias[indiceCuenta];
    if (!cuenta.starseed) return;

    const ultimoFaro = faro.metrics.find((metrica) => metrica.label === "Último faro")?.value
      ?? "sin dato";
    let metrics = ponerMetrica(cuenta.metrics, "Faro en el relé", ultimoFaro);
    if ((identidad.onlineCount ?? 0) > 0) {
      metrics = ponerMetrica(metrics, "Nodos LoRa que ve", `${identidad.onlineCount}`);
    }
    const capabilities = Array.from(new Set([
      ...cuenta.starseed.capabilities,
      "faro en el relé",
    ]));
    const fresco = faro.lastHeard != null
      && Math.max(0, ahora - faro.lastHeard) < CINCO_MINUTOS_MS;
    const reanima = fresco && cuenta.starseed.online === false;
    if (reanima) metrics = ponerMetrica(metrics, "Estado", "en línea (por su faro)");
    const calidad = reanima
      ? cuenta.quality == null ? faro.quality
        : faro.quality == null ? cuenta.quality
        : Math.max(cuenta.quality, faro.quality)
      : cuenta.quality;

    copias[indiceCuenta] = {
      ...cuenta,
      quality: calidad,
      metrics,
      starseed: {
        ...cuenta.starseed,
        online: reanima ? true : cuenta.starseed.online,
        capabilities,
      },
    };
    omitidas.add(indiceFaro);
  });

  return copias.filter((_, indice) => !omitidas.has(indice));
}
