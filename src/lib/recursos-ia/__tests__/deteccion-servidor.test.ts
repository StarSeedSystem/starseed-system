/**
 * Parsers de la detección de la máquina con salidas REALES de la Mac M1 de Alex (2026-10-23) y
 * fixtures realistas de un SSD externo USB, una caja Thunderbolt y un Linux con NVIDIA.
 */
import { describe, expect, it } from "vitest";

import {
    arquitecturaDe,
    cpuDeProcCpuinfo,
    detectarMaquinaCon,
    filasDf,
    gpusDeNvidiaSmi,
    gpusDeSystemProfiler,
    herramientaDe,
    infoDeDiskutilPlist,
    interpretarServidor,
    macosMayor,
    montajesMacRelevantes,
    npuApple,
    ramDeMeminfo,
    ramLibreGbDeVmStat,
    runtimesDe,
    sinHome,
    soDeOsRelease,
    soDeSwVers,
    sysctlMac,
    volumenMac,
    volumenesDeLsblk,
    type DependenciasDeteccion,
    type SalidaOrden,
} from "../deteccion-servidor";

/* ── Mac de Alex (salidas reales) ── */
const SW_VERS = "ProductName:\t\tmacOS\nProductVersion:\t\t26.3.1\nBuildVersion:\t\t25D771280a\n";
const SYSCTL = "Apple M1\n8589934592\n8\n";
const VM_STAT = [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free:                                3928.",
    "Pages active:                             52012.",
    "Pages inactive:                           54958.",
    "Pages speculative:                         5354.",
    "Pages throttled:                              0.",
    "Pages wired down:                         72111.",
].join("\n");
// `df -h` real: /dev/disk3s1s1 228Gi 12Gi 9.2Gi 56% / · /dev/disk3s5 228Gi 189Gi 9.2Gi 96% /System/Volumes/Data
const DF_KP = [
    "Filesystem     1024-blocks      Used Available Capacity  Mounted on",
    "/dev/disk3s1s1   239075328  12582912   9646899    57%    /",
    "devfs                  211       211         0   100%    /dev",
    "/dev/disk3s6     239075328   1048576   9646899    10%    /System/Volumes/VM",
    "/dev/disk3s2     239075328   6291456   9646899    40%    /System/Volumes/Preboot",
    "/dev/disk3s4     239075328      4096   9646899     1%    /System/Volumes/Update",
    "/dev/disk1s2        512000      6144    491520     2%    /System/Volumes/xarts",
    "/dev/disk1s1        512000      5120    491520     2%    /System/Volumes/iSCPreboot",
    "/dev/disk1s3        512000      1024    491520     1%    /System/Volumes/Hardware",
    "/dev/disk3s5     239075328 198180864   9646899    96%    /System/Volumes/Data",
    "map auto_home            0         0         0   100%    /System/Volumes/Data/home",
    "/dev/disk5s1     976284672 120586240 855698432    13%    /Volumes/SSD Externo",
    "/dev/disk7s1       2097152   1048576   1048576    50%    /Volumes/Instalador",
    "/dev/disk3s7     239075328   1048576   9646899    10%    /Volumes/.timemachine/abc/2026-10-22",
].join("\n");
const SWIFT = "swift-driver version: 1.115 Apple Swift version 6.0.2 (swiftlang-6.0.2.1.2 clang-1600.0.26.4)\nTarget: arm64-apple-macosx26.0\n";
const XCODEBUILD_ERROR =
    "xcode-select: error: tool 'xcodebuild' requires Xcode, but active developer directory '/Library/Developer/CommandLineTools' is a command line tools instance";

