import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { commitsQuePublica } from "@/lib/mando/publicaciones";
import {
    argsConCuenta,
    cuentaDenegada,
    cuentasDeGh,
    esFalloDeRed,
    pushReparable,
    queHaceFalta,
    repoDeUrl,
} from "@/lib/mando/push-reparable";

const DENEGADO = [
    "remote: Permission to StarSeedSystem/astraura.git denied to alexbordongarrigos.",
    "fatal: unable to access 'https://github.com/StarSeedSystem/astraura.git/': The requested URL returned error: 403",
].join("\n");

const ESTADO_GH = [
    "github.com",
    "  ✓ Logged in to github.com account alexbordongarrigos (keyring)",
    "  - Active account: true",
    "  ✓ Logged in to github.com account StarSeedSystem (keyring)",
    "  - Active account: false",
].join("\n");

function carpeta(): string {
    return mkdtempSync(path.join(tmpdir(), "push-reparable-"));
}

function fallo(stderr: string): Error & { stderr: string } {
    return Object.assign(new Error("git falló"), { stderr });
}

describe("piezas puras", () => {
    it("lee la cuenta y el repo del 403 de GitHub", () => {
        expect(cuentaDenegada(DENEGADO)).toEqual({ repo: "StarSeedSystem/astraura", usuario: "alexbordongarrigos" });
        expect(cuentaDenegada("rejected: non-fast-forward")).toBeNull();
    });

    it("lista las cuentas con sesión en gh", () => {
        expect(cuentasDeGh(ESTADO_GH)).toEqual(["alexbordongarrigos", "StarSeedSystem"]);
    });

    it("distingue un corte de red de un rechazo", () => {
        expect(esFalloDeRed("fatal: unable to access: Could not resolve host: github.com")).toBe(true);
        expect(esFalloDeRed("The requested URL returned error: 502")).toBe(true);
        expect(esFalloDeRed(DENEGADO)).toBe(false);
        expect(esFalloDeRed("! [rejected] main -> main (fetch first)")).toBe(false);
    });

    it("saca owner/repo de la URL del remoto", () => {
        expect(repoDeUrl("https://github.com/StarSeedSystem/astraura.git\n")).toBe("StarSeedSystem/astraura");
        expect(repoDeUrl("git@github.com:StarSeedSystem/starseed-system.git")).toBe("StarSeedSystem/starseed-system");
        expect(repoDeUrl("https://gitlab.com/x/y.git")).toBeNull();
    });

    it("arma el ayudante sin dejar entrar nada que no sea un nombre de cuenta", () => {
        const a = argsConCuenta(["push", "origin", "abc:refs/heads/main"], "StarSeedSystem", "/opt/homebrew/bin/gh");
        expect(a.slice(0, 3)).toEqual(["-c", "credential.helper=", "-c"]);
        expect(a[3]).toContain("auth token --user StarSeedSystem");
        expect(a.slice(4)).toEqual(["push", "origin", "abc:refs/heads/main"]);
        expect(() => argsConCuenta(["push"], "x; rm -rf ~", "gh")).toThrow();
    });

    it("dice qué hace falta con el enlace exacto", () => {
        const t = queHaceFalta("StarSeedSystem/astraura", "alexbordongarrigos", ["StarSeedSystem"]);
        expect(t).toContain("https://github.com/StarSeedSystem/astraura/settings/access");
        expect(t).toContain("gh auth login");
    });

    it("cuenta los commits que sube de verdad un `hasta`", () => {
        // 11 delante y `hasta` es el más nuevo (posición 0): suben los 11, no 1.
        expect(commitsQuePublica(11, 0)).toBe(11);
        expect(commitsQuePublica(11, 10)).toBe(1);
        expect(commitsQuePublica(11, -1)).toBe(11);
    });
});

