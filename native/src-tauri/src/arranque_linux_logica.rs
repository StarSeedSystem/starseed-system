// ═══════════════════════════════════════════════════════════════════════════
// arranque_linux_logica — lógica pura del arranque en Linux (LNX1118WC · 2026-11-18).
// Contrato: esta tarea. Solo std: se prueba en cualquier sistema.
// ---------------------------------------------------------------------------
// Qué decide esta lógica (sin tocar el sistema):
//   · si la GPU es «vieja» a partir del texto de /sys/class/drm o lspci;
//   · si hay que poner WEBKIT_DISABLE_DMABUF_RENDERER=1 (cuando no está definido y la GPU es vieja o desconocida);
//   · política de reintentos de carga del webview: cuántos, cuánto esperar y cuándo cargar la interfaz incluida;
//   · la línea que se escribe en enlaces.log al caer al respaldo.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

/// GPU conocidas que NO necesitan DMABUF desactivado (modernas, a partir de ~2015).
/// Si la GPU NO está en esta lista y se puede identificar, se considera «vieja».
const GPU_MODERNAS: &[&str] = &[
    // Intel: Gen 9 (Skylake, 2015) en adelante
    "HD Graphics 5",     // 500 series (Apollo Lake, 2016)
    "HD Graphics 6",     // 600 series (Kaby Lake, 2017)
    "UHD Graphics 6",    // 600 series
    "UHD Graphics 7",    // 700 series (Ice Lake, 2019)
    "Iris Plus",         // 2017+
    "Iris Xe",           // 2020+
    "Arc",               // 2022+
    // AMD: GCN 3 (2015) en adelante / RDNA
    "Radeon RX 4",       // Polaris (2016)
    "Radeon RX 5",       // Polaris refresh (2017)
    "Radeon RX 5",       // Vega (2017)
    "Radeon RX 6",       // RDNA2 (2020)
    "Radeon RX 7",       // RDNA3 (2022)
    "Radeon Pro",        // Workstation modernas
    "RDNA",              // Arquitectura RDNA
    "Vega",              // Vega (2017)
    // NVIDIA: Maxwell (2014) en adelante — conservador: Pascal (2016)+
    "GeForce GTX 10",    // Pascal (2016)
    "GeForce GTX 16",    // Turing (2019)
    "GeForce RTX 20",    // Turing (2018)
    "GeForce RTX 30",    // Ampere (2020)
    "GeForce RTX 40",    // Ada (2022)
    "Quadro P",          // Pascal workstation
    "Quadro RTX",        // Turing workstation
    "Quadro A",          // Ampere workstation
    "Tesla P",           // Pascal datacenter
    "Tesla T",           // Turing datacenter
    "Tesla A",           // Ampere datacenter
    "Tesla H",           // Hopper datacenter
];

/// Palabras que indican GPU integradas antiguas de Intel (pre-Gen 9, antes de 2015).
const GPU_INTEL_ANTIGUAS: &[&str] = &[
    "HD Graphics 2",     // Sandy Bridge (2011)
    "HD Graphics 3",     // Ivy Bridge (2012)
    "HD Graphics 4",     // Haswell (2013)
    "HD Graphics 4400",  // Haswell
    "HD Graphics 4600",  // Haswell
    "HD Graphics 5000",  // Haswell (iris)
    "HD Graphics 5100",  // Haswell (iris)
    "HD Graphics 5200",  // Haswell (iris pro)
    "Iris Graphics 5100",// Haswell
    "Iris Pro Graphics 5200", // Haswell
    "HD Graphics (",     // Genéricas sin número (suelen ser antiguas)
    "HD Graphics [0-9]$", // HD Graphics 1, 2, 3, 4 sin sufijo de serie moderna
];

/// Palabras que indican GPU antiguas de AMD (pre-GCN 3, antes de 2015).
const GPU_AMD_ANTIGUAS: &[&str] = &[
    "Radeon HD 5",       // Evergreen (2009)
    "Radeon HD 6",       // Northern Islands (2010)
    "Radeon HD 7",       // Southern Islands (2011)
    "Radeon HD 8",       // Sea Islands (2013)
    "Radeon R5 ",        // Sea Islands rebrand (2013)
    "Radeon R7 ",        // Sea Islands rebrand (2013)
    "Radeon R9 2",       // Hawaii (2013) — límite
    "Radeon R9 3",       // Hawaii rebrand (2015) — límite
];