const plist = (pares: Record<string, string | number | boolean>) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0">\n<dict>\n${Object.entries(pares)
        .map(([k, v]) =>
            typeof v === "boolean"
                ? `\t<key>${k}</key>\n\t<${v}/>`
                : typeof v === "number"
                  ? `\t<key>${k}</key>\n\t<integer>${v}</integer>`
                  : `\t<key>${k}</key>\n\t<string>${v}</string>`,
        )
        .join("\n")}\n</dict>\n</plist>\n`;

const DISKUTIL_DATOS = plist({
    APFSContainerFree: 9878425600,
    BusProtocol: "Apple Fabric",
    DeviceIdentifier: "disk3s5",
    FilesystemName: "APFS",
    FilesystemType: "apfs",
    Internal: true,
    MediaName: "APPLE SSD AP0256Q",
    RemovableMediaOrExternalDevice: false,
    SolidState: true,
    VolumeName: "Macintosh HD - Data",
    WritableVolume: true,
});
// SSD externo USB (Samsung T7 en exFAT), inventado con la forma real de `diskutil info -plist`.
const DISKUTIL_SSD_USB = plist({
    BusProtocol: "USB",
    DeviceIdentifier: "disk5s1",
    FilesystemName: "ExFAT",
    FilesystemType: "exfat",
    Internal: false,
    MediaName: "Samsung PSSD T7 Media",
    RemovableMedia: false,
    RemovableMediaOrExternalDevice: true,
    SolidState: true,
    VolumeName: "SSD Externo",
    WritableVolume: true,
});
const DISKUTIL_DMG = plist({ BusProtocol: "Disk Image", Internal: false, VolumeName: "Instalador", WritableVolume: false });
const SYSTEM_PROFILER = JSON.stringify({
    SPDisplaysDataType: [
        {
            _name: "Apple M1",
            spdisplays_mtlgpufamilysupport: "spdisplays_metal3",
            spdisplays_vendor: "sppci_vendor_Apple",
            sppci_bus: "spdisplays_builtin",
            sppci_cores: "8",
            sppci_device_type: "spdisplays_gpu",
            sppci_model: "Apple M1",
        },
    ],
});

/* ── Linux con NVIDIA (fixtures realistas) ── */
const OS_RELEASE = 'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nID=ubuntu\n';
const LSBLK = JSON.stringify({
    blockdevices: [
        {
            name: "nvme0n1", mountpoint: null, tran: "nvme", rota: false, rm: false, size: 512110190592, fsavail: null, fstype: null, type: "disk",
            children: [
                { name: "nvme0n1p1", mountpoint: "/boot/efi", tran: null, rota: false, rm: false, size: 536870912, fsavail: 530579456, fstype: "vfat", type: "part" },
                { name: "nvme0n1p2", mountpoint: "/", tran: null, rota: false, rm: false, size: 511571820544, fsavail: 214748364800, fstype: "ext4", type: "part" },
            ],
        },
        {
            name: "sda", mountpoint: null, tran: "usb", rota: false, rm: false, size: 1000204886016, fsavail: null, fstype: null, type: "disk",
            children: [{ name: "sda1", mountpoint: "/media/alex/T7", tran: null, rota: false, rm: false, size: 1000202241024, fsavail: 858993459200, fstype: "exfat", type: "part" }],
        },
        {
            name: "sdb", mountpoint: null, tran: "sata", rota: true, rm: false, size: 2000398934016, fsavail: null, fstype: null, type: "disk",
            children: [
                { name: "sdb1", mountpoint: "/mnt/datos", tran: null, rota: true, rm: false, size: 1900397795328, fsavail: 1500000000000, fstype: "ext4", type: "part" },
                { name: "sdb2", mountpoint: "/home/alex/modelos", tran: null, rota: true, rm: false, size: 100000000000, fsavail: 50000000000, fstype: "ext4", type: "part" },
            ],
        },
        {
            // lsblk antiguo: números y booleanos como texto, y `mountpoints` en vez de `mountpoint`.
            name: "mmcblk0", mountpoint: null, tran: null, rota: "0", rm: "1", size: "63864569856", fsavail: null, fstype: null, type: "disk",
            children: [{ name: "mmcblk0p1", mountpoints: ["/media/alex/SD"], tran: null, rota: "0", rm: "1", size: "63863521280", fsavail: "60000000000", fstype: "exfat", type: "part" }],
        },
        { name: "zram0", mountpoint: "[SWAP]", tran: null, rota: false, rm: false, size: 8589934592, fsavail: null, fstype: "swap", type: "disk" },
        { name: "loop0", mountpoint: "/snap/core22/1380", tran: null, rota: false, rm: false, size: 77492224, fsavail: 0, fstype: "squashfs", type: "loop" },
    ],
});
const NVIDIA_SMI = "NVIDIA GeForce RTX 3060, 12288\n";
const CPUINFO_X86 = [
    "processor\t: 0",
    "model name\t: AMD Ryzen 7 5800X 8-Core Processor",
    "flags\t\t: fpu vme sse sse2 avx avx2 fma bmi2 avx512f avx512bw",
    "",
    "processor\t: 1",
    "model name\t: AMD Ryzen 7 5800X 8-Core Processor",
    "flags\t\t: fpu vme sse sse2 avx avx2 fma bmi2 avx512f avx512bw",
].join("\n");
const CPUINFO_ARM = "processor\t: 0\nBogoMIPS\t: 108.00\nFeatures\t: fp asimd evtstrm crc32 cpuid\n\nprocessor\t: 1\nFeatures\t: fp asimd evtstrm crc32 cpuid\n\nModel\t\t: Raspberry Pi 5 Model B Rev 1.0\n";
const MEMINFO = "MemTotal:       32768000 kB\nMemFree:         1024000 kB\nMemAvailable:   20480000 kB\nSwapTotal:             0 kB\nSwapFree:              0 kB\n";

describe("parsers de macOS (Mac M1 de Alex)", () => {
    it("sistema, arquitectura, chip, RAM y núcleos", () => {
        expect(soDeSwVers(SW_VERS)).toBe("macOS 26.3.1");
        expect(macosMayor("macOS 26.3.1")).toBe(26);
        expect(arquitecturaDe("arm64\n")).toBe("arm64");
        expect(arquitecturaDe("aarch64")).toBe("arm64");
        expect(arquitecturaDe("x86_64")).toBe("x86_64");
        expect(arquitecturaDe("riscv64")).toBe("otra");
        expect(sysctlMac(SYSCTL)).toEqual({ chip: "Apple M1", ramGb: 8, nucleos: 8 });
        // sysctl salta una clave que no existe: el orden de las líneas no importa.
        expect(sysctlMac("8\n8589934592\n")).toEqual({ ramGb: 8, nucleos: 8 });
    });

    it("RAM libre = libres + inactivas + especulativas (≈ 1 GB, no los 61 MB de «free»)", () => {
        // (3928 + 54958 + 5354) × 16384 B = 1.003,8 MiB
        expect(ramLibreGbDeVmStat(VM_STAT)).toBe(0.98);
        expect(ramLibreGbDeVmStat("basura")).toBeNull();
    });

    it("GPU de Apple Silicon: memoria unificada y Metal 4 desde macOS 26", () => {
        expect(gpusDeSystemProfiler(SYSTEM_PROFILER, { macosMayor: 26 })).toEqual([
            { nombre: "Apple M1 · GPU de 8 núcleos", memoriaUnificada: true, api: ["metal4"] },
        ]);
        expect(gpusDeSystemProfiler(SYSTEM_PROFILER, { macosMayor: 15 })[0].api).toEqual(["metal3"]);
        const amd = JSON.stringify({
            SPDisplaysDataType: [{ sppci_model: "AMD Radeon Pro 5500M", spdisplays_vram: "8 GB", spdisplays_mtlgpufamilysupport: "spdisplays_metal3" }],
        });
        expect(gpusDeSystemProfiler(amd, { macosMayor: 15 })).toEqual([{ nombre: "AMD Radeon Pro 5500M", vramGb: 8, memoriaUnificada: false, api: ["metal3"] }]);
        expect(gpusDeSystemProfiler("{no es json")).toEqual([]);
    });

    it("df -kP: el sistema es «/» + Data, los montajes de sistema y los ocultos se ignoran", () => {
        const { sistema, datos, volumenes } = montajesMacRelevantes(filasDf(DF_KP));
        expect(sistema?.totalGb).toBe(228);
        expect(datos).toMatchObject({ totalGb: 228, libreGb: 9.2 });
        // Las imágenes .dmg se apartan después, con diskutil; aquí solo se quitan sistema y ocultos.
        expect(volumenes.map((v) => v.montaje)).toEqual(["/Volumes/SSD Externo", "/Volumes/Instalador"]);
        expect(volumenes[0]).toMatchObject({ totalGb: 931.1, libreGb: 816.1 });
    });

    it("diskutil -plist: SSD externo USB → externo, ssd, usb", () => {
        const info = infoDeDiskutilPlist(DISKUTIL_SSD_USB);
        expect(info).toMatchObject({ interno: false, protocolo: "USB", ssd: true, extraible: true, escribible: true, sistemaArchivos: "exfat", nombre: "SSD Externo" });
        const fila = filasDf(DF_KP).find((f) => f.montaje === "/Volumes/SSD Externo")!;
        expect(volumenMac(fila, info)).toEqual({
            montaje: "/Volumes/SSD Externo",
            nombre: "SSD Externo",
            totalGb: 931.1,
            libreGb: 816.1,
            externo: true,
            tipoDisco: "ssd",
            conexion: "usb",
            sistemaArchivos: "exfat",
        });
    });

    it("diskutil: interno Apple Fabric → nvme interno; caja PCI-Express fuera → Thunderbolt; HDD; red", () => {
        const fila = { dispositivo: "/dev/disk3s5", montaje: "/", totalGb: 228, libreGb: 9.2 };
        expect(volumenMac(fila, infoDeDiskutilPlist(DISKUTIL_DATOS))).toMatchObject({ externo: false, tipoDisco: "nvme", conexion: "interna" });
        const tb = { dispositivo: "/dev/disk8s1", montaje: "/Volumes/Rapido", totalGb: 1862.6, libreGb: 1500 };
        expect(volumenMac(tb, { interno: false, protocolo: "PCI-Express", ssd: true })).toMatchObject({ externo: true, tipoDisco: "nvme", conexion: "thunderbolt" });
        expect(volumenMac(tb, { interno: false, protocolo: "USB", ssd: false })).toMatchObject({ tipoDisco: "hdd", conexion: "usb" });
        const nas = { dispositivo: "//alex@nas.local/Modelos", montaje: "/Volumes/Modelos", totalGb: 3725, libreGb: 2000 };
        const v = volumenMac(nas, null);
        expect(v).toMatchObject({ externo: true, tipoDisco: "red", conexion: "red", nombre: "Modelos" });
        // El dispositivo (con usuario@host) nunca sale en la respuesta.
        expect(JSON.stringify(v)).not.toContain("alex@");
        expect(volumenMac(tb, { interno: false, protocolo: "USB", ssd: true, escribible: false }).soloLectura).toBe(true);
    });

    it("herramientas: swift-6.0.2, xcode-26, python-3.14, node-22, cmake, clang (Apple aparte)", () => {
        expect(herramientaDe("swift", SWIFT)).toBe("swift-6.0.2");
        expect(herramientaDe("swift", "Swift version 6.2 (swift-6.2-RELEASE)")).toBe("swift-6.2");
        expect(herramientaDe("xcode", "Xcode 26.0\nBuild version 17A324")).toBe("xcode-26");
        expect(herramientaDe("xcode", XCODEBUILD_ERROR)).toBeNull();
        expect(herramientaDe("python", "Python 3.14.0")).toBe("python-3.14");
        expect(herramientaDe("node", "v22.11.0")).toBe("node-22");
        expect(herramientaDe("cmake", "cmake version 3.31.2\n\nCMake suite maintained…")).toBe("cmake-3.31");
        expect(herramientaDe("clang", "Apple clang version 16.0.0 (clang-1600.0.26.4)")).toBe("apple-clang-16");
        expect(herramientaDe("clang", "Ubuntu clang version 18.1.3 (1ubuntu1)")).toBe("clang-18");
    });

    it("Neural Engine por chip", () => {
        expect(npuApple("Apple M1")).toEqual({ nombre: "Apple Neural Engine", tops: 11 });
        expect(npuApple("Intel(R) Core(TM) i7")).toBeUndefined();
    });
});

describe("parsers de Linux", () => {
    it("os-release empieza por «Linux» para casar con `so: [\"Linux\"]`", () => {
        expect(soDeOsRelease(OS_RELEASE)).toBe("Linux (Ubuntu 24.04.1 LTS)");
        expect(soDeOsRelease("NAME=Debian\nVERSION_ID=12\n")).toBe("Linux (Debian 12)");
        expect(soDeOsRelease("")).toBe("Linux");
    });

    it("lsblk: interno NVMe, SSD USB, HDD SATA, SD; sin EFI, swap ni snaps; home → ~", () => {
        const v = volumenesDeLsblk(LSBLK, "/home/alex");
        expect(v.map((x) => x.montaje)).toEqual(["/", "/media/alex/T7", "/mnt/datos", "~/modelos", "/media/alex/SD"]);
        expect(v[0]).toMatchObject({ nombre: "Disco del sistema", externo: false, tipoDisco: "nvme", conexion: "interna", totalGb: 476.4, libreGb: 200, sistemaArchivos: "ext4" });
        expect(v[1]).toMatchObject({ nombre: "T7", externo: true, tipoDisco: "ssd", conexion: "usb", libreGb: 800 });
        expect(v[2]).toMatchObject({ externo: false, tipoDisco: "hdd", conexion: "interna" });
        expect(v[4]).toMatchObject({ nombre: "SD", externo: true, tipoDisco: "sd" });
        expect(JSON.stringify(v)).not.toContain("/home/alex");
        expect(volumenesDeLsblk("no json")).toEqual([]);
    });

    it("nvidia-smi, cpuinfo y meminfo", () => {
        expect(gpusDeNvidiaSmi(NVIDIA_SMI)).toEqual([{ nombre: "NVIDIA GeForce RTX 3060", vramGb: 12, memoriaUnificada: false, api: ["cuda"] }]);
        expect(gpusDeNvidiaSmi("")).toEqual([]);
        expect(cpuDeProcCpuinfo(CPUINFO_X86)).toEqual({ modelo: "AMD Ryzen 7 5800X 8-Core Processor", nucleos: 2, simd: ["avx2", "avx512"] });
        expect(cpuDeProcCpuinfo(CPUINFO_ARM)).toEqual({ modelo: "Raspberry Pi 5 Model B Rev 1.0", nucleos: 2, simd: ["neon"] });
        expect(ramDeMeminfo(MEMINFO)).toEqual({ ramGb: 31.3, ramLibreGb: 19.53 });
    });
});

