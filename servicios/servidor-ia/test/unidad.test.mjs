import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Prueba de la unidad systemd y de su instalador (RIA1023B): contratos exactos de la
// unidad de usuario y del guion (arranque solo con --encender; sin claves en el repo).

const CARPETA = resolve(dirname(fileURLToPath(import.meta.url)), "..", "systemd");
const unidad = readFileSync(resolve(CARPETA, "starseed-servidor-ia.service"), "utf8");
const instalar = readFileSync(resolve(CARPETA, "instalar.sh"), "utf8");
const EXECSTART = "ExecStart=/usr/bin/env node %h/starseed-system/servicios/servidor-ia/bin/servidor-ia.mjs";

test("la unidad es de usuario y arranca el servidor con reinicio y su entorno", () => {
    assert.ok(unidad.includes(EXECSTART));
    assert.match(unidad, /^Type=simple$/m);
    assert.match(unidad, /^Restart=on-failure$/m);
    assert.match(unidad, /^RestartSec=30$/m);
    assert.match(unidad, /^EnvironmentFile=-%h\/\.starseed\/servidor-ia\.env$/m);
    assert.match(unidad, /^WantedBy=default\.target$/m);
});

test("la unidad no fija claves: host, puerto y token los pone el archivo de entorno", () => {
    assert.doesNotMatch(unidad, /STARSEED_SERVIDOR_IA_(TOKEN|HOST|PUERTO|ORIGENES)\s*=/);
});

test("instalar.sh: sintaxis válida y daemon-reload antes de encender", () => {
    execFileSync("bash", ["-n", resolve(CARPETA, "instalar.sh")]);
    const recarga = instalar.indexOf("systemctl --user daemon-reload");
    const encender = instalar.indexOf('[ "$ENCENDER" = "yes" ]');
    const arrancar = instalar.indexOf('systemctl --user enable --now "$SERVICIO"');
    assert.ok(recarga > -1, "hace systemd --user daemon-reload");
    assert.ok(encender > -1, "distingue el argumento --encender");
    assert.ok(recarga < encender, "la recarga corre siempre, antes del arranque");
    assert.ok(arrancar > encender, "enable --now solo ocurre dentro de la rama de --encender");
});

test("instalar.sh: rechaza argumentos distintos a --encender", () => {
    assert.throws(
        () => execFileSync("bash", [resolve(CARPETA, "instalar.sh"), "--lo-que-no"], { encoding: "utf8" }),
        (e) => e.status === 2,
    );
});

test("instalar.sh: el ejemplo del archivo de entorno solo enseña nombres", () => {
    assert.doesNotMatch(instalar, /STARSEED_SERVIDOR_IA_(TOKEN|ORIGENES)=[ \t]*\S/);
});
