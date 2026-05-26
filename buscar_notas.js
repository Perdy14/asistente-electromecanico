const path = require("path");

/**
 * Busca notas relevantes en la base de conocimiento.
 * Devuelve el CONTENIDO COMPLETO de las notas mas relevantes para que la IA
 * tenga toda la informacion del documento original (no solo metadatos).
 */
function buscarNotasRelevantes(mensajeTecnico) {
  // Recargar siempre por si se actualizo
  delete require.cache[require.resolve("./notas.json")];
  const notas = require("./notas.json");
  const mensaje = mensajeTecnico.toLowerCase();

  const resultados = notas.map(nota => {
    let score = 0;

    // Coincidencia por sintomas (peso alto)
    if (nota.sintomas) {
      const sintomasCoincidentes = nota.sintomas.filter(s => mensaje.includes(s.toLowerCase()));
      score += sintomasCoincidentes.length * 5;
    }

    // Coincidencia por componentes
    if (nota.componentes) {
      const compCoincidentes = nota.componentes.filter(c => mensaje.includes(c.toLowerCase()));
      score += compCoincidentes.length * 3;
    }

    // Coincidencia por sistema
    if (nota.sistema && mensaje.includes(nota.sistema.toLowerCase())) {
      score += 3;
    }

    // Coincidencia por ID
    if (nota.id && mensaje.includes(nota.id.toLowerCase())) {
      score += 8;
    }

    // Coincidencia por palabras del titulo
    if (nota.titulo) {
      const palabrasTitulo = nota.titulo.toLowerCase().split(/\s+/);
      const tituloCoincidencias = palabrasTitulo.filter(p => p.length > 3 && mensaje.includes(p));
      score += tituloCoincidencias.length * 2;
    }

    // Busqueda de palabras clave en el contenido completo (peso bajo)
    if (nota.contenido_completo) {
      const palabrasMensaje = mensaje.split(/\s+/).filter(p => p.length > 4);
      let coincidencias = 0;
      palabrasMensaje.forEach(p => {
        if (nota.contenido_completo.toLowerCase().includes(p)) coincidencias++;
      });
      score += Math.min(coincidencias, 5); // max 5 puntos por contenido
    }

    return { nota, score };
  });

  const relevantes = resultados
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score);

  if (relevantes.length === 0) return null;

  // Devolver hasta 2 notas mas relevantes con su CONTENIDO COMPLETO
  return relevantes.slice(0, 2).map(r => {
    const n = r.nota;
    let texto = `═══════════════════════════════════════\n`;
    texto += `NOTA: ${n.id}\n`;
    texto += `TITULO: ${n.titulo}\n`;
    texto += `CATEGORIA: ${n.categoria}\n`;
    texto += `SISTEMA: ${n.sistema}\n`;
    texto += `VEHICULO: ${n.vehiculo || "General"}\n`;
    if (n.video) texto += `VIDEO REFERENCIA: ${n.video}\n`;
    texto += `NIVEL EVIDENCIA: ${n.nivel_evidencia}\n`;
    texto += `═══════════════════════════════════════\n`;
    texto += `CONTENIDO COMPLETO DEL DOCUMENTO:\n\n`;
    texto += n.contenido_completo || "(sin contenido)";
    texto += `\n═══════════════════════════════════════`;
    return texto;
  }).join("\n\n");
}

module.exports = buscarNotasRelevantes;