describe("servidores y runtimes", () => {
    it("cada forma de respuesta", () => {
        expect(interpretarServidor({ forma: "salud" }, 200, '{"status":"ok"}')).toEqual({ ok: true });
        expect(interpretarServidor({ forma: "ollama" }, 200, JSON.stringify({ models: [{ name: "bitnet:2b" }, { name: "qwen3:4b" }] }))).toEqual({
            ok: true,
            modelos: ["bitnet:2b", "qwen3:4b"],
        });
        // El 8080 es un puerto común: un 200 con HTML no es TurboFieldfare.
        expect(interpretarServidor({ forma: "openai" }, 200, "<html>otra cosa</html>")).toEqual({ ok: false });
        expect(interpretarServidor({ forma: "openai" }, 200, JSON.stringify({ data: [{ id: "gemma-4-26b-a4b" }] }))).toEqual({ ok: true, modelos: ["gemma-4-26b-a4b"] });
        // freellmapi sin clave: el 401 dice que está vivo.
        expect(interpretarServidor({ forma: "openai", vivoCon401: true }, 401, "")).toEqual({ ok: true });
        expect(interpretarServidor({ forma: "openai" }, 401, "")).toEqual({ ok: false });
    });

    it("runtimes por ejecutables, carpetas conocidas y servidores vivos", () => {
        expect(
            runtimesDe({
                ejecutables: ["ollama", "llama-server"],
                carpetas: ["~/Documents/IA 1.58 bit"],
                servidores: [{ id: "turbo-fieldfare", ok: true }, { id: "lmstudio", ok: false }],
            }),
        ).toEqual(["bitnet-cpp", "llama-cpp", "ollama", "turbo-fieldfare"]);
    });

    it("sinHome cambia el home por ~ también dentro de frases", () => {
        expect(sinHome("no se pudo leer /Users/alex/turbo-fieldfare", "/Users/alex")).toBe("no se pudo leer ~/turbo-fieldfare");
        expect(sinHome("/Volumes/SSD", "/")).toBe("/Volumes/SSD");
    });
});

