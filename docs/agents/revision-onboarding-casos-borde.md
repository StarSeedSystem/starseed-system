[nvidia/nemotron-3-super-120b-a12b:free · 55.0s]
1. Sin conexión de red durante el registro o wizard, mostrar mensaje claro y permitir reintento sin perder progreso.
2. RAM no expuesta por el navegador (valor undefined o 0), fallback a configuración mínima y avisar al usuario.
3. Usuario cancela o cierra el navegador a mitad del wizard; al volver debe retomar desde el último paso completado.
4. Dispositivo nuevo con cuenta existente: flujo corto debe cargar correctamente cerebros existentes y permitir elegir modo de sync.
5. Usuario anónimo/invitado intenta acceder al wizard; redirigir a login o mostrar que solo usuarios autenticados pueden continuar.
6. Pantalla muy pequeña (ej. móvil <320px ancho): elementos del wizard no se solapan y son táctiles accesibles.
7. Doble ejecución accidental del wizard (recargar página después de completar); debe detectar estado completado y redirigir al dashboard.
8. Correo sugerido @star.seed ya está tomado; ofrecer sugerencias alternativas o permitir usar correo externo.
9. Formato de correo externo inválido (falta @, dominio mal formado); validación en tiempo real con feedback claro.
10. Selección de @handle que ya existe o contiene caracteres no permitidos; mostrar error y sugerir variantes.
11. Paso de recuperación (pregúntale por correo de recuperación) dejado vacío o con formato incorrecto; validar antes de continuar.
12. Creación de cerebro por defecto falla por límite de almacenamiento local; notificar y ofrecer opción de usar solo sync nube.
13. Toggle de sync nube desactivado pero sin almacenamiento local disponible; bloquear avance y explicar requisito.
14. Personalidad IA opcional no se guarda correctamente al cambiar de opción; asegurar persistencia entre pasos.
15. Permiso de micrófono denegado; wizard debe continuar sin funciones de voz y mostrar advertencia no bloqueante.
16. Permiso de notificaciones bloqueado; impedir que intenciones de agenda fallen silenciosamente, avisar al usuario.
17. Permiso de cámara denegado al intentar usar visor embebido; visor debe mostrar placeholder y permitir continuar.
18. Permiso de ubicación denegado; funciones que dependen de geolocalización deben degradarse sin bloquear wizard.
19. Permiso de acceso a archivos denegado; opciones de import/export deben estar deshabilitadas con explicación.
20. Detector de conciencia colectiva falla al obtener nodo peer; ofrecer reintento y modo offline temporal.
21. Selección de motor auto/bitnet inconsistente con RAM detectada (p.ej. Bitnet en <2GB); advertir y sugerir alternativa.
22. Modelo seleccionado excede límite de memoria; wizard debe ajustar automáticamente a modelo más pequeño y notificar.
23. En paso de guía del sistema, enlaces rotos o videos que no cargan; proporcionar fallback de texto o reintento.
24. Usuario intenta usar caracteres emoji o especiales en @handle o nombre de cerebro; validar y limpiar entrada.
25. Al completar wizard, redirección a dashboard falla por error de ruta; mostrar pantalla de error con botón de reintento.
