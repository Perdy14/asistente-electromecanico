/**
 * SYNC_DRIVE.js — Sincroniza la base de notas con Google Drive
 *
 * Lee los documentos de Google Docs publicos listados en drive_docs.json,
 * extrae el contenido y guarda el TEXTO COMPLETO en notas.json.
 *
 * IMPORTANTE: Guardamos el documento completo como contexto para que el
 * asistente lo use literalmente, sin perder informacion.
 */

const fs = require("fs");
const path = require("path");

const DOCS_CONFIG = path.join(__dirname, "drive_docs.json");
const NOTAS_FILE = path.join(__dirname, "notas.json");

/**
 * Descarga un Google Doc publico como texto plano.
 */
async function descargarDoc(docId) {
  const url = `https://docs.google.com/document/d/${docId}/export?format=txt`;
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  if (!response.ok) throw new Error(`Status ${response.status}`);
  return await response.text();
}

/**
 * Extrae metadatos basicos del documento (titulo, video, sistema, palabras clave).
 * El TEXTO COMPLETO se guarda intacto para que la IA lo use.
 */
function extraerMetadatos(texto, docId) {
  const meta = {
    id: "",
    categoria: "CONOCIMIENTO DE SISTEMA",
    sistema: "",
    titulo: "",
    autor: "",
    vehiculo: "",
    sintomas: [],
    componentes: [],
    nivel_evidencia: "MEDIO",
    video: "",
    fuente_drive_id: docId,
    contenido_completo: texto.trim()
  };

  // Titulo Archivo
  let m = texto.match(/T[ií]tulo\s+Archivo:?\s*([^\n\r*\[]+)/i);
  if (m) {
    let titId = m[1].trim().replace(/[\[\]]/g, "").trim();
    meta.id = titId.replace(/[^A-Z0-9._-]/gi, ".").toUpperCase().replace(/\.+/g, ".");
    meta.titulo = titId.replace(/_/g, " ").replace(/^NT\.?\s*/i, "");
  }

  // Fuente video
  m = texto.match(/Fuente\s*v[ií]deo:?\s*(https?:\/\/[^\s\]\)]+)/i);
  if (m) meta.video = m[1].trim().replace(/[.,;]+$/, "");

  // Autor
  m = texto.match(/Autor[ií]a:?\s*([^\n\r*\[]+)/i);
  if (m) meta.autor = m[1].trim();

  // Vehiculo / Sistema
  m = texto.match(/Veh[ií]culo\s*\/?\s*Sistema:?\s*([^\n\r]+)/i);
  if (m) {
    const partes = m[1].split("/");
    meta.vehiculo = (partes[0] || "").replace(/\[.*?\]/g, "").trim();
    meta.sistema = partes.slice(1).join("/").replace(/\[.*?\]/g, "").trim() || meta.vehiculo;
  }

  // DTC -> sintomas
  m = texto.match(/DTC\s*\(C[oó]digos\)?:?\s*([^\n\r]+)/i);
  if (m) {
    const codigos = m[1].match(/P\d{4}|U\d{4}|C\d{4}|B\d{4}|P[0-9A-F]{4}/gi);
    if (codigos) meta.sintomas.push(...codigos.map(c => c.toUpperCase()));
  }

  // Sintomas en negrita o tras ":"
  const sintomasMatches = texto.match(/S[ií]ntoma[^:\n]*:\s*([^\n\r\[]+)/gi);
  if (sintomasMatches) {
    sintomasMatches.forEach(s => {
      const valor = s.split(":").slice(1).join(":").replace(/\[.*?\]/g, "").trim();
      if (valor && valor.length < 200) {
        valor.split(/[,;]/).forEach(p => {
          const limpio = p.toLowerCase().trim().replace(/^["']|["']$/g, "");
          if (limpio.length > 3 && limpio.length < 80) meta.sintomas.push(limpio);
        });
      }
    });
  }

  // Componentes/sistemas mencionados
  const compMatch = texto.match(/Componentes:?\s*\n([\s\S]+?)(?=\n\s*[A-Z][a-z]+:|\n\n[a-z])/i);
  if (compMatch) {
    compMatch[1].split("\n").forEach(linea => {
      const limpio = linea.replace(/^\s*[-*•·]\s*/, "").replace(/[\[\]"']/g, "").trim();
      if (limpio && limpio.length > 3 && limpio.length < 100) {
        meta.componentes.push(limpio);
      }
    });
  }

  // Categoria
  if (texto.match(/RESOLUCI[OÓ]N\s+DE\s+AVER[IÍ]A/i)) meta.categoria = "RESOLUCION DE AVERIA";
  else if (texto.match(/PROCEDIMIENTO\s+DE\s+VERIFICACI[OÓ]N/i)) meta.categoria = "PROCEDIMIENTO DE VERIFICACION";
  else meta.categoria = "CONOCIMIENTO DE SISTEMA";

  // Nivel evidencia
  if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+ALTO/i)) meta.nivel_evidencia = "ALTO";
  else if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+BAJO/i)) meta.nivel_evidencia = "BAJO";
  else meta.nivel_evidencia = "MEDIO";

  // Limpiar duplicados
  meta.sintomas = [...new Set(meta.sintomas.filter(s => s && s.length > 2))];
  meta.componentes = [...new Set(meta.componentes)];

  // Defaults si no se encontro
  if (!meta.id) meta.id = "DRIVE." + docId.substring(0, 12).toUpperCase();
  if (!meta.titulo) {
    // Extraer primer linea con texto
    const primerLinea = texto.split("\n").find(l => l.trim().length > 5);
    meta.titulo = (primerLinea || "Documento " + docId.substring(0, 8)).substring(0, 100);
  }
  if (!meta.sistema) meta.sistema = "General";

  return meta;
}

/**
 * Sincroniza todos los documentos del config con notas.json
 */
async function sincronizar() {
  if (!fs.existsSync(DOCS_CONFIG)) {
    return { ok: false, error: "drive_docs.json no existe" };
  }

  const config = JSON.parse(fs.readFileSync(DOCS_CONFIG, "utf8"));
  const docs = config.docs || [];

  if (docs.length === 0) {
    return { ok: false, error: "No hay documentos configurados" };
  }

  const notas = [];
  const errores = [];

  for (const docId of docs) {
    try {
      console.log(`📥 Descargando ${docId.substring(0, 12)}...`);
      const texto = await descargarDoc(docId);
      console.log(`   ${texto.length} caracteres`);
      const nota = extraerMetadatos(texto, docId);
      notas.push(nota);
      console.log(`   ✅ ${nota.id} - ${nota.titulo.substring(0, 50)}`);
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      errores.push({ docId, error: err.message });
    }
  }

  fs.writeFileSync(NOTAS_FILE, JSON.stringify(notas, null, 2), "utf8");

  return {
    ok: true,
    total: notas.length,
    errores: errores.length,
    detalleErrores: errores,
    notas: notas.map(n => ({ id: n.id, titulo: n.titulo, sistema: n.sistema, video: n.video }))
  };
}

module.exports = { sincronizar, descargarDoc, extraerMetadatos };

if (require.main === module) {
  sincronizar().then(r => {
    console.log("\n=== RESULTADO ===");
    console.log(`Total notas: ${r.total}`);
    console.log(`Errores: ${r.errores}`);
    if (r.notas) {
      console.log("\nNotas guardadas:");
      r.notas.forEach(n => console.log(`  - ${n.id}: ${n.titulo}`));
    }
  });
}
