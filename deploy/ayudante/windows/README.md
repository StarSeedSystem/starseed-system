# Ayudante Privilegiado Windows — StarSeed OS

## Resumen

El **Ayudante Privilegiado de Windows** (`StarSeedAyudante`) es un servicio de Windows que se instala con el instalador NSIS (modo `perMachine`, requiere UAC). Proporciona órdenes tipadas con privilegios de administrador para:

- **Almacenes**: listar discos (`Get-Disk`), volúmenes (`Get-Volume`), salud SMART, formatear (`Format-Volume`), montar/desmontar, verificar (`Repair-Volume`).
- **Servicios StarSeed**: iniciar, parar, reiniciar, listar (solo servicios `StarSeed*`).
- **App**: actualizar, reiniciar, leer logs (`Get-WinEvent`).
- **Terminal Administrador**: ejecutar comandos PowerShell arbitrarios con auditoría completa.

> **Contrato**: `architecture/terminal-entre-neuronas.md`, `architecture/control-remoto-entre-neuronas.md`, `architecture/permisos-y-control-del-dispositivo.md §4`.

---

## Instalación

### Vía Instalador NSIS (Recomendado)

El instalador de StarSeed OS (`installMode: perMachine`) ya incluye el hook `windows/hooks.nsh` que:

1. **Copia** `ayudante.exe` al directorio de instalación (`$INSTDIR\ayudante.exe`).
2. **Ejecuta** `sc.exe create` con UAC (elevación automática por `perMachine`).
3. **Configura** recuperación automática (reinicio en fallo cada 60s).
4. **Inicia** el servicio automáticamente.

La persona ve la ventana de UAC de Windows una sola vez durante la instalación.

### Instalación Manual (Desarrollo)

```powershell
# Requiere PowerShell como Administrador
sc.exe create StarSeedAyudante binPath= "C:\ruta\a\ayudante.exe" DisplayName= "StarSeed Ayudante" start= auto
sc.exe failure StarSeedAyudante reset= 86400 actions= restart/60000/restart/60000/restart/60000
sc.exe start StarSeedAyudante
```

### Desde la App (Comando Tauri)

```typescript
// La persona pulsa "Instalar ayudante" en Ajustes → Esta neurona → Ayudante privilegiado
await invoke('ayudante_instalar');
// Muestra UAC nativo → instala servicio → devuelve estado
```

---

## Desinstalación

### Vía Instalador NSIS

Al desinstalar StarSeed OS, el hook `un.onUninstSuccess` ejecuta `StarSeed_UninstallService` que detiene y elimina el servicio.

### Manual

```powershell
sc.exe stop StarSeedAyudante
sc.exe delete StarSeedAyudante
```

### Desde la App

```typescript
await invoke('ayudante_desinstalar');
```

---

## Órdenes Tipadas (Contrato Único)

Todas las órdenes requieren que el servicio esté **instalado y corriendo**. Se invocan vía `ayudante_ejecutar` con la orden firmada (canal sellado, anti-repetición, topes de ritmo).

| Orden | Argumentos | Confirmación | Descripción |
|-------|------------|--------------|-------------|
| `almacenes_estado` | — | No | `Get-Disk` + `Get-Volume` (JSON) |
| `almacen_salud` | `serie` | No | SMART, temperatura, ciclos (`Get-PhysicalDisk` + `Get-StorageReliabilityCounter`) |
| `almacen_formatear` | `serie`, `formato` (NTFS/ReFS/exFAT/FAT32), `nombre` | **Sí** | `Format-Volume` **SOLO si la serie está autorizada** |
| `almacen_montar` | `serie` | No | Asigna letra de unidad libre (`Set-Partition`) |
| `almacen_desmontar` | `serie` | No | Quita letra de unidad (`Remove-PartitionAccessPath`) |
| `almacen_verificar` | `serie` | No | `Repair-Volume` (chkdsk) |
| `servicios_estado` | — | No | `Get-Service StarSeed*` |
| `servicio_iniciar` | `servicio` (StarSeed*) | No | `Start-Service` |
| `servicio_parar` | `servicio` (StarSeed*) | No | `Stop-Service -Force` |
| `servicio_reiniciar` | `servicio` (StarSeed*) | No | Parar + iniciar |
| `actualizar_app` | — | **Sí** | Gestionado por Tauri Updater |
| `logs_leer` | `filtro?` (XPath), `lineas?` (máx 5000) | No | `Get-WinEvent` |
| `reiniciar_app` | — | **Sí** | `Start-Process` la app |
| `terminal_administrador` | `orden` (máx 8000 chars) | **Sí** | PowerShell elevado (auditado completo) |

