# 📓 Bitácora de Estado — StarSeed OS

> Registro cronológico de cambios significativos. **Cada sesión de trabajo añade una entrada aquí al final.** Permite a futuras sesiones (Claude u otras) entender qué se hizo, qué quedó pendiente y por qué.

---

## Formato de entrada

```
## YYYY-MM-DD — Título corto
**Sesión por:** [agente / humano]
**Resumen ejecutivo:** 1-2 frases.

### Hecho
- ...

### Decisiones tomadas
- ...

### Pendiente / Próximos pasos
- ...

### Notas / aprendizajes
- ...
```

---

## 2026-05-24 — Bootstrap del sistema de memoria y roadmap

**Sesión por:** Claude (Cowork mode, modelo Opus 4.6) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Primera sesión de consolidación del proyecto. Se conectó la carpeta local, se auditó el estado del repo, se leyeron los documentos fundacionales de Drive (Constitución, Manifiesto, Codex), y se creó el sistema de memoria persistente + roadmap técnico de 3 fases.

### Hecho
- Conectada carpeta `/Users/alex/Documents/starseed-os-main` como working directory.
- Auditoría del estado actual: Next.js 15 + Supabase + Trinity UI + Crystal Liquid Glass + Genkit AI.
- Confirmado que la carpeta **NO es un repo git todavía** (no hay `.git`). Falta `git init` y vincularlo a `StarSeedSystem/starseed-system`.
- Leídos 3 documentos fundacionales de Google Drive:
  - Constitución de la Sociedad StarSeed
  - Manifiesto Fundacional
  - Codex StarSeed (Arquitectura social comunitaria)
- Creado sistema de memoria persistente:
  - `CLAUDE.md` (raíz) — memoria de trabajo, índice maestro
  - `memory/principles.md` — desarrollo extendido de los principios con implicaciones técnicas
  - `memory/roadmap.md` — roadmap técnico de 3 fases (Semilla → Fruto → Cosecha)
  - `memory/architecture.md` — decisiones arquitectónicas
  - `memory/state.md` — esta bitácora

### Decisiones tomadas (preliminares, sujetas a validación con el equipo)
- **Estrategia de despliegue:** WebOS (PWA) primero en Fase Semilla, luego capa multiplataforma (Tauri + Capacitor) en Fase Fruto, y finalmente distro Linux propia en Fase Cosecha.
- **Servidor:** Vercel + Supabase free tier inicialmente, migración a infra propia en Fase Fruto.
- **Licencia recomendada:** AGPLv3 (no confirmada todavía).
- **Federación:** ActivityPub-compatible para feed cultural + protocolo propio para gobernanza (Fase Fruto).
- **Schema de datos:** Mantener el de `gemini.md` (Account / Profile / Page / Post / StoreItem / LibraryItem). Está alineado con la Constitución (Cuenta privada + Perfiles múltiples).
- **Sin git todavía:** se inicializará en la próxima sesión tras confirmación del propietario.

### Pendiente / Próximos pasos
1. **Inicializar git** y vincular a GitHub:
   ```
   cd /Users/alex/Documents/starseed-os-main
   git init
   git remote add origin https://github.com/StarSeedSystem/starseed-system.git
   git add .
   git commit -m "Initial commit: bootstrap memory system and roadmap"
   git branch -M main
   git push -u origin main
   ```
   (Confirmar nombre del repo y permisos primero.)
2. **Leer el 4º documento crítico de Drive** (Documento Maestro del SOSD, `1DaX2bl8...`) por chunks — es muy grande y contiene detalles técnicos importantes.
3. **Limpieza del repo:**
   - Borrar / mover a `scripts/legacy/`: `temp-aurora.html`, `temp-flora.html`, `temp-omni.html`, `temp_stitch.html`, `apply_mock_fetch.js`, `fix-widgets.js`, `refactor_widgets.js`, `run_test.js`, `update_widgets.js`.
   - Renombrar README real (no template Firebase Studio).
   - Quitar `node_modules` y `.next` del repo (asegurar `.gitignore`).
   - Quitar archivos `Icon` (artefactos de macOS).
   - Quitar `.DS_Store` y añadir a `.gitignore` global.
4. **Renombrar el proyecto** en `package.json`: `"name": "nextn"` → `"name": "starseed-os"`.
5. **Implementar Hito 1.1** del roadmap: CI/CD, licencia, code of conduct, contributing, .env.example.
6. **Conectar GitHub MCP** si está disponible, o trabajar con git por bash.
7. **Decidir governance del propio repo:** ¿quién aprueba PRs en fase Semilla? Necesario para abrir contribuciones.

### Notas / aprendizajes
- El proyecto está significativamente más maduro de lo esperado. Mucho del código está hecho, pero falta:
  - Estandarización (cleanup de scripts huérfanos).
  - Tests (no hay testing setup todavía).
  - CI/CD (falta).
  - Git (la carpeta no está versionada).
  - Documentación canónica (existía dispersa, ahora consolidada en `CLAUDE.md` + `memory/`).
- El sistema de **Singularidad del Contenido (Lienzo Universal)** es un diferenciador técnico fuerte vs. redes sociales tradicionales. El schema actual ya lo soporta con `Post.references[]`, pero falta implementar la lógica de propagación de cambios.
- Las **Insignias verificables** son la clave de la Meritocracia del Entendimiento. Implementarlas bien es prioridad en Fase Semilla.
- **Nota cultural:** los documentos fundacionales son extremadamente ricos y poéticos. La traducción a código debe mantener este espíritu: no es solo software, es la encarnación digital de una constitución civilizatoria.
- Conector de Google Drive funciona perfectamente. Conector de GitHub no apareció en el registro — usar git CLI por bash.

---

---

## 2026-05-24 — Sesión 2: Multi-proveedor de IA + privacidad + cleanup

**Sesión por:** Claude (Cowork mode, Opus 4.7) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Implementada la capa multi-proveedor de IA del Exocórtex (Ollama local, OpenAI-compatible, Anthropic Claude, Google Gemini), con cifrado AES-GCM de claves en navegador. Añadido panel de Privacidad/Soberanía de Datos en /settings. Página /agent ahora hace chat real con streaming y stop. Cleanup de carpetas duplicadas.

### Hecho
- **Capa multi-proveedor de IA** (`src/ai/providers/` y `src/ai/client/`):
  - `types.ts` con la interfaz `Provider` y tipos `ChatMessage`/`ChatOptions`/`ChatResponse`.
  - `ollama.ts` — proveedor local (sin clave, streaming NDJSON).
  - `openai.ts` — OpenAI y compatibles (Groq, Together, OpenRouter, LM Studio, vLLM). Streaming SSE.
  - `anthropic.ts` — Claude con `anthropic-dangerous-direct-browser-access`. Streaming SSE.
  - `google.ts` — Gemini vía REST directo. Sin SDK extra.
  - `index.ts` — registro central + orden de presentación.
  - `README.md` — documentación de cómo añadir nuevos proveedores y modelo de seguridad.
- **Almacenamiento seguro** (`src/ai/client/`):
  - `keyStorage.ts` — AES-GCM 256-bit + PBKDF2-SHA256 (250k iter) + salt aleatorio por instalación. Soporta modo con/sin frase de paso.
  - `providerStore.ts` — gestión de configs en localStorage, export/import JSON, wipe.
  - `chat.ts` — punto único de entrada `chat({messages, ...})` provider-agnostic.
- **UI:**
  - `src/components/settings/ai/ai-providers-panel.tsx` — catálogo + gestor con guardado cifrado, test de conexión, refresh de modelos, frase de paso.
  - `src/components/settings/privacy/privacy-panel.tsx` — Modo Fantasma, telemetría opt-in, exportar/importar/borrar IA, ver desglose localStorage, borrado total.
- **Página /agent** refactorizada:
  - Reemplaza el `setTimeout` simulado por `chat()` real con streaming.
  - Selector de proveedor activo + selector de agente en cabecera.
  - Input opcional de frase de paso si el proveedor activo tiene clave cifrada.
  - Botón Detener (AbortController).
  - Inyecta automáticamente el system prompt del agente + reglas activas en el contexto.
- **Settings page** expandida de 3 a 5 tabs: Diseño · IA & Modelos · Privacidad · Perfil · Seguridad.
- **Cleanup:** eliminadas `src/contexts/` y `src/components/trinity/` (vacías). Verificado que no hay imports rotos.

### Decisiones tomadas
- **Privacidad por diseño:** las claves de IA viven solo en el navegador del usuario, cifradas con AES-GCM. El backend de Next.js nunca las ve. Las llamadas a OpenAI/Anthropic/Google parten del browser (CORS).
- **Ollama es el default sugerido** (proveedor por defecto en `defaultConfigs()`): cero datos a terceros, alineado con la Ciberdelia y la soberanía.
- **No reemplazar Genkit todavía:** `src/ai/genkit.ts` y los flujos en `src/ai/flows/` se mantienen para casos server-side. La nueva capa convive con ellos. Migración progresiva.
- **Configuración portable:** la export/import de configuración de IA permite trasladar setup entre dispositivos.

### Pendiente / Próximos pasos
1. **Verificar el typecheck** localmente — el sandbox excede timeout. Si hay errores, arreglar.
2. **Streaming real para Google AI:** sustituir `:generateContent` por `:streamGenerateContent` con parseo SSE.
3. **Persistir agentes/reglas/workflows** en Supabase (hoy son mocks en estado local de la página).
4. **Migrar flujos de Genkit** que no requieran server al nuevo `chat()` client-side.
5. **Vincular activación de IA al sistema de Insignias** — cuando un usuario contribuye con su modelo a la federación, recibe una insignia.
6. **Tests:** la capa de providers es pura y testeable con MSW — añadir cobertura.
7. **i18n** — el panel está en español; preparar para EN/FR/PT.
8. **Vector storage local** para que el Exocórtex tenga memoria persistente del usuario (IndexedDB + embeddings).

### Notas / aprendizajes
- La constitución del proyecto se traduce muy bien a decisiones técnicas concretas: "el usuario es soberano de su IA" → multi-proveedor + claves locales + sin lock-in. Cada feature debería poder justificarse así.
- Anthropic ya permite uso directo desde browser (header `anthropic-dangerous-direct-browser-access`). Esto cambia el paradigma respecto a hace 2 años: ya no necesitamos backend obligatorio para LLM calls.
- El TypeScript del proyecto compila lento — vale la pena considerar mover a SWC o evaluar si hay dependencias circulares en los contextos.
- Limpieza incremental: la primera sesión quitó scripts huérfanos; ésta limpió carpetas duplicadas. Próxima sesión: revisar `apphosting.yaml` (Firebase) si vamos solo a Vercel; revisar `src/components/stitch/` para ver si sigue siendo necesario.


---

## 2026-05-24 — Sesión 3: Sistema de Apariencia expandido

**Sesión por:** Claude (Cowork mode, Opus 4.7).
**Resumen ejecutivo:** Expansión del sistema de Apariencia con 12 nuevos temas curados, picker integrado de 45+ fuentes Google con preview en vivo, y un panel completo de Accesibilidad universal (alto contraste, motion, daltonismo, tamaño táctil, foco).

### Hecho
- **Biblioteca curada de temas** (`src/lib/themes/curated-presets.ts`): 12 presets coordinados con identidad visual completa (tipografía, colores, glass, fondo, botones, animaciones). Categorizados en 7 moods: cyberdélico, solarpunk, minimal, brutalist, futurista, orgánico, luxury.
  - Synthwave Horizon, Tokyo Midnight (cyberdélico)
  - Solarpunk Aurora (solarpunk)
  - Verdant Earth, Terracotta Warm (orgánico)
  - Bauhaus Modular (brutalist)
  - Monaco Noir, Iridescent Pearl (luxury)
  - Origami Paper, Lavender Mist (minimal)
  - Aurora Borealis, Quantum Hex (futurista)
- **Galería de temas curados** (`curated-themes-gallery.tsx`): grid con cards visuales (gradiente de swatches, icono, badge de mood, indicador activo), filtros por mood, aplicación con un clic + setTheme.
- **Catálogo de Google Fonts** (`src/lib/themes/google-fonts.ts`): 45+ fuentes en 5 categorías (sans, serif, display, mono, handwriting), helpers para construir URLs de Google Fonts CSS2 y la cadena fontFamily.
- **Picker de Google Fonts** (`google-fonts-picker.tsx`): preview en vivo con `<link>` dinámico, texto de preview editable, slider de escala global de fuentes, filtros por categoría, búsqueda por nombre/tags. Instala como customFont en el AppearanceContext existente.
- **Panel de Accesibilidad** (`accessibility-settings.tsx`):
  - Alto contraste (filter + text color override)
  - Reduce motion (auto / always / never con detección de prefers-reduced-motion)
  - Pausar animaciones (más agresivo, incluye canvas)
  - Escala de texto (0.9× a 1.5×)
  - Tamaño táctil mínimo (estándar 24, grande 44, enorme 60)
  - Simulación de daltonismo (protanopia/deuteranopia/tritanopia/achromatopsia con SVG color matrices)
  - Anillo de foco (intensidad 0–3)
  - Subrayar enlaces
  - Cursor grande/enorme (SVG inline)
  - CSS global auto-inyectado, persistencia en localStorage separado.
- **AppearanceEditor expandido** de 4 a 6 tabs: Galería · **Tipografía** (nuevo) · Lienzo · Interfaz · Fondo · **Accesibilidad** (nuevo). La pestaña Galería ahora muestra primero los 12 temas curados, luego la galería existente.

### Decisiones tomadas
- **No tocar el AppearanceContext gigante** (970 líneas) salvo lo imprescindible. Los nuevos presets son `DeepPartial<AppearanceConfig>` aplicados con `updateConfig()` — patrón ya existente. Compatible 100% con save/load/export/import ya construidos.
- **Accesibilidad fuera del AppearanceContext** porque su lógica es ortogonal: persistencia separada (`starseed.a11y.settings`), aplicación via clases en `<html>`. Esto evita acoplar accesibilidad a temas.
- **Estilos de a11y auto-inyectados al montar el panel**, evitando tocar `globals.css`. Permite que el panel sea self-contained y se pueda copiar/desactivar sin migraciones.
- **Daltonismo via SVG `<filter>` con `feColorMatrix`** estándar (matrices clínicas), inyectado al `<body>`. Más performante y preciso que filtros CSS custom.

