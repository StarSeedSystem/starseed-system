# Mensajería, Contactos, llamadas y apps en vivo (2026-09-28)

SOP de la ola que rehízo `/messages` y sustituyó «seguir» (personas) por **Contactos**. Fuente de
verdad de los contratos: `src/lib/contactos/tipos.ts`, `src/lib/mensajeria/{ajustes-tipos,formato-tipos,carpetas-tipos}.ts`
y la migración `supabase/migrations/20260928120000_contactos_presencia_mensajeria.sql`.

## Dónde vive cada dato

| Dato | Dónde | Quién lo ve |
|---|---|---|
| Libreta de contactos (teléfonos, correos, descripción, relación, categorías, listas) | `entity_state` de la cuenta, clave `contactos` | Solo el dueño |
| Notas de una persona (línea de tiempo) | `entity_state`, clave `contacto-notas:<id>` (se carga al abrir la ficha) | Solo el dueño |
| Lista pública de contactos del perfil | `os_contactos_publicos` (dueño, contacto, etiqueta de relación) | Todos; los perfiles no públicos no se resuelven |
| Ajustes de la sección y de cada chat/grupo/correo | `entity_state`, clave `mensajeria` | Solo el dueño, en todas sus neuronas |
| Carpetas privadas de un chat | `entity_state`, clave `carpetas-hilos` | Solo quien las crea |
| Carpetas compartidas de un chat | `os_dm_threads.meta.carpetas` | Miembros del chat; «pública» se publica además en la Biblioteca |
| En línea / última vez | `os_presencia` (tabla aparte, fuera del realtime) | Usuarios con sesión, si la persona lo muestra |
| Mensaje enriquecido | `os_dm_messages.formato` (jsonb) + `body` en texto plano | Miembros del chat |
| Apps en vivo y llamadas | `os_sesiones_vivas` + RPC `unirse_sesion_publica` para enlaces públicos | Chat, invitados o quien tenga el enlace público |

Todo lo local-primero (contactos, ajustes, carpetas privadas) sigue el patrón de la Biblioteca:
caché en localStorage, escritura diferida de 800 ms con lectura-fusión-escritura, aviso entre
dispositivos por `live-signal`, fusión por elemento con `actualizado` y lápidas (`borrado`).

## Reglas del área

- **Contactos privados por defecto.** Los «seguidos» de personas se importaron como contactos
  **privados** (una vez, `migradoSeguidos`). Un contacto sin cuenta StarSeed nunca puede ser
  público: es un tercero que no ha consentido aparecer en la red. En la lista pública solo viaja
  el tipo de relación, nunca teléfonos, correos, notas ni el matiz de la relación.
- **«Seguir» sigue existiendo para entidades** (páginas, comunidades, E.F., partidos): `os_follows`.
- **Ajustes personales, nunca punitivos.** Silenciar, archivar, restringir o vaciar un chat solo
  cambia lo que ve quien lo decide (Justicia restaurativa, CLAUDE.md §6).
- **Formato = dato, no código.** `validarFormato` (lista blanca, límites, sin `javascript:` ni
  `blob:`, sin rutas `/api` o `/auth` como medio). Las ventanas web son iframes con `sandbox` sin
  `allow-same-origin` y se activan con un clic; las «apps» son rutas del OS; nada ejecuta código ajeno.
- **Apps en vivo honestas.** Todas sincronizan de verdad sobre `os_spaces`: pizarra, sala con
  plantilla, escritorio, ventana web, y desde la segunda tanda (2026-09-28) documento y presentación
  (`src/lib/vivo/doc-colaborativo`, fusión por bloque/diapositiva), tabla de datos (fusión por
  celda, fórmulas con un evaluador propio sin `eval`), panel compartido, juegos (diario de jugadas
  con reglas puras), programas (bloques declarativos con estado compartido, nunca código), escena
  3D y sala XR (objetos por elemento, avatares por canal ≤ 10 Hz). Los tipos nuevos usan
  `kind 'dashboard'` + `doc.vivo`/`doc.app` o los kinds que añaden sus migraciones (siempre
  sumando a la lista, nunca reescribiéndola). Lo que aún no hacen está en `nota` de cada entrada
  de `catalogo-vivo.ts`.
- **Llamadas** WebRTC en malla completa (hasta 8), señalización por Realtime `llamada:<sesionId>`,
  STUN públicos y TURN servido por `/api/llamadas/ice` (Cloudflare, Metered o fijo por entorno;
  guía en `architecture/llamadas-turn-y-canales-privados.md`). VR/AR abren `/sala-xr`.
  Desde la segunda tanda la señalización va por canales PRIVADOS de Realtime con RLS sobre
  `realtime.messages` (`llamada:<id>` para miembros e invitados, `llamada:<id>:<token>` para el
  enlace público); si el servidor no autoriza, la llamada se detiene con un aviso: nunca se cae a
  un canal público en silencio.
- **Capas globales perezosas.** `MontajeGlobalMensajeria` (layout raíz, `next/dynamic`) monta el
  latido de presencia, la capa de llamadas, la presencia de apps en vivo y el aviso de novedad del
  bloqueo. Nada de eso entra en el grafo común.
- **La migración puede no estar aplicada**: cada llamada a tablas/columnas nuevas degrada con un
  mensaje en español (`dm.ts` reintenta sin `formato` si la columna no existe).

## Rutas nuevas

`/contactos` (app, en el OmniDock y el catálogo) · `/llamada/[id]` · `/vivo/[id]` · `/documentos`,
`/documento/[id]`, `/presentacion/[id]`, `/tabla`, `/dashboard-compartido`, `/juego`, `/programa`,
`/escena`, `/sala-xr` (en el catálogo de apps y la Biblioteca; en el dock, apagadas hasta que las añadas) · pestaña
«Contactos» en `/profile/[username]`.
