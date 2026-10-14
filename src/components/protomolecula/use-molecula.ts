"use client";

import { useEffect, useRef, useState } from "react";
import type { Ambito, Autor, Molecula, Rol } from "@/lib/protomolecula/tipos";
import { crearMolecula } from "@/lib/protomolecula/molecula-estado";
import { guardarMolecula, cargarMolecula, listarMoleculas, almacenNavegador } from "@/lib/protomolecula/almacen-moleculas";
import { registrarControlador } from "@/lib/protomolecula/controlador-activo";
import { crearControlador } from "@/lib/protomolecula/controlador";

export function useMolecula(opts?: { moleculaId?: string; ambito?: Ambito }) {
   const [controlador, setControlador] = useState<ReturnType<typeof crearControlador> | null>(null);
   const [estado, setEstado] = useState<ReturnType<typeof crearControlador>["obtener"] | null>(null);
   const [autor, setAutor] = useState<Autor>({ tipo: "persona", id: "local", nombre: "Yo" });
   const [rol, setRol] = useState<Rol>("dueno");
   
   // Efecto para inicializar la molécula y el controlador
   useEffect(() => {
     async function inicializar() {
       let molecula: Molecula | null = null;
       
       // Si se proporciona un ID de molécula, intentar cargarla
       if (opts?.moleculaId) {
         const almacen = almacenNavegador();
         if (almacen) {
           molecula = await cargarMolecula(almacen, opts.moleculaId);
         }
       }
       
       // Si no se proporcionó ID o no se encontró la molécula, intentar cargar la más reciente
       if (!molecula) {
         const almacen = almacenNavegador();
         if (almacen) {
           const moleculas = await listarMoleculas(almacen);
           if (moleculas.length > 0) {
             // Ordenar por actualizadaEn descendente y tomar la primera
             const masReciente = [...moleculas].sort((a, b) => b.actualizadaEn - a.actualizadaEn)[0];
             molecula = await cargarMolecula(almacen, masReciente.id);
           }
         }
       }
       
       // Si aún no hay molécula, crear una nueva
       if (!molecula) {
         const almacen = almacenNavegador();
         if (almacen) {
           // Convertir ambito string to Ambito type
           const ambitoMap: Record<string, Ambito> = {
             personal: "personal",
             perfil: "perfil",
             privado: "privado",
             publico: "publica",
             grupo: "grupo"
           };
           const ambitoValor = opts?.ambito ?? "personal";
           const ambitoTyped: Ambito = ambitoMap[ambitoValor] || "personal";
           
           molecula = await crearMolecula({
             titulo: "Mi primera molécula",
             ambito: ambitoTyped,
             capas: [],
             atomos: [],
             valores: {},
             version: 1,
             creadaEn: Date.now(),
             actualizadaEn: Date.now()
           }, Date.now());
           await guardarMolecula(almacen, molecula);
         }
       }
       
       // Crear el controlador con rol de dueño
       if (molecula) {
         const controladorNuevo = crearControlador({
           molecula,
           rol: "dueno",
           autor: autor,
           ahora: () => Date.now(),
           nuevoId: () => Math.random().toString(36).substr(2, 9)
         });
         
         // Suscribirse a los cambios del controlador
         const suscripcion = controladorNuevo.suscribir((estadoNuevo) => {
           setEstado(estadoNuevo);
         });
         
         // Registrar el controlador
         const unregister = registrarControlador(molecula.id, controladorNuevo);
         
         setControlador(controladorNuevo);
         
         // Devolver la suscripción para limpiar al desmontar
         return () => {
           suscripcion();
           unregister();
         };
       }
     }
     
     inicializar();
   }, [opts, autor]);
   
   // Auto-guardado con debounce de 400ms
   useEffect(() => {
     if (!controlador || !estado) return;
     
     const handler = setTimeout(async () => {
       const moleculaActual = controlador.obtener();
       if (moleculaActual.molecula) {
         const almacen = almacenNavegador();
         if (almacen) {
           await guardarMolecula(almacen, moleculaActual.molecula);
         }
       }
     }, 400);
     
     return () => clearTimeout(handler);
   }, [controlador, estado]);
   
   return { controlador, estado, autor, rol };
 }