### Pendiente / Próximos pasos
1. Si TypeScript se queja por `distortWidth` en algunos presets (existe en theme-utils.ts pero no en la interfaz `AppearanceConfig.liquidGlass`), añadirlo al tipo en `appearance-context.tsx`.
2. Test de los 12 presets aplicándolos uno a uno en navegador para verificar coherencia visual.
3. Permitir guardar uno de los presets curados como "tema personal" con un nombre custom (botón "Guardar como tema").
4. Color picker avanzado para que el usuario pueda overridir los colores base de cualquier tema curado.
5. Considerar separar `presetsByMood()` en una página dedicada `/themes` con preview detallado por tema.
6. i18n del catálogo de moods y descripciones (actualmente solo español).

### Notas / aprendizajes
- El AppearanceContext del proyecto ya cubre prácticamente todo lo que un sistema de personalización avanzado necesitaría (responsive, mobile, trinity, display VR/AR/spatial). La calidad técnica del trabajo anterior es alta.
- La estrategia ganadora es: añadir capas de UX (galería curada, picker visual, panel a11y) sobre el contexto existente, no reescribir.
- Google Fonts via CSS2 + `display=swap` es perfecto para preview en vivo sin tocar el bundle. El usuario puede explorar 45 fuentes sin recompilar.
- `feColorMatrix` para daltonismo es genial: tres matrices estándar cubren los tipos más comunes, y `grayscale(1)` cubre acromatopsia.


## 2026-05-25 — Unificación e Integración de Git
**Sesión por:** Antigravity (Assistant Mode) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Sincronización completa y exitosa del repositorio local de StarSeed OS con GitHub, resolviendo divergencias del historial sin perder las funcionalidades avanzadas de IA y Apariencia locales. Confirmado y validado el servidor en http://localhost:9002.

### Hecho
- Configurada la compatibilidad de Git con Unicode en macOS (`core.precomposeunicode true`) para resolver el bloqueo de nombres con caracteres especiales (NFC/NFD).
- Ejecutado `git merge origin/main --allow-unrelated-histories` para unificar el historial local con los commits de configuración de despliegue en Vercel.
- Resueltos conflictos de fusión favoreciendo la rama local (`--ours`) en archivos esenciales: `package.json`, `src/app/(app)/agent/page.tsx`, `src/app/(main)/settings/page.tsx`, `src/components/settings/appearance/appearance-editor.tsx`, `src/utils/supabase/*`, `.gitignore` y `yarn.lock`.
- Completado el push unificado a GitHub (`git push origin main`), dejando la rama `main` local y remota en perfecta sincronía.
- Verificada la disponibilidad activa y redirección del servidor local en `http://localhost:9002`.

### Decisiones tomadas
- **Resolución unilateral a favor de lo local (`--ours`)**: Las versiones locales de la página de agentes y el panel de apariencia representan la implementación más avanzada de la visión ciberdélica e IA (multi-proveedor, cifrado local) y debían ser preservadas intactas sobre los mocks previos del servidor remoto.
- **Mantener fallas de tipo preexistentes**: Las advertencias de tipo TypeScript son heredadas de la base de código externa; se determinó no modificarlas de forma ad-hoc ya que Next.js ignora estos errores en compilación de forma explita y el servidor corre perfectamente.

### Pendiente / Próximos pasos
1. **Desarrollo del workflow Starseed**: Continuar con el diseño e instalación del sistema en entornos Linux/Android y el despliegue a producción.
2. **Refactorización progresiva**: Resolver las advertencias de TypeScript preexistentes en los componentes de clima y layouts de forma segura en las siguientes sesiones.

---

## 2026-05-25 — Sesión 4: Estilos + Crystal realista + Zenith + Notificaciones + Reglas de Diseño

**Sesión por:** Claude (Cowork mode, Opus 4.7).
**Resumen ejecutivo:** Lote grande de mejoras de UX: rename "curados" → "estilos", arreglo de overflow en cards de estilos, Crystal preset con efectos realistas (refracción, aberración cromática, irisado, especular), reestructura de ZenithCurtain con más espacio vertical + Editor Universal + botón pantalla completa, sistema de notificaciones funcional con persistencia local, y nuevo DESIGN_RULES.md para garantizar adaptabilidad universal.

### Hecho
- **Estilos (antes "Temas curados"):**
  - `curated-themes-gallery.tsx`: rename del comentario doc + reescritura del card layout (icono+nombre+badge en línea, tagline 2 líneas line-clamp con break-words, swatches al pie con shrink-0). Sin más overflow ni superposiciones.
  - `appearance-editor.tsx`: header "Estilos" + subtítulo explicando que cada estilo adapta TODOS los elementos (widgets, perfiles, páginas, mensajes, posts, menús, botones, fondos).
- **Tema Crystal realista** (`src/components/theme/theme-utils.ts` preset `glass`):
  - styling: refraction 0.85, chromaticAberration 5, glassNoise 0.12, frostOpacity 0.20, glowIntensity 0.7, glassIntensity 42 (blur).
  - liquidGlass: mode='prominent', distortWidth 0.55, displacementScale 22, aberrationIntensity 2.5, saturation 1.4.
- **CrystalFilters** (`src/components/ui/effects/CrystalFilters.tsx`): añadidos 5 filtros SVG nuevos:
  - `crystal-refraction` (turbulencia + displacement + separación RGB).
  - `iridescent-edge` (borde madreperla con matriz prismática).
  - `glass-specular` (lighting especular angular).
  - `prismatic-glow` (halo multicolor para HolographicOverlay).
  - `etched-glass` (vidrio grabado con feDiffuseLighting).
  - + 2 gradientes (`crystal-facet`, `iris-stroke`).
- **ZenithCurtain** (`src/components/layout/zenith-curtain.tsx`): reescrito completamente.
  - Altura: 70vh → **92vh**, max-w-4xl → **7xl**, padding superior 12 → 5.
  - Layout en 3 secciones independientes: header con acciones rápidas, buscador compacto, área de resultados que ocupa TODO el vertical restante (no se comprimen los documentos).
  - **Nuevo botón "Editor"** (violeta): abre UniversalEditor modal.
  - **Nuevo botón "Pantalla"** (esmeralda): toggle fullscreen con hook `useFullscreen` cross-browser.
- **Editor Universal** (`src/components/layout/universal-editor.tsx`): modal de comando central con 4 modos (Diseño, Código, Con IA, Biblioteca) y 9 secciones del programa (apariencia, dashboard, layout/Trinity, perfil, IA, privacidad, biblioteca, publicar, componentes). Buscador con autofocus. Navega a la sección elegida con `?tab=`.
- **Hook useFullscreen** (`src/hooks/useFullscreen.ts`): cross-browser (Chrome/FF/Safari/Edge con prefijos vendor), detecta Esc, opt-in en SSR seguro.
- **Notificaciones funcional**:
  - `src/context/notifications-context.tsx`: 8 categorías (system/ai/mention/governance/culture/education/community/achievement) + 4 prioridades + snooze + archive + persistencia localStorage (`starseed.notifications.v1`) + 3 notificaciones seed.
  - `src/components/layout/notification-center.tsx`: reescrito con tabs por categoría (conteo de no-leídas por tab), ScrollArea, acciones hover (snooze 1h, archivar, eliminar), formato relativo de tiempo en español (date-fns/locale es), badge con conteo en bell.
  - `src/app/layout.tsx`: `NotificationsProvider` integrado en el árbol de providers.
- **DESIGN_RULES.md** (`design-system/starseed-system/DESIGN_RULES.md`): nuevo doc de 11 secciones que rige adaptabilidad universal. Cubre: tokens, contraste auto, prevención overflow/superposiciones, patrones adaptativos a estilo, velos sobre fondos arbitrarios, manifiesto JSON de widgets, pre-merge visual checklist en 3 estilos.

### Decisiones tomadas
- **"Estilos" como nombre canonico** (antes "Temas curados") — alineado con la idea de que cada elemento de la red del usuario se adapta.
- **Crystal preset usa `mode: 'prominent'`** (no `standard`) para activar el shader real de liquid-glass-react, no solo glass plano.
- **Editor Universal navega a páginas existentes** (no inventa edit-in-place) — implementación más sólida en V1; futura iteración puede embeber el editor inline.
- **Notificaciones 100% local** por defecto (Art. 7 — Soberanía de Datos). Federación se añadirá en Fase Fruto.
- **`a11y-pause-animations` también pausa canvas** — para preservar batería y prevenir mareo (regla en DESIGN_RULES §7).

### Pendiente / Próximos pasos
1. Pasar los 12 estilos curados por el pre-merge checklist visual del DESIGN_RULES §8 (mobile 375px, 3 estilos representativos).
2. Migrar widgets existentes del dashboard a tokens estrictos (ahora algunos hardcodean colores).
3. Implementar el modo "edit-in-place" del Editor Universal (overlay con outline en hover sobre componentes editables).
4. Conectar el sistema de notificaciones a eventos reales (post creado, propuesta votada, mención).
5. Streaming federado de notificaciones cuando exista federación (Fase Fruto).
6. Atajo de teclado `⌘E` para abrir el Editor Universal desde cualquier parte.
7. Asegurar que las notificaciones respeten `--a11y-text-scale` y modo daltonismo.

### Notas / aprendizajes
- El `liquid-glass-react` config soporta `mode: 'prominent'` y `mode: 'shader'` para efectos realistas — antes el preset glass usaba defaults planos y el efecto se quedaba en simple blur.
- La estrategia de "rename + extender card" mantuvo la compatibilidad con `themeStore.activeTemplateId` previo — los usuarios que tenían un estilo aplicado siguen viéndolo correcto.
- La regla de cards `flex flex-col + min-w-0 + truncate/clamp + shrink-0 en iconos` resuelve el 95% de los overflow en este proyecto. Vale la pena hacerla parte del DESIGN_RULES.
- Las notificaciones del proyecto antes eran mock estático. La nueva arquitectura es preparada para federación: cada notificación tiene `source.node` y `source.actorDid` opcionales, que se llenarán cuando un nodo externo nos envíe un evento firmado.


---

## 2026-05-26 — Sesión 5: Calendario Unificado (Hub ↔ Cultura) con capas, CRUD y contexto IA

**Sesión por:** Claude (Cowork mode, Opus 4.7) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** Se unifica la temporalidad del SOSD. La pestaña "Eventos" del Hub pasa a llamarse "Calendario" y comparte el mismo componente y la misma fuente de datos que la pestaña "Agenda" de `/network/culture`. El nuevo `UnifiedCalendar` permite filtrar por capas (cultura, política, educación, bienestar, personal, recordatorios, alarmas, logs del sistema), abrir cada día en un diálogo con CRUD + compartir a la Red, y ofrece un punto de inyección de contexto al Exocórtex.

### Hecho
- **Store unificado** `src/contexts/calendar-context.tsx`:
  - Tipo `CalendarItem` con `layer`, `visibility` (privado / publico / red), `recurrence`, `time`, `durationMin`, `location`, `urgent`, `aiHighlight`, etc.
  - 8 capas (`politica`, `cultura`, `educacion`, `bienestar`, `personal`, `recordatorios`, `alarmas`, `sistema`) con metadatos visuales (color, dot, border, descripción).
  - Seed: importa `communityEvents` y añade recordatorios, alarmas y logs del sistema de ejemplo.
  - API: `addItem`, `updateItem`, `removeItem`, `shareItem`, `toggleLayer`, `setAllLayers`, `itemsByDate`, `aiContextSnapshot()`.
  - Provider montado en `src/app/(app)/layout.tsx`.
- **Componente `UnifiedCalendar`** (`src/components/calendar/unified-calendar.tsx`):
  - Rejilla mensual real con semanas que empiezan en lunes y 42 celdas.
  - Filtro de capas en chips activables.
  - Panel lateral con "Agenda próxima" (combina lo que antes eran "Próximos eventos" + "Eventos por confirmar").
  - Indicador de hoy, botón "Hoy", navegación entre meses, leyenda en pie.
  - Botón "Contexto IA" que abre `/agent` con un snapshot temporal codificado.
- **`DayDetailDialog`** (`src/components/calendar/day-detail-dialog.tsx`):
  - Lista ordenable (hora / capa / título / visibilidad).
  - CRUD completo con form colapsable (fecha, hora, duración, capa, recurrencia, visibilidad, ubicación, descripción, urgente).
  - Acciones rápidas por entrada (editar, compartir/federar, eliminar).
- **Hub** (`src/app/(app)/hub/page.tsx`):
  - Trigger renombrado `events` → `calendar` con `<CalendarDays />`.
  - Pestaña anterior eliminada; nuevo `HubCalendarPanel` con `UnifiedCalendar` + dos tarjetas auxiliares ("Próximos en la Red" y "Por confirmar") que sustituyen y fusionan las antiguas secciones.
  - Limpieza de imports muertos (`Progress`, `MapPin`, `PartyPopper`).
- **Cultura** (`src/app/(app)/network/culture/page.tsx`): la pestaña Agenda usa `UnifiedCalendar` en lugar del antiguo `EventCalendarView`. Misma fuente de datos que el Hub.

### Decisiones tomadas
- **Fuente única de verdad temporal** a través de `CalendarContext`. Cualquier superficie futura (dashboard widget, página de comunidad, exportación a ICS, federación ActivityPub `Event`) usará este store.
- **Capas en vez de tipos rígidos:** el campo `layer` reemplaza el `type` libre que tenía `communityEvents`. Permite filtrado coherente con la estética y deja sitio para añadir nuevas capas (p.ej. `salud`, `economia`) sin migraciones.
- **Visibilidad de 3 niveles** (`privado` / `publico` / `red`) en línea con el principio dual privacidad↔transparencia y la dualidad Cuenta/Perfil de la Constitución.
- **Contexto IA serializable**: `aiContextSnapshot()` devuelve un texto plano apto para inyectar como system prompt o tool input. Se abrirá vía query string `?context=…` para no acoplar el calendario a un proveedor concreto (Genkit, Anthropic, etc.).

### Pendiente / Próximos pasos
1. Persistir el calendario en Supabase (tabla `calendar_items` con RLS por `account_id`).
2. Exportar/importar `.ics` y suscripción a calendarios externos.
3. Federar eventos `visibility === 'red'` vía ActivityPub `Event` (Fase Fruto).
4. Notificaciones cuando `layer === 'alarmas'` y la hora está dentro de `nowβ±5 min`.
5. Integrar el snapshot temporal directamente como tool de Genkit (sin abrir `/agent` en nueva ventana).
6. Vista "Semana", "Día" y "Agenda lista" además de la actual mensual.
7. Pruebas unitarias del helper `buildMonthGrid` (límites de año bisiesto, transiciones DST).
8. Componente "Mini-calendario" para incrustar en el dashboard.

