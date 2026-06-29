# Cerebros · Configuración de Salidas de Chat (Canales)

> Diseño: cada **cerebro** configura sus **salidas de chat** — los chats de Aurora y su
> vínculo con chats externos (**Telegram, Google Chat**, o cualquier servicio con API).
> Integrado con **todas las funciones de Aurora** en todos los sistemas StarSeed.

## Principios
- **Inicio sencillo:** se mantienen las opciones predeterminadas actuales; todo funcional out-of-the-box.
- **Guía progresiva:** el sistema guía al usuario para incorporar conexiones adicionales paso a paso.
- **Aurora como base:** toda salida usa Aurora con sus configuraciones (ver `starseed_memory_root/ego/ego.md`),
  incluyendo el uso **inteligente de distintos servicios de IA** (y de ideas) según el contexto/solicitud del chat.

## Canales
- Selección de **uno o varios** canales por cerebro: chats internos de Aurora + externos
  (Telegram, Google Chat, Slack, WhatsApp, etc. — cualquier API).
- **Sincronizados:** el contexto se integra entre canales y con las funciones de Aurora.

## Acceso (permisos)
- Cualquier chat conectado al **servidor del cerebro** puede tener **acceso completo** al cerebro:
  - Memorias (memory root), configuraciones y opciones.
  - **Terminales** de los dispositivos/servidores conectados al cerebro (acceso completo desde el sistema y desde el chat).
  - **Servicios de IA** del cerebro (cualquier proveedor; Aurora elige inteligentemente).
- Permisos **configurables por canal** (de solo-lectura a control total), con *defaults* seguros.

## Inteligencia contextual
- Aurora interpreta cada solicitud desde el chat donde esté y elige el servicio/herramienta/terminal
  adecuados al contexto y a la solicitud.

## Estado
- **Diseño.** Defaults simples ya activos (chats actuales de Aurora). Implementación pendiente (ver `tasks`).
- Relación: `ego.md` (config Aurora) · `sync.md` (vínculos de memoria) · Hub de Conexiones · `src/lib/telegram-spaces.ts`.
