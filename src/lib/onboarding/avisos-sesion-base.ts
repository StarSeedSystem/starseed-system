/**
 * Línea base de los avisos de sesión sueltos (GUI1021N · Ola 1021G).
 *
 * §5 de `architecture/guias-introduccion.md`: el aviso «Inicia sesión para…» debe ser UN
 * componente (`AvisoSesion`, con «Iniciar sesión» y «Conoce StarSeed») o, en avisos
 * transitorios, un toast que SÍ ofrece la acción de la guía. Las tareas GUI1021M1–M5 migraron
 * las suyas; estos son los que quedan sueltos EN EL CÓDIGO DE HOY, registrados para que la
 * guardia impida NUEVOS avisos sueltos respetando los que ya existen.
 *
 * La clave de cada aviso es el texto justo detrás de «Inicia sesión para», cortado en la
 * primera comilla (`"`, `'` o «`»), ángulo (`<`), llave (`}`) o punto y coma de la línea, con
 * los espacios repetidos colapsados. Cuando migres uno a `AvisoSesion` (o a un toast con la
 * guía), borra su entrada de aquí: la guardia solo falla con avisos que no estén registrados.
 * Módulo PURO: sin React, sin `node:*`, sin almacén.
 */

/** Archivos donde el texto es legítimo de por sí: la puerta de acceso, el mismo `AvisoSesion`
 *  (que documenta su propio texto) y la consola de la terminal (mensaje de la sesión). */
export const ARCHIVOS_EXENTOS = [
  "auth/auth-gate.tsx",
  "auth/aviso-sesion.tsx",
  "terminal/terminal-console.tsx",
] as const;

/** Los avisos sueltos registrados hoy, por archivo (relativo a `src/components`): el texto
 *  que sigue a «Inicia sesión para». La guardia marca como NUEVO todo aviso suelto que falte
 *  aquí. Si un archivo desaparece o se vacía, su entrada se puede borrar sin romper nada. */