### Notas / aprendizajes
- Reusar `communityEvents` como seed mantiene la continuidad visual con la versión anterior — los usuarios siguen viendo los mismos eventos, ahora dentro de una rejilla coherente.
- Mantener `EventCalendarView` exportado en `culture/components.tsx` aunque ya no se importe evita romper otros consumidores potenciales; se puede borrar en un cleanup posterior.
- El patrón "store → componente compuesto → vistas dependientes" es la forma natural de unificar superficies temporales en este proyecto.


---

## 2026-05-26 — Sesión 6: Corrección de distorsión de clics y detección de cursor en ventanas 3D

**Sesión por:** Antigravity (Assistant Mode)
**Resumen ejecutivo:** Se refinó el efecto de movimiento dinámico 3D de las ventanas (`src/components/ui/card.tsx`) para eliminar por completo la vibración, la pérdida de hover y la distorsión del cursor/clic en las esquinas y orillas de las ventanas. El contenido interactivo se mantiene plano en pantalla (2D), mientras que las hermosas capas visuales de vidrio líquido, caustics y destellos 3D siguen inclinándose de manera ultra-fluida y profunda.

### Hecho
- **Planitud del contenedor de interacción y contenido (`src/components/ui/card.tsx`):**
  - Se modificó la capa interna de contenido (`motion.div` que envuelve `{children}`) para mantener `rotateX: 0`, `rotateY: 0`, `z: 0` y `transformStyle: "flat"`.
  - Con esto, todas las entradas interactivas (botones, enlaces, inputs, formularios) permanecen perfectamente paralelas y estables frente a la pantalla, asegurando una detección de cursor 100% natural, directa y sin desajuste de píxeles.
- **Remoción de capas 3D anidadas distorsionantes (`src/components/ui/card.tsx`):**
  - Se removieron los estilos `translateZ(4px)`, `translateZ(6px)` y `translateZ(8px)` de `CardHeader`, `CardContent` y `CardFooter` (fijándolos a `transform: "none"` e inyectando `transformStyle: "flat"` en `CardContent`).
  - Esto soluciona por completo el bug donde el raycast 2D de colisiones del navegador calcula erróneamente las posiciones de clic en planos inclinados anidados.
- **Preservación del efecto premium visual 3D:**
  - Las capas de fondo visuales del vidrio de cristal líquido (Capas 1 a 6: colores dinámicos, ruido, especular, caustics, refracción, reflejo de luz) **sí continúan inclinándose dinámicamente** en respuesta a la posición del cursor (con la física de resortes y oscilaciones ya calibrada).
  - Esto genera un impresionante efecto de profundidad parallax tipo "HUD holográfico" o "Pantalla de Cristal Flotante", donde la información interactiva permanece nítida y perfectamente utilizable mientras el vidrio oscila con elegancia en el fondo.

### Decisiones tomadas
- **Parallax de vidrio holográfico sobre tilt total:** La rotación 3D del plano de los elementos interactivos generaba un bucle de retroalimentación física donde la deformación proyectiva causaba que el cursor "saliera" del elemento al inclinarse, disparando instantáneamente un `mouseLeave` que lo devolvía a la posición inicial, creando un molesto parpadeo o jittering a 60fps. Mantener el contenido plano soluciona el problema de raíz de manera limpia y profesional, sin comprometer el estilo visual de ciencia ficción.

### Pendiente / Próximos pasos
1. Monitorear si algún otro componente de lienzo 3D requiere una separación similar de la capa lógica de clics (2D) de la capa visual de animación (3D).
2. Probar y validar la respuesta táctil en dispositivos móviles, donde las rotaciones se han ajustado para ser extremadamente pasivas.


---

## 2026-05-26 — Sesión 7: Sincrómetro, Integración Hermes y Gráfica Viva unificada

**Sesión por:** Claude (Cowork mode) bajo dirección de Alex Bordón Garrigós.
**Resumen ejecutivo:** El Calendario Unificado se renombra a **Sincrómetro** y se le añaden tres modos visuales (Convencional gregoriano, Astrológico zodiacal y Lunar). El Exocórtex Hermes se materializa en el OmniDock con accesos al agente, gráfica viva, IA setup, skills, tools y sentidos. La Red Holográfica y la Gráfica Armónica se fusionan en una única "Gráfica Viva" en `/network/graph`, con controles de capa y opacidad. Se añaden paneles dedicados de Sentidos y MCPs en `/ai-setup` y `/agent`. Cabecera de La Red rediseñada (compacta y estética). El nombre "Hermes" se retira de toda la UI excepto la sección de Gráfica Viva.

### Hecho
- **Sistema Sincrómetro** (`src/lib/sincrometro/`): nuevo módulo con tipos para tres modos (`gregoriano`, `astrologico`, `lunar`), tablas canónicas de signos zodiacales tropicales y de las 8 fases del ciclo sinódico lunar, y conversores deterministas (`getZodiacForISO`, `getLunarPhaseForISO`, `buildZodiacYear`, `buildLunarMonth`, `bucketForISO`, `findNewMoonsInRange`).
- **Context renombrado** (`src/contexts/calendar-context.tsx`): añade `sincrometroMode` + `setSincrometroMode` persistidos en localStorage; expone alias semánticos `SincrometroProvider`, `useSincrometro`, `SincrometroItem`, `SincrometroLayer`, `SincrometroVisibility`. Conserva 100% retro-compatibilidad con `useCalendar`/`CalendarProvider`.
- **Componentes nuevos:**
  - `sincrometro-mode-switcher.tsx` — pill con tres modos (icon + glyph).
  - `sincrometro-astrological.tsx` — rueda zodiacal: 12 columnas, una por signo del año visible, eventos agrupados por signo.
  - `sincrometro-lunar.tsx` — ciclo sinódico: 8 cards de fases lunares con eventos agrupados.
- **UnifiedCalendar refactor** (`src/components/calendar/unified-calendar.tsx`):
  - Título cambia a "Sincrómetro Unificado".
  - Conmuta entre las tres vistas según `sincrometroMode`.
  - Pista contextual del modo activo (signo solar o fase lunar) cuando no es gregoriano.
  - Invariante: el storage es siempre ISO `YYYY-MM-DD`. Los modos solo cambian la **vista**, nunca los datos. Eventos, recordatorios y alarmas se sincronizan automáticamente entre vistas.
- **Integración Hermes en el dock**: `omni-dock.tsx` añade entradas para Agente IA, Gráfica Viva, IA Setup, Skills, Tools y Sentidos, con separadores visuales degradados y nuevo color `purple` para el tipado del DockItem.
- **Gráfica Viva integrada** (`src/components/network/integrated-living-graph.tsx`): apila la capa holográfica federada con la armónica de Memoria Unificada en una única visualización con `mixBlendMode: 'screen'` + controles de visibilidad/opacidad independientes para cada capa.
- **`/network/graph` reescrito**: usa `IntegratedLivingGraph`. La leyenda Solfeggio + información de capas se actualiza para reflejar la integración.
- **`/network` (panorama) simplificado**: se elimina el header redundante "StarSeed Network / Connect with the living ontology…" y el hero del grafo se reemplaza por un acceso link card a la Gráfica Viva. El panorama queda focalizado en feed y trending.
- **Layout de La Red rediseñado** (`src/app/(app)/network/layout.tsx`): cabecera compacta en una sola fila con pill (dot pulsante + Sparkles + gradiente cyan→purple→amber) y subtítulo elegante en línea con colores semánticos por dominio.
- **Paneles nuevos en `src/components/hermes/`:**
  - `senses-panel.tsx` — 9 sentidos del Exocórtex (visión, audición, voz, ubicación, cámara, consciencia ambiental, tacto, intuición sintética, resonancia armónica), cada uno con su permiso de browser, capacidades que desbloquea y persistencia local.
  - `mcp-panel.tsx` — gestor de servidores MCP con tres seeds (Memoria Unificada interna, Sincrómetro interno, Fediverso ActivityPub) y formulario de "Añadir MCP".
- **`/ai-setup` con tabs**: Descubrimientos / Sentidos / MCPs. Acepta `?tab=senses|mcp` para deep linking desde el dock.
- **`/agent` con tabs ampliadas**: añade Sentidos y MCPs como pestañas, escucha `?tab=` para abrir directamente la pestaña deseada desde los accesos rápidos del dock.
- **Nombre "Hermes" retirado** de OmniDock labels y de `/ai-setup`. Se conserva solo en `hermes-integration/` interno (módulo técnico) y en la sección de Gráfica Viva como tejido cognitivo del Exocórtex.

### Decisiones tomadas
- **Sincrómetro como concepto antes que calendario**: el cambio no es cosmético. La palabra "calendario" reduce la temporalidad a un solo sistema (el gregoriano); "sincrómetro" expresa la simultaneidad entre ciclos cósmicos y biológicos, alineado con la Ciberdelia §3 (ampliar consciencia, no estrechar).
- **Storage ISO universal, vistas conmutables**: nunca se duplica un evento al cambiar de modo. La fecha es siempre ISO; el modo solo determina cómo se agrupa visualmente. Esto garantiza que crear un evento en vista lunar lo refleja inmediatamente en gregoriano y astrológico (sin migraciones ni reescrituras).
- **Hermes invisible para el usuario, omnipresente para el sistema**: la marca "Hermes" pertenece a la arquitectura técnica, no al lenguaje del usuario. Los menús dicen "Agente", "Sentidos", "Tools" — palabras que cualquier persona entiende. El nombre interno se preserva solo en `/network/graph` como guiño al "mensajero entre capas" que ejecuta la fusión.
- **Fusión holográfica ↔ armónica vs selector**: en lugar de obligar a elegir entre las dos capas (red federada vs memoria personal), se renderizan superpuestas con mezcla aditiva. Refleja la tesis ontológica del proyecto: la mente y la red NO son dos cosas separadas — son dos vistas del mismo tejido.
- **Cabecera de La Red en una fila**: ahorra ~80px de altura vertical en la primera vista; coherente con DESIGN_RULES §1 (densidad informativa sin sacrificio estético).

### Pendiente / Próximos pasos
1. Conectar `SensesPanel` y `McpPanel` a la Memoria Unificada para que cada sentido/MCP activado cree un nodo real en la gráfica armónica.
2. Implementar adapter para que el Sincrómetro exponga sus tres modos como tool MCP que el agente pueda consultar (`sincrometro.get_active_mode`, `sincrometro.zodiac_for`, `sincrometro.lunar_phase_for`).
3. Persistir las fechas de luna nueva calculadas en una tabla para evitar recalcular en cada render.
4. Añadir vista "Año astrológico" con calor de eventos por elemento (fuego/tierra/aire/agua).
5. Validar accesibilidad: lectores de pantalla deben leer correctamente el modo activo del Sincrómetro y la fase lunar del día.
6. Tests del converter (`getZodiacForDate`, `getLunarPhaseForDate`, `buildLunarMonth`) con fechas conocidas.
7. Considerar exportar el Sincrómetro como SDK público — algunas comunidades fuera de StarSeed querrían los conversores.

### Notas / aprendizajes
- El `HarmonicGraph3D` ya existía pero estaba aislado en `/network/graph`. Integrarlo con `HolographicGraph` requirió poco más que envolverlos en un wrapper con `mixBlendMode: 'screen'`. La inversión previa en componentes auto-contenidos paga aquí.
- Los signos zodiacales tropicales tienen fechas canónicas pero varían ±1 día por año bisiesto. Asumir el caso canónico (sin corrección por bisiesto) es razonable en V1; la corrección se puede añadir cuando un nodo astrológico de la comunidad lo pida.
- El ciclo sinódico real es 29.530588 días, no 29.5. La fórmula simple (referencia luna nueva conocida + módulo) tiene error ~3 horas por ciclo: aceptable para vista de mes, no para precisión astronómica. Si se necesita mayor precisión, integrar `astronomia` o `lune.js`.
- Renombrar "calendario" → "sincrómetro" preservando alias evita cualquier ruptura. 60+ archivos siguen usando `useCalendar` y siguen funcionando.


---

## 2026-05-26 — Sesión 8: Gráfica Viva geométrica unificada + Bridge OpenHuman×Hermes + contexto completo IA

**Sesión por:** Claude (Cowork mode).
**Resumen ejecutivo:** Refactor profundo de la Gráfica Viva. Se sustituye la doble capa apilada por una única gráfica geométrica SVG estática (sin física ni movimiento). Las "capas" pasan a ser tipos de conexión filtrables, no gráficas separadas. Se implementa el modelo de 3 capas de memoria de OpenHuman AI (Memory Tree + FTS-like index + KV namespaced) sobre el `UnifiedMemoryStore` de Hermes, formando una única tienda local persistente. El usuario puede crear nuevas conexiones entre cualesquiera dos nodos. La IA recibe contexto completo en cada turno (sincrómetro, sentidos, MCPs, skills, tools, memoria reciente, próximos eventos y resumen del grafo).

### Hecho
- **`hermes-integration/openhuman-bridge.ts`** — Bridge funcional OpenHuman × Hermes:
  - `KvStore` namespaced (`global`, `background`, `autocomplete`, `skill-{id}`) con categorías `core`/`daily`/`conversation` y persistencia local.
  - `MemoryTree` con `insertChunk`, `upsertEntity`, `queryGlobal`, `querySource`, `queryTopic`, `searchEntities`, `fetchChunks`.
  - `FtsIndex` con búsqueda por tokens (sustituible por SQLite FTS5 WASM cuando esté disponible).
  - `OpenHumanMemoryEngine` orquesta las 3 capas y expone `ingest()`, `decide(prompt)` (OpenHuman §4 árbol de decisión), `projectToGraph()` y `buildContextSnapshot()` (estilo MEMORY.md).
- **`hermes-integration/system-context.ts`** — Construye `SystemContextSnapshot` exhaustivo:
  - Modo del Sincrómetro, signo solar, fase lunar del día.
  - Lista de sentidos activos, MCPs conectados, skills cargados, tools habilitadas.
  - Próximos eventos del Sincrómetro.
  - Memoria OpenHuman serializada.
  - Helper `snapshotToSystemPrompt()` que produce un bloque inyectable en el system prompt.
- **`hermes-integration/living-graph-store.ts`** — Una sola fuente de verdad para la gráfica:
  - `GraphNode` con `kind`, `geometry` (sphere/tetrahedron/cube/octahedron/icosahedron/dodecahedron/star), `frequency` (solfeggio).
  - `GraphEdge` con `kind` (uses/depends_on/exposes/configured_for/remembers/perceives/references/discovers/custom), peso y `origin` (user/system).
  - Semilla con 27 nodos y 28 aristas representando el sistema instalado (memoria 3 capas, sentidos, agentes, providers, MCPs, tools, skills).
  - API `addNode`, `addEdge`, `removeEdge`, `edgesOf`, `textualSummary` (para alimentar la IA).
  - `CONNECTION_LAYERS` define las 9 capas filtrables con color, dashed y descripción.
