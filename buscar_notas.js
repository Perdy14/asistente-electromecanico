/**
 * Buscador de notas tecnicas mejorado.
 * Busca palabras clave en multiples campos de cada nota:
 * sintomas, componentes, sistema, titulo, vehiculo, resumen, parametros, diagnostico, causa raiz.
 *
 * Devuelve las notas mas relevantes ordenadas por puntuacion.
 */

function normalizar(texto) {
  if (!texto) return "";
  return texto.toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quitar acentos
    .replace(/[^a-z0-9\s]/g, " ") // solo letras y numeros
    .replace(/\s+/g, " ")
    .trim();
}

function extraerPalabrasClave(texto) {
  const stopWords = new Set([
    "el","la","los","las","un","una","unos","unas","de","del","al","y","o","en","con","por","para",
    "que","como","cuando","donde","es","son","esta","estan","ser","tener","hacer","muy","mas","menos",
    "este","esta","ese","esa","aquel","aquella","tu","tus","mi","mis","su","sus","nos","te","me",
    "tengo","tiene","tienes","hay","fue","fui","sera","si","no","ni","tambien","pero","aunque",
    "ahora","ya","luego","despues","antes","quiero","puedo","pueda","necesito","necesita"
  ]);
  const norm = normalizar(texto);
  return norm.split(/\s+/).filter(p => p.length >= 3 && !stopWords.has(p));
}

function buscarNotasRelevantes(mensajeTecnico) {
  delete require.cache[require.resolve("./notas.json")];
  const notas = require("./notas.json");

  const palabrasClave = extraerPalabrasClave(mensajeTecnico);
  if (palabrasClave.length === 0) return null;

  const resultados = notas.map(nota => {
    let score = 0;

    // Texto completo de la nota normalizado para buscar
    const textoCompleto = normalizar([
      nota.titulo || "",
      nota.sistema || "",
      nota.vehiculo || "",
      nota.resumen || "",
      nota.causa_raiz || "",
      nota.verificacion || "",
      nota.resolucion || "",
      nota.falso_diagnostico || "",
      (nota.sintomas || []).join(" "),
      (nota.componentes || []).join(" "),
      (nota.parametros_vitales || []).join(" "),
      (nota.diagnostico_logico || []).join(" "),
      nota.id || "",
      nota.categoria || ""
    ].join(" "));

    // Sumar puntos por cada palabra clave que aparezca
    palabrasClave.forEach(palabra => {
      // Aparicion en titulo o id (peso muy alto)
      if (normalizar(nota.titulo || "").includes(palabra)) score += 5;
      if (normalizar(nota.id || "").includes(palabra)) score += 5;

      // Aparicion en sistema o vehiculo (peso alto)
      if (normalizar(nota.sistema || "").includes(palabra)) score += 4;
      if (normalizar(nota.vehiculo || "").includes(palabra)) score += 3;

      // Aparicion en sintomas o componentes (peso medio)
      const sintomas = normalizar((nota.sintomas || []).join(" "));
      const componentes = normalizar((nota.componentes || []).join(" "));
      if (sintomas.includes(palabra)) score += 3;
      if (componentes.includes(palabra)) score += 3;

      // Aparicion en cualquier otro campo (peso bajo)
      if (textoCompleto.includes(palabra)) score += 1;
    });

    // Bonus si todas las palabras clave aparecen
    const todasAparecen = palabrasClave.every(p => textoCompleto.includes(p));
    if (todasAparecen) score += 5;

    return { nota, score };
  });

  // Filtrar solo las que tienen suficiente coincidencia
  const relevantes = resultados
    .filter(r => r.score >= 3) // umbral minimo
    .sort((a, b) => b.score - a.score)
    .slice(0, 3); // maximo 3 notas

  if (relevantes.length === 0) return null;

  return relevantes.map(r => {
    const n = r.nota;
    return `═══════════════════════════════════════
NODO: ${n.id}
CATEGORIA: ${n.categoria}
SISTEMA: ${n.sistema}
TITULO: ${n.titulo}
VEHICULO: ${n.vehiculo || "N/A"}
───────────────────────────────────────
RESUMEN: ${n.resumen || "(sin resumen)"}
───────────────────────────────────────
${n.parametros_vitales && n.parametros_vitales.length > 0 ? `PARAMETROS VITALES:\n${n.parametros_vitales.map(p => "  • " + p).join("\n")}\n───────────────────────────────────────\n` : ""}${n.diagnostico_logico && n.diagnostico_logico.length > 0 ? `DIAGNOSTICO LOGICO:\n${n.diagnostico_logico.map(d => "  → " + d).join("\n")}\n───────────────────────────────────────\n` : ""}VERIFICACION: ${n.verificacion || "(no especificado)"}
RESOLUCION: ${n.resolucion || "(no especificado)"}
${n.falso_diagnostico ? `FALSO DIAGNOSTICO COMUN: ${n.falso_diagnostico}\n` : ""}${n.causa_raiz ? `CAUSA RAIZ: ${n.causa_raiz}\n` : ""}NIVEL DE EVIDENCIA: ${n.nivel_evidencia}
${n.video ? `VIDEO: ${n.video}` : ""}
═══════════════════════════════════════`;
  }).join("\n\n");
}

module.exports = buscarNotasRelevantes;
