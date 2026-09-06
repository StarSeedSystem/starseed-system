# 🚀 Despliegue del Sistema StarSeed

Este archivo contiene los pasos y la configuración para el despliegue automático del Sistema StarSeed en línea. 

## 🔗 Enlace Generado y Nombre del Sistema

He seleccionado el siguiente nombre sugerido para el enlace, ya que se acerca más a "Starseed System" y está disponible en Vercel (que es gratuito para proyectos frontend y Next.js):

- **Nombre del Proyecto:** `starseed-nexus` o `starseed-system-app`
- **Enlace Final de Producción (una vez desplegado):** `https://starseed-os.vercel.app` (o el nombre que elijamos en el paso 1).

## ⚡ Cómo Activar el Despliegue Automático (1 Clic)

Dado que he configurado el repositorio en GitHub, el despliegue en Vercel será 100% automático. Cada vez que enviemos código a GitHub, tu enlace en línea se actualizará solo.

Para conectar esto por primera vez, simplemente haz clic en el siguiente botón. Esto te pedirá iniciar sesión en Vercel (puedes usar tu cuenta de GitHub de forma gratuita) e importará este proyecto:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FStarSeedSystem%2Fstarseed-system&project-name=starseed-nexus&repository-name=starseed-nexus)

---

## 🛠️ Pasos de Despliegue Automático (Si no usas el botón)

1. Ve a [Vercel](https://vercel.com/new).
2. Inicia sesión con tu cuenta de GitHub (`StarSeedSystem` o `alexbordongarrigos`).
3. Importa el repositorio `StarSeedSystem/starseed-system`.
4. En **Project Name**, escribe `starseed-nexus` (o `starseed-system` si está disponible).
5. Deja la configuración por defecto (Vercel detectará automáticamente que es un proyecto **Next.js**).
6. Haz clic en **Deploy**. 

En menos de 2 minutos el sistema estará en línea y accesible desde cualquier dispositivo móvil o de escritorio.

## 🗃️ Datos Actualizables

Para facilitar la actualización de la información en toda la app sin tener que tocar código profundo, he creado el archivo `starseed.config.json` en la raíz del proyecto. Este archivo contiene los "datos actualizables" generales (nombre, versión, tema por defecto). 

*Nota: Todavía no hemos integrado la base de datos de perfiles ni Supabase (como solicitaste), esta es solo la versión de la interfaz autónoma.*

---

## 🍃 Modo ligero en la Mac (voz y 1.58)

Para probar la **voz neuronal (OmniVoice)** y el backend **Astraura 1.58** en la Mac de 8 GB, el servidor de desarrollo (`next dev`, 3-5 GB de RAM) no deja aire: el tts-server no responde y VibeASR corre a RTF 13. El modo ligero sirve el OS **compilado en producción** (`next build` + `next start`), que consume una fracción de esa memoria. Todo lo gestiona `scripts/starseed-ligero.sh` (sin sudo):

```bash
scripts/starseed-ligero.sh construir   # compila producción (para el dev server antes)
scripts/starseed-ligero.sh arrancar    # sirve en http://localhost:9002 (construye si falta)
scripts/starseed-ligero.sh estado      # pid, MB, build y si main trae commits más nuevos
scripts/starseed-ligero.sh parar       # detiene el modo ligero
scripts/starseed-ligero.sh dev         # vuelve al modo desarrollo con recarga en vivo
```

Las rutas de servidor (`/api/mando/*`, `/api/voz-local/*`, `/api/ai/*`) funcionan **igual** en producción local: el daemon de voz (127.0.0.1:4500) y el 1.58 se hablan con el OS igual que en desarrollo. Además, el arranque con `starseed-ligero.sh` exporta `STARSEED_MANDO=1` y `STARSEED_LOCAL=1`, así que el **Puente de Mando y la voz funcionan sin sesión en localhost** (la sesión solo se exige en el despliegue público; en Vercel nunca se abre la puerta). Úsalo solo para probar voz/modelos; para desarrollar con cambios en vivo, vuelve con `dev`.
