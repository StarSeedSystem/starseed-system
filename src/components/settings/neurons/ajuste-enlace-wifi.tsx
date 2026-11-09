"use client";

/**
 * AjusteEnlaceWifi — Ajustes › Neuronas › Medios: el enlace Wi-Fi directo entre neuronas (2026-11-08 · WFD1108A).
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * Contrato: `architecture/wifi-directo.md` §5. Automático / Preguntar / Nunca (por aparato), lo que puede
 * esta neurona (levantar la red, unirse a ella, una sola radio) y el permiso del sistema con su porqué en
 * claro («Dispositivos cercanos» en Android 13+, «Ubicación» en Android 12 o anterior y en el Mac: el
 * sistema lo exige para ver o crear redes Wi-Fi; StarSeed no usa la ubicación). Solo en la app nativa.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader2, Wifi } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AjusteWifiDirecto, CapacidadesWifi } from "@/lib/malla/enlace-wifi-directo";
import { AJUSTES_WIFI, AVISO_RADIO_UNICA, TEXTO_AJUSTE, textoEnlaceWifi } from "@/lib/malla/enlace-wifi-orquestacion";
import { fijarAjusteWifi, motorWifi, useAjusteWifi, useEnlaceWifi } from "@/lib/malla/enlace-wifi-motor";
// (WFA1109A) Wi-Fi P2P sin router ni hotspot, y el punto de acceso como permiso aparte (apagado por defecto).
import { fijarPuntoAcceso, puntoAccesoPermitido, suscribirPuntoAcceso } from "@/lib/malla/punto-acceso-ajuste";
import { DETALLE_PUNTO_ACCESO, ETIQUETA_PUNTO_ACCESO, ETIQUETA_WIFI_P2P, TEXTO_PAREJAS, TEXTO_PERMITIR_PUNTO_ACCESO, lanasP2pDe, nombreLana } from "@/lib/malla/wifi-p2p";

/** Lo que puede esta neurona, SIN contar el punto de acceso cuando la persona no lo permitió. */
export function textoCapacidades(c: CapacidadesWifi, puntoAcceso = false): string {
  const partes: string[] = [];
  const p2p = lanasP2pDe(c);
  if (p2p.length) partes.push(`habla Wi‑Fi P2P sin router ni hotspot (${p2p.map(nombreLana).join(" y ")}) y conserva su Wi‑Fi`);
  if (puntoAcceso) {
    if (c.ap.includes("hotspot-local")) partes.push("levanta un punto de acceso local (permitido por ti)");
    if (c.cliente.includes("corewlan")) partes.push("se une sola a la red del Android (permitido por ti)");
    if (c.cliente.includes("guiado") && !c.cliente.includes("corewlan")) partes.push("se une a mano a la red que se enseña (permitido por ti)");
  }
  return partes.length ? `Esta neurona ${partes.join(", ")}.` : "Esta neurona no tiene Wi‑Fi P2P sin hotspot: con las demás va por Bluetooth o la red local.";
}

function textoPermiso(c: CapacidadesWifi): string {
  if (c.plataforma === "android") {
    return "Android pide «Dispositivos cercanos» (Android 13+) o «Ubicación» (Android 12 o anterior) para crear o unirse a la red directa. StarSeed no usa tu ubicación.";
  }
  if (c.plataforma === "macos") {
    return "macOS pide «Ubicación» para dejar ver el nombre de las redes Wi-Fi (sin ella, te unes a mano). StarSeed no usa ni guarda tu ubicación.";
  }
  return "";
}

