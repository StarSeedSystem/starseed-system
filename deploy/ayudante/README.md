# Ayudante privilegiado StarSeed OS (TRM1125C)

El **ayudante con privilegios** es un componente instalado una sola vez en cada aparato que permite a la dirección y a MetaGenesis administrar la neurona con órdenes tipadas y guardas, sin que las contraseñas viajen nunca. Existe en **Linux** (script `starseed-ayudante` + regla `sudoers`) y **macOS** (LaunchDaemon vía `SMAppService`).

> **Contratos base:** `architecture/terminal-entre-neuronas.md` · `architecture/control-remoto-entre-neuronas.md` · `architecture/permisos-y-control-del-dispositivo.md`
>
> **Regla de oro:** el permiso está **apagado por defecto** y lo enciende el dueño **en ese aparato**. Un voto de comunidad nunca lo enciende en un aparato personal.

---

## Arquitectura de dos niveles

| Nivel | Qué permite | Cómo se activa |
|-------|-------------|----------------|
| **usuario** | Terminal de la cuenta, sin privilegios | Interruptor local «Terminal» (fase 1 control remoto) |
| **administrador** | Órdenes tipadas con `sudo`/`root` (almacenes, servicios, actualizar, registros, reiniciar app, **modo completo**) | El dueño instala el ayudante **una vez** con autorización del sistema; luego lo enciende en el aparato |

**Modo completo** (terminal `root` sin límites): existe pero **solo** lo activa el dueño en ese aparato, con **aviso visible**, **caducidad** (1 min – 24 h) y **registro encadenado** de cada orden.

---

## Órdenes tipadas (contrato único, mismo vocabulario en Linux y macOS)

| Categoría | Órdenes | Guardia principal |
|-----------|---------|-------------------|
| **almacenes** | `estado`, `salud`, `formatear --serie`, `montar`, `desmontar`, `verificar` | `formatear` solo series autorizadas; raíz requerida |
| **servicios** | `lista`, `estado <nombre>`, `iniciar|parar|reiniciar <nombre>` | Solo servicios `starseed-*` / `com.starseed.*`; raíz para mutar |
| **actualizar** | `estado`, `buscar`, `aplicar` | `aplicar` solo si hay actualización descargada; raíz |
| **registros** | `leer [--lineas N] [--servicio NOMBRE]` | Solo lectura; filtra journal o log del ayudante |
| **reiniciar** | `app` | Reinicia `starseed-app` / `app.starseed.os`; raíz |
| **modo-completo** | `activar --caducidad-min N`, `desactivar`, `estado` | Caducidad 1–1440 min; registro encadenado; aviso visible; raíz |
| **estado** | (sin suborden) | Resumen JSON: modo completo, almacenes, servicios |

> **Anti-repetición:** misma orden con mismos argumentos en < 2 s se rechaza.
>
> **Registro encadenado:** cada ejecución escribe JSON Lines con hash SHA-256 del previo (inalterable).
>
> **Órdenes selladas:** viajan firmadas por aparato (ECDSA P-256), con `seq` monótono, nonce y caducidad (15 min). Replay = 409.

---

## Linux (`deploy/ayudante/linux/`)

### Componentes

| Archivo | Qué es |
|---------|--------|
| `starseed-ayudante` | Script principal (bash, 542 líneas) instalado en `/usr/local/sbin/starseed-ayudante` |
| `instalar.sh` | Instalador (root) que copia el ayudante, crea dirs, valida y mueve regla `sudoers` con `visudo -c` |
| `test_ayudante.py` | Suite pytest: sintaxis (`bash -n`), guardas, modo completo, instalador |

### Instalación (una sola vez, root)

```bash
sudo ./deploy/ayudante/linux/instalar.sh
```

El instalador:
1. Verifica `bash -n` en ayudante e instalador
2. Crea `/var/log/starseed-ayudante` (750, root:adm), `/etc/starseed` (750), `/run/starseed-ayudante`, `/var/lib/starseed`
3. Crea `/etc/starseed/almacenes-autorizados.json` (lista de series vacía, editar para autorizar discos)
4. Copia ayudante a `/usr/local/sbin/starseed-ayudante` (750, root:root)
5. Genera regla `sudoers` **limitada** en `/etc/sudoers.d/starseed-ayudante` (solo órdenes listadas, `NOPASSWD` para grupo `starseed`)
6. Valida con `visudo -c` antes de mover
7. Crea grupo `starseed` si no existe

