function entradaRepartoDesde(dep) {
  const perfil = dep.perfilDelMedio();
  const presupuesto = dep.presupuestoMedio(perfil);
  const instaladas = dep.capasInstaladas();
  const nodos = dep.nodosCapas();
  const preferencias = dep.preferenciasCapas();
  const apisFreeCatalog = dep.apisFreeCatalog();
  const presupuestoPago = dep.presupuestoPago?.();

  const disponibleParaPago = presupuestoPago?.disponible !== undefined && presupuestoPago.disponible > 0;

  const entrada = {
    tarea: "chat",
    dificultad: 0.5,
    privacidad: "publica",
    segundoPlano: presupuesto.segundo_plano ?? false,
    ambito: undefined,
    perfil,
    presupuesto: { discoMb: presupuesto.disco_mb ?? 0, ramMb: presupuesto.ram_mb ?? 0 },
    instaladas,
    nodos,
    preferencias,
    tipoCapa: presupuesto.capas_guardables?.[0] ?? "reflejo",
    disponibleParaPago,
    plan: null,
  };

  if (entrada.tipoCapa === "reflejo" && apisFreeCatalog.length > 0) {
    entrada.plan = { capa: "reflejo", modelo: "astraura-158/auto", donde: "api-gratis", motivo: "planificado desde API gratuita" };
  }

  return entrada;
}

export { entradaRepartoDesde };
