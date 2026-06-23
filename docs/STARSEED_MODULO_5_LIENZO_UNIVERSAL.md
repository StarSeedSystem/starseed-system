# StarSeed · Módulo 5 — El Lienzo Universal de Creación (Publicaciones y Comentarios)

> Memoria de diseño (del Prompt Maestro StarSeed). Astraura y el equipo deben
> respetar estas dinámicas al construir publicaciones, comentarios y el lienzo.

## A. La Publicación como Entidad Viva y Sincronizada
- **Página Web Atómica:** una "publicación" es UNA entidad única y autocontenida en
  la base de datos (casi una mini página web). Al compartirse en varios lugares
  (feed de un Perfil, muros de Páginas, un chat…) **NO se crean copias**: se crean
  **referencias / instancias visuales** a la entidad original.
- **Sincronización total en tiempo real:** cada comentario, reacción, voto o edición
  se realiza sobre la entidad única y se refleja **instantáneamente** en todas las
  instancias donde se está viendo.
- **Visibilidad contextual y alcance transparente:** metadatos en el cuerpo muestran
  todos los Perfiles/Páginas donde está publicada (su "alcance"), navegables entre sus
  diferentes "hogares".

## B. El Acto Creador: Flujo Guiado por Intención (modal al pulsar "Publicar")
1. **Área Principal:** Política · Educación · Cultura.
2. **Sub-Área (si aplica):** Política → *Propuesta Legislativa* | *Caso Judicial*
   (carga plantillas y herramientas específicas).
3. **Destino + Tipo de Publicación:** *Publicación Principal* (línea de tiempo) o
   *Historia* (sección de Historias) + destinos múltiples (perfiles/páginas/grupos…).
4. **Formato de Contenido.**
5. **Configuración Contextual + Ámbito:** visibilidad, configuración de votación, alcance.
6. **El Lienzo de Creación** (editor híbrido) **o Editor Simple.**

## C. El Lienzo de Creación Ilimitado (Editor Híbrido)
- Entorno de diseño profesional y a la vez intuitivo. Lienzo central con **zoom/paneo**
  y **manipulación directa** de elementos.
- **Menú Superior:** *Insertar*, *Herramientas de Creación/Edición*, *IA*, guardado.
- **Paneles Laterales:** *Lienzos*, *Capas*, *Propiedades del Elemento*.

## D. La Tarjeta de Previsualización
- **Portada obligatoria** del Lienzo Universal (cover de la publicación).

## E. Interacciones, Gobernanza y Moderación
- Barra estándar: **Republicar · Etiquetar · Sugerir Cambio · Reportar.**

## F. Votación Avanzada y Comentarios
- Votaciones complejas configurables.
- **Comentarios como publicaciones anidadas** (usan el mismo Lienzo de Creación de Comentarios).

## Principios transversales (contexto del SOSD)
- Identidad como acceso (perfil/reputación/insignias = permisos).
- Sistema de archivos como red social (archivos = objetos sociales con biografía).
- Apps como entornos colaborativos persistentes (estado social pausable/reanudable).
- UI como dashboard social contextual (2D/3D/VR-AR).
- Descentralización/fediverso, soberanía de datos.

## Estado de implementación en StarSeed OS (vivo)
- `/publicar` (PublicationComposer): flujo tipo→perfiles→destinos→formato→preview/abrir.
- `/pizarra` (CanvasBoard): lienzo con bloques, capas/edges, pan/zoom, vistas, WebXR.
- `/pizarras` (centros de trabajo infinitos). `/apps-ia` + `/app/[id]` (apps con IA).
- Próximo: alinear el composer al flujo por intención (Área→Subárea→Tipo Principal/Historia),
  editor híbrido (Insertar/Capas/Propiedades + Tarjeta de Previsualización), y la
  publicación como **entidad atómica** con instancias/alcance + barra de interacciones
  (Republicar/Etiquetar/Sugerir Cambio/Reportar) y comentarios anidados.