/* ── Orquestación con dependencias simuladas ── */

function depMac(extra: Partial<DependenciasDeteccion> = {}, colgar: string[] = []): DependenciasDeteccion {
    const salidas: Record<string, string> = {
        "sw_vers": SW_VERS,
        "uname -m": "arm64\n",
        "sysctl -n machdep.cpu.brand_string hw.memsize hw.ncpu": SYSCTL,
        "vm_stat": VM_STAT,
        "system_profiler SPDisplaysDataType -json": SYSTEM_PROFILER,
        "df -kP": DF_KP,
        "diskutil info -plist /System/Volumes/Data": DISKUTIL_DATOS,
        "diskutil info -plist /Volumes/SSD Externo": DISKUTIL_SSD_USB,
        "diskutil info -plist /Volumes/Instalador": DISKUTIL_DMG,
        "xcode-select -p": "/Library/Developer/CommandLineTools\n",
        "swift --version": SWIFT,
        "python3 --version": "Python 3.14.0\n",
        "node --version": "v22.11.0\n",
        "clang --version": "Apple clang version 16.0.0 (clang-1600.0.26.4)\n",
        "which ollama": "/opt/homebrew/bin/ollama\n",
    };
    return {
        plataforma: "darwin",
        home: "/Users/alex",
        host: "MacBook-Air-de-Alex.local",
        correr: (orden: string, args: string[]): Promise<SalidaOrden> => {
            const clave = [orden, ...args].join(" ");
            if (colgar.includes(clave)) return new Promise(() => {});
            const s = salidas[clave];
            return s === undefined ? Promise.reject(new Error(`falla: ${clave}`)) : Promise.resolve({ stdout: s, stderr: "" });
        },
        leer: () => Promise.reject(new Error("no existe")),
        existe: (ruta) => Promise.resolve(ruta === "/Users/alex/Documents/IA 1.58 bit"),
        pedir: (url) =>
            url === "http://127.0.0.1:8790/health"
                ? Promise.resolve({ status: 200, cuerpo: '{"status":"ok"}' })
                : url === "http://127.0.0.1:11434/api/tags"
                  ? Promise.resolve({ status: 200, cuerpo: JSON.stringify({ models: [{ name: "bitnet-b1.58-2b" }] }) })
                  : Promise.reject(new Error("ECONNREFUSED")),
        respaldo: { arch: "arm64", nucleos: 8, ramBytes: 8589934592, libreBytes: 100_000_000, versionNode: "v22.22.2" },
        ahora: () => new Date("2026-10-23T10:00:00Z"),
        ...extra,
    };
}