- **`components/network/living-graph.tsx`** — Componente geométrico unificado:
  - SVG estático 1000×1000 con anillos concéntricos por tipo de nodo.
  - Layout determinista: cada `GraphNodeKind` tiene radio + offset angular fijos. El centro es siempre `self`.
  - Cada nodo se dibuja como su sólido platónico (rombo octaedro, cubo, triángulo tetraedro, hexágono icosaedro, pentágono dodecaedro, estrella de 8 puntas, círculo esfera).
  - Aristas coloreadas por tipo de conexión; capas filtran qué tipos son visibles.
  - Click en nodo: resalta vecinos + atenúa el resto + abre detalle.
  - **Modo "Conectar nodos"**: el usuario hace click en dos nodos cualesquiera, elige el tipo de conexión y se crea persistentemente.
  - Eliminación de aristas manuales con click en el círculo central de la línea iluminada.
  - Panel lateral con detalle del nodo seleccionado (lista de aristas adyacentes, eliminar conexiones manuales).
- **`components/network/integrated-living-graph.tsx`** simplificado a un wrapper de `LivingGraph` (ya no apila dos visualizaciones).
- **`app/(app)/network/graph/page.tsx`** rediseñado: usa `LivingGraph`, leyenda dividida en geometrías + tipos de conexión + instrucciones de uso.
- **`app/(app)/agent/page.tsx`** — `handleSend` ahora inyecta en el system prompt:
  1. Persona y reglas del agente.
  2. `snapshotToSystemPrompt(buildSystemContext({ upcomingEvents }))`.
  3. `getLivingGraphStore().textualSummary()` — la IA "ve" sus conexiones.
  4. `calendar.aiContextSnapshot()` — Sincrómetro.
  5. Historial de mensajes.
  Además persiste el texto del usuario como chunk OpenHuman para recuperación futura.
- **SensesPanel y McpPanel** ahora escriben en el `LivingGraphStore` al activarse: cada sentido o MCP encendido crea/actualiza un nodo y lo conecta a `self` con la arista correspondiente (perceives/uses).

### Decisiones tomadas
- **Una sola gráfica, capas = tipos de conexión**: la dualidad "red holográfica vs. memoria personal" no existe en realidad; son el mismo tejido visto desde dos ángulos. Mostrar una única gráfica con filtros por tipo de relación refleja la tesis ontológica del proyecto y simplifica enormemente el modelo mental para el usuario.
- **SVG estático en vez de Three.js dinámico**: la gráfica geométrica con sólidos platónicos en posiciones deterministas (anillos concéntricos tipo mandala) comunica mejor "estructura" y "armonía" que un grafo con física vibrante. Además: 0 dependencias 3D, accesible por screen reader, escalable, sin jitter de cursor.
- **OpenHuman 3-capas implementado nativamente, no como librería externa**: el modelo (tree + FTS + KV namespaced + orchestrator §4) está bien descrito y es portable. Implementarlo dentro de Hermes (en vez de depender de un binario externo) nos da una sola tienda local con persistencia controlada por el usuario. Cuando el usuario tenga su instalación nativa de OpenHuman corriendo, podremos exponer un MCP que sincronice ambos.
- **Bridge funcional desde el primer día**: tanto el snapshot textual (`buildContextSnapshot`), como la proyección al grafo (`projectToGraph`), como el orchestrator (`decide`) ya están operativos. Cuando lleguen los datos reales (ingestas, emails, descubrimientos), todo el grafo se puebla automáticamente.
- **Las nuevas conexiones se guardan con `origin: 'user'`**: distinguir entre conexiones "del sistema" (semilla) y "manuales" permite mostrar solo las manuales como eliminables, evitando que el usuario rompa accidentalmente la topología base.

### Pendiente / Próximos pasos
1. Persistir las aristas/nodos también en IndexedDB (más capacidad que localStorage) cuando el usuario tenga >1k nodos.
2. Conectar `OpenHumanMemoryEngine.ingest()` automáticamente a los puntos de entrada del sistema: posts nuevos, eventos del sincrómetro, descubrimientos del wizard de IA.
3. Implementar SQLite WASM FTS5 real para sustituir el `FtsIndex` basado en tokens.
4. Exponer la API de Hermes como tools MCP (`graph.addEdge`, `memory.store`, `memory.query_tree`) para que la IA pueda modificar el grafo desde el chat.
5. Tests unitarios del bridge (KV roundtrip, tree query, FTS scoring) y del store (addEdge idempotente, deleteEdge en cascade).
6. Visual: añadir niveles de zoom para grafos grandes (>100 nodos) — actual aguanta bien ~50 nodos en 1000×1000.
7. Sincronización con un binario local de OpenHuman cuando esté presente (vía MCP).

### Notas / aprendizajes
- La idea de "capas = tipos de conexión" es semánticamente más rica que "capas = tipos de nodo". El segundo enfoque (que era el inicial de Hermes en `02-layers.ts`) sí sirve para colorear, pero la verdadera información cognitiva está en los TIPOS de relación. Filtrando por tipo de relación, el usuario puede ver instantáneamente "qué cosas dependen de qué" o "qué cosas exponen tools".
- La doble capa apilada con `mix-blend-mode: screen` se veía bonita pero confundía al usuario sobre qué era qué. Una sola gráfica con leyenda clara es mejor pedagogía.
- Generar el system prompt completo en cada turno (~3-5kb extra) es razonable para LLMs modernos. Si en el futuro el contexto se vuelve un cuello de botella, se puede usar embedding-based selection en lugar de inyección bruta.
- Mantener todos los archivos OpenHuman dentro de `hermes-integration/` mantiene la cohesión semántica: Hermes es el "mensajero" entre la mente del usuario y el mundo digital; OpenHuman es su biblioteca de memoria. Son una sola arquitectura.


---

## 2026-05-28 — Colocación de widgets gen2 en dashboards + UI de sección + fix Fragua

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se colocaron los 10 widgets de 2ª generación en sus dashboards predeterminados ordenados por relevancia, se poblaron y activaron 6 categorías de dashboard antes vacías, se rediseñó el encabezado de la sección Dashboards (dinámico y centrado con contexto vivo) y se dejó compilable la Fragua de Interfaces (creador de widgets con IA, flujo 3 fases + edición).

### Hecho
- **`dashboard-defaults.ts`** — bloque gen2 al inicio de `WIDGET_CATEGORY_MAP` (AGORA_CAUSAL, LIQUID_DELEGATION, OIKOS_METABOLISM, SKILL_TREE, ASTRAURA_CORTEX, SOVEREIGN_NODE, AKASHIC_CODEX, NATAL_CHART, MESH_RADAR, IMMERSION_PORTAL). Plantillas predeterminadas reordenadas por relevancia respetando los `minW/minH` del manifest:
  - Política: AGORA_CAUSAL · POLITICAL_SUMMARY · LIQUID_DELEGATION · RELEVANT_POSTS.
  - Educación: SKILL_TREE · LEARNING_PATH · ACTIVE_PROJECTS.
  - Cultura: CULTURAL_FEED · IMMERSION_PORTAL · RELEVANT_POSTS.
  - Economía: OIKOS_METABOLISM · ECONOMIC_OVERVIEW · CALCULATOR · ACTIVE_PROJECTS.
  - Sistema: SOVEREIGN_NODE · MESH_RADAR · SYSTEM_STATUS · LIVE_DATA · NOTIFICATIONS.
  - IA: ASTRAURA_CORTEX · NEXUS_QUICK_ACCESS · MESSAGES.
  - Parlamento: AGORA_CAUSAL · LIQUID_DELEGATION · POLITICAL_SUMMARY · RELEVANT_POSTS.
  - Red: MESH_RADAR · EXPLORE_NETWORK · LIVE_DATA · MY_PAGES.
  - `FUTURE_DASHBOARD_TEMPLATES` poblado: astrología, archivos, entretenimiento, ayudantía, ciberdelia, descubrimientos.
- **`widget-categories.ts`** — `hasWidgets: true` en astrología, archivos, entretenimiento, ayudantía, ciberdelia, descubrimientos.
- **`dashboard-layout.tsx`** — encabezado dinámico y centrado: pill eyebrow (icono+nombre de categoría, punto pulsante, "{n} paneles · {n} widgets"), `<motion.h1>` con AnimatePresence keyed por dashboard activo y gradiente violet→cyan→fuchsia, descripción de categoría, fila centrada de `HeaderAction` (Forjar Widget · Crear Dashboard · Editar/Terminar · Pantalla completa). Nuevo componente `HeaderAction` con tonos neutral/cyan/emerald/indigo.
- **Fragua de Interfaces** — `ForgeWidgetResult` añadido en `widget-forge-types.ts`; `widget-forge-dialog.tsx` corregido (imports `CircleDashed/Loader2/Wand2/Input`, props retipadas a `ForgeWidgetResult`, init de `ontology` null-safe). El flujo 3 fases + edición ya estaba implementado: se preservó, no se reescribió.
- **`messages-widget.tsx`** — 3 props framer-motion `shadow:` → `boxShadow:` (clave válida).

### Decisiones tomadas
- **Preservar la Fragua existente** en lugar de reescribirla: ya implementaba las 3 fases (visuales + código + metamorfosis/edición IA). Solo faltaba que compilara.
- **Orden por relevancia para usuario promedio**: el widget más representativo de cada categoría va primero/arriba-izquierda, con feeds anchos al pie. Tamaños iniciales respetan `minW/minH` del manifest para evitar overflow desde el arranque.
- **Tolerar los 8 errores de tipo preexistentes** (grid-area `isDraggable`, workspace-renderer null, space-weather flare/magnetometer): documentados desde 2026-05-25, Next.js los ignora en build. Fuera del alcance de esta ola.

### Pendiente / Próximos pasos
1. Regenerar/actualizar los widgets gen1 restantes al patrón adaptativo (WidgetShell + kit + `useWidgetData`) para adaptabilidad total a cualquier dimensión y tema.
2. Resolver de forma segura los errores de tipo preexistentes en una ola de refactor dedicada.
3. Verificar visualmente en navegador la composición predeterminada de cada dashboard y el nuevo encabezado.

### Notas / aprendizajes
- Type-check con scope (`tsconfig.scope.json` temporal) es la vía para validar un subconjunto sin exceder el timeout del sandbox en el `tsc` de proyecto completo.
- En framer-motion la clave de sombra animable es `boxShadow`, no `shadow`.

---

## 2026-05-28 — Ola de migración gen1→adaptativo (completada)

Se migraron los widgets gen1 restantes al patrón adaptativo (WidgetShell + kit + `useWidgetData`), cerrando la regeneración total solicitada.

### Widgets migrados en esta ola
- **`active-projects-widget.tsx`** → `productivity.projects` (7s). "Génesis Activa", icono Rocket. ProgressRing/ProgressBar según tier, hitos en expanded.
- **`collab-projects-widget.tsx`** → `productivity.projects` (8s). "Hub Colaborativo". StatTiles Sincronía/Colaboradores + MiniList con Chip de estado.
- **`system-status-widget.tsx`** → `system.node` (2.5s). "Nodo Soberano". ProgressRing en micro; StatTiles CPU/RAM/Temp/Pares; "Procomún donado" (invariante Tríada); threads en expanded.
- **`notifications-widget.tsx`** → `common.notifications` (10s). "Alertas". KIND_META por tipo, franja de no-leído.
- **`messages-widget.tsx`** → `social.threads` (6s). "Enlace Neural". Avatar+punto online, badge de no-leídos.
- **`live-data-widget.tsx`** → `common.metrics` (3s). "Telemetría de Red". Grid de StatTiles + Sparkline del líder.
- **`learning-path-widget.tsx`** (nuevo archivo) → `education.paths` (15s). "Ruta de Aprendizaje", MENTOR_ICON humano/ia/híbrido.
- **`social-radar-widget.tsx`** (nuevo archivo) → `social.events` (20s). "Radar Social", badge de fecha + Chip por tipo de evento.
- **`mental-coherence-widget.tsx`** → `wellness.coherence` (4s). "Coherencia". ProgressRing + StatTiles Foco/Calma/Energía + Sparkline de historial.
- **`nexus-quick-access-widget.tsx`** → `ai.astraura` (5s). "Nexus IA". Atención + carga cognitiva + sugerencias + trabajos en segundo plano (reemplazado useRouter por next/link).
- **`calculator-widget.tsx`** — ahora **funcional** (aritmética real con `evaluate` validado por regex; sin fuente de datos, "Cálculo local" por invariante de soberanía). Display y teclado adaptativos.
- **`theme-selector-widget.tsx`** — envuelto en WidgetShell ("Vibrancy"), grid de 6 temas (next-themes) size-aware: 3-col icon-only en micro/compact, 2-col con etiqueta en regular+. Nunca desborda.
- **`theme-manager-widget.tsx`** — envuelto en WidgetShell ("Archivo de Temas"), conserva drag-reorder/aplicar/eliminar; MiniList con `max` por vTier; estado vacío adaptativo.
- **`ai-generated-widget.tsx`** — revisado, ya adaptativo (renderiza HTML IA con fallback de estado vacío). Sin reescritura.

### Correcciones de tipos preexistentes (resueltas, ya no toleradas)
- **`space-weather-flare-widget.tsx`** — el fallback de `latestFlare` usaba `time` mientras el dato real usa `timestamp`; unificado a `timestamp` y formateado a HH:MM UTC en la bandeja de telemetría.
- **`space-weather-magnetometer-widget.tsx`** — eliminada la línea rota e inusada `gicRisk = Math.abs(currentKp …)` (`currentKp` indefinido, `Math.abs` sobre string).

### Verificación
- Type-check con scope sobre los 13 widgets migrados + registry + los 2 weather corregidos: **EXIT 0, 0 errores**.

### Estado
Regeneración de widgets **completa**: todos los widgets del dashboard siguen ahora el patrón adaptativo (cualquier dimensión, cualquier tema, datos en vivo vía capa mock tipada intercambiable por APIs reales con `registerAdapter`).

---

## 2026-05-29 — Tercera generación (gen3): cobertura del documento de widgets

