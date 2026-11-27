"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { tarjetaAQr } from "@/lib/nfc/respaldo";
import type { TarjetaNeurona } from "@/lib/nfc/tarjeta";

interface Props {
  tarjeta: TarjetaNeurona;
  /** Lado en px; el QR se adapta a móvil, tableta, escritorio y TV. */
  lado?: number;
}

/** Respaldo sin NFC: muestra la misma tarjeta firmada como QR. La tarjeta caduca a los 30 s. */
export function QrTarjeta({ tarjeta, lado = 220 }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = tarjetaAQr(tarjeta);
    if (!r.ok) {
      setSvg(null);
      setError(r.motivo);
      return;
    }
    let vivo = true;
    QRCode.toString(r.texto, { type: "svg", margin: 1, errorCorrectionLevel: "L" })
      .then((s) => {
        if (!vivo) return;
        setSvg(s);
        setError(null);
      })
      .catch(() => {
        if (vivo) setError("No se pudo dibujar el código QR.");
      });
    return () => {
      vivo = false;
    };
  }, [tarjeta]);

  if (error) {
    return (
      <p role="alert" data-testid="qr-tarjeta-error" className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-200">
        {error}
      </p>
    );
  }

  return (
    <figure data-testid="qr-tarjeta" className="flex flex-col items-center gap-2">
      <div
        role="img"
        aria-label="Código QR con la tarjeta firmada de esta neurona"
        style={{ width: lado, height: lado }}
        className="max-w-full rounded-xl bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      />
      <figcaption className="text-center text-xs text-white/70">
        Acerca la otra neurona a este código. Vale 30 segundos.
      </figcaption>
    </figure>
  );
}