export const AVISOS_SUELTOS_HOY: Record<string, readonly string[]> = {
  "agent/agent-runtime-panel.tsx": ["configurar tus agentes y servidores."], "aurora/message-context-menu.tsx": ["guardar en tu biblioteca."],
  "aurora/personalities-panel.tsx": ["compartir en tu Biblioteca.", "ver tu Biblioteca."], "brains/brains-panel.tsx": ["crear y administrar tus cerebros."],
  "brains/device-network-panel.tsx": [
    "conectar: la señalización viaja por tu cuenta y hace falta en ambos dispositivos.",
    "sincronizar entre dispositivos. Ahora mismo solo se guarda este dispositivo en el",
    "ver y sincronizar tus otros dispositivos.",
  ],
  "brains/servers-panel.tsx": ["administrar el registro de servidores de cerebros."],
  "browser/browser-windows.tsx": ["guardar ventanas en tu cuenta.", "crear y guardar ventanas.", "guardar el modo de red.", "conservarlas entre dispositivos."],
  "camera/camera-app.tsx": ["guardar en tu biblioteca."], "canvas/canvas-board.tsx": ["guardarlo."],
  "canvas/work-centers.tsx": ["crear y guardar centros de trabajo persistentes."], "cerebro/neuronas-panel.tsx": ["que este dispositivo se registre como la primera."],
  "contactos/boton-anadir-contacto.tsx": ["añadir a contactos"], "creation/library-location-picker.tsx": ["guardar en una biblioteca."],
  "creation/source-picker.tsx": ["ver tus bibliotecas."], "dashboard/editor-superior/panel-sistema.tsx": ["ver y gestionar tus perfiles."],
  "dashboard/widgets/gen4/creative-studio-widget.tsx": ["ver tus obras"], "dashboard/widgets/gen4/multiverse-hub-widget.tsx": ["ver tus mundos"],
  "dashboard/widgets/gen5/merit-gallery-widget.tsx": ["ver las tuyas ·"], "decisions/my-activity.tsx": ["ver tu actividad democrática: tus propuestas, tus votos y tus notificaciones."],
  "design/theme-mixer-panel.tsx": ["publicar en la Librería."], "education/group-education-panel.tsx": ["crear una pizarra"],
  "education/study/study-groups-panel.tsx": ["crear un grupo de estudio."], "education/study/study-guides-panel.tsx": ["personalizar la guía.", "guardar tareas."],
  "education/study/study-tasks-panel.tsx": ["guardar tareas.", "guardar las recomendaciones.", "crear proyectos."],
  "education/topic-graph.tsx": ["añadir temas propios a tu mapa."], "exocortex/memory-hub.tsx": ["crear y sincronizar tus memorias de StarSeed."],
  "exocortex/okf-panel.tsx": ["abrir tu wiki OKF (cada baúl es una wiki que Astraura mantiene por ti)."], "exocortex/provider-panel.tsx": ["administrar tus tokens de proveedor."],
  "exocortex/vaults-panel.tsx": ["administrar tus baúles de memorias."], "files/universal-file-picker.tsx": ["ver tus bibliotecas."],
  "gallery/gallery-app.tsx": ["ver tu galería personal."], "governance/delegation-panel.tsx": ["delegar o revocar tu voto."],
  "governance/liquid-delegation-panel.tsx": ["delegar tu voto.", "delegar tu voto o para revocar una delegación existente."], "governance/notifications-panel.tsx": ["ver tus notificaciones de decisiones."],
  "group/group-ai-studio.tsx": ["crear memorias del grupo."], "group/group-governance.tsx": ["proponer.", "votar."],
  "group/group-members.tsx": ["unirte al grupo.", "ver y unirte a los miembros de este grupo."],
  "hub/connections-hub.tsx": [
    "escribir a alguien.",
    "recibir sugerencias por afinidad. Mientras tanto, explora «Toda la red».",
    "ver y gestionar todo lo que sigues, los grupos donde participas",
  ],
  "hub/user-directory-results.tsx": ["escribir a alguien."], "invitations/invitation-card.tsx": ["aceptar esta invitación.", "responder esta invitación."],
  "layout/dock/iconos/acciones-compartir.tsx": ["guardar en tu Biblioteca.", "compartir en la Librería."], "layout/dock/iconos/galeria-plantillas.tsx": ["ver tu Biblioteca"],
  "layout/dock/iconos/selector-imagen.tsx": ["usar tu Biblioteca"], "library/entity-library-panel.tsx": ["ver esta biblioteca."],
  "library/finder/install-to-dialog.tsx": ["guardar en una biblioteca", "guardar en tu biblioteca o en la de tus comunidades."], "library/finder/public-catalog-section.tsx": ["guardar en una biblioteca"],
  "library/repos/repo-detail-sheet.tsx": ["replicar este repositorio."], "library/save-to-library.tsx": ["guardar en una biblioteca", "guardar referencias en tu biblioteca o en la de tus comunidades."],
  "messages/correos-panel.tsx": ["enviar.", "redactar"],
  "messages/dm/new-chat-dialog.tsx": ["escribir a alguien.", "crear un grupo.", "ver tu libreta."],
  "messages/dm/thread-view.tsx": ["enviar mensajes."], "network/feed/rich-post-card.tsx": ["referenciar esta publicación."],
  "posts/live-attachment.tsx": ["solicitar acceso."], "profile/profile-switcher.tsx": ["gestionar tu identidad soberana, perfil y correos."],
  "protomolecula/gobierno/seccion-gobierno-proto.tsx": ["proponer cambios."], "publish/publication-composer.tsx": ["publicar.", "activar el modo en vivo."],
  "recordatorios/recordatorios-panel.tsx": ["crear y gestionar tus recordatorios."], "recordatorios/recordatorios-widget.tsx": ["ver tus recordatorios."],
  "security/security-panel.tsx": ["guardar la configuración VPN en tu bóveda."], "servers/server-card.tsx": ["unirte a un servidor."],
  "settings/account/account-sync-panel.tsx": ["sincronizar"], "settings/appearance/theme-catalog-gallery.tsx": ["guardar temas en tu biblioteca"],
  "settings/neurons/neurons-panel.tsx": ["ver todas tus neuronas: ahora solo se muestra este dispositivo."], "settings/profile/profile-identity-panel.tsx": ["guardar tu perfil."],
  "settings/profile/profile-library-showcase-panel.tsx": ["elegir qué se muestra en tu perfil."], "sharing/share-access-dialog.tsx": ["crear su espacio compartido."],
  "sharing/share-to-dialog.tsx": ["publicar", "guardar en una biblioteca."], "social/PostCard.tsx": ["comentar…"],
  "social/PostFeed.tsx": ["ver el flujo real de la red."], "social/entity-editor-dialog.tsx": ["subir imágenes."],
  "storage/backends-network-panel.tsx": ["gestionar la red de servidores y almacenamiento de tus recursos."], "storage/connections-hub.tsx": ["conectar Google Drive"],
  "storage/storage-panel.tsx": ["conectar Google Drive", "configurar tus almacenes de datos y el enrutado inteligente."], "variaciones/publicar-variacion.tsx": ["que la nota pública lleve tu nombre.", "guardar en tu Biblioteca."],
  "vivo/programas/bloque-contador.tsx": ["participar."],
};