Objetivo: implementar los ~90 widgets del documento "Opciones de Widgets en Dashboards predeterminados", en oleadas por relevancia para el ciudadano medio. Carpeta nueva: `src/components/dashboard/widgets/gen3/`.

### Wave 1 — Política/Ontocracia ✅
- **CIVIC_ALCHEMY** (Alquimia Cívica) → `politics.initiatives`. Transmutador funcional queja→iniciativa (textarea + selector de ámbito + botón Transmutar que redacta localmente; botón Firmar). Leyes relacionadas, progreso de firmas.
- **VITAL_FLOW_AUDIT** (Auditoría de Flujo Vital) → `politics.treasury`. Total, barras por sector, zoom macro→micro por filtro de sector, gasto por asignación, botón Flag (revisión comunitaria), votaciones de presupuesto.
- **SOCIAL_RESONANCE** (Resonancia Social) → `politics.resonance`. Heatmap semántico por emoción, modo "Burbuja Rota" (postura contraria), filtro por palabra clave, enlaces al debate.

### Wave 2 — Economía/Ecología ✅
- **GIFT_AGORA** (Ágora del Don) → `oikos.gifts`. Bienes/servicios libres, filtro de proximidad, botón Tomar/Sumarme.
- **COMMONS_MATRIX** (Patrimonio Común) → `oikos.commons`. Medios de producción compartidos, estado/cola, Reserva por Propósito.
- **FOOD_ORACLE** (Soberanía Alimentaria) → `oikos.food`. Cosecha, reservas, madurez de cultivos, invernaderos, predicción 7d, perfil dietético.
- **REGEN_TRACER** (Huella Regenerativa) → `oikos.regen`. CO₂/árboles/compost/agua, anillo de circularidad, metas, escáner AR de verdad material.

### Plumbing por oleada (patrón repetible)
1. Contratos en `lib/widget-data/types.ts` + claves en `WidgetDataMap`.
2. Adaptadores mock en `lib/widget-data/adapters.ts` (vivos, deterministas) + registro en `defaultRegistry`.
3. Literales en `dashboard-types.ts` (`WidgetType`).
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. Componentes adaptativos en `widgets/gen3/` + barrel `gen3/index.ts`.
6. Casos en `widget-registry.tsx`.
7. Type-check con scope → 0 errores por oleada (Wave 1 y Wave 2 verificadas).

### Pendiente
- Waves 3–7: Productividad (5), Utilidades+IA (7), Perfil+Hub (8), Educación/Cultura/Arte (resto), Especializados (Ubicación, AR/VR, Astronomía/Astrología, Descubrimientos, Creatividad, Privacidad, Conectividad, Dispositivos, Archivos, Sistema, Entretenimiento, Sociedad).
- Recomponer dashboards predeterminados por relevancia con los nuevos widgets.
- Nota: el dev server (`npm run dev`, puerto 9002) debe ejecutarse en la máquina del usuario; el sandbox Linux no puede servir a su localhost ni cargar el binario SWC de macOS.



---

## 2026-05-29 — Cuarta generación (gen4): cierre del catálogo + rename "Social"→"Dashboards"

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se implementaron 11 widgets adaptativos nuevos (gen4) cubriendo los dashboards del documento "Opciones de Widgets en Dashboards predeterminados" que faltaban, todos con el patrón WidgetShell + kit + useWidgetData (datos en vivo mock, intercambiables por APIs reales con registerAdapter). Se colocaron en sus dashboards predeterminados por relevancia sin tocar los widgets previos, y el dashboard por defecto pasó de llamarse "Social" a "Dashboards".

### Widgets gen4 (carpeta `widgets/gen4/`)
- **ELDER_COUNCIL** (Consejo de Sabios) → `politics.council`. Meritocracia del entendimiento: ranking por reputación, insignias verificables, voces delegadas, filtro "solo en línea". → dashboard Política.
- **RESTORATIVE_COURT** (Tribunal Restaurativo) → `politics.justice`. Círculos de Paz, justicia restaurativa nunca punitiva. Etapas, progreso, próximo círculo. → Política.
- **BARTER_MARKET** (Mercado de Trueque) → `oikos.barter`. Ofrece↔busca, filtro por categoría, match por afinidad, botón Proponer. → Economía.
- **ENERGY_GRID** (Energía Comunal) → `oikos.energy`. Microred: gen/consumo, batería, kW al procomún, fuentes, CO₂, sparkline. → Economía.
- **MENTOR_MATCH** (Mentoría Híbrida) → `education.mentors`. Humano/IA/híbrido, rating, afinidad, disponibilidad. → Educación.
- **UNIVERSAL_LIBRARY** (Biblioteca Universal) → `education.library`. Continúa aprendizaje + destacados + colecciones + búsqueda. Acceso abierto. → Educación.
- **MULTIVERSE_HUB** (Multiverso) → `culture.multiverse`. Mundos VR/AR/2D/espacial, presencia viva, en directo. → Cultura.
- **CREATIVE_STUDIO** (Estudio Creativo) → `culture.studio`. Proyectos por medio, herramientas del Lienzo, inspiración del día. → Cultura.
- **ORACLE_PREDICT** (Oráculo Predictivo) → `ai.oracle`. Escenarios probabilísticos del Exocórtex con confianza, horizonte y factores. → IA.
- **IDENTITY_VAULT** (Bóveda de Identidad) → `system.identity`. Dualidad Cuenta/Perfil, verificación ZK, accesos a datos revocables, score de soberanía. → Sistema.
- **ENERGY_MAP** (Mapa de Energía) → `astro.energy`. Coherencia, centros energéticos, biorritmo, influencias cósmicas. → Astrología.

### Plomería (mismo patrón repetible de gen2/gen3)
1. 11 interfaces + claves en `lib/widget-data/types.ts` (`WidgetDataMap`).
2. Adaptadores mock deterministas en `lib/widget-data/gen4-adapters.ts`, auto-registrados (side-effect importado desde `index.ts`). No se tocó `adapters.ts`.
3. 11 literales en `dashboard-types.ts` (`WidgetType`).
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. 11 entradas en `WIDGET_CATEGORY_MAP` (dashboard-defaults.ts) → aparecen automáticamente en el selector de widgets (dashboard-layout lee este mapa).
6. Componentes en `widgets/gen4/` + barrel `gen4/index.ts`.
7. Casos en `widget-registry.tsx`.

### Colocación en dashboards predeterminados (sin borrar nada previo)
- Política: + ELDER_COUNCIL, RESTORATIVE_COURT (segunda fila).
- Educación: + UNIVERSAL_LIBRARY, MENTOR_MATCH.
- Cultura: + MULTIVERSE_HUB, CREATIVE_STUDIO.
- Economía: + ENERGY_GRID, BARTER_MARKET.
- IA: + ORACLE_PREDICT.
- Sistema: + IDENTITY_VAULT.
- Astrología (FUTURE templates): + ENERGY_MAP.

### Rename
- Plantilla por defecto (categoryId 'social'): `name: 'Social'` → `name: 'Dashboards'`. Es el título que se muestra al abrir el dashboard por defecto.

### Verificación
- Type-check con scope (tsconfig.gen4.json temporal) sobre los 11 widgets + capa de datos + registry + manifest + defaults: **0 errores**. Config temporal eliminada.

### Pendiente
- Conectar adaptadores reales (Supabase/REST/oráculos) por `registerAdapter` cuando existan las fuentes.
- Widgets del documento aún no cubiertos como piezas dedicadas (algunos ya equivalen a widgets previos): Bienvenida/Estado, Lanzador de Creación Rápida, Galería de Arte, Reproductor de Medios, Seguimiento de Hábitos, Pausa Consciente, Actividad Física (wearables), Accesos Directos de Config. Candidatos a una gen5.

---

## 2026-05-29 — Quinta generación (gen5): 10 widgets nuevos + 5 dashboards + estado vacío con biblioteca + IA omnipresente

**Sesión por:** Claude (Cowork mode, Opus) + 5 subagentes en paralelo (sonnet), uno por par de widgets.
**Resumen ejecutivo:** Se añadieron 10 widgets adaptativos (gen5) cubriendo las categorías del documento que faltaban (Productividad avanzada, Ubicación, Privacidad, Dispositivos, Descubrimientos, Creatividad, Perfil, Sociedad), con 5 categorías/dashboards nuevos. El estado vacío de cualquier dashboard ahora ofrece un botón real "Añadir Widget" que abre la biblioteca. El asistente flotante de IA (AiOverlay/Astraura) ya estaba montado en el layout y aparece en toda sección con posición configurable. Sin borrar nada previo (gen1–gen4).

### Widgets gen5 (carpeta `widgets/gen5/`, creados por subagentes en paralelo)
- **FLOW_DIRECTOR** (Director de Flujo Vital) → `productivity.flow`. Energía circadiana (ProgressRing+Sparkline 24h), sugerencia de tarea óptima, ventanas del día, toggle "Modo Fortaleza". → Productividad.
- **PROJECT_SWARM** (Enjambre de Propósitos) → `productivity.swarm`. Constelación viva de proyectos, brillo por urgencia×impacto, filtro por estado, "Soltar al enjambre". → Productividad.
- **ABUNDANCE_RADAR** (Radar de Abundancia) → `location.resources`. RadialNodeGraph de recursos libres cercanos, filtro por tipo, ETA/Reservar. → Ubicación.
- **TRANSIT_FLOW** (Tránsito Orgánico) → `location.transit`. Movilidad compartida, ETA, ocupación, CO₂ ahorrado, Solicitar. → Ubicación.
- **CRYPTO_SHIELD** (Escudo Ontológico) → `privacy.shield`. Niveles de fricción criptográfica, rastreadores bloqueados, flujos de datos con toggle Permitir/Bloquear, "Amnistía de datos". → Privacidad.
- **HABITAT_CORE** (Simbiosis Habitacional) → `devices.habitat`. Domótica: clima/luz/aire por habitación, modo circadiano, robots con batería, sincronía energética. → Dispositivos.
- **SERENDIPITY_LENS** (Lente de Serendipia) → `discovery.serendipity`. Slider "Nivel de Extrañeza", hallazgos por tipo, "Sorpréndeme". → Descubrimientos.
- **IDEA_FORGE** (Incubadora de Quimeras) → `creativity.ideas`. Colisión de conceptos (a✕b + puente), botón "Colisionar", guardar chispas, disciplinas. → Creatividad.
- **MERIT_GALLERY** (Cristalería de Mérito) → `profile.merit`. Firma de confianza (ProgressRing), huella regenerativa, insignias por tier, top-skills. → Perfil.
- **SOCIETY_PULSE** (Pulso del Organismo) → `society.cohesion`. Índice de Armonía Global, abundancia/bienestar/participación, cohesión por biorregión, detección de fracturas. → Sociedad.

### Categorías/dashboards nuevos (widget-categories.ts + dashboard-defaults.ts)
- Añadidas 5 categorías: **privacidad, dispositivos, creatividad, perfil, sociedad** (con icono/color/tags, hasWidgets).
- 5 plantillas predeterminadas nuevas (Privacidad, Dispositivos, Creatividad, Perfil, Sociedad) ordenadas por relevancia.
- Reforzadas plantillas existentes: Productividad (FLOW_DIRECTOR + PROJECT_SWARM), Ubicación (ABUNDANCE_RADAR + TRANSIT_FLOW), Descubrimientos (SERENDIPITY_LENS).

### Infra de UX
- **Estado vacío** (`grid-area.tsx`): rediseñado con halo animado + botón real `AddWidgetDialog` (abre la biblioteca de widgets). `GridArea` ahora recibe `onAddWidget`/`onForgeOpen`, cableados desde `dashboard-workspace-renderer.tsx`.
- **Asistente IA omnipresente**: confirmado `AiOverlay` montado en `app/(app)/layout.tsx` (voz+texto, posición configurable, navega/actúa). No se duplicó.

### Plomería (mismo patrón gen4)
1. 10 grupos de interfaces + claves en `types.ts` (`WidgetDataMap`).
2. Adaptadores mock deterministas auto-registrados en `gen5-adapters.ts` (side-effect desde `index.ts`). `defaultRegistry` ya es `Partial<AdapterRegistry>` (gen4), así que gen5 encaja sin tocar `adapters.ts`.
3. 10 literales en `dashboard-types.ts`.
4. Entradas en `widget-manifest.ts` (minW/minH, categoría, relevancia, data).
5. 10 entradas en `WIDGET_CATEGORY_MAP` + 5 categorías nuevas → aparecen solas en el selector.
6. Componentes en `widgets/gen5/` (10 archivos).
7. Casos + imports en `widget-registry.tsx` (los 10 cableados).

### Verificación
- Type-check con scope (tsconfig.gen5.json temporal) sobre los 10 widgets + capa de datos + registry + manifest + defaults + grid-area + renderer: **0 errores**. Temporal eliminado.

### Pendiente / próximos pasos
- Conectar adaptadores reales por `registerAdapter` (Supabase/REST/oráculos/puente de dispositivos) cuando existan fuentes del usuario.
- Mejora estética profunda iterativa de widgets gen1 (microinteracciones/animaciones) si se desea otra ola dedicada.
- Sincronización biblioteca online + compartir widgets entre usuarios (edición compartida/bloqueada, réplica de archivos de la red) — diseño pendiente respetando que los archivos/datos de la red NO son alterables salvo permiso.

---

## 2026-05-29 — Acomodo final gen4/gen5 en dashboards + migración rename "Social"→"Dashboards"

**Sesión por:** Claude (Cowork mode, Opus).
**Resumen ejecutivo:** Se confirmó/cerró el acomodo de los 21 widgets gen4+gen5 en sus 27 dashboards predeterminados, se añadió migración de localStorage para que usuarios existentes vean el dashboard por defecto como "Dashboards" (antes "Social"), y se verificó consistencia total (47 tipos usados ↔ manifest/registry/WidgetType) + type-check 0 errores.

### Hecho
- **Rename robusto**: además de `name: 'Dashboards'` en la plantilla por defecto (categoryId 'social'), se añadió en `dashboard-layout.tsx` una migración al cargar: si un dashboard persistido tiene `category==='social' && name==='Social'`, se renombra a 'Dashboards' y se re-persiste. Cubre instalaciones previas sin tocar tableros personalizados.
- **Acomodo verificado por dashboard** (widgets por relevancia, sin solapes):
  - Dashboards(social) 5 · Política 6 · Educación 5 · Cultura 5 · Economía 6 · Clima 9 · Productividad 6 · Ubicación 4 · Utilidades 3 · Arte 1 · Astronomía 7 · Sistema 6 · Personalización 2 · IA 5 · Parlamento 4 · Red 4 · Explorador 3 · Astrología 4 · Archivos 2 · Entretenimiento 2 · Ayudantía 3 · Ciberdelia 3 · Descubrimientos 4 · Privacidad 3 · Dispositivos 3 · Creatividad 3 · Perfil 3 · Sociedad 3.