export function AjusteEnlaceWifi() {
  const ajuste = useAjusteWifi();
  const puntoAcceso = useSyncExternalStore(suscribirPuntoAcceso, puntoAccesoPermitido, () => false);
  const s = useEnlaceWifi();
  const [nativa, setNativa] = useState<boolean | null>(null);
  const [pidiendo, setPidiendo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void motorWifi().then((m) => {
      if (!vivo) return;
      setNativa(!!m);
      if (m) void m.capacidades(true);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (!nativa) return null;
  const c = s.capPropia;

  const pedirPermiso = async () => {
    setPidiendo(true);
    try {
      const m = await motorWifi();
      await m?.pedirPermiso();
    } finally {
      setPidiendo(false);
    }
  };

  return (
    <Card className="bg-background/40 backdrop-blur-sm" data-testid="ajuste-enlace-wifi">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wifi className="h-4 w-4 text-[#39FF14]" aria-hidden /> Medios · {ETIQUETA_WIFI_P2P}
        </CardTitle>
        <CardDescription className="leading-relaxed">
          Para lo pesado (archivos grandes, llamadas, pantalla, transmisiones) dos neuronas vecinas se hablan por Wi‑Fi directamente entre sus antenas, sin router,
          sin internet y sin hotspot, y conservan su Wi‑Fi de casa. Lo que cabe depende de la pareja:
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <ul className="space-y-1 text-xs text-muted-foreground" data-testid="parejas-wifi-p2p">
          {TEXTO_PAREJAS.map((p) => (
            <li key={p.id}>
              <span className="font-medium text-foreground">{p.titulo}:</span> {p.texto}
            </li>
          ))}
        </ul>

        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 px-3 py-2" data-testid="permitir-punto-acceso">
          <input
            type="checkbox"
            checked={puntoAcceso}
            onChange={(e) => {
              fijarPuntoAcceso(e.target.checked);
              void motorWifi().then((m) => m?.capacidades(true));
            }}
            className="mt-1 accent-[#39FF14]"
          />
          <span>
            <span className="font-medium">{TEXTO_PERMITIR_PUNTO_ACCESO}</span>
            <span className="block text-xs text-muted-foreground">
              {ETIQUETA_PUNTO_ACCESO}: {DETALLE_PUNTO_ACCESO}
            </span>
          </span>
        </label>

        <fieldset className="space-y-1.5" aria-label="Cuándo se abre el enlace Wi-Fi P2P">
          {AJUSTES_WIFI.map((a: AjusteWifiDirecto) => (
            <label
              key={a}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 transition-colors",
                ajuste === a ? "border-[#39FF14]/40 bg-[#39FF14]/5" : "border-white/10 hover:border-white/25",
              )}
            >
              <input type="radio" name="enlace-wifi-directo" value={a} checked={ajuste === a} onChange={() => fijarAjusteWifi(a)} className="mt-1 accent-[#39FF14]" />
              <span>
                <span className="font-medium">{TEXTO_AJUSTE[a].nombre}</span>
                <span className="block text-xs text-muted-foreground">{TEXTO_AJUSTE[a].detalle}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {c ? (
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <p className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{c.plataforma}</Badge>
              {c.wifi ? <Badge variant="outline">Wi-Fi encendido</Badge> : <Badge variant="destructive">Wi-Fi apagado</Badge>}
              {c.permiso === "concedido" && <Badge variant="outline">permiso concedido</Badge>}
              {c.permiso === "denegado" && <Badge variant="destructive">permiso denegado</Badge>}
            </p>
            <p>{textoCapacidades(c, puntoAcceso)}</p>
            {c.radioUnica && puntoAcceso && <p className="text-amber-300/90">{AVISO_RADIO_UNICA}</p>}
            {(c.permiso === "preguntar" || c.permiso === "denegado") && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">{textoPermiso(c)}</span>
                <Button size="sm" variant="outline" className="cursor-pointer" onClick={() => void pedirPermiso()} disabled={pidiendo}>
                  {pidiendo && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />}
                  {c.permiso === "denegado" ? "Volver a pedir" : "Dar permiso"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Esta app aún no dice qué puede (app anterior a WFD1108A o la parte nativa no respondió).</p>
        )}

        {s.estado.fase === "activo" && <p className="text-xs text-emerald-300">{textoEnlaceWifi({ mbps: s.estado.mbps })} con {s.estado.nombreOtro ?? "otra neurona"}.</p>}
        {s.ultimoRespaldo && s.estado.fase === "fallido" && <p className="text-xs text-amber-300/90">{s.ultimoRespaldo}</p>}
      </CardContent>
    </Card>
  );
}