/// Palabras que indican GPU antiguas de NVIDIA (pre-Pascal, antes de 2016).
const GPU_NVIDIA_ANTIGUAS: &[&str] = &[
    "GeForce GTX 4",     // Fermi (2010)
    "GeForce GTX 5",     // Fermi (2011)
    "GeForce GTX 6",     // Kepler (2012)
    "GeForce GTX 7",     // Kepler (2013)
    "GeForce GTX 8",     // Kepler/Mobile (2014)
    "GeForce GTX 9",     // Maxwell (2014) — límite
    "Quadro K",          // Kepler workstation
    "Quadro M",          // Maxwell workstation
    "Tesla K",           // Kepler datacenter
    "Tesla M",           // Maxwell datacenter
];

/// Resultado de la detección de GPU.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TipoGpu {
    /// GPU moderna conocida: no hace falta desactivar DMABUF.
    Moderna,
    /// GPU antigua conocida: hay que desactivar DMABUF.
    Antigua,
    /// No se pudo determinar (sin acceso a /sys/class/drm ni lspci, o salida vacía/irreconocible).
    Desconocida,
}

/// Decide si la GPU es moderna, antigua o desconocida a partir del texto bruto de /sys/class/drm o lspci.
/// `texto` puede venir de `std::fs::read_to_string("/sys/class/drm/.../device/uevent")` o de `lspci -nn`.
pub fn detectar_tipo_gpu(texto: &str) -> TipoGpu {
    let t = texto.to_lowercase();

    // Primero: buscar coincidencias claras de GPU modernas.
    for g in GPU_MODERNAS {
        if t.contains(&g.to_lowercase()) {
            return TipoGpu::Moderna;
        }
    }

    // Segundo: buscar coincidencias claras de GPU antiguas.
    for g in GPU_INTEL_ANTIGUAS {
        if t.contains(&g.to_lowercase()) {
            return TipoGpu::Antigua;
        }
    }
    for g in GPU_AMD_ANTIGUAS {
        if t.contains(&g.to_lowercase()) {
            return TipoGpu::Antigua;
        }
    }
    for g in GPU_NVIDIA_ANTIGUAS {
        if t.contains(&g.to_lowercase()) {
            return TipoGpu::Antigua;
        }
    }

    // Tercero: si hay texto que pinta a GPU pero no coincide con ninguna lista → desconocida.
    // Palabras clave que sugieren que SÍ hay info de GPU pero no la reconocemos.
    let palabras_gpu = [
        "vga", "3d", "display", "graphics", "gpu", "radeon", "geforce", "quadro", "tesla",
        "intel", "amd", "nvidia", "iris", "hd graphics", "uhd graphics",
    ];
    for p in palabras_gpu {
        if t.contains(p) {
            return TipoGpu::Desconocida;
        }
    }

    // Sin texto relevante → desconocida (no se pudo leer nada).
    TipoGpu::Desconocida
}

/// Decide si hay que poner `WEBKIT_DISABLE_DMABUF_RENDERER=1`.
/// Regla: si la variable YA está definida (cualquier valor no vacío), no se toca.
/// Si NO está definida: se pone a "1" cuando la GPU es `Antigua` o `Desconocida`.
/// `valor_existente` es `Some(valor)` si la variable de entorno ya existe, `None` si no.
pub fn decidir_dmabuf(valor_existente: Option<&str>, tipo_gpu: TipoGpu) -> Option<String> {
    // Si ya está definida (incluso "0"), respetar la decisión del usuario/entorno.
    if let Some(v) = valor_existente {
        if !v.trim().is_empty() {
            return None;
        }
    }
    // Si no está definida o está vacía: activar para GPU antigua o desconocida.
    match tipo_gpu {
        TipoGpu::Antigua | TipoGpu::Desconocida => Some("1".to_string()),
        TipoGpu::Moderna => None,
    }
}

/// Parámetros de la política de reintentos.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PoliticaReintentos {
    /// Número máximo de intentos (incluye el primero).
    pub max_intentos: u32,
    /// Espera base en milisegundos (se multiplica por 2^intento).
    pub espera_base_ms: u64,
    /// Tope de espera en milisegundos.
    pub espera_tope_ms: u64,
}