---

## Guardas de Seguridad (Lógica Pura)

Implementadas en `ayudante_windows_logica.rs::decidir_orden`:

1. **Servicio instalado**: Todas las órdenes fallan si `AYUDANTE_INSTALADO == false`.
2. **Formateo autorizado**: `almacen_formatear` **SOLO** si la `serie` está en `ayudante-series-autorizadas.json` (config firmada).
3. **Servicios StarSeed only**: `servicio_*` rechazan nombres que no empiecen por `StarSeed`.
4. **Terminal admin**: Longitud máx 8000 chars, siempre confirmación.
5. **Confirmación obligatoria**: `almacen_formatear`, `terminal_administrador`, `actualizar_app`, `reiniciar_app` requieren confirmación nativa previa (orden firmada).

---

## Registro Encadenado (Solo-Añadir)

Cada ejecución escribe en `%LOCALAPPDATA%\StarSeed OS\Logs\ayudante.log` (y `enlaces.log`):

```
<timestamp-ISO> <hash-anterior> <evento> <origen> <detalle>
```

Eventos: `instalacion-pedida`, `instalado`, `instalacion-fallida`, `desinstalacion-pedida`, `desinstalado`, `ejecutada`, `rechazada`, `a-confirmar`, `terminada`.

El hash encadena líneas (SHA-256): manipulación se detecta.

---

## Configuración

### Series Autorizadas para Formatear

Archivo: `%APPDATA%\StarSeed OS\Config\ayudante-series-autorizadas.json`

```json
["SERIAL_DISCO_1", "SERIAL_DISCO_2"]
```

> **Por defecto lista vacía**: nadie puede formatear hasta que la persona configure las series permitidas.

### Límites de Ejecución

| Límite | Valor | Configurable |
|--------|-------|--------------|
| Tiempo máx por orden | 60 s | `tiempo_max_ms` en orden |
| Salida máx | 500 KB | `salida_max_bytes` en `LimitesAyudante` |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    StarSeed OS (Web)                        │
│  invoke('ayudante_ejecutar', { orden, args })               │
└──────────────────────────┬──────────────────────────────────┘
                           │ Tauri IPC (orden firmada)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Rust (ayudante_windows.rs)                     │
│  • Verifica origen (main window, StarSeed OS)               │
│  • decide_orden() → guardas puras                           │
│  • Anota registro encadenado                                │
│  • Ejecuta PowerShell vía Command::new("powershell")        │
└──────────────────────────┬──────────────────────────────────┘
                           │ Proceso hijo (contexto SYSTEM del servicio)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Servicio Windows: StarSeedAyudante                │
│  • Corre como LOCAL SYSTEM (privilegios completos)          │
│  • Ejecuta: Get-Disk, Format-Volume, sc.exe, etc.           │
│  • Logs en Event Viewer → Applications and Services Logs    │
└─────────────────────────────────────────────────────────────┘
```

---

## Compilación del Ayudante (`ayudante.exe`)

El binario `ayudante.exe` es un **ejecutable Rust independiente** que implementa el servicio Windows.

### Cargo.toml (en `native/src-tauri/ayudante/`)

```toml
[package]
name = "starseed-ayudante"
version = "0.5.0"
edition = "2021"

[[bin]]
name = "ayudante"
path = "src/main.rs"

