# 🔄 SYNC — Sincronización & Vínculos del Memory Root (sync.md)

> Cómo este **memory root** (`starseed_memory_root/`) se sincroniza y se **vincula** a destinos.

## 1. Estructura: raíz + ramas
- Un **memory root** = carpeta `<nombre>_memory_root/` con **ramas** (subcarpetas) por tipo:
  `soul/ · ego/ · skills/ · style/ · memory/ · dream/ · accounts/ · tasks/ · logs/`
  + `index.md`, `sync.md`, `memory.manifest.json`.
- Cada rama contiene una o varias memorias (`.md`). Pueden existir **varios memory roots**
  (por usuario, cerebro o proyecto) — el nombre lo elige el usuario (`<nombre>_memory_root`).

## 2. Destinos de vínculo / compartición
Este root puede **compartirse y vincularse** como almacén de memoria a:
- 🧠 **Cerebros** (Aurora/Astraura o propios del usuario).
- 🖥️ **Servidores internos** del usuario · **servidores StarSeed** · **servidores externos**.
- ☁️ **Computadoras virtuales en línea** (cualquier servicio).
- 🔌 Cualquier **servicio / plugin / conexión** integrable que actúe como **servidor y almacén**
  de estas memorias y de su funcionamiento, configuraciones, opciones y sincronizaciones.

## 3. Superficies de sincronización (activas hoy)
**Local** (`starseed_memory_root/`) ↔ **Google Drive** (*Sistema de Memoria StarSeed*)
↔ **Escritorio** (enlace) ↔ **Telegram** (🧠 Exocórtex & IA; requiere token del bot).

## 4. Sincronización a detalle (por memoria)
- `memory.manifest.json` enumera cada memoria (rama + archivo + tipo + scope + hash).
- Al vincular a un cerebro/servidor/VM, StarSeed integra/actualiza **memoria por memoria**,
  respetando `scope` y deduplicando por `hash`.

## 5. Estado de conexión
- ⚠️ **NO conectar a la cuenta StarSeed ahora.** Prueba futura con la cuenta **Ester**
  ("conecta esta carpeta de memorias").
- Punto de integración en el OS: `../architecture/memoria-cerebros-sync.md`.
