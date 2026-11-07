// ═══════════════════════════════════════════════════════════════════════════
// servidor_local_android_logica — el núcleo PURO del servidor local DENTRO de la APK (AND1107A).
// ---------------------------------------------------------------------------
// Contrato: architecture/apps-autonomas-sin-internet.md §9.1.
//
// En Android no hay un `node` que lanzar como proceso: el Node es `libnode.so` (nodejs-mobile, el
// fork digidem/nodejs-mobile) y corre en un hilo DENTRO del proceso de la app (`node::Start`). Kotlin
// (`ServidorLocal.kt`) extrae el servidor de los assets a la primera vez de cada versión, carga
// libnode y le cuenta a Rust cómo va con líneas `clave=valor` (JNI). Este archivo es lo que no toca
// ni Tauri ni JNI ni el sistema: leer ese estado, decidir el siguiente paso, los argumentos (en
// memoria contigua, como pide node::Start), el entorno extra y los mensajes de la página de arranque.
// Solo `std`: se prueba sin Tauri con
//     rustc --edition 2021 --test src/servidor_local_android_logica.rs -o /tmp/sla && /tmp/sla
// El pegamento (JNI, dlopen, hilo de Node, salud, ventana) vive en `servidor_local_android.rs`.
// ═══════════════════════════════════════════════════════════════════════════

#![allow(dead_code)]

use std::path::{Path, PathBuf};

/// La librería de nodejs-mobile (va en `jniLibs/<abi>/` del APK; la pone preparar-android.mjs).
pub const LIBNODE: &str = "libnode.so";
/// `node::Start(int, char**)` (C++ de node.h; nombre «mangled» de la ABI Itanium, igual en las tres ABI).
pub const SIMBOLO_START: &str = "_ZN4node5StartEiPPc";
/// Pila del hilo de Node: V8 usa ≈ 1 MB (`--stack-size` por defecto 984 KB); 8 MB dan margen.
pub const PILA_NODE: usize = 8 * 1024 * 1024;
/// Si Kotlin no dice nada en este tiempo (APK sin el proveedor, librería sin cargar), respaldo.
pub const ESPERA_SIN_NOTICIAS_MS: u64 = 20_000;
/// Tope de la extracción (primera vez de cada versión: ≈ 400 MB en ≈ 2.700 archivos).
pub const ESPERA_EXTRACCION_MS: u64 = 20 * 60_000;
/// Tope hasta «listo»: en un móvil el primer arranque de Next tarda más que en escritorio.
pub const ESPERA_LISTO_MS: u64 = 120_000;
/// Vigía tras «listo»: cada cuánto se pregunta por la salud y cuántos fallos seguidos tumban el
/// servidor (Node no se puede volver a arrancar en el mismo proceso: entonces, la web publicada).
pub const VIGIA_PASO_MS: u64 = 3_000;
pub const VIGIA_FALLOS: u32 = 6;

/// Lo que tiene que haber en la carpeta extraída para arrancar.
pub const ARCHIVOS_PAQUETE: [&str; 4] = ["server.js", ".next/BUILD_ID", "starseed-arranque.cjs", "guarda.cjs"];

/// Lo que cuenta Kotlin (cada campo puede faltar).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct EstadoPaquete {
    /// "extrayendo" | "listo" | "sin-paquete" | "error"
    pub fase: String,
    pub hecho: u64,
    pub total: u64,
    /// Carpeta del servidor ya extraída (`noBackupFilesDir/servidor-local/<buildId>`).
    pub dir: Option<PathBuf>,
    /// `getCacheDir()`: TMPDIR y la caché de compilación de V8.
    pub cache: Option<PathBuf>,
    /// `getFilesDir()`: HOME (hay código npm que llama a os.homedir()).
    pub datos: Option<PathBuf>,
    /// Registro del servidor (`noBackupFilesDir/servidor-local/servidor-local.log`).
    pub registro: Option<PathBuf>,
    pub build_id: Option<String>,
    pub motivo: Option<String>,
    /// Memoria total del aparato en bytes (ActivityManager), para el tope del heap de V8.
    pub memoria: u64,
    /// La ABI principal del aparato (para los mensajes).
    pub abi: Option<String>,
}