describe("pushReparable", () => {
    it("ante el 403 prueba con la otra cuenta, publica y la recuerda", async () => {
        const dir = carpeta();
        const llamadas: string[][] = [];
        const r = await pushReparable({
            cwd: dir,
            args: ["push", "origin", "3fee41c:refs/heads/main"],
            carpetaMemoria: dir,
            urlRemoto: async () => "https://github.com/StarSeedSystem/astraura.git",
            estadoGh: async () => ESTADO_GH,
            esperar: async () => undefined,
            ejecutar: async (a) => {
                llamadas.push(a);
                if (a[0] === "push") throw fallo(DENEGADO);
                return { stdout: "", stderr: "To https://github.com/StarSeedSystem/astraura.git\n   175eb3a..3fee41c  main" };
            },
        });
        expect(r.ok).toBe(true);
        expect(r.cuenta).toBe("StarSeedSystem");
        expect(r.reparado).toContain("solo puede leer StarSeedSystem/astraura");
        expect(llamadas).toHaveLength(2);
        const memoria = JSON.parse(readFileSync(path.join(dir, "cuentas-push.json"), "utf8"));
        expect(memoria).toEqual({ "StarSeedSystem/astraura": "StarSeedSystem" });
    });

    it("con la cuenta ya recordada empuja con ella a la primera", async () => {
        const dir = carpeta();
        writeFileSync(path.join(dir, "cuentas-push.json"), JSON.stringify({ "StarSeedSystem/astraura": "StarSeedSystem" }));
        const llamadas: string[][] = [];
        const r = await pushReparable({
            cwd: dir,
            args: ["push", "origin", "a:refs/heads/main"],
            carpetaMemoria: dir,
            urlRemoto: async () => "https://github.com/StarSeedSystem/astraura.git",
            estadoGh: async () => ESTADO_GH,
            ejecutar: async (a) => {
                llamadas.push(a);
                return { stdout: "", stderr: "ok" };
            },
        });
        expect(r.ok).toBe(true);
        expect(llamadas).toHaveLength(1);
        expect(llamadas[0][3]).toContain("--user StarSeedSystem");
    });

    it("un corte de red se reintenta y sale", async () => {
        const dir = carpeta();
        let n = 0;
        const r = await pushReparable({
            cwd: dir,
            args: ["push", "origin", "a:refs/heads/main"],
            carpetaMemoria: dir,
            urlRemoto: async () => "https://github.com/StarSeedSystem/starseed-system.git",
            estadoGh: async () => ESTADO_GH,
            esperar: async () => undefined,
            ejecutar: async () => {
                n += 1;
                if (n < 3) throw fallo("fatal: unable to access: Could not resolve host: github.com");
                return { stdout: "", stderr: "ok" };
            },
        });
        expect(r.ok).toBe(true);
        expect(n).toBe(3);
    });

    it("si ninguna cuenta puede, falla diciendo qué hace falta", async () => {
        const dir = carpeta();
        const r = await pushReparable({
            cwd: dir,
            args: ["push", "origin", "a:refs/heads/main"],
            carpetaMemoria: dir,
            urlRemoto: async () => "https://github.com/StarSeedSystem/astraura.git",
            estadoGh: async () => ESTADO_GH,
            esperar: async () => undefined,
            ejecutar: async () => {
                throw fallo(DENEGADO);
            },
        });
        expect(r.ok).toBe(false);
        expect(r.salida).toContain("Hace falta UNA de estas dos cosas");
    });

    it("un rechazo por historia no se toca: no es de cuentas ni de red", async () => {
        const dir = carpeta();
        let n = 0;
        const r = await pushReparable({
            cwd: dir,
            args: ["push", "origin", "a:refs/heads/main"],
            carpetaMemoria: dir,
            urlRemoto: async () => "https://github.com/StarSeedSystem/astraura.git",
            estadoGh: async () => ESTADO_GH,
            esperar: async () => undefined,
            ejecutar: async () => {
                n += 1;
                throw fallo("! [rejected] main -> main (fetch first)");
            },
        });
        expect(r.ok).toBe(false);
        expect(n).toBe(1);
    });
});