- **Verificación de consistencia** (script): 47 WidgetType usados en plantillas → 0 faltantes en manifest, 0 faltantes en registry case, 0 faltantes en declaración WidgetType.
- **Type-check** scope completo (widget-data + dashboard core + gen4 + gen5): **0 errores**.
- **Estado vacío** con botón real a la biblioteca y **AiOverlay omnipresente** ya integrados (sesión previa gen5).

### Pendiente / próximos pasos (olas dedicadas)
- Rediseño estético profundo iterativo de widgets gen1 antiguos (microinteracciones/animaciones por widget).
- Sincronización con biblioteca online + compartir/replicar widgets entre usuarios (edición compartida/bloqueada), respetando que datos/archivos de la red NO se alteran salvo permiso.
- Panel de permisos de IA en la página de IA (acceso complejo al sistema, desplegar agentes/subagentes) — por defecto las IAs de chat del usuario pueden editar su propio entorno.

### Adenda (misma fecha) — fixes de cierre
- **Migración rename en runtime**: `dashboard-layout.tsx` ahora, al cargar dashboards persistidos, renombra `category==='social' && name==='Social'` → 'Dashboards' y re-persiste (cubre usuarios ya inicializados; no toca tableros personalizados). El título grande del header lee `activeDashboard?.name ?? "Dashboards"`.
- **Bug real corregido**: `LIVE_DATA` no tenía case en `widget-registry.tsx` (renderizaba "Widget desconocido" en Sistema y Red). Añadido import `LiveDataWidget` + case.
- **Verificación de cobertura**: 47 WidgetType colocados en las 28 plantillas → 0 sin case en registry. Type-check scope (data + dashboard core + gen4 + gen5 + app-shell) → 0 errores nuevos (2 preexistentes ajenos: tipado RGL en grid-area:205 y activeId en renderer:174, ignorados por Next en build).

### Adenda 2 — re-siembra versionada de dashboards predeterminados
- **Problema**: instalaciones con `LS_INITIALIZED` ya puesto nunca volvían a sembrar, así que los nuevos acomodos gen4/gen5 no aparecían en localhost del usuario.
- **Solución**: `LS_DEFAULTS_VERSION` + `DEFAULTS_VERSION='gen5-2026-05-29'`. Al montar, si la versión guardada ≠ actual, `reseedDefaultDashboards()` regenera TODOS los tableros predeterminados con el acomodo nuevo y **preserva los tableros propios** del usuario (categorías no predeterminadas + sus widgets), resetea `LS_ORDER` y guarda la versión. Subir `DEFAULTS_VERSION` en el futuro re-siembra automáticamente.
- Type-check del archivo: 0 errores nuevos.

---

## 2026-05-30 — Re-siembra de defaults + Olas 1·2·3 (gen1 redux, permisos IA, compartir/sincronizar)

**Sesión por:** Claude (Cowork mode, Opus) + 1 subagente (gen1).
**Resumen ejecutivo:** Resuelto que los nuevos acomodos no aparecían en localhost (bandera de init), mejorados los widgets gen1 más básicos, y construidas dos capacidades nuevas: panel de permisos de IA y sistema de compartir/sincronizar widgets con la biblioteca.

### Re-siembra versionada de dashboards (fix del usuario)
- `LS_DEFAULTS_VERSION` + `DEFAULTS_VERSION='gen5-2026-05-29'` en `dashboard-layout.tsx`. Al montar, si la versión guardada ≠ actual y ya había tableros, `reseedDefaultDashboards()` regenera TODOS los predeterminados con el acomodo nuevo y PRESERVA los tableros propios del usuario (categorías no predeterminadas + sus widgets), resetea `LS_ORDER` y guarda versión. Subir la constante re-siembra en el futuro. (Recargar la página aplica el cambio.)
- Migración de rename "Social"→"Dashboards" también en runtime.

### Ola 1 — gen1 redux
- Auditoría: casi todos los widgets raíz ya usaban el kit (sesiones previas). Solo eran básicos 3.
- Reescritos (subagente) con kit adaptativo + datos en vivo, microinteracciones y diseño único:
  - `explore-network-widget.tsx` → `social.entities` (entidades trending, momentum, unirse).
  - `my-pages-widget.tsx` → `social.pages` (rol, actividad, filtro por kind).
  - `political-summary-widget.tsx` → `politics.proposals` (etapas, votar a favor/contra, deadline).
- Type-check 0 errores.

### Ola 2 — Permisos y accesos de IA
- `src/ai/client/ai-permissions.ts`: modelo soberano. Por DEFECTO acceso completo al PROPIO entorno (read/edit widgets·dashboards·layout·appearance·code·memory, manage agents·providers, navigate, net.read). `net.write` OFF por la Constitución (datos de la red/otros inmutables salvo permiso). API: load/save/canPerform/setScope/setComplexAccess/setMaxAgents/reset, por actor (`assistant`|`nexus`), persistente + evento de cambios.
- `src/ai/client/use-ai-permissions.ts`: hook reactivo.
- `src/components/ai/ai-permissions-panel.tsx`: panel con selector actor, toggle maestro de "acceso complejo", scopes por grupos (lectura/entorno/inteligencia/red), slider de agentes máximos, reset. `net.write` marcado con candado.
- Integrado como pestaña **"Permisos"** en `/ai-setup` (deep-link `?tab=permissions`). Type-check 0 errores.

### Ola 3 — Compartir / sincronizar widgets (biblioteca)
- `src/lib/widget-sync/index.ts`: source-agnostic (transport intercambiable por Supabase/IPFS/ActivityPub con `registerSyncTransport`). API: `shareWidget` (publica a biblioteca), `replicateEntity` (réplica = REFERENCIA al origen, nunca lo altera; Lienzo Universal), `syncReplica`, `openCollabSession`/`canEditEntity`/`closeCollabSession` (edición compartida o bloqueada con lock). Invariante: contenido de red `networkLocked` → inmutable salvo permiso.
- UI: botón **🔗 Compartir** en los controles de edición de cada widget (`grid-area.tsx`), copia un enlace `starseed://widget/<id>` y publica a la biblioteca. Type-check 0 errores nuevos.

### Verificación final
- Type-check de scope amplio (widget-data + widget-sync + IA + dashboard core + gen4 + gen5 + gen1 redux + app-shell): **0 errores nuevos**. Persisten 2 preexistentes ajenos (RGL en grid-area, activeId string|null en renderer), ignorados por Next en build.

### Pendiente / siguientes mejoras opcionales
- UI de biblioteca para explorar/replicar widgets compartidos por otros (lista + botón Replicar) — el store ya lo soporta.
- Conectar `registerSyncTransport` a Supabase/federación real.
- Cablear `canPerform()` de permisos dentro del overlay/agente para gatear acciones reales (hoy el modelo y el panel están listos; el overlay es grande y frágil — integrar con cuidado en una pasada dedicada).

### Adenda 3 — fixes finales + botón de restablecer
- **Bug del subagente corregido**: los 3 widgets gen1 (explore-network, my-pages, political-summary) importaban `../../kit` (ruta de gen5) → corregido a `../kit`. 0 errores.
- **Botón "Restablecer dashboards"** en la barra del dashboard → `handleResetLayout()` llama a `reseedDefaultDashboards()` con confirmación; regenera los predeterminados con el acomodo nuevo conservando los tableros propios. Da una vía manual además de la re-siembra automática por versión.
- Verificación final del núcleo (data + sync + IA + dashboards + gen1/gen4/gen5 + app-shell): 0 errores nuevos.

### Adenda 6 — verificado en dev server + fondos líquidos + favicon servido
- Dev server (puerto 9002) sano: /login HTTP 200, /dashboard 307→login (auth middleware Supabase). Sin errores de compilación tras los cambios.
- IMPORTANTE para el usuario: /dashboard redirige a /login si no hay sesión; los widgets sólo se ven autenticado. Tras iniciar sesión, recargar aplica la re-siembra (DEFAULTS_VERSION='gen5-2026-05-30b').
- Favicon e íconos servidos OK (public/starseed-symbol.png, src/app/icon.png 512, apple-icon.png 180, favicon-48.png) desde Documents/simbolos/simbolo_starseed.png. Metadata `icons` en app/layout.tsx.
- Fondos psicodélicos líquidos: nuevo `LiquidPsychedelicBackground` (5 presets: Aurora Líquida, Plasma Psicodélico, Lava Solar, Marea Profunda, Iris Cuántica) — blobs SVG con gradientes animados, hue-rotate y parallax al cursor; montado en app/layout. Añadidos a "Temas Rápidos → Fondo de Pantalla" con preview animado; applyBackground setea config.background.type al id del preset. 0 errores de tipo.

### Adenda 7 — picker de fondos líquidos en Apariencia
- Los presets líquidos NO van en la barra del dashboard (ahí "Diseño Estético" sólo estiliza la barra). El picker real de fondo es `src/components/settings/appearance/background-settings.tsx`.
- Añadida sección "Fondos Psicodélicos Líquidos" con los 5 presets (Aurora Líquida, Plasma Psicodélico, Lava Solar, Marea Profunda, Iris Cuántica), preview con gradiente animado; al pulsar setea `config.background.type` al id → activa `LiquidPsychedelicBackground` (montado en app/layout). 0 errores de tipo.
- Ubicación para el usuario: Ajustes → Apariencia → Fondo → "Fondos Psicodélicos Líquidos".
- NOTA: el dev server (localhost:9002) estaba caído (HTTP 000) al cerrar la sesión; debe ejecutarse `npm run dev` en la máquina del usuario para ver y verificar los cambios.

### Adenda 8 — tipado de fondos líquidos + pestaña "Líquidos"
- Corregida línea duplicada `type:` en `appearance-context.tsx` (interface background) y extendida la unión con los 5 ids líquidos → ya no requiere `as any`.
- `background-settings.tsx`: añadida pestaña "Líquidos" (Droplets) con grid de 5 presets, preview con gradiente animado + check del activo; setea `config.background.type` al id. 0 errores.
- Resumen verificado de la sesión: DEFAULTS_VERSION bump ✓, sidebar auto-hide con título ✓, cabecera limpia ✓, fullscreen 100dvh ✓, favicon/íconos StarSeed ✓, LiquidPsychedelicBackground montado ✓, pestaña Líquidos ✓.

### Adenda 9 — BUG CRÍTICO encontrado: header.tsx roto (causa real del dashboard en blanco)
- `src/components/layout/header.tsx` estaba CORRUPTO: sin `export function AppHeader()`, sin importar `useState`, con 10 líneas `const [mounted2, setMounted] = useState(false)` duplicadas a nivel de módulo. Compila-crash de TODA la sección `(app)` al renderizar el AppHeader → por eso, tras iniciar sesión, el dashboard salía en blanco / sin widgets. (No se notaba en /login porque vive en el root layout, y /dashboard redirige a /login por middleware antes de render cuando no hay sesión.)
- Reconstruido limpio: AppHeader con el símbolo StarSeed (`/starseed-symbol.png`) como marca + ColorThemeSwitcher. 0 errores.
- Verificado: ningún otro archivo tiene esa corrupción (scan de líneas duplicadas consecutivas en todo src = limpio). Type-check de la ruta de render completa de /dashboard (layout (app) + header + app-shell + dashboard-layout + grid-area + floating-assistant) = 0 errores.
- **Marca StarSeed integrada**: símbolo real en login (80px con halo animado) y cabecera global (24px con hover). Dev server /login HTTP 200.

### Adenda 10 — marca StarSeed propagada + ortografía verificada
- `src/components/logo.tsx`: reemplazado icono Orbit por `/starseed-symbol.png` (28px, halo) → se propaga a login + AuthForm + cualquier consumidor de <Logo/>.
- header.tsx restaurado correctamente (búsqueda + NotificationCenter + UserNav intactos) con el símbolo StarSeed como marca a la izquierda.
- Ortografía: barrido de texto JSX visible — sin errores reales (Conexiones, Notificaciones, Personalización, Configuraciones, etc. ya correctos con tilde). Se normalizaron "..." → "…" en placeholders del header.
- Type-check ruta de render completa /dashboard + logo + login: 0 errores nuevos.

### Adenda 11 — BUG RAÍZ de "otros dashboards vacíos" + sidebar fullscreen + más corrupción
- **CAUSA REAL encontrada**: `widgetsMap` en dashboard-layout se construía con `widgets.filter(w => w.dashboard_id===d.id)`, pero `widgets` (estado) sólo contiene los del dashboard ACTIVO → todas las demás pestañas recibían []. Por eso sólo la principal mostraba widgets. FIX: `widgetsMap` ahora usa `loadAllWidgets()` para los no-activos y el estado en vivo para el activo. Todas las pestañas aparecen acomodadas por defecto.
- **Más corrupción reparada** (mismo patrón que header.tsx): efecto `setTimeout(setIsFullscreen,2500)` duplicado, y atributo `title=...` repetido 6× en el botón toggle del sidebar. Limpiados.
- **Sidebar en pantalla completa**: nuevo efecto `if (isFullscreen) setIsSidebarOpen(false)` → al auto-entrar a fullscreen (2.5s) el menú de ajustes se esconde y queda sólo el botón de expansión, dejando los widgets a pantalla completa. (Ya se ocultaba también con el scroll del título.)
- Verificado: 7/7 fixes presentes, type-check dashboard-layout 0 errores, sin duplicados consecutivos.
- **No pude levantar el dev server ni abrir el navegador yo mismo**: Terminal está en tier "click" (no puedo teclear) y Chrome en tier "read" (no puedo clicar); la extensión Claude-in-Chrome está desconectada. El usuario debe ejecutar `npm run dev` (puerto 9002). Tras el fix de header.tsx (que crasheaba el render) + widgetsMap, los dashboards deben cargar con sus widgets al recargar e iniciar sesión.