fn texto(v: &str) -> Option<String> {
    let t = v.trim();
    if t.is_empty() {
        None
    } else {
        Some(t.to_string())
    }
}

/// Lee las líneas `clave=valor` de Kotlin. Claves desconocidas y líneas sin `=` se ignoran.
pub fn leer_estado(s: &str) -> EstadoPaquete {
    let mut e = EstadoPaquete::default();
    for linea in s.lines() {
        let Some((k, v)) = linea.split_once('=') else { continue };
        let v = v.trim_end_matches('\r');
        match k.trim() {
            "fase" => e.fase = v.trim().to_string(),
            "hecho" => e.hecho = v.trim().parse().unwrap_or(0),
            "total" => e.total = v.trim().parse().unwrap_or(0),
            "dir" => e.dir = texto(v).map(PathBuf::from),
            "cache" => e.cache = texto(v).map(PathBuf::from),
            "datos" => e.datos = texto(v).map(PathBuf::from),
            "registro" => e.registro = texto(v).map(PathBuf::from),
            "build_id" => e.build_id = texto(v),
            "motivo" => e.motivo = texto(v),
            "memoria" => e.memoria = v.trim().parse().unwrap_or(0),
            "abi" => e.abi = texto(v),
            _ => {}
        }
    }
    e
}

/// Qué hacer ahora.
#[derive(Debug, Clone, PartialEq)]
pub enum Paso {
    /// Seguir esperando; el mensaje va a la página de arranque.
    Esperar(String),
    /// Todo listo: arrancar Node.
    Arrancar,
    /// No se puede: la web publicada (el service worker v8 la sirve sin conexión si ya precargó).
    Respaldo(String),
}

pub fn mensaje_progreso(hecho: u64, total: u64) -> String {
    if total == 0 {
        return "Preparando StarSeed OS para usarlo sin internet (primera vez de esta versión)…".to_string();
    }
    let pct = (hecho.min(total) * 100) / total;
    format!(
        "Preparando StarSeed OS para usarlo sin internet (primera vez de esta versión): {pct} % · {} de {} MB…",
        hecho / 1_048_576,
        total / 1_048_576
    )
}

/// `transcurrido_ms`: desde que arrancó la espera.
pub fn decidir(e: Option<&EstadoPaquete>, transcurrido_ms: u64) -> Paso {
    let Some(e) = e else {
        if transcurrido_ms > ESPERA_SIN_NOTICIAS_MS {
            return Paso::Respaldo("La app no preparó su servidor local (no llegó ninguna noticia del lado Android).".into());
        }
        return Paso::Esperar("Preparando StarSeed OS en esta neurona…".into());
    };
    let motivo = |por_defecto: &str| e.motivo.clone().unwrap_or_else(|| por_defecto.to_string());
    match e.fase.as_str() {
        "listo" => {
            if e.dir.is_none() {
                Paso::Respaldo("El servidor local está listo pero no dice dónde.".into())
            } else {
                Paso::Arrancar
            }
        }
        "sin-paquete" => Paso::Respaldo(motivo("Esta APK no trae el servidor local.")),
        "error" => Paso::Respaldo(motivo("No se pudo preparar el servidor local.")),
        "extrayendo" if transcurrido_ms > ESPERA_EXTRACCION_MS => Paso::Respaldo(format!(
            "Preparar el servidor local tardó más de {} min.",
            ESPERA_EXTRACCION_MS / 60_000
        )),
        "extrayendo" => Paso::Esperar(mensaje_progreso(e.hecho, e.total)),
        _ if transcurrido_ms > ESPERA_SIN_NOTICIAS_MS => Paso::Respaldo(format!("Estado desconocido del servidor local: «{}».", e.fase)),
        _ => Paso::Esperar("Preparando StarSeed OS en esta neurona…".into()),
    }
}

