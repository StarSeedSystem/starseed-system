# Puente de Mando · mod de Claude Code (StarSeed OS)

El Puente de Mando de StarSeed OS dentro de Claude Code: la misma información y las mismas
palancas que el Mando del navegador (`localhost:9002/mando`), a un atajo.

## Qué trae

- **Panel** «Puente de Mando», con siete pestañas (teclas `1`–`7`; `r` actualiza):
  - **Pulso**: en curso, agentes, bloqueadas, olas, sin publicar, crédito, publicación y Mac.
  - **Chat Director**: últimos mensajes, bandeja de claude-cowork (con «✓ visto») y un campo
    para escribir a la flota como Alex.
  - **Bloqueadas**: cada una con su causa y **Reparar** si el Mando la puede reintentar.
    **Reparar todas las que sirvan** pide un segundo clic.
  - **Olas**: el medidor de olas activas.
  - **Producción**: la publicación en curso, paso a paso. Lanzar otra pide una nota y una
    confirmación, y no se ofrece mientras haya una corriendo.
  - **Servicios**: `com.starseed.*` vivos y parados, memoria, carga, enjambre y avisos.
  - **Uso**: crédito, memoria, disco, tokens de Claude en la Mac y límites.
- **Órdenes**:
  - `/mando [pestaña]` abre el panel.
  - `/mando-estado` escribe el resumen en texto.
- **Línea de estado viva**: `⟁ Mando · 5 en curso · 11 agentes · 3/32 bloq · pub corriendo: …`.
  Se relee cada 5 min.
- **Herramientas del modelo**, todas `mcp__puente-de-mando__*`: `estado`, `medidor`, `reparar`,
  `chat`, `informar` (publica como claude-cowork) y `publicar` (solo con la palabra de Alex o
  dentro de las puertas del director de producción).

## Cómo llega a la Mac

El Mando solo escucha en `127.0.0.1:9002` de la Mac. Cada lectura o acción es **una** llamada
al servidor MCP `remote-devices` (Desktop Commander, `start_process`). Esa llamada corre
`hooks/script-mac.ts`, un Python de biblioteca estándar que entra por heredoc.

- El script reduce el Mando a un resumen de unos 50 KB, en lugar de los 2,5 MB de `/estado`,
  y lo devuelve en una sola línea `@@MANDO@@{json}`.
- Las acciones usan las mismas rutas que el Mando:
  - `/api/mando/reintentar` con `{ids, automatico: true}`;
  - `/api/mando/director-chat` con `decir`;
  - `/api/mando/publicacion` con `publicar`;
  - y `scripts/puente/director_chat.py` para los informes y las entregas de claude-cowork.
- Nunca imprime claves ni rutas de secretos.

## Desarrollo

    claude plugin validate .        # manifiesto, ganchos y contrato de estado
    claude plugin test .            # 11 pruebas con la Mac simulada (terminal y escritorio)

- Sesión de Cowork: vive en la carpeta de mods de la sesión y se recarga sola si la recarga en
  caliente está activada.
- En la Mac, con Claude Code: `claude --plugin-dir <esta carpeta>`. Ahí `remote-devices` no
  existe y el mod corre el mismo script en local con `$.process.run`, sin cambiar nada.