[dependencies]
windows-service = { version = "0.6", features = ["async"] }
windows = { version = "0.62", features = ["Win32_System_Services", "Win32_Foundation"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "signal"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tracing = "0.1"
tracing-subscriber = { version = "0.3", features = ["fmt"] }
anyhow = "1.0"

[profile.release]
strip = true
lto = true
opt-level = "s"
```

### main.rs (esqueleto)

```rust
use windows_service::service::{ServiceControl, ServiceControlAccept, ServiceExitCode, ServiceState, ServiceStatus, ServiceType};
use windows_service::service_control_handler::{self, ServiceControlHandlerResult};
use windows_service::service_dispatcher;
use std::ffi::OsString;
use std::time::Duration;

const SERVICE_NAME: &str = "StarSeedAyudante";

fn main() -> Result<(), Box<dyn std::error::Error>> {
    service_dispatcher::start(SERVICE_NAME, ffi_service_main)?;
    Ok(())
}

fn ffi_service_main(arguments: Vec<OsString>) {
    if let Err(e) = run_service(arguments) {
        eprintln!("Service error: {e}");
    }
}

fn run_service(_arguments: Vec<OsString>) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let handler = service_control_handler::register(SERVICE_NAME, move |ctrl| {
        match ctrl {
            ServiceControl::Stop => { let _ = tx.send(()); ServiceControlHandlerResult::NoError }
            ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
            _ => ServiceControlHandlerResult::NotImplemented,
        }
    })?;

    handler.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Running,
        controls_accepted: ServiceControlAccept::STOP,
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(0),
        process_id: None,
    })?;

    // Bucle principal del servicio: escuchar órdenes IPC (named pipe, TCP, etc.)
    // Por ahora: mantener vivo
    let _ = rx.recv();

    handler.set_service_status(ServiceStatus {
        service_type: ServiceType::OWN_PROCESS,
        current_state: ServiceState::Stopped,
        controls_accepted: ServiceControlAccept::empty(),
        exit_code: ServiceExitCode::Win32(0),
        checkpoint: 0,
        wait_hint: Duration::from_secs(0),
        process_id: None,
    })?;
    Ok(())
}
```

> **Nota**: En la versión actual (TRM1125G), las órdenes se ejecutan directamente desde la app Tauri vía `Command::new("powershell")` corriendo en el contexto del servicio (SYSTEM). El ejecutable `ayudante.exe` es un stub que registra el servicio; la lógica real vive en la app. En futuras versiones, el servicio expondrá un canal IPC (named pipe) para que la app le envíe órdenes sin spawn de procesos.

---

## NSIS Hooks (`windows/hooks.nsh`)

Funciones expuestas:

| Función | Descripción |
|---------|-------------|
| `StarSeed_InstallService` | Crea, configura e inicia el servicio |
| `StarSeed_UninstallService` | Detiene y elimina el servicio |
| `StarSeed_StartService` / `StarSeed_StopService` | Control manual |
| `StarSeed_CheckServiceExists` / `StarSeed_CheckServiceRunning` | Consultas |

Hooks automáticos:
- `.onInstSuccess` → `StarSeed_InstallService`
- `un.onUninstSuccess` → `StarSeed_UninstallService`

---

## Pruebas

### Unitarias (Lógica Pura)

```bash
cd native/src-tauri
cargo test ayudante_windows_logica
```

Cubren: `decidir_orden`, `validar_formatear`, `validar_montar`, `validar_logs`, `validar_terminal_admin`, serialización, scripts de instalación/desinstalación.

### Integración (Requiere Windows + Admin)

```powershell
# Instalar servicio
sc.exe create StarSeedAyudante binPath= "target\release\ayudante.exe" start= auto
sc.exe start StarSeedAyudante

# Probar órdenes desde la app (Tauri)
# invoke('ayudante_ejecutar', { orden: 'almacenes_estado', args: {} })

# Ver logs
Get-Content "$env:LOCALAPPDATA\StarSeed OS\Logs\ayudante.log" -Tail 20

# Desinstalar
sc.exe stop StarSeedAyudante
sc.exe delete StarSeedAyudante
```

---

## Referencias

- `native/src-tauri/src/ayudante_windows_logica.rs` — Lógica pura + pruebas
- `native/src-tauri/src/ayudante_windows.rs` — Comandos Tauri + ejecución PowerShell
- `native/src-tauri/windows/hooks.nsh` — Hooks NSIS para instalador
- `architecture/terminal-entre-neuronas.md` — Contrato de terminal entre neuronas
- `architecture/control-remoto-entre-neuronas.md` — Contrato de control remoto
- `architecture/permisos-y-control-del-dispositivo.md §4` — Permisos y control del dispositivo

---

## Checklist de Entrega (TRM1125G)

- [x] `ayudante_windows_logica.rs` — Lógica pura con pruebas (≥ 20 tests)
- [x] `ayudante_windows.rs` — Comandos Tauri: `ayudante_instalar`, `ayudante_desinstalar`, `ayudante_estado`, `ayudante_ejecutar`
- [x] `windows/hooks.nsh` — Hooks NSIS para install/uninstall perMachine con UAC
- [x] `tauri.conf.json` — `bundle.windows.nsis.include: "windows/hooks.nsh"`
- [x] `deploy/ayudante/windows/README.md` — Esta documentación
- [x] Registro en `lib.rs` (módulos + comandos)
- [ ] `cargo test` pasa en Windows (CI)
- [ ] Instalador NSIS genera `.exe` que instala servicio con UAC visible
- [ ] Órdenes `Format-Volume` / `Get-Disk` funcionan end-to-end con guardas