### Uso tras instalar

```bash
# Añadir usuario al grupo (una vez)
sudo usermod -a -G starseed $USER
# Cerrar sesión y volver a entrar

# Probar
starseed-ayudante --help
starseed-ayudante estado
sudo starseed-ayudante almacenes estado
```

### Series autorizadas para formatear

Editar `/etc/starseed/almacenes-autorizados.json`:

```json
{
  "series": ["ABC123", "XYZ789"],
  "nota": "Añada aquí los números de serie de los discos autorizados para formatear."
}
```

---

## macOS (`deploy/ayudante/macos/`)

### Componentes

| Archivo | Qué es |
|---------|--------|
| `README.md` | Este documento técnico (ver `deploy/ayudante/macos/README.md`) |
| `ayudante` (binario Rust) | Compilado como crate aparte, firmado y notarizado con la app |
| `com.starseed.ayudante.plist` | LaunchDaemon instalado en `/Library/LaunchDaemons/` |

### Registro (una sola vez, con autorización de administrador)

1. La web invoca `ayudante_registrar` (comando Tauri)
2. Rust escribe plist temporal → `launchctl bootstrap system <plist>`
3. **macOS pide contraseña de administrador** en diálogo nativo
4. Si se autoriza, LaunchDaemon queda instalado y persiste entre reinicios
5. Estado `registrado: true` disponible vía `ayudante_estado`

### Desregistro

`ayudante_desregistrar` → `launchctl bootout system com.starseed.ayudante` (siempre permitido, sin diálogo extra).

### Requisitos previos

- macOS 13 (Ventura) o posterior (`SMAppService`)
- StarSeed OS (no Nexus ni Café)
- Ventana principal (`main`)
- Origen permitido: `https://starseed-os.vercel.app` y `http://127.0.0.1:47610…47619`
- **«Acceso al equipo» concedido** en este Mac (diálogo nativo, aviso en barra de menús)
- Ayudante registrado (paso anterior)

### Series autorizadas

Viven en `<carpeta config app>/ayudante-series-autorizadas.json` (array JSON de strings). **Nunca se edita a mano en producción:** se incluye firmado en el CI (`native-build.yml`, job `firmar-y-empaquetar`).

### Registro encadenado

`~/Library/Logs/app.starseed.os/ayudante.log` — JSON Lines con `ant` (hash anterior) y `h` (hash actual). `ayudante_estado.registro_integro` detecta manipulación.

---

## Seguridad (ambas plataformas)

- **Contraseñas nunca viajan**: nivel administrador = `sudo` limitado / LaunchDaemon root, no `sudo` interactivo.
- **Lista blanca cerrada**: solo las órdenes de la tabla de arriba. Nada de shell arbitrario salvo `terminal_administrador` / `modo-completo` (auditado).
- **Guardia dura en formateo**: serie debe estar en lista autorizada/firmada. Serie no autorizada **nunca** se formatea.
- **Servicios solo propios**: `starseed-*` (Linux) / `com.starseed.*` (macOS). No se toca `systemd` / `com.apple.*` ajeno.
- **Aviso visible**: Linux → log visible + grupo `starseed`; macOS → icono «Acceso al equipo» en barra de menús. Sin aviso, órdenes se niegan.
- **Aparato bloqueado**: con pantalla bloqueada no se acepta ninguna orden.
- **Registro inmutable**: cadena SHA-256. Cualquier manipulación se detecta.
- **Órdenes selladas**: firma ECDSA por aparato, `seq` monótono, nonce, caducidad 15 min. Replay = 409.

---

## Flujo típico desde Genesis / Control remoto

1. Persona quiere acción privilegiada en neurona remota (ej. formatear disco).
2. Genesis muestra botón **solo si**:
   - Ayudante instalado/registrado en destino
   - Serie en lista autorizada (si aplica)
   - Permiso «administrador» encendido en ese aparato