impl Default for PoliticaReintentos {
    fn default() -> Self {
        Self {
            max_intentos: 3,
            espera_base_ms: 1_000, // 1 s, 2 s, 4 s…
            espera_tope_ms: 30_000,
        }
    }
}

/// Qué hacer tras un fallo de carga.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccionTrasFallo {
    /// Reintentar después de `espera_ms` milisegundos.
    Reintentar { intento: u32, espera_ms: u64 },
    /// Cargar la interfaz incluida (fallback) y registrar en enlaces.log.
    CargarRespaldo { causa: String },
    /// No hacer nada (p. ej. error irrecuperable sin red).
    Nada,
}

/// Decide qué hacer tras un fallo de carga del webview.
/// `intento` es 1-based (1 = primer intento fallido).
/// `hay_red` indica si hay conectividad de red (ping/DNS/TCP a algún host conocido).
/// `es_error_interno_webkit` es true si el fallo es la página «WebKit encountered an internal error».
/// `causa` es una descripción corta del fallo (para el log).
pub fn decidir_reintento(
    intento: u32,
    hay_red: bool,
    es_error_interno_webkit: bool,
    causa: &str,
    politica: PoliticaReintentos,
) -> AccionTrasFallo {
    // Si ya se agotaron los intentos → respaldo.
    if intento >= politica.max_intentos {
        return AccionTrasFallo::CargarRespaldo {
            causa: format!("{causa} (intentos={})", politica.max_intentos),
        };
    }

    // Si no hay red y no es error interno de WebKit (p. ej. DNS, timeout de red), no reintentar.
    if !hay_red && !es_error_interno_webkit {
        return AccionTrasFallo::Nada;
    }

    // Calcular espera con backoff exponencial: base * 2^(intento-1), con tope.
    let factor = 2u64.saturating_pow((intento - 1).min(63));
    let espera = politica.espera_base_ms.saturating_mul(factor).min(politica.espera_tope_ms);

    AccionTrasFallo::Reintentar { intento: intento + 1, espera_ms: espera }
}

