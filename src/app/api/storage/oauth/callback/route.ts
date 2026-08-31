/**
 * Callback OAuth de los almacenamientos externos (Adenda 194).
 * ----------------------------------------------------------------------------
 * El proveedor redirige aquí con `code` y `state`. Esta ruta NO guarda nada ni
 * ve ningún token: devuelve una página mínima que reenvía el código por
 * `postMessage` a la ventana del OS que abrió el consentimiento, y se cierra.
 * El canje por token lo hace el navegador con PKCE (sin secreto de cliente),
 * así que ninguna credencial pasa por el servidor.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function pagina(payloadJson: string, origen: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Conectando…</title>
<style>body{font:14px/1.5 system-ui;margin:0;display:grid;place-items:center;height:100vh;background:#0b0b12;color:#e8e8f0}</style>
</head><body>
<p>Conexión autorizada. Puedes volver a StarSeed.</p>
<script>
  try {
    var payload = ${payloadJson};
    if (window.opener) window.opener.postMessage(payload, ${JSON.stringify(origen)});
  } catch (e) { /* la ventana principal lo detectará al cerrarse */ }
  setTimeout(function () { try { window.close(); } catch (e) {} }, 400);
</script>
</body></html>`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const origen = url.origin;

  const payload = JSON.stringify({
    tipo: "starseed:oauth",
    code: code || null,
    state: state || null,
    error: error || null,
  });

  return new NextResponse(pagina(payload, origen), {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