describe("detectarMaquinaCon · Mac M1 de Alex con un SSD externo USB", () => {
    it("lo junta todo, sin home real ni imágenes de disco", async () => {
        const m = await detectarMaquinaCon(depMac());
        expect(m).toMatchObject({
            t: "2026-10-23T10:00:00.000Z",
            host: "MacBook-Air-de-Alex",
            so: "macOS 26.3.1",
            arquitectura: "arm64",
            chip: "Apple M1",
            nucleos: 8,
            ramGb: 8,
            ramLibreGb: 0.98,
            npu: { nombre: "Apple Neural Engine", tops: 11 },
            simdCpu: ["neon"],
        });
        expect(m.gpus).toEqual([{ nombre: "Apple M1 · GPU de 8 núcleos", memoriaUnificada: true, api: ["metal4"] }]);
        expect(m.volumenes).toEqual([
            { montaje: "/", nombre: "Macintosh HD", totalGb: 228, libreGb: 9.2, externo: false, tipoDisco: "nvme", conexion: "interna", sistemaArchivos: "apfs" },
            { montaje: "/Volumes/SSD Externo", nombre: "SSD Externo", totalGb: 931.1, libreGb: 816.1, externo: true, tipoDisco: "ssd", conexion: "usb", sistemaArchivos: "exfat" },
        ]);
        expect(m.herramientas).toEqual(["apple-clang-16", "node-22", "python-3.14", "swift-6.0.2"]);
        expect(m.runtimes).toEqual(["bitnet-cpp", "ollama"]);
        expect(m.servidoresIA.find((s) => s.id === "bitnet")).toEqual({ id: "bitnet", url: "http://127.0.0.1:8790", ok: true });
        expect(m.servidoresIA.find((s) => s.id === "ollama")?.modelos).toEqual(["bitnet-b1.58-2b"]);
        expect(m.servidoresIA.filter((s) => s.ok).map((s) => s.id)).toEqual(["bitnet", "ollama"]);
        expect(m.avisos.some((a) => a.includes("Sin Xcode"))).toBe(true);
        expect(JSON.stringify(m)).not.toContain("/Users/alex");
    });

    it("sin herramientas de desarrollo no lanza swift ni /usr/bin/python3 (abrirían el diálogo de macOS)", async () => {
        const pedidas: string[] = [];
        const base = depMac();
        const dep = depMac({
            correr: (orden, args) => {
                pedidas.push([orden, ...args].join(" "));
                return orden === "xcode-select" ? Promise.reject(new Error("no dev")) : base.correr(orden, args);
            },
        });
        const m = await detectarMaquinaCon(dep);
        expect(pedidas).not.toContain("swift --version");
        expect(pedidas).not.toContain("python3 --version");
        expect(m.herramientas).toEqual(["node-22"]);
    });

    it("corta en el plazo con lo que haya y lo dice; nunca lanza", async () => {
        const m = await detectarMaquinaCon(depMac({ plazoMs: 60 }, ["system_profiler SPDisplaysDataType -json"]));
        expect(m.so).toBe("macOS 26.3.1");
        expect(m.gpus).toEqual([]);
        expect(m.avisos.some((a) => a.includes("se cortó"))).toBe(true);
        const roto = await detectarMaquinaCon(
            depMac({ correr: () => Promise.reject(new Error("x")), pedir: () => Promise.reject(new Error("x")), existe: () => Promise.reject(new Error("x")) }),
        );
        // Sin ninguna orden: lo de Node, y el Node que sirve la ruta como herramienta.
        expect(roto).toMatchObject({ so: "macOS", arquitectura: "arm64", nucleos: 8, ramGb: 8, volumenes: [], herramientas: ["node-22"] });
        expect(roto.avisos.length).toBeGreaterThan(0);
    });
});

