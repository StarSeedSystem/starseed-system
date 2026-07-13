# SOP — Adenda 66 · Folders · Permisos · Publicaciones ilimitadas · Red descentralizada

> Fuente de verdad de la ola 2026-07-12 (segunda). Escrito ANTES de tocar código (regla dorada).
> Base del OS: Supabase **`nxstilnyidvkqeosofuh`** (NO el de Nexus/Café). Credenciales de gestión en `.env.local`
> (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`) → las migraciones se aplican y **se verifican** en la BD real.
> Backend adicional: GitHub · Vercel · **Google Cloud Run** (`Dockerfile` + `cloudbuild.yaml`).

## 1. Renombrado: «carpeta» → **folder**
- Concepto único en TODO el OS y la red: **folder** (masculino: «el folder», «los folders»).
- Alcance: textos de UI, comentarios, nombres de tipos/props/funciones nuevas. **NO** se renombran claves de
  localStorage ni columnas de BD ya existentes (romperían datos guardados): se documenta el alias.
- Excepción: «carpetas del dock» pasan también a **folders del dock**.

## 2. Bibliotecas · folders · archivos — sincronización REAL en línea
- Hoy solo se guardaba en local. Tablas ya creadas (2026-07-12): `entity_state` (docs de biblioteca) y `os_files`
  (metadatos del bucket `os-files`) + realtime + `REPLICA IDENTITY FULL`.
- **Toda** creación/edición de biblioteca, folder o archivo escribe en la nube y emite señal
  (`live-signal.ts`) → aparece en todos los dispositivos y perfiles al instante. Cola offline + reintento.
- **Historial de versiones, ramas y logs** (tabla nueva `os_versions`): cada guardado crea una revisión
  (`rev`, autor, dispositivo, mensaje, hash/tamaño, puntero al objeto de Storage). Operaciones: ver historial,
  restaurar, **ramificar** (variación con su propia línea), comparar, y registro (`log`) de accesos y cambios.
  Los archivos binarios versionan por objeto de Storage (`<uid>/<fileId>/<rev>`), nunca sobreescriben.

## 3. Permisos independientes (biblioteca · folder · archivo)
- Cada nodo tiene su ACL propia y **heredable** (el hijo hereda si no define la suya): `visibility`
  (`private` · `account` · `profiles` · `groups` · `pages` · `public`) y roles `view` · `comment` · `edit` · `admin`.
- **Regla cuenta↔perfiles (nueva, obligatoria):** conceder acceso a UN perfil concede acceso a **todos los perfiles
  de esa cuenta**, y a la inversa (el acceso concedido a la cuenta vale para cualquiera de sus perfiles).
  Se resuelve en la BD con una función `security definer` que mapea perfil→cuenta (`os_account_profiles`).
- Se apoya en `src/lib/sharing/access.ts` (Adenda 63) ampliando `ResourceRef` a `library|folder|file` con ACL propia.

## 4. Biblioteca pública del perfil
- Cada perfil elige QUÉ bibliotecas/folders/archivos aparecen en su sección pública de Biblioteca
  (selector desde la biblioteca y desde los ajustes del perfil). Lo no seleccionado no se lista aunque sea público.

## 5. Compartir cualquier cosa en cualquier sitio
- Acción **Compartir** universal para cerebro · biblioteca · folder · archivo, con destinos:
  publicación (abre el **Lienzo Universal** con el recurso ya integrado), cerebro, mensaje, grupo, página,
  comunidad, evento, **enlace** o **enviar a la Librería** (con su ubicación destino).
- **Selector de fuente universal** (`SourcePicker`): en TODO lugar donde se publique o suba contenido se puede
  elegir origen = dispositivo · biblioteca · folder · archivo · cerebro/memoria · neurona · URL.
- Bibliotecas por **temas y categorías** (catálogo navegable).

## 6. Lienzo Universal — publicaciones como experiencias
- **Destinos**: perfil · página · grupo · comunidad · evento · secciones (política/educación/cultura) ·
  **Librería (con ubicación: biblioteca + folder)** · mensaje · cerebro.
- **Tipo de publicación = ETIQUETAS MÚLTIPLES** (no una sola). Catálogo inicial: general, artículo, página web,
  presentación, propuesta, denuncia, sugerencia, petición, ayuda, voluntariado, urgencia, widget, VR/AR, examen,
  meme, noticia, evento, juego, app, archivo, programa, curso, guía, recurso, obra, convocatoria, debate,
  votación, iniciativa, tutoría, investigación, dato/gráfica, mapa, pizarra, repo, agente/bot.
- **Bloques** (formatos): texto, imagen, archivo, enlace, widget + **programa/código ejecutable**, repo,
  pizarra, portada, página dinámica interactiva (transiciones, botones, procesos), cerebro, biblioteca,
  agente/bot (Aurora+Astraura configurables), página/perfil/grupo/comunidad/evento, mapa, gráfica con datos
  reales configurables, herramientas de edición manual y con IA.
- **Adaptación inteligente**: cada publicación se renderiza según dispositivo, tamaño, capacidades y contexto
  (perfil de rendimiento, reduced-motion, táctil). El render es el MISMO en toda la red (componente único).
- Seguridad: el código de una publicación se ejecuta **aislado** (sandbox), nunca con acceso a la sesión.

## 7. Filtros, orden y búsqueda inteligente (Astraura)
- Barra de control de contenido en TODO entorno con publicaciones (perfil, página, grupo, comunidad, hub, red,
  comentarios): filtrar por etiquetas/tipos, ordenar (reciente, relevante, popular, cronológico inverso, propio),
  vista (lista/tarjetas/compacta), búsqueda, y **relevancia con Astraura** (ranking por contexto del perfil).
- Preferencias por perfil y por entorno, persistidas y sincronizadas.

## 8. Hub y Red
- Sección principal al entrar al Hub = **Red**.
- Todas las opciones muestran **datos reales** (nada de mocks); si no hay datos, vacío honesto con CTA.

## 9. Educación
- Arreglar la **red 3D** y el **mapa conceptual 2D** (no abren).
- Nuevo: grupos de estudio · guías inteligentes personalizadas (Aurora/Astraura) · exámenes opcionales con
  **insignias** · tareas · recomendaciones · proyectos personalizables · itinerarios (eventos+tareas+exámenes),
  siempre opcionales y libres, con contexto, recursos, fuentes, artículos y estudios.

## 10. Menús unificados + temas
- Un solo lenguaje de menús (mismo componente/estilo) en todas las áreas del OS y la red.
- Edición de estilos/temas más accesible e integrada (entrada directa desde cada menú).

## 11. Librería: semilla por defecto
- TODAS las repos/paquetes recomendados quedan instalados por defecto en cada cuenta, perfil, dispositivo,
  cerebro y neurona (versión de semilla `starseed.library.seed.vN` → re-siembra al subir la versión).

## 12. Centro de notificaciones — actualizaciones
- Sección **Actualizaciones disponibles** de cualquier programa/repo instalado en el perfil y la cuenta:
  comprueba versiones en varios servidores/fuentes (GitHub releases, registro StarSeed, fuentes propias),
  muestra variaciones de versión y permite actualizar. Historial de actualizaciones.

## 13. Red descentralizada de servidores, hostings y almacenamientos
- Cualquier recurso (cuenta, perfil, página, folder, archivo, biblioteca, cerebro, publicación) puede vivir en
  uno o varios **backends**: **servidor oficial StarSeed (por defecto, automático)** + externos: Supabase propio,
  Google Cloud (Storage/Cloud Run), GitHub, Vercel, S3/compatibles, CasaOS/neurona propia, WebDAV, IPFS.
- Registro `storage_backends` (ya existe la tabla) + política por recurso: primario, réplicas, cifrado,
  sincronización inteligente (elige por disponibilidad/latencia/coste) y **libertad total** de mover/replicar.
- Toda escritura pasa por una capa única `src/lib/storage/backends.ts` → nadie escribe a Supabase directamente
  sin pasar por ella (permite que el mismo código funcione en Vercel o Cloud Run).

## 14. Correcciones de interfaz
- **Dock Trinity (lado derecho)**: en tablet/escritorio las apps se salen de la pantalla y no se pueden deslizar
  → carril con scroll real (y sombras/flechas), nunca contenido inalcanzable.
- **Secciones seleccionadas cortadas por arriba** → anclar top+bottom dentro del viewport (`svh`), nunca altura
  fija anclada a un solo borde (misma regla que la Adenda 63 §15).
- Perfiles: rediseño equilibrado y atractivo en cada tamaño de pantalla.
