# 🧾 LOGS — Bitácora del Sistema StarSeed (logs.md)

> Registro cronológico de eventos del sistema: despliegues, decisiones, incidencias
> y sincronización de memorias. Formato: `[fecha] (área) evento`.

## 2026-06-29
- (infra) Liberados ~12 GB en el Mac (modelos Ollama + cachés npm/brew/Xcode). Sin tocar Documentos / Google / Chrome.
- (repo) El repo OS local estaba **382 commits atrás** de `origin/main` → sincronizado a `db9217d` (evitó revertir una semana de trabajo). 0 commits locales perdidos.
- (memoria) Creado el **Sistema de Memoria StarSeed** (taxonomía MD + `memory.manifest.json`) en `memory/` + espejo en Google Drive (*Sistema de Memoria StarSeed*).
- (memoria) Definida la sincronización a **cerebros/baúles** (`architecture/memoria-cerebros-sync.md`). ⚠️ NO conectado a la cuenta StarSeed (prueba futura con la cuenta *Ester*).
- (OS) En curso: #85 perfil duplicado · #86 botón "Decisiones"→Hub de Conexiones · #87 dock "AI Studio"→"Astraura AI".

## Despliegues (histórico reciente)
- **Café/Nexus:** v88 · v90 · v91 (ver `past_task.md`).
- **OS (`starseed-system`):** … → Adenda 47 (WebXR) → … → `db9217d` (navegador full-window, home configurable, modo de red).

## 2026-06-29 (continuación · Memory Root)
- (memoria) Reestructurado a **memory root + ramas**: `starseed_memory_root/` → `soul/ ego/ skills/ style/ memory/ dream/ accounts/ tasks/ logs/` + `index.md` + `sync.md` + `memory.manifest.json`.
- (memoria) **Drive:** espejo en `My Drive/StarSeed_Memory_Root` vía mount (auto-sync). **Escritorio:** enlace `~/Desktop/StarSeed_Memory_Root`.
- (memoria) Destinos de vínculo definidos: 🧠 cerebros · 🖥️ servidores internos/StarSeed/externos · ☁️ VMs en línea · 🔌 servicios/plugins/conexiones (servidor+almacén). ⚠️ Sin conectar a cuenta (prueba futura: *Ester*).
- (pendiente) Telegram digest (🧠 Exocórtex & IA, `-1004444519617`) requiere **token del bot**.

## 2026-06-29 (OS #85/#86/#87 + hallazgo de deploy)
- (os) **#85** perfil unificado: `UserNav` real con chip (avatar + @handle) + dropdown/logout; `AccountChip` retirado del header (+ fix de referencia rota). **#86** dock `Decisiones` → `enabled:false`. **#87** `AI Studio`→`Astraura AI` (18 archivos; `google.ts` excluido por ser referencia a *Google* AI Studio). Commits `c117a1a` + `71b97c4` en `main`; verificado en `origin`.
- (deploy) ⚠️ El proyecto Vercel **`starseed-os`** (repo `starseed-system`) **NO auto-despliega desde `4740637a`**: ni la serie *navegador* ni estos commits llegaron a producción. El backend **`starseed-neurocortex`** sí despliega. Acción pendiente: reconectar la integración Git o re-disparar el deploy del OS.