describe("detectarMaquinaCon · Linux con NVIDIA", () => {
    it("lsblk, nvidia-smi, cpuinfo y meminfo", async () => {
        const archivos: Record<string, string> = { "/etc/os-release": OS_RELEASE, "/proc/cpuinfo": CPUINFO_X86, "/proc/meminfo": MEMINFO };
        const salidas: Record<string, string> = {
            "uname -m": "x86_64\n",
            "lsblk -J -b -o NAME,MOUNTPOINT,TRAN,ROTA,RM,SIZE,FSAVAIL,FSTYPE,TYPE": LSBLK,
            "nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits": NVIDIA_SMI,
            "python3 --version": "Python 3.12.3\n",
            "which llama-server": "/usr/local/bin/llama-server\n",
        };
        const m = await detectarMaquinaCon({
            ...depMac(),
            plataforma: "linux",
            home: "/home/alex",
            host: "taller",
            correr: (o, a) => {
                const s = salidas[[o, ...a].join(" ")];
                return s === undefined ? Promise.reject(new Error("no")) : Promise.resolve({ stdout: s, stderr: "" });
            },
            leer: (r) => (archivos[r] !== undefined ? Promise.resolve(archivos[r]) : Promise.reject(new Error("no"))),
            existe: () => Promise.resolve(false),
            pedir: () => Promise.reject(new Error("no")),
        });
        expect(m).toMatchObject({ so: "Linux (Ubuntu 24.04.1 LTS)", arquitectura: "x86_64", chip: "AMD Ryzen 7 5800X 8-Core Processor", nucleos: 2, ramGb: 31.3, ramLibreGb: 19.53, simdCpu: ["avx2", "avx512"] });
        expect(m.gpus).toEqual([{ nombre: "NVIDIA GeForce RTX 3060", vramGb: 12, memoriaUnificada: false, api: ["cuda"] }]);
        expect(m.volumenes.filter((v) => v.externo).map((v) => v.nombre)).toEqual(["T7", "SD"]);
        expect(m.runtimes).toEqual(["llama-cpp"]);
        expect(m.herramientas).toEqual(["node-22", "python-3.12"]);
        expect(m.npu).toBeUndefined();
    });
});
