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

  // ═══ TITULO Y ID ═══
  // Formato tutor: "Titulo Archivo: NT_..."
  let m = texto.match(/T[ií]tulo Archivo:?\s*([^\n\r*]+)/i);
  if (m) {
    let titId = m[1].trim().replace(/[\[\]]/g, "").trim();
    nota.id = titId.replace(/[^A-Z0-9._-]/gi, ".").toUpperCase();
    nota.titulo = titId.replace(/_/g, " ");
  } else {
    // Formato alumno: "TÍTULO: ..." o linea principal con titulo descriptivo
    m = texto.match(/T[ÍI]TULO:?\s*([^\n\r]+)/);
    if (m) {
      nota.titulo = m[1].trim().replace(/[\[\]]/g, "").trim();
      nota.id = "ALUMNO." + nota.titulo.substring(0, 30).replace(/[^A-Z0-9._-]/gi, ".").toUpperCase();
    } else {
      // Buscar primera linea no vacia como titulo
      const lineas = texto.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 5);
      if (lineas.length > 0) {
        nota.titulo = lineas[0].substring(0, 100);
        nota.id = "DOC." + docId.substring(0, 12).toUpperCase();
      }
    }
  }

  // ═══ FUENTE VIDEO ═══
  m = texto.match(/(?:Fuente\s*v[ií]deo|FUENTE):?\s*(https?:\/\/[^\s\]]+)/i);
  if (m) nota.video = m[1].trim();

  // ═══ AUTOR ═══
  m = texto.match(/(?:Autor[ií]a|AUTOR[ÍI]A):?\s*([^\n\r*\[]+)/i);
  if (m) nota.autor = m[1].trim();

  // Nombre del alumno (en notas de alumnado puede aparecer como "Nombre: ..." o linea inicial)
  const nombreMatch = texto.match(/Nombre:?\s*([^\n\r]+)/i);
  if (nombreMatch && !nota.autor) nota.autor = nombreMatch[1].trim();

  // ═══ VEHICULO Y SISTEMA ═══
  m = texto.match(/Veh[ií]culo\s*\/\s*Sistema:?\s*([^\n\r*]+)/i);
  if (m) {
    const partes = m[1].split("/");
    nota.vehiculo = partes[0]?.replace(/\[.*?\]/g, "").trim() || "";
    nota.sistema = partes.slice(1).join("/").replace(/\[.*?\]/g, "").trim() || nota.vehiculo;
  } else {
    // Buscar SISTEMA o VEHICULO por separado
    m = texto.match(/(?:Sistema|SISTEMA):?\s*([^\n\r]+)/i);
    if (m) nota.sistema = m[1].trim().replace(/[\[\]]/g, "").trim();
    m = texto.match(/(?:Veh[ií]culo|VEH[IÍ]CULO):?\s*([^\n\r]+)/i);
    if (m) nota.vehiculo = m[1].trim().replace(/[\[\]]/g, "").trim();
  }

  // Si el sistema sigue vacio, intentar deducirlo del titulo
  if (!nota.sistema && nota.titulo) {
    const t = nota.titulo.toLowerCase();
    if (t.includes("egr")) nota.sistema = "Sistema EGR";
    else if (t.includes("scr") || t.includes("adblue")) nota.sistema = "Sistema SCR/AdBlue";
    else if (t.includes("inyec")) nota.sistema = "Sistema de Inyeccion";
    else if (t.includes("turbo")) nota.sistema = "Sobrealimentacion / Turbo";
    else if (t.includes("dpf") || t.includes("fap")) nota.sistema = "Filtro de Particulas";
    else if (t.includes("alternador") || t.includes("carga")) nota.sistema = "Sistema de Carga";
    else if (t.includes("freno")) nota.sistema = "Sistema de Frenos";
    else if (t.includes("refrig") || t.includes("termostato")) nota.sistema = "Sistema de Refrigeracion";
    else if (t.includes("transmis") || t.includes("caja")) nota.sistema = "Transmision";
    else if (t.includes("lambda") || t.includes("nox")) nota.sistema = "Sensores de Escape";
    else nota.sistema = "Mecanica General";
  }

  // ═══ DTC ═══
  m = texto.match(/DTC[^:]*:?\s*([^\n\r]+)/i);
  if (m) {
    const codigos = m[1].match(/P\d{4}|U\d{4}|C\d{4}|B\d{4}/gi);
    if (codigos) nota.sintomas.push(...codigos.map(c => c.toLowerCase()));
  }
  // Buscar codigos DTC en cualquier parte del texto
  const codigosTexto = texto.match(/\b(P\d{4}|U\d{4}|C\d{4}|B\d{4})\b/gi);
  if (codigosTexto) nota.sintomas.push(...codigosTexto.map(c => c.toLowerCase()));

  // ═══ SINTOMAS ═══
  const sintomas = texto.match(/S[ÍIií]ntoma[^:]*:?\s*([^\n\r\[]+)/gi);
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

  // ═══ PARAMETROS VITALES ═══
  const lineas = texto.split(/[\n\r]+/);
  lineas.forEach(linea => {
    const limpia = linea.replace(/[\*•·-]\s*/g, "").trim();
    if (limpia.match(/^Par[aá]metro/i) || limpia.match(/^(Tensi[oó]n|Presi[oó]n|Temperatura|Corriente|Resistencia|Voltaje)\s/i)) {
      const valor = limpia.replace(/^Par[aá]metros?\s*vitales?:?\s*/i, "").replace(/\[.*?\]/g, "").trim();
      if (valor && valor.length > 5 && valor.length < 200) {
        nota.parametros_vitales.push(valor);
      }
    }
  });

  // ═══ DIAGNOSTICO LOGICO ═══
  const reglas = texto.match(/SI\s+[^\n\r]+(?:👉|->|=>)\s*ENTONCES\s+[^\n\r\[]+/gi);
  if (reglas) {
    reglas.forEach(r => {
      const limpia = r.replace(/👉|->|=>/g, "->").replace(/\[.*?\]/g, "").trim();
      if (limpia.length < 300) nota.diagnostico_logico.push(limpia);
    });
  }

  // ═══ SECCIONES DE TEXTO ═══
  const buscarSeccion = (regex) => {
    const match = texto.match(regex);
    if (match) {
      let valor = match[1].replace(/\[.*?\]/g, "").trim();
      valor = valor.split(/\n\s*\*?\s*[A-Z][a-z]+:/)[0];
      if (valor.length > 1500) valor = valor.substring(0, 1500) + "...";
      return valor.trim();
    }
    return "";
  };

  // Resumen / observacion / introduccion
  nota.resumen = buscarSeccion(/(?:Flujo f[ií]sico|Resumen|Observaci[oó]n general|INTRODUCCI[OÓ]N|En este caso):?\s*([\s\S]{20,1500}?)(?=\n\s*\*?\s*[A-Z]{3,}|\n\s*L[oó]gica|\n\s*Par[aá]metro|\n\s*🔬|\n\s*🔧|$)/i);

  // Si no hay resumen, coger el primer parrafo despues del titulo
  if (!nota.resumen) {
    const parrafos = texto.split(/\n\s*\n/).filter(p => p.length > 100 && p.length < 1500);
    if (parrafos.length > 0) nota.resumen = parrafos[0].replace(/\[.*?\]/g, "").trim();
  }

  nota.causa_raiz = buscarSeccion(/(?:Causa\s*Ra[ií]z|CAUSA\s*RA[ÍI]Z):?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);
  nota.verificacion = buscarSeccion(/(?:Verificaci[oó]n|VERIFICACI[OÓ]N|Condici[oó]n de verificaci[oó]n|COMPROBACI[OÓ]N|DIAGN[OÓ]STICO):?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);
  nota.resolucion = buscarSeccion(/(?:Resoluci[oó]n|RESOLUCI[OÓ]N|Intervenci[oó]n correctiva|REPARACI[OÓ]N|SOLUCI[OÓ]N):?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);
  nota.falso_diagnostico = buscarSeccion(/(?:Falso\s*Diagn[oó]stico\s*Com[uú]n|FALSO\s*DIAGN[OÓ]STICO):?\s*([^\n\r]+(?:\n(?!\s*[A-Z*][a-z]).+)*)/i);

  // ═══ CATEGORIA ═══
  if (texto.match(/RESOLUCI[OÓ]N\s+DE\s+AVER[IÍ]A/i)) nota.categoria = "RESOLUCION DE AVERIA";
  else if (texto.match(/PROCEDIMIENTO\s+DE\s+VERIFICACI[OÓ]N/i)) nota.categoria = "PROCEDIMIENTO DE VERIFICACION";
  else if (nota.causa_raiz || nota.resolucion) nota.categoria = "RESOLUCION DE AVERIA";
  else nota.categoria = "CONOCIMIENTO DE SISTEMA";

  // ═══ NIVEL DE EVIDENCIA ═══
  if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+ALTO/i)) nota.nivel_evidencia = "ALTO";
  else if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+MEDIO/i)) nota.nivel_evidencia = "MEDIO";
  else if (texto.match(/Nivel\s+de\s+Evidencia[:\s]+BAJO/i)) nota.nivel_evidencia = "BAJO";

  // ═══ LIMPIAR ═══
  nota.sintomas = [...new Set(nota.sintomas.filter(s => s && s.length > 2))];
  nota.parametros_vitales = [...new Set(nota.parametros_vitales)];
  nota.diagnostico_logico = [...new Set(nota.diagnostico_logico)];

  if (!nota.id) nota.id = "DOC." + docId.substring(0, 12).toUpperCase();
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

  // Lista de carpetas a procesar (folder_ids tiene prioridad sobre folder_id)
  const folderIds = config.folder_ids && config.folder_ids.length > 0
    ? config.folder_ids
    : (config.folder_id ? [config.folder_id] : []);

  if (folderIds.length > 0) {
    for (const fid of folderIds) {
      try {
        console.log(`📂 Detectando documentos en carpeta ${fid}...`);
        const ids = await detectarDocsEnCarpeta(fid);
        console.log(`   Encontrados: ${ids.length} documentos`);
        docs.push(...ids);
      } catch (err) {
        console.log(`⚠️  Error detectando carpeta ${fid}: ${err.message}`);
      }
    }
    // Eliminar duplicados
    docs = [...new Set(docs)];
  } else {
    docs = config.docs || [];
  }

  if (docs.length === 0) {
    return { ok: false, error: "No se encontraron documentos" };
  }

  const notas = [];
  const errores = [];

  for (const docId of docs) {
    try {
      console.log(`📥 Descargando ${docId}...`);
      const texto = await descargarDoc(docId);
      console.log(`   ${texto.length} caracteres`);

      // Filtro: solo procesar documentos con formato de nota tecnica
      const esNotaTecnica =
        /T[ií]tulo\s*Archivo:/i.test(texto) ||
        /METADATOS\s*DEL\s*CASO/i.test(texto) ||
        /SISTEMA\s*SANO/i.test(texto) ||
        /SALIDA\s*1:\s*NOTA\s*MAESTRA/i.test(texto) ||
        /S[ÍI]NTOMA\s*Y\s*DTC/i.test(texto) ||
        /NOTA\s*T[ÉE]CNICA:/i.test(texto) ||
        /T[ÍI]TULO:.*FUENTE:/is.test(texto);

      if (!esNotaTecnica) {
        console.log(`   ⏭️  Saltado: no tiene formato de nota tecnica`);
        continue;
      }

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