/// La primera pieza que falta en la carpeta extraída (None = está entera).
pub fn falta(dir: &Path, existe: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    ARCHIVOS_PAQUETE.iter().map(|r| dir.join(r)).find(|p| !existe(p))
}

/// Tope del heap de V8 en MB: una sexta parte de la memoria del aparato, entre 256 y 768 MB. En
/// Android pasar del límite del cgroup mata la app entera (no lanza un error de memoria), así que
/// mejor un recolector más activo que el tope por defecto de V8 (≈ ¼ de la RAM, hasta 2–4 GB).
pub fn limite_heap_mb(memoria_bytes: u64) -> u64 {
    if memoria_bytes == 0 {
        return 512;
    }
    (memoria_bytes / 6 / 1_048_576).clamp(256, 768)
}

/// argv de node::Start: `node --max-old-space-size=<mb> <script>`.
pub fn argumentos(script: &Path, heap_mb: u64) -> Vec<String> {
    vec![
        "node".to_string(),
        format!("--max-old-space-size={heap_mb}"),
        script.display().to_string(),
    ]
}

/// node::Start (libuv, `uv_setup_args`) exige que los argumentos estén SEGUIDOS en memoria, cada uno
/// terminado en NUL (lo dicen los ejemplos de nodejs-mobile). Devuelve el búfer y dónde empieza cada
/// argumento. Un NUL dentro de un argumento lo cortaría: se rechaza.
pub fn argv_contiguo(args: &[String]) -> Result<(Vec<u8>, Vec<usize>), String> {
    let mut buf = Vec::with_capacity(args.iter().map(|a| a.len() + 1).sum());
    let mut inicios = Vec::with_capacity(args.len());
    for a in args {
        if a.as_bytes().contains(&0) {
            return Err(format!("argumento con NUL: {a:?}"));
        }
        inicios.push(buf.len());
        buf.extend_from_slice(a.as_bytes());
        buf.push(0);
    }
    Ok((buf, inicios))
}

/// Entorno EXTRA del Node de Android (se suma a `servidor_local_logica::entorno_hijo`). Nada secreto:
/// el pase va por una tubería (`STARSEED_ENTRADA_FD` es solo el NÚMERO del descriptor).
/// · STARSEED_EN_PROCESO=1: el envoltorio no llama a process.exit (cerraría la app entera) ni toca
///   la entrada estándar del proceso de la app.
/// · STARSEED_VIGIA_PADRE=0: no hay padre que vigilar; Node vive y muere con la app.
/// · TMPDIR/HOME: en Android no hay /tmp ni HOME (docs/EMBEDDING.md de nodejs-mobile).
/// · NODE_COMPILE_CACHE (+ _PORTABLE): caché de V8 en disco; los arranques siguientes van más rápido.
pub fn entorno_extra(fd_pase: i32, e: &EstadoPaquete) -> Vec<(&'static str, String)> {
    let mut v = vec![
        ("STARSEED_EN_PROCESO", "1".to_string()),
        ("STARSEED_VIGIA_PADRE", "0".to_string()),
        ("STARSEED_ENTRADA_FD", fd_pase.to_string()),
    ];
    if let Some(c) = &e.cache {
        v.push(("TMPDIR", c.display().to_string()));
        v.push(("NODE_COMPILE_CACHE", c.join("node-compile-cache").display().to_string()));
        v.push(("NODE_COMPILE_CACHE_PORTABLE", "1".to_string()));
    }
    if let Some(d) = &e.datos {
        v.push(("HOME", d.display().to_string()));
    }
    v
}

/// ¿La ventana está en la página de arranque de la app (y no en el servidor local ni en una web)?
/// En Android la página de arranque es `http(s)://tauri.localhost/…`; en escritorio `tauri://…`.
/// Solo desde ahí se lleva la ventana al servidor local: nunca se arranca a nadie de otra web (OAuth…).
pub fn es_pagina_arranque(url: &str) -> bool {
    let u = url.to_ascii_lowercase();
    u.starts_with("tauri://")
        || u.starts_with("http://tauri.localhost")
        || u.starts_with("https://tauri.localhost")
        || u == "about:blank"
        || u.is_empty()
}