/// Genera la línea que se escribe en `enlaces.log` al cargar el respaldo.
/// Formato: `arranque webview-fallo intento=N causa=…`
pub fn linea_log_fallo(intento: u32, causa: &str) -> String {
    format!("arranque webview-fallo intento={intento} causa={causa}")
}

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn gpu_moderna_intel_skylake() {
        let txt = "DRIVER=i915\nPCI_CLASS=030000\nPCI_ID=8086:1912\nPCI_SUBSYS_ID=1028:0706\nPCI_SLOT_NAME=0000:00:02.0\nMODALIAS=pci:v00008086d00001912sv00001028sd00000706bc03sc00i00\n";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Moderna);
    }

    #[test]
    fn gpu_moderna_amd_polaris() {
        let txt = "03:00.0 VGA compatible controller [0300]: Advanced Micro Devices, Inc. [AMD/ATI] Ellesmere [Radeon RX 470/480/570/580] [1002:67df]";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Moderna);
    }

    #[test]
    fn gpu_moderna_nvidia_pascal() {
        let txt = "01:00.0 VGA compatible controller: NVIDIA Corporation GP104 [GeForce GTX 1070] [10de:1b81]";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Moderna);
    }

    #[test]
    fn gpu_antigua_intel_hd3000() {
        let txt = "00:02.0 VGA compatible controller: Intel Corporation 2nd Generation Core Processor Family Integrated Graphics Controller [8086:0126]";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Antigua);
    }

    #[test]
    fn gpu_antigua_intel_hd4000() {
        let txt = "PCI_ID=8086:0166\nDRIVER=i915\n"; // HD Graphics 4000 (Ivy Bridge)
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Antigua);
    }

    #[test]
    fn gpu_antigua_amd_hd6000() {
        let txt = "Radeon HD 6630M";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Antigua);
    }

    #[test]
    fn gpu_antigua_nvidia_fermi() {
        let txt = "GeForce GTX 480";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Antigua);
    }

    #[test]
    fn gpu_desconocida_texto_vacio() {
        assert_eq!(detectar_tipo_gpu(""), TipoGpu::Desconocida);
    }

    #[test]
    fn gpu_desconocida_sin_palabras_clave() {
        assert_eq!(detectar_tipo_gpu("algo sin sentido"), TipoGpu::Desconocida);
    }

    #[test]
    fn gpu_desconocida_reconocible_pero_no_en_listas() {
        // Una GPU que contiene "graphics" pero no está en ninguna lista.
        let txt = "Unknown Graphics Controller XYZ";
        assert_eq!(detectar_tipo_gpu(txt), TipoGpu::Desconocida);
    }

    #[test]
    fn dmabuf_ya_definida_no_se_toca() {
        assert_eq!(decidir_dmabuf(Some("0"), TipoGpu::Antigua), None);
        assert_eq!(decidir_dmabuf(Some("1"), TipoGpu::Moderna), None);
        assert_eq!(decidir_dmabuf(Some("cualquier_cosa"), TipoGpu::Desconocida), None);
    }

    #[test]
    fn dmabuf_vacia_se_trata_como_no_definida() {
        assert_eq!(decidir_dmabuf(Some(""), TipoGpu::Antigua), Some("1".to_string()));
        assert_eq!(decidir_dmabuf(Some("   "), TipoGpu::Moderna), None);
    }

    #[test]
    fn dmabuf_no_definida_gpu_antigua_activa() {
        assert_eq!(decidir_dmabuf(None, TipoGpu::Antigua), Some("1".to_string()));
    }

    #[test]
    fn dmabuf_no_definida_gpu_desconocida_activa() {
        assert_eq!(decidir_dmabuf(None, TipoGpu::Desconocida), Some("1".to_string()));
    }

    #[test]
    fn dmabuf_no_definida_gpu_moderna_no_activa() {
        assert_eq!(decidir_dmabuf(None, TipoGpu::Moderna), None);
    }

    #[test]
    fn reintento_primer_fallo_con_red() {
        let p = PoliticaReintentos::default();
        let r = decidir_reintento(1, true, false, "timeout", p);
        assert!(matches!(r, AccionTrasFallo::Reintentar { intento: 2, espera_ms: 1_000 }));
    }

    #[test]
    fn reintento_segundo_fallo_con_red_backoff() {
        let p = PoliticaReintentos::default();
        let r = decidir_reintento(2, true, false, "timeout", p);
        assert!(matches!(r, AccionTrasFallo::Reintentar { intento: 3, espera_ms: 2_000 }));
    }

    #[test]
    fn reintento_tercer_fallo_agota_intentos_carga_respaldo() {
        let p = PoliticaReintentos::default();
        let r = decidir_reintento(3, true, false, "timeout", p);
        assert!(matches!(r, AccionTrasFallo::CargarRespaldo { causa } if causa.contains("intentos=3")));
    }

    #[test]
    fn reintento_sin_red_y_no_error_interno_no_reintenta() {
        let p = PoliticaReintentos::default();
        let r = decidir_reintento(1, false, false, "dns_failed", p);
        assert_eq!(r, AccionTrasFallo::Nada);
    }

    #[test]
    fn reintento_sin_red_pero_error_interno_webkit_sí_reintenta() {
        let p = PoliticaReintentos::default();
        let r = decidir_reintento(1, false, true, "WebKit internal error", p);
        assert!(matches!(r, AccionTrasFallo::Reintentar { intento: 2, espera_ms: 1_000 }));
    }

    #[test]
    fn espera_tope_no_se_pasa() {
        let p = PoliticaReintentos { espera_base_ms: 10_000, espera_tope_ms: 15_000, ..Default::default() };
        // intento 2: 10_000 * 2 = 20_000 > tope 15_000
        let r = decidir_reintento(2, true, false, "x", p);
        assert!(matches!(r, AccionTrasFallo::Reintentar { espera_ms: 15_000, .. }));
    }

    #[test]
    fn linea_log_formato_correcto() {
        let linea = linea_log_fallo(3, "WebKit internal error");
        assert_eq!(linea, "arranque webview-fallo intento=3 causa=WebKit internal error");
    }

    #[test]
    fn politica_por_defecto_valores_esperados() {
        let p = PoliticaReintentos::default();
        assert_eq!(p.max_intentos, 3);
        assert_eq!(p.espera_base_ms, 1_000);
        assert_eq!(p.espera_tope_ms, 30_000);
    }
}