3. Persona pulsa → Genesis firma orden con args (`{ serie: "ABC123" }`)
4. Orden viaja por malla (P2P o relé sellado) a neurona destino
5. Página destino invoca ayudante (Linux: `sudo starseed-ayudante ...`; macOS: `ayudante_ejecutar`)
6. Ayudante valida: instalado/registrado + serie/servicio permitido + origen + ventana main + anti-repetición
7. Si `requiere_confirmacion` (modo completo, formatear, reiniciar app): **diálogo nativo** en el aparato antes de firmar
8. Ayudante ejecuta (root / LaunchDaemon)
9. Resultado vuelve firmado → Genesis muestra → registro encadenado en destino

---

## Pruebas

### Linux

```bash
# Sintaxis
bash -n deploy/ayudante/linux/starseed-ayudante
bash -n deploy/ayudante/linux/instalar.sh

# Suite completa (sin root, usa ayudante en PATH o ./starseed-ayudante)
cd deploy/ayudante/linux
python3 -m pytest test_ayudante.py -v
```

### macOS

```bash
# Solo lógica pura (cualquier SO)
cargo test --lib ayudante_macos_logica

# Con Tauri (solo macOS)
cargo test --lib ayudante_macos
```

---

## Integración en paquetes nativos (regla del contrato)

| Plataforma | Cómo se incluye |
|------------|-----------------|
| **Linux .deb / .rpm** | `postinst` ejecuta `instalar.sh` con regla `sudoers` limitada |
| **Linux AppImage** | Primera activación → `pkexec` para autorización del sistema |
| **macOS** | Helper `com.starseed.ayudante` empaquetado en `Contents/Library/LaunchServices/`, firmado y notarizado con la app; `SMAppService` lo registra la primera vez |
| **Windows** | Servicio de sistema (MSI/NSIS) con ventana UAC |
| **Android** | Sin root: solo terminal de la app; órdenes tipadas que el marco permite (almacenes por Storage Access Framework, ajustes con su pantalla) |

> **Instalarlo no lo enciende**: el permiso de terminal y de administración sigue encendiéndose en cada aparato por su dueño. Las órdenes tipadas son las mismas en todos los sistemas (un solo contrato), y cada una dice si en ese sistema existe o no.

---

## Referencias rápidas

| Documento | Qué cubre |
|-----------|-----------|
| `architecture/terminal-entre-neuronas.md` | Contrato TRM1125C: petición de Maggasukha, niveles, modo completo, Maggabox |
| `architecture/control-remoto-entre-neuronas.md` | CRN1114: seguridad (§1), canal único (§2), niveles (§2.3), terminal/archivos (§4), fases (§8) |
| `deploy/ayudante/linux/starseed-ayudante` | Implementación Linux (bash) |
| `deploy/ayudante/linux/instalar.sh` | Instalador Linux con `visudo -c` |
| `deploy/ayudante/linux/test_ayudante.py` | Pruebas Linux (pytest) |
| `deploy/ayudante/macos/README.md` | Documentación técnica macOS (LaunchDaemon, Tauri commands) |
| `src/lib/control-remoto/sellado.ts` | Firma y verificación de órdenes |
| `src/lib/control-remoto/orden.ts` | Tipos de orden, vocabulario, validación |
| `src/lib/control-remoto/niveles.ts` | Niveles y validación de argumentos |

---

## Glosario

- **Neurona**: un aparato (dispositivo) que corre StarSeed OS; cada forma de abrir el OS en él es un medio (`capabilities.medios`).
- **Malla**: red P2P entre neuronas de la misma cuenta (WebRTC, TCP nativo, Bluetooth, LoRa, relé).
- **Relé sellado**: `CanalSellado` (MPT1108B) cifra extremo a extremo; el operador transporta, no lee ni forja.
- **Orden sellada**: firma ECDSA por aparato + `seq` + nonce + caducidad; vocabulario cerrado.
- **Modo completo**: terminal `root` sin límites, activada por el dueño en el aparato, con caducidad y registro encadenado.
- **Anti-repetición**: rechaza misma orden con mismos args en < 2 s.
- **Registro encadenado**: JSON Lines con hash SHA-256 del previo (inalterable).