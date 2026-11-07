/*
 * StarSeed OS — compatibilidad del service worker (SW1107A · 2026-11-07).
 *
 * El service worker vigente es /sw-v8.js (la app entera sin conexión). Una pestaña abierta con una
 * versión anterior de la web aún registra /sw-v7.js: recibe el MISMO código, así no vuelve el v7
 * (que al activarse borraba todas las cachés que no eran suyas, precarga sin conexión incluida).
 * Ver public/sw-v8.js y architecture/apps-autonomas-sin-internet.md §9.1.
 */
importScripts("/sw-v8.js");