// ───────────────────────────────── Pruebas ─────────────────────────────────

#[cfg(test)]
mod pruebas {
    use super::*;

    #[test]
    fn lee_el_estado_de_kotlin() {
        let e = leer_estado(
            "fase=listo\nhecho=10\ntotal=20\ndir=/data/user/0/app.starseed.os/no_backup/servidor-local/abc\n\
             cache=/c\ndatos=/f\nregistro=/r.log\nbuild_id=abc\nmemoria=4000000000\nabi=arm64-v8a\nrara=1\nsin igual\r\nmotivo= \n",
        );
        assert_eq!(e.fase, "listo");
        assert_eq!((e.hecho, e.total, e.memoria), (10, 20, 4_000_000_000));
        assert_eq!(e.dir.as_deref(), Some(Path::new("/data/user/0/app.starseed.os/no_backup/servidor-local/abc")));
        assert_eq!(e.build_id.as_deref(), Some("abc"));
        assert_eq!(e.abi.as_deref(), Some("arm64-v8a"));
        assert_eq!(e.motivo, None, "un valor vacío no es un motivo");
        // Un valor con «=» dentro se queda entero; números malos → 0.
        let m = leer_estado("motivo=a=b\r\nhecho=x\n");
        assert_eq!(m.motivo.as_deref(), Some("a=b"));
        assert_eq!(m.hecho, 0);
        assert_eq!(leer_estado(""), EstadoPaquete::default());
    }

    #[test]
    fn decide_esperar_arrancar_o_respaldo() {
        assert!(matches!(decidir(None, 0), Paso::Esperar(_)));
        assert!(matches!(decidir(None, ESPERA_SIN_NOTICIAS_MS + 1), Paso::Respaldo(_)));
        let ext = EstadoPaquete { fase: "extrayendo".into(), hecho: 50 * 1_048_576, total: 200 * 1_048_576, ..Default::default() };
        assert_eq!(decidir(Some(&ext), 60_000), Paso::Esperar(mensaje_progreso(ext.hecho, ext.total)));
        // Extraer puede tardar mucho más que las noticias: solo cuenta el tope de la extracción.
        assert!(matches!(decidir(Some(&ext), ESPERA_SIN_NOTICIAS_MS * 10), Paso::Esperar(_)));
        assert!(matches!(decidir(Some(&ext), ESPERA_EXTRACCION_MS + 1), Paso::Respaldo(_)));
        let listo = EstadoPaquete { fase: "listo".into(), dir: Some("/d".into()), ..Default::default() };
        assert_eq!(decidir(Some(&listo), 0), Paso::Arrancar);
        let sin_dir = EstadoPaquete { fase: "listo".into(), ..Default::default() };
        assert!(matches!(decidir(Some(&sin_dir), 0), Paso::Respaldo(_)));
        let err = EstadoPaquete { fase: "error".into(), motivo: Some("sin espacio".into()), ..Default::default() };
        assert_eq!(decidir(Some(&err), 0), Paso::Respaldo("sin espacio".into()));
        let sin = EstadoPaquete { fase: "sin-paquete".into(), ..Default::default() };
        assert!(matches!(decidir(Some(&sin), 0), Paso::Respaldo(m) if m.contains("no trae")));
        let raro = EstadoPaquete { fase: "¿?".into(), ..Default::default() };
        assert!(matches!(decidir(Some(&raro), 0), Paso::Esperar(_)));
        assert!(matches!(decidir(Some(&raro), ESPERA_SIN_NOTICIAS_MS + 1), Paso::Respaldo(_)));
    }