### Adenda 12 — Cuenta unificada con el Portal StarSeed OS (2026-06-10)
- Creado `architecture/integracion-portal-starseed-os.md` (SOP primero, regla dorada) y `.env.local` con el proyecto Supabase COMPARTIDO `dzkjapinnewkxzjltadv` (el del Café/Portal) + `GOOGLE_GENAI_API_KEY` → una sola cuenta soberana en todo el ecosistema y Genkit operativo.
- El Portal StarSeed OS (repo Starseed-Cafe, carpeta "StarSeed Café/app") es ahora la página principal: 6 áreas (incluye Audiomorphic), Astraura (Exocórtex global con el corpus del Drive), cartera Semillas/Granos con bolsa simulada (tablas nuevas `grain_types` y `seed_market`, lectura pública), cuenta OTP compartida (storageKey `starseed.auth`).
- Sistema de enlaces: starseed-os.vercel.app (portal) · /cafe/ · starseed-nexus.vercel.app (este SOSD).
- Razón: petición del visionario de interconectar todas las áreas y cuentas bajo una identidad y mejorar el diseño global del ecosistema.

### Adenda 13 — Intercambio de nombres (2026-06-10, tarde)
- DECISIÓN del visionario: el portal de marca pasa a llamarse **StarSeed Nexus** (starseed-nexus.vercel.app) y ESTE repo/aplicación es **StarSeed OS** (conserva starseed-os.vercel.app, que ya servía esta app). starseed.config.json: systemName "StarSeed OS", deployment.url starseed-os.vercel.app. SOP de integración actualizado.

### Adenda 14 — Tema Materia Viva (2026-06-11)
- **Qué:** nueva familia de fondos "Materia Viva" (oro + cristal + geometría sagrada del rediseño Nexus/Café) en canvas 2D ligero, sin three.js. 3 ids nuevos en `config.background.type`: `materia-oro-vivo` (ámbar/oro), `materia-cristal-liquido` (cian/lavanda), `materia-bosque-dorado` (lima/musgo). Flor de la Vida (19 círculos) en rotación lenta, ~90 partículas ascendentes y brillo especular que sigue al cursor; pausa en pestaña oculta, DPR-aware, `prefers-reduced-motion` → fotograma estático.
- **Dónde:** SOP primero en `architecture/integracion-portal-starseed-os.md` ("Tema Materia Viva (v1)"); componente nuevo `src/components/backgrounds/materia-viva-background.tsx` (`MateriaVivaBackground` con props `variant`+`intensity` + host `MateriaVivaBackgroundHost` que se auto-activa con `type.startsWith("materia-")`); host montado en `src/app/layout.tsx`; unión de tipos + campo opcional `background.intensity` (0..1) en `src/context/appearance-context.tsx`; pestaña "Materia Viva ✦" con 3 tarjetas (preview CSS animada) y deslizador Intensidad (0–100) en `src/components/settings/appearance/background-settings.tsx` (TabsList pasa de grid-cols-5 a grid-cols-7 para acomodar las 7 pestañas).
- **Por qué:** personalización de la red con los nuevos estilos visuales del rediseño Nexus/Café — opciones configurables (variante + intensidad) publicadas como personalización elegible por cada usuario (código abierto, §6). Cambios 100% aditivos: ninguna función existente tocada ni eliminada; `intensity` opcional → configs guardadas siguen siendo válidas.

### Adenda 15 — Widget Cartera StarSeed (2026-06-11)
- **SOP primero (regla dorada):** nueva sección "Widget Cartera StarSeed (v1)" en `architecture/integracion-portal-starseed-os.md` con fuentes de datos, estados e invariantes.
- **Nuevo widget** `src/components/dashboard/widgets/cartera-starseed.tsx` (`CarteraStarseedWidget`, 'use client'): tarjeta "Cartera StarSeed 🌱" sobre `WidgetShell` del kit. Consume la **cuenta soberana unificada** (Supabase compartido `dzkjapinnewkxzjltadv`) vía el cliente browser existente `@/utils/supabase/client`:
  - Público siempre: `grain_types` + últimas ~60 filas de `seed_market` → sparkline SVG inline de `seed_eur` (stroke `#9FE870`, degradado sutil) con último valor y delta 7d %.
  - Con sesión (RLS `auth.uid()`): fila de `wallets` (Semillas en contador grande verde + granos por tipo como pills emoji + g con color del tipo) y últimos 6 movimientos de `economy_ledger` (kind + name + ±semillas + hace cuánto).
  - Estados: skeleton de carga, error con botón Reintentar, sin sesión → mercado público + CTA "Iniciar sesión" (`/login`), micro-tier adaptativo. Pie fijo: "Bolsa y cartera en modo beta simulada". Solo lectura; sin dependencias nuevas.
- **Registro** (siguiendo el patrón de los widgets existentes, todo aditivo, nada eliminado): tipo `CARTERA_STARSEED` en `dashboard-types.ts`; case + import en `widget-registry.tsx`; manifiesto en `widget-manifest.ts` (label "Cartera StarSeed", categoría economia, w3×h5 como Pulso Económico); mapeo de categorías en `dashboard-defaults.ts` (economia + perfil); tarjeta en la Biblioteca de Widgets (`add-widget-dialog.tsx`) con icono `Wallet` de lucide-react. NO se añadió a las plantillas de tableros predeterminados: el usuario lo añade cuando quiera. Nota: el sistema identifica widgets por `WidgetType` en MAYÚSCULAS, por eso el id interno es `CARTERA_STARSEED` (el archivo sí es `cartera-starseed.tsx`).
- Verificación: `npx tsc --noEmit` sin errores en los archivos tocados (cartera-starseed, dashboard-types, widget-registry, widget-manifest, dashboard-defaults, add-widget-dialog).
- No se tocaron `src/components/settings/appearance/`, `src/components/backgrounds/` ni el contexto de apariencia (en manos de otro agente en paralelo).

### Adenda 16 — OmniDock responsive + Materia Viva integrada por defecto (2026-06-11)
- **SOP primero (regla dorada):** secciones nuevas en `architecture/integracion-portal-starseed-os.md`: "Tema Materia Viva → v1.1" y "OmniDock responsive (fix 2026-06-11)".
- **Fix del dock Trinity (Anchor) en pantallas chicas** — el usuario reportó que "el menú de abajo no sale completo en pantallas chicas". Causa: 11 botones × 56–64px + gaps + padding ≈ 745–897px de contenido con `overflow-visible` → cortado en cualquier viewport <1024px. Cambios en `src/components/layout/omni-dock.tsx` (NINGUNA función eliminada):
  - La píldora conserva borde/cristal; dentro un strip `.omni-dock-strip` (CSS en `globals.css`) que en `<1024px` hace scroll-x con `scroll-snap` (snap-center), scrollbar oculta, máscara de degradado en ambos bordes (pista de "hay más") y `overscroll-behavior-x: contain`. En `≥1024px` (lg) overflow visible y tamaños 64px como siempre (tooltips intactos).
  - Items `shrink-0`, talla compacta 48px en `<lg` (≥44px táctil), gaps/padding reducidos, `safe-area-inset-bottom` en el wrapper. El breakpoint es **lg y no sm** porque a 768px el contenido (897px) también desbordaba — verificado empíricamente con Playwright.
