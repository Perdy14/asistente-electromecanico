/**
 * SYNC_DRIVE.js — Sincroniza la base de notas con Google Drive
 *
 * Detecta automaticamente los documentos publicos en la carpeta de Drive
 * configurada en drive_docs.json, los descarga y los guarda en notas.json.
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
 * Detecta automaticamente los IDs de Google Docs en una carpeta publica de Drive.
 */
async function detectarDocsEnCarpeta(folderId) {
  const url = `https://drive.google.com/drive/folders/${folderId}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    }
  });
  if (!response.ok) throw new Error(`No se puede acceder a la carpeta: ${response.status}`);
  const html = await response.text();

  // Buscar IDs de documentos (patron de 30+ caracteres alfanumericos)
  const matches = html.match(/"([a-zA-Z0-9_-]{30,})"/g) || [];
  const ids = new Set();
  matches.forEach(m => {
    const id = m.replace(/"/g, "");
    // Filtrar: empieza por 1 (Drive IDs) y no es la propia carpeta
    if (id.startsWith("1") && id !== folderId && id.length >= 33) {
      ids.add(id);
    }
  });
  return Array.from(ids);
}

/**
 * Extrae los datos estructurados de un documento con formato de Nota Maestra.
 */
function parsearNota(texto, docId) {
  const nota = {
    id: "",
    categoria: "CONOCIMIENTO DE SISTEMA",
    sistema: "",
    titulo: "",
    autor: "",
    vehiculo: "",
    sintomas: [],
    componentes: [],
    parametros_vitales: [],
    diagnostico_logico: [],
    resumen: "",
    verificacion: "",
    resolucion: "",
    falso_diagnostico: "",
    causa_raiz: "",
    nivel_evidencia: "MEDIO",
    video: "",
    fuente_drive_id: docId
  };

  let m = texto.match(/T[ií]tulo Archivo:?\s*([^\n\r*]+)/i);
  if (m) {
    let titId = m[1].trim().replace(/[\[\]]/g, "").trim();
    nota.id = titId.replace(/[^A-Z0-9._-]/gi, ".").toUpperCase();
    nota.titulo = titId.replace(/_/g, " ");
  }

  m = texto.match(/Fuente\s*v[ií]deo:?\s*(https?:\/\/[^\s\]]+)/i);
  if (m) nota.video = m[1].trim();

  m = texto.match(/Autor[ií]a:?\s*([^\n\r*\[]+)/i);
  if (m) nota.autor = m[1].trim();

  m = texto.match(/Veh[ií]culo\s*\/\s*Sistema:?\s*([^\n\r*]+)/i);
  if (m) {
    const partes = m[1].split("/");
    nota.vehiculo = partes[0]?.replace(/\[.*?\]/g, "").trim() || "";
    nota.sistema = partes.slice(1).join("/").replace(/\[.*?\]/g, "").trim() || nota.vehiculo;
  }

  m = texto.match(/DTC\s*\(C[oó]digos\)?:?\s*([^\n\r]+)/i);
  if (m) {
    const codigos = m[1].match(/P\d{4}|U\d{4}|C\d{4}|B\d{4}/gi);
    if (codigos) nota.sintomas.push(...codigos.map(c => c.toLowerCase()));
  }

  const sintomas = texto.match(/S[ií]ntoma[^:]*:?\s*([^\n\r\[]+)/gi);
  if (sintomas) {
    sintomas.forEach(s => {
      const valor = s.split(":").slice(1).join(":").replace(/\[.*?\]/g, "").trim();
      if (valor && valor.length < 200) {
        valor.split(/[,;.]/).forEach(palabra => {
          const limpio = palabra.toLowerCase().trim();
          if (limpio.length > 3 && limpio.length < 50) nota.sintomas.push(limpio);
        });
      }
    });
  }

  const lineas = texto.split(/[\n\r]+/);
  lineas.forEach(linea => {
    const limpia = linea.replace(/[\*•·-]\s*/g, "").trim();
    if (limpia.match(/^Par[aá]metro/i) || limpia.match(/^(Tensi[oó]n|Presi[oó]n|Temperatura|Corriente|Resistencia)\s/i)) {
      const valor = limpia.replace(/^Par[aá]metros?\s*vitales?:?\s*/i, "").replace(/\[.*?\]/g, "").trim();
      if (valor && valor.length > 5 && valor.length < 200) {
        nota.parametros_vitales.push(valor);
      }
    }
  });

  const reglas = texto.match(/SI\s+[^\n\r]+(?:👉|->|=>)\s*ENTONCES\s+[^\n\r\[]+/gi);
  if (reglas) {
    reglas.forEach(r => {
      const limpia = r.replace(/👉|->|=>/g, "->").replace(/\[.*?\]/g, "").trim();
      if (limpia.length < 300) nota.diagnostico_logico.push(limpia);
    });
  }

  const buscarSeccion = (regex) => {
    const match = texto.match(regex);
    if (match) {
      let valor = match[1].replace(/\[.*?\]/g, "").trim();
      valor = valor.split(/\n\s*\*?\s*[A-Z][a-z]+:/)[0];
      if (valor.length > 800) valor = valor.substring(0, 800) + "...";
      return valor.trim();
    }
    return "";
  };

  nota.resumen = buscarSeccion(/(?:Flujo f[ií]sico|Resumen|Observaci[oó]n general):?\s*([\s\S]{20,800}?)(?=\n\s*\*?\s*[A-Z][a-z]|\n\s*L[oó]gica|\n\s*Par[aá]metro|\n\s*🔬|\n\s*🔧|$)/);
  nota.causa_raiz = buscarSeccion(/Causa\s*Ra[ií]z:?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);
  nota.verificacion = buscarSeccion(/(?:Verificaci[oó]n|Condici[oó]n de verificaci[oó]n):?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);
  nota.resolucion = buscarSeccion(/(?:Resoluci[oó]n|Intervenci[oó]n correctiva):?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);
  nota.falso_diagnostico = buscarSeccion(/Falso\s*Diagn[oó]stico\s*Com[uú]n:?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);

  if (texto.match(/RESOLUCI[OÓ]N\s+DE\s+AVER[IÍ]A/i)) nota.categoria = "RESOLUCION DE AVERIA";
  else if (texto.match(/PROCEDIMIENTO\s+DE\s+VERIFICACI[OÓ]N/i)) nota.categoria = "PROCEDIMIENTO DE VERIFICACION";
  else nota.categoria = "CONOCIMIENTO DE SISTEMA";

  if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+ALTO/i)) nota.nivel_evidencia = "ALTO";
  else if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+MEDIO/i)) nota.nivel_evidencia = "MEDIO";
  else if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+BAJO/i)) nota.nivel_evidencia = "BAJO";

  nota.sintomas = [...new Set(nota.sintomas.filter(s => s && s.length > 2))];
  nota.parametros_vitales = [...new Set(nota.parametros_vitales)];
  nota.diagnostico_logico = [...new Set(nota.diagnostico_logico)];

  if (!nota.id) nota.id = "DRIVE." + docId.substring(0, 12).toUpperCase();
  if (!nota.titulo) nota.titulo = "Documento Drive " + docId.substring(0, 8);

  return nota;
}

/**
 * Sincroniza todos los documentos del Drive con notas.json
 */
async function sincronizar() {
  if (!fs.existsSync(DOCS_CONFIG)) {
    fs.writeFileSync(DOCS_CONFIG, JSON.stringify({ folder_id: "", docs: [] }, null, 2));
    return { ok: false, error: "drive_docs.json vacio" };
  }

  const config = JSON.parse(fs.readFileSync(DOCS_CONFIG, "utf8"));
  let docs = [];

  // Si hay folder_id, detectar documentos automaticamente
  if (config.folder_id) {
    try {
      console.log(`📂 Detectando documentos en carpeta ${config.folder_id}...`);
      docs = await detectarDocsEnCarpeta(config.folder_id);
      console.log(`   Encontrados: ${docs.length} documentos`);
    } catch (err) {
      console.log(`⚠️  Error detectando carpeta: ${err.message}`);
      docs = config.docs || [];
    }
  } else {
    docs = config.docs || [];
  }

  if (docs.length === 0) {
    return { ok: false, error: "No se encontraron documentos en la carpeta" };
  }

  const notas = [];
  const errores = [];

  for (const docId of docs) {
    try {
      console.log(`📥 Descargando ${docId}...`);
      const texto = await descargarDoc(docId);
      console.log(`   ${texto.length} caracteres`);
      const nota = parsearNota(texto, docId);
      notas.push(nota);
      console.log(`   ✅ Procesado: ${nota.id}`);
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
    notas: notas.map(n => ({ id: n.id, titulo: n.titulo, sistema: n.sistema }))
  };
}

module.exports = { sincronizar, descargarDoc, parsearNota, detectarDocsEnCarpeta };

if (require.main === module) {
  sincronizar().then(r => {
    console.log("\n=== RESULTADO ===");
    console.log(JSON.stringify(r, null, 2));
  });
}