    #[test]
    fn progreso_legible() {
        assert!(mensaje_progreso(0, 0).contains("primera vez"));
        let m = mensaje_progreso(100 * 1_048_576, 400 * 1_048_576);
        assert!(m.contains("25 %") && m.contains("100 de 400 MB"), "{m}");
        assert!(mensaje_progreso(999, 10).contains("100 %"), "nunca más del 100 %");
    }

    #[test]
    fn dice_que_falta_del_paquete() {
        let d = Path::new("/s");
        assert_eq!(falta(d, |_| true), None);
        assert_eq!(falta(d, |p| !p.ends_with("BUILD_ID")), Some(PathBuf::from("/s/.next/BUILD_ID")));
        assert_eq!(falta(d, |p| !p.ends_with("guarda.cjs")), Some(PathBuf::from("/s/guarda.cjs")));
    }

    #[test]
    fn heap_entre_256_y_768() {
        assert_eq!(limite_heap_mb(0), 512);
        assert_eq!(limite_heap_mb(1 << 30), 256, "1 GB de RAM → el mínimo");
        assert_eq!(limite_heap_mb(3 * (1 << 30)), 512);
        assert_eq!(limite_heap_mb(16 * (1u64 << 30)), 768, "16 GB → el máximo");
    }

    #[test]
    fn argv_seguido_en_memoria() {
        let a = argumentos(Path::new("/s/starseed-arranque.cjs"), 384);
        assert_eq!(a, vec!["node", "--max-old-space-size=384", "/s/starseed-arranque.cjs"]);
        let (buf, inicios) = argv_contiguo(&a).unwrap();
        assert_eq!(buf, b"node\0--max-old-space-size=384\0/s/starseed-arranque.cjs\0".to_vec());
        assert_eq!(inicios, vec![0, 5, 30]);
        for (i, &o) in inicios.iter().enumerate() {
            let fin = buf[o..].iter().position(|&b| b == 0).unwrap();
            assert_eq!(&buf[o..o + fin], a[i].as_bytes());
        }
        assert!(argv_contiguo(&["a\0b".to_string()]).is_err());
        assert_eq!(argv_contiguo(&[]).unwrap(), (vec![], vec![]));
    }

    #[test]
    fn entorno_extra_sin_secretos() {
        let e = EstadoPaquete { cache: Some("/c".into()), datos: Some("/f".into()), ..Default::default() };
        let v = entorno_extra(7, &e);
        let get = |k: &str| v.iter().find(|(n, _)| *n == k).map(|(_, x)| x.clone());
        assert_eq!(get("STARSEED_EN_PROCESO").as_deref(), Some("1"));
        assert_eq!(get("STARSEED_VIGIA_PADRE").as_deref(), Some("0"));
        assert_eq!(get("STARSEED_ENTRADA_FD").as_deref(), Some("7"));
        assert_eq!(get("TMPDIR").as_deref(), Some("/c"));
        assert_eq!(get("NODE_COMPILE_CACHE").as_deref(), Some("/c/node-compile-cache"));
        assert_eq!(get("HOME").as_deref(), Some("/f"));
        for (k, _) in &v {
            assert!(!k.contains("PASE") && !k.contains("KEY") && !k.contains("SECRET") && !k.contains("TOKEN"), "{k}");
            assert_ne!(*k, "NODE_OPTIONS", "las opciones de Node van por argv, no por el entorno");
        }
        // Sin carpetas, solo lo del envoltorio.
        assert_eq!(entorno_extra(3, &EstadoPaquete::default()).len(), 3);
    }

    #[test]
    fn solo_desde_la_pagina_de_arranque() {
        assert!(es_pagina_arranque("http://tauri.localhost/index.html"));
        assert!(es_pagina_arranque("https://tauri.localhost/"));
        assert!(es_pagina_arranque("tauri://localhost/index.html"));
        assert!(es_pagina_arranque("about:blank"));
        assert!(!es_pagina_arranque("http://127.0.0.1:47610/escritorios"));
        assert!(!es_pagina_arranque("https://starseed-os.vercel.app/"));
        assert!(!es_pagina_arranque("https://accounts.google.com/o/oauth2"));
    }
}
