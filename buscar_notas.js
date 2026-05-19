const notas = require("./notas.json");

/**
 * Busca notas relevantes en la base de conocimiento.
 * Usa coincidencia de síntomas, componentes y sistema.
 * Devuelve las notas ordenadas por relevancia (más coincidencias primero).
 */
function buscarNotasRelevantes(mensajeTecnico) {
  const mensaje = mensajeTecnico.toLowerCase();

  const resultados = notas.map(nota => {
    let score = 0;

    // Coincidencia por síntomas (peso alto)
    const sintomasCoincidentes = nota.sintomas.filter(s => mensaje.includes(s.toLowerCase()));
    score += sintomasCoincidentes.length * 3;

    // Coincidencia por componentes (peso medio)
    const componentesCoincidentes = nota.componentes.filter(c => mensaje.includes(c.toLowerCase()));
    score += componentesCoincidentes.length * 2;

    // Coincidencia por sistema (peso medio)
    if (mensaje.includes(nota.sistema.toLowerCase())) {
      score += 2;
    }

    // Coincidencia por ID del nodo
    if (mensaje.includes(nota.id.toLowerCase())) {
      score += 5;
    }

    // Coincidencia por palabras del título
    const palabrasTitulo = nota.titulo.toLowerCase().split(/\s+/);
    const tituloCoincidencias = palabrasTitulo.filter(p => p.length > 3 && mensaje.includes(p));
    score += tituloCoincidencias.length;

    return { nota, score };
  });

  // Filtrar solo las que tienen alguna coincidencia
  const relevantes = resultados
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (relevantes.length === 0) return null;

  // Devolver máximo 3 notas más relevantes
  return relevantes.slice(0, 3).map(r => {
    const n = r.nota;
    return `═══════════════════════════════════════
NODO: ${n.id}
CATEGORÍA: ${n.categoria}
SISTEMA: ${n.sistema}
TÍTULO: ${n.titulo}
VEHÍCULO: ${n.vehiculo}
───────────────────────────────────────
RESUMEN: ${n.resumen}
───────────────────────────────────────
PARÁMETROS VITALES:
${n.parametros_vitales.map(p => "  • " + p).join("\n")}
───────────────────────────────────────
DIAGNÓSTICO LÓGICO:
${n.diagnostico_logico.map(d => "  → " + d).join("\n")}
───────────────────────────────────────
VERIFICACIÓN: ${n.verificacion}
RESOLUCIÓN: ${n.resolucion}
FALSO DIAGNÓSTICO COMÚN: ${n.falso_diagnostico}
CAUSA RAÍZ: ${n.causa_raiz}
NIVEL DE EVIDENCIA: ${n.nivel_evidencia}
═══════════════════════════════════════`;
  }).join("\n\n");
}

module.exports = buscarNotasRelevantes;