- **Materia Viva integrada en dashboards** (`src/context/appearance-context.tsx`, `src/app/globals.css`, `src/app/(main)/layout.tsx`):
  - Default `background.type: "materia-oro-vivo"` (+ `intensity: 0.7`) para usuarios SIN config guardada; las configs en localStorage se mergean encima y no se tocan (verificado: con config webgl guardada todo vuelve al estado anterior).
  - `applyStyles` pone `data-materia="<variante>"` en `<body>` cuando el type empieza por `materia-` (y lo borra si no). `globals.css`: bloque `body[data-materia…]` con `--materia-accent` y override de `--primary-hsl`/`--ring-hsl` por variante (dorado #E9C46A / cian #7FD8E8 / lima #9FE870), borde global cálido en dark (44 28% 24%, mismo L/S que Nebula), y borde+glow `color-mix` en `.card-glass`/`.liquid-glass-panel`. Sin data-materia: cero efecto (temas existentes intactos).
  - Shell del grupo `(main)` con clases estables `os-main-shell`/`os-main-scroll`: bajo data-materia su `bg-background` opaco pasa a transparente para que el canvas respire tras los widgets.
- **Página QA interna** `/qa-dock` (`src/app/(main)/qa-dock/page.tsx`): renderiza el mismo `DashboardLayout` que `/dashboard` sin exigir sesión (el signup del auditor vía REST exige confirmación de email, así que no se creó sesión); marcada "QA interno" y devuelve `notFound()` en producción. `src/app/(main)/__qa-dock/page.tsx` quedó como stub privado (carpetas `_` no rutean en App Router y el entorno no permite borrar archivos del mount).
- **Verificación empírica** (dev server + Playwright headless, capturas en outputs/shots/): `os-dock-360.png` (píldora 6→354 dentro de 360, strip 603/330 con scroll+máscara), `os-dock-390.png` (6→384, bottom 816<844), `os-dock-768.png` (los 12 items completos sin scroll, 603=603), `os-dashboard-materia-390.png` y `os-dashboard-materia-1280.png` (widgets sobre el canvas materia, shell transparente rgba(0,0,0,0), `--primary-hsl` = 42 74% 66%, data-materia="oro-vivo"). Test de regresión con `background.type: "webgl"`: data-materia null, shell opaco de nuevo, primary 276 85% 55% original.
- `npx tsc --noEmit`: **0 errores en los archivos tocados**; quedan 153 errores PREEXISTENTES en archivos no relacionados (drift `distortWidth`/`liquidGlass` en settings antiguos, `src/types/supabase.ts` generado, carpetas demo `theme-antigravity-flux/`, `integraciones-de-codigo/`…). El proyecto ya compila con `ignoreBuildErrors: true` en `next.config`; no se tocaron por riesgo de romper funciones ajenas al encargo.
- Nota de entorno: el sandbox linux/arm64 necesitó `@next/swc-linux-arm64-gnu` (instalado en /tmp y symlinkeado en node_modules) para arrancar `next dev`.

### Adenda 17 — Trinity Móvil: drag táctil con pulsación mantenida + TrinityFab + menús en pantallas chicas (2026-06-11)
- **SOP primero (regla dorada):** sección nueva "Trinity Móvil (v1)" en `architecture/integracion-portal-starseed-os.md` con los 3 bloques, causa raíz, soluciones y verificación empírica completa.
- **Bloque 1 — widgets táctiles (`grid-area.tsx` + `use-touch-drag-arming.ts` + `grid-area-touch.module.css`, archivos nuevos los dos últimos):**
  - **Causa raíz descubierta en runtime (fibers):** react-grid-layout **2.2.2 NO cablea `draggableHandle`** hasta el item — `DraggableCore.props.handle = ""` aunque GridLayout reciba ".drag-handle" → en modo edición CUALQUIER punto del widget arrastraba, y en táctil react-draggable hace `preventDefault()` del touchstart → scroll muerto + widgets moviéndose (el bug reportado).
  - **Solución:** puerta en fase de captura sobre el contenedor del grid que oculta los `touchstart` a DraggableCore (el scroll del navegador queda libre); pulsación mantenida 320 ms sin mover >10 px → arma el widget (vibración 10 ms + elevación scale 1.03 + glow dorado #D4AF37 vía CSS Module), `flushSync` retira el handle y un `TouchEvent` sintético con el Touch vivo entrega el gesto a RGL **sin levantar el dedo**; un `touchmove {passive:false}` global bloquea el scroll solo mientras dura el drag; al soltar, `onDragStop` desarma y el widget asienta con `cubic-bezier(.34,1.56,.64,1)`. Handles ✋/resize exentos (flujo inmediato de siempre); `draggable` HTML5 (transferencia entre paneles) solo con ratón — en táctil era otro secuestrador del gesto. **Ratón/escritorio bit a bit igual** (la puerta solo escucha eventos touch; verificado con Playwright a 1280).
  - Métricas (CDP touch, 390×844, modo edición): swipe → scrollTop 0→32 con transform intacto `translate(18px,18px)`; hold 450 ms → `armed=true` + `react-draggable-dragging=true`, drag en el mismo gesto hasta `translate(148px,128px)` sin scroll, asentamiento al soltar.
- **Bloque 2 — TrinityFab (`layout/trinity-fab.tsx` + `.module.css` nuevos, montado como hermano del dock dentro de `omni-dock.tsx`):** botón flotante cristal líquido 56 px con anillo cónico cardinal (N #007FFF · E #FFBF00 · S #DC143C · O #39FF14) y sigil de 4 gemas; al tocar despliega 4 pétalos-gema en cruz que abren cada menú con el MISMO `usePerimeter().setActiveEdge` de los sensores (cero lógica duplicada, toggle incluido). Draggable con anclaje al borde más cercano (pos persistida `os.trinity.fab.pos`); al abrirse pegado a un borde se desplaza ~64 px al centro para que ningún pétalo caiga fuera. Visibilidad `os.trinity.fab` = auto/on/off (auto = coarse o ≤1024 px; a 1280 fino NO se renderiza — verificado 0 nodos). Nota: `globals.css` fuerza `button{border-radius:var(--radius)!important}` → el módulo usa `9999px !important`. Panel nuevo de Ajustes `settings/trinity/trinity-fab-settings.tsx` + pestaña "Trinity" en `/settings` (sin tocar `appearance/**`): selector Auto/Visible/Oculto con estado en vivo (verificado: Oculto desmonta el FAB al instante).
- **Bloque 3 — menús Trinity en pantallas chicas (`side-curtains.tsx`, `trinity/control-center.tsx`):**
  - **Logic estaba ROTO en móvil:** el wrapper framer-motion con `y:"-50%"` residual era containing block del `fixed inset-0` del ControlCenter → quedaba confinado a una franja de ~2 px fuera de pantalla (a 320: root l=320 r=322, 86 elementos derramados hasta x=577). Fix: el wrapper anima solo `x`, centrado vertical sin transform (inset-0 móvil / top-0 bottom-0 + my-auto md), y el ControlCenter rellena a su padre (`w-full h-full` móvil) conservando exactamente sus tamaños md/lg.
  - Auditoría final (320/360/390/768, rects vs viewport ignorando scrollers horizontales legítimos): **0 desbordes** en Anchor/Logic/Horizon en todos los anchos, `scrollWidth==viewport` siempre; en Zenith solo el div decorativo de rayos `w-[600px]` clipado por `overflow-hidden` (sin efecto visual).
- **Verificación:** `npx tsc --noEmit --incremental` = **153 errores, idéntico al baseline (0 nuevos, ninguno en archivos nuevos)**; el TS2322 de grid-area es preexistente (tipos de RGL v2 sin `isDraggable` en `Responsive`). Capturas en `outputs/shots/`: `os2-touch-scroll.png`, `os2-touch-armed.png`, `os2-fab-cerrado-390.png`, `os2-fab-abierto-390.png`, `os2-fab-zenith-390.png`, `os2-fab-logic-390.png`, `os2-settings-trinity-390.png`, `os2-{zenith,horizon,logic,anchor}-390.png`, `os2-logic-320.png` (peor caso arreglado) y set `os2-*-320.png`.
- **No tocado (límite de propiedad):** `globals.css`, `appearance-context`, `app/layout.tsx`, `settings/appearance/**`, `dashboard/widgets/**`. Ninguna función eliminada (drag ratón, ✋, resize, HTML5 DnD entre paneles, sensores de borde y atajos siguen intactos).

### Adenda 18 — Tema "StarSeed Café" para todo el OS + pulido global (2026-06-11)
- **SOP primero (regla dorada):** sección nueva "Tema StarSeed Café (data-os-theme, v1)" en `architecture/integracion-portal-starseed-os.md` (mecanismo de 3 capas, paletas exactas, tokens de movimiento, invariantes).
- **Sistema de temas descubierto:** (1) next-themes con `attribute="class"` (atmósferas `light/dark/grey/natural/glass/custom` como clases en `<html>` con bloques HSL en `globals.css`); (2) `AppearanceConfig` en `localStorage appearance-config-v2` con `applyStyles()` inyectando vars (glass, radius, fuentes, `data-materia` en body); (3) presets curados (`curated-presets.ts`) que aplican DeepPartial del config. El tema Café se montó como **capa nueva ortogonal**: `themeStore.osTheme?: "default" | "cafe"` (unión aditiva, export `OsThemeId`) → `applyStyles()` pone `data-os-theme="cafe"` en `<html>` → `globals.css` recubre TODAS las vars del design system.
- **Tema café (valores clave):** OSCURO (.dark/.natural/.glass): fondo `130 19% 6%` (#0d130e verde-negro), card `120 16% 9%`, primario oro `42 74% 66%` (#E9C46A), acento lima `97 72% 67%`, secundario terracota, borde oro `44 30% 26%`, body radial #16210f→#070b08. CLARO: fondo pergamino `43 76% 95%` (#fdf7ea), tinta café `27 42% 16%` (#3B2818), primario terracota `15 53% 47%` (#C05C3B), secundario ámbar `37 92% 50%`, acento musgo `104 49% 30%`, borde oro suave `40 42% 72%`, body radial #fdf7ea→#e8dabc. Tipos: titulares **Fraunces** (`--font-headline` en body bajo café), labels **Space Mono** (`--font-code`); radios 14–26px; cristal cálido (liquid-glass-ui/panel/card-glass con verde-oliva + borde oro 35% en dark, crema+oro en claro); botones primary "oro fundido" (degradado vertical + inset highlight); glow hover dorado en dark; scrollbar tintada. Regla extra: bajo café claro, `body[data-materia]` re-afirma terracota (el oro de materia no contrasta sobre crema); en café oscuro coinciden (oro).
- **Tokens de movimiento** en `:root`: `--ease-organic/.22,1,.36,1`, `--ease-glide/.16,1,.3,1`, `--ease-elastic`, `--ease-soft` + `--dur-fast/base/slow` (150/220/300ms); `--dur-base` ahora sincronizada con `animations.transitionDuration` desde `applyStyles`. La regla global de transiciones pasó a `var(--dur-base) var(--ease-glide)` (mismos fallbacks). Bajo café, interactivos usan `--ease-organic` y los Radix open/close `--ease-glide`.
- **Selector:** `src/components/settings/appearance/os-theme-selector.tsx` (nuevo) — "Tema del sistema" con 2 tarjetas (Aurora StarSeed default / StarSeed Café) con mini-preview doble dark+light (ventanita: titular serif, tarjeta, botón primario, chip acento), `aria-pressed`, check activo; montado arriba de la pestaña Galería en `appearance-editor.tsx`. Persistencia: el mismo `updateSection("themeStore",…)` de siempre.
- **Pulido de widgets (sistémico vía kit, API intacta):** `globals.css` define por fin `.custom-scrollbar` (WidgetShell la usaba y NO existía → scrollbars finas en TODOS los widgets) + clase nueva `os-widget-shell` (hover border-primary, `focus-within` con anillo, `font-variant-numeric: tabular-nums` heredado en todo widget, sombra cálida bajo café). `widget-shell.tsx`: clase añadida + título `font-headline`. `primitives.tsx`: `MiniList` con empty state real (icono Lucide `Inbox` configurable `emptyIcon` + mensaje — cascada a ~15 widgets legacy que ya pasaban `empty=`), `StatTile` con hover visible, `Chip` con `whitespace-nowrap` (los badges partían palabras a 390px: "COLECTIV O").
- **Fix transversal real:** `--primary-rgb` se usaba en 5 archivos (`rgba(var(--primary-rgb),…)` en network, hub, culture, glass-card, design-canvas) pero **no estaba definida en ningún sitio** → esas sombras se descartaban en silencio. Definida ahora por tema (:root 160,43,238 · .dark 205,119,248 · .grey 10,167,235 · .natural 58,223,118 · .glass 51,187,255 · café claro 192,92,59 · café oscuro 233,196,106 · y las 3 variantes materia).
- **Páginas:** hub h1 des-hardcodeado (`from-cyan-400 to-purple-400` → `from-primary to-secondary` + sombra `hsl(var(--primary-hsl)/…)`); explorer h1 `from-white` (ilegible en temas claros) → `from-foreground`; agent: SelectTriggers `bg-black/50 border-white/10` → `bg-card/60 border-border/50` + `max-w-[46vw]` (móvil); network `_components/navigation.tsx`: tabs con `whitespace-nowrap shrink-0` + `overflow-x-auto scrollbar-hide` (a 390px partían palabras: "Panoram a"). Resto de secciones heredan vía vars (verificado en captura).
- **Verificación:** `npx tsc --noEmit --incremental` = **153 errores, idéntico al baseline (0 nuevos)**, ninguno en archivos tocados. Playwright (dev server 9002, capturas en `outputs/shots/`): `os3-tema-cafe-dashboard-1280.png` y `-390.png` (café oscuro: widgets verde-negro+oro, serif, sin overflow), `os3-tema-cafe-light-390.png` (tarjetas pergamino + terracota; nota: el canvas Materia sigue siendo oscuro detrás — comportamiento previo de materia en temas claros), `os3-settings-selector-390.png` (selector con tarjeta Café activa, aria-pressed true), `os3-network-390.png` (café + tabs scrollables, scrollWidth 390=390). Prueba DOM en vivo: alternando el atributo, `--primary-hsl` 280 90% 72% ↔ **42 74% 66%**, `--background-hsl` 258 45% 5% ↔ **130 19% 6%**, body gradient Nebula ↔ verde-negro, `--font-headline` Space Grotesk ↔ **Fraunces**.
- **No tocado (límite de propiedad):** `src/components/layout/**`, dashboard layout/grid drag, TrinityFab. Nada eliminado en ningún archivo; cambios aditivos.

### Adenda 19 — Trinity Móvil v2: pulsación 3s configurable + acceso por bordes + sync de cuenta (2026-06-13)
- **Petición de Alex:** (a) integrar el nuevo diseño como tema en Ajustes — ya estaba (tema "StarSeed Café" + Materia Viva, Adendas 14/18; confirmado, no se rehace); (b) en táctil los widgets deben moverse solo tras mantener pulsado **3 s**; (c) los menús Trinity deben abrirse con **botón lateral largo no intrusivo configurable en cada borde** y **deslizando desde cada orilla**, todo ajustable; (d) mejorar integración con cuentas/perfiles compartidos. SOP primero: nuevas secciones "Trinity Móvil · Bloque 4" y "Sincronización de preferencias" en `integracion-portal-starseed-os.md`.
- **Config aditiva** (`context/appearance-context.tsx`): `trinity.touch{holdMs:3000, haptics:true}` y `trinity.edgeAccess{mode:auto, edges{4×{handle,swipe}}, handleLength:28%, handleThickness:5px, handleOpacity:0.22, swipeThreshold:56px}`, ambos opcionales → deepMerge mantiene válidas las configs guardadas.
- **Pulsación configurable:** `use-touch-drag-arming.ts` ahora `useTouchDragArming(enabled,{holdMs,haptics})` con refs vivas; `grid-area.tsx` lee `config.trinity.touch` (import `useAppearance` añadido). Default 3000 ms; ajustable 300–4000. Resto del Bloque 1 intacto.
- **Acceso por bordes (NUEVO):** `components/layout/trinity-edge-access.tsx` + `.module.css`, montado en `app/layout.tsx` bajo `PerimeterProvider`. Asas-píldora por orilla (color cardinal, opacidad baja en reposo, tap = toggle) + deslizar desde los 24px del borde superado `swipeThreshold` (con guarda anti-scroll-paralelo y destello de confirmación). Mismo `setActiveEdge` que sensores/FAB; solo eventos touch; `mode auto` = coarse/≤1024px. z-index 84.
- **Ajustes ampliados:** `components/settings/trinity/trinity-edge-settings.tsx` añadido a la pestaña Trinity de `/settings` (junto al panel del FAB): slider pulsación + háptica, modo global, asa/deslizar por orilla, longitud/grosor/opacidad/sensibilidad. Usa `updateConfig` (deepMerge anidado).
- **Sync de cuenta StarSeed (NUEVO):** `lib/settings-sync.ts` (push/pull de `SYNCED_KEYS` a Supabase `user_settings`, opt-in, tolerante a falta de sesión/tabla) + panel `components/settings/account/account-sync-panel.tsx` en Ajustes → Perfil. Migración SQL documentada en el SOP (tabla + RLS por usuario). localStorage sigue siendo fuente de verdad offline.
- **OmniDock pantallas chicas:** ya resuelto por el strip `.omni-dock-strip` (scroll-snap + máscara + safe-area, Adenda 16); ahora abrir Anchor en táctil es trivial vía asa/deslizar inferior + FAB. Sin cambios extra.
- **⚠️ Verificación PENDIENTE:** el sandbox Linux no arrancó (disco lleno en el Mac) → no se pudo correr `tsc`/dev/Playwright esta sesión. Revisado por lectura (tipos, imports, providers, deepMerge). Ejecutar `npx tsc --noEmit` y `npm run dev` antes de desplegar. Nada eliminado; todo aditivo y desactivable.

### Adenda 20 — Deploy del OS desbloqueado + rediseño de widgets con interconexión (2026-06-13, tarde)
- **CAUSA REAL de "el OS nunca cambia" (resuelta):** el proyecto Vercel `starseed-os` (equipo `starseeds-projects`, token `vcp_237Kww…`) desplegaba desde **`StarSeedSystem/starseed-os`** (congelado marzo 2026), mientras el desarrollo vivo está en **`StarSeedSystem/starseed-system`** (este repo, `main`). Además el `next build` **fallaba** por `useSearchParams()` sin `<Suspense>` en `/agent` y `/ai-setup`.
- **Fixes de build:** `<Suspense>` en `/agent` y `/ai-setup` (+ `force-dynamic`); `/library` ya lo tenía. Deploy quedó READY.
- **Reconexión:** el proyecto Vercel `starseed-os` se **reapuntó a `StarSeedSystem/starseed-system` (branch main)** vía API (unlink DELETE v1 + link v9) → auto-deploy por push ya funciona. Disparo manual: `POST /v13/deployments` con `gitSource.repoId=1138672501`, `target=production`.
- **WidgetShell (kit):** hairline de acento, sigilo StarSeed de fondo, glow en hover (sin transform, no interfiere con drag), y nuevo prop `connections` (chips "✦ Conecta" en footer, solo no-micro) + prop `sigil`.
- **Interconexión cableada en 9 widgets:** Cartera (Fundación/Café/Mercado), Gobernanza (Comunidades/Cultura/Educación), Nexus IA (Ecosistema IA/Gráfica Viva/Biblioteca), Mis Páginas, Explorar Red, Cultura, Aprendizaje, Pulso Económico, Mensajes.
- **Responsividad:** `globals.css` `.os-widget-shell` con glow hover + `prefers-reduced-motion`; `grid-area` con padding fluido `clamp()` + `pb` con safe-area/holgura de dock (320px→ultrawide).
- **Verificación:** `tsc --noEmit` = 153 (baseline exacto, 0 nuevos; el TS2322 de grid-area es el preexistente de react-grid-layout). Deploys READY: `534c503` (fix build) → `a922889` (WidgetShell) → `dc9777d` (interconexión+responsive).
- **Pendiente ideal:** rediseño individual por widget/área a mayor profundidad; rotar el GITHUB_TOKEN compartido en chat.

### Adenda 21 — Modo de diseño por widget + rediseño de 11 widgets + Figma poblado (2026-06-13, noche · multi-agente)
- **Botón del bot de IA eliminado** (`AiOverlay` desmontado de `(app)/layout.tsx`; la IA vive en el Exocórtex de Trinity/Zenith).
- **WidgetShell**: nueva acción **Ampliar** (`expandHref`/`onExpand` → ventana/pestaña) y **modo de diseño** `designMode "theme"|"original"` (prop por widget + global `config.widgets.designMode`). "original" = cristal líquido teñido con el acento del widget (identidad propia, independiente del tema). Autoguardado en dashboard (localStorage) + perfil (settings-sync). Control en Ajustes→Apariencia (`widgets-design-settings.tsx`).
- **Rediseño profesional de 11 widgets** (multi-agente, lotes disjuntos): system-status, notifications, recent-activity, active-projects, social-radar, mental-coherence, learning-path, collab-projects, relevant-posts, live-data, calculator. Mejoras: info más clara/jerárquica, iconos/colores con significado, `connections` (interconexión), `expandHref`, teclado en calculadora, responsividad (clamp/min-w-0/flex-wrap).
- **Figma**: 5 proyectos creados y **poblados** vía `use_figma` (funcionó pese a asiento "View"): Maestro con board "Design Tokens" (paletas 3 temas + tipografía + Trinity + cristal líquido), y portadas + demo WidgetShell en OS UI Kit, Nexus, Café, Audiomorphic. Spec: `architecture/design-system-figma.md`. Keys en memoria.
- **Verificación**: `tsc --noEmit` = 153 (baseline, 0 nuevos) en cada paso. Deploys READY encadenados: `29024f9`→`44b3ea3`→`18835b5`→`082047f`. Auto-deploy ya reconectado (proyecto Vercel starseed-os → repo starseed-system/main).
- **Pendiente profundo**: poblar más frames Figma (dashboard responsive, kit de estados, assets Café/Audiomorphic); reestructurar el resto de widgets (gen2–gen5) con servicios en tiempo real; override de designMode por instancia desde el panel de cada widget.
