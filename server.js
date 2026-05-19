const express = require("express");
const cors = require("cors");
const path = require("path");
const SYSTEM_PROMPT = require("./system_prompt");
const buscarNotasRelevantes = require("./buscar_notas");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Almacén de conversaciones en memoria
const conversaciones = {};

const OLLAMA_URL = "http://localhost:11434/api/chat";
const MODELO = "llama3.2";

// ═══════════════════════════════════════════════════════════
// STREAMING ENDPOINT — Respuestas en tiempo real
// ═══════════════════════════════════════════════════════════

app.post("/api/mensaje/stream", async (req, res) => {
  const { mensaje, sessionId } = req.body;

  if (!mensaje) {
    return res.status(400).json({ error: "Mensaje requerido" });
  }

  const sid = sessionId || "default";
  if (!conversaciones[sid]) {
    conversaciones[sid] = [];
  }

  // Buscar notas relevantes
  const notasRelevantes = buscarNotasRelevantes(mensaje);

  // Construir contexto
  let contenidoUsuario = "";
  if (notasRelevantes) {
    contenidoUsuario = `NOTAS TÉCNICAS RELEVANTES DE LA BASE DE CONOCIMIENTO:\n${notasRelevantes}\n\n---\nPREGUNTA DEL TÉCNICO: ${mensaje}`;
  } else {
    contenidoUsuario = `No hay notas específicas en la base para esta consulta. Responde con tu conocimiento general de mecánica automotriz.\n\nPREGUNTA DEL TÉCNICO: ${mensaje}`;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversaciones[sid].slice(-10),
    { role: "user", content: contenidoUsuario }
  ];

  // Configurar headers para streaming
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Enviar info de notas encontradas
  res.write(`data: ${JSON.stringify({ type: "info", notasEncontradas: !!notasRelevantes })}\n\n`);

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        messages: messages,
        stream: true,
        options: {
          temperature: 0.3,
          num_predict: 2048
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama status ${response.status}`);
    }

    let respuestaCompleta = "";

    // Leer el stream de Ollama
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(l => l.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.message && data.message.content) {
            respuestaCompleta += data.message.content;
            res.write(`data: ${JSON.stringify({ type: "token", content: data.message.content })}\n\n`);
          }
          if (data.done) {
            // Guardar en historial
            conversaciones[sid].push({ role: "user", content: mensaje });
            conversaciones[sid].push({ role: "assistant", content: respuestaCompleta });
            if (conversaciones[sid].length > 20) {
              conversaciones[sid] = conversaciones[sid].slice(-20);
            }
          }
        } catch (e) {
          // Línea no es JSON válido, ignorar
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

  } catch (err) {
    // Fallback: motor local
    const respuestaLocal = generarRespuestaLocal(mensaje, notasRelevantes);
    res.write(`data: ${JSON.stringify({ type: "token", content: respuestaLocal })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done", fallback: true })}\n\n`);
    res.end();

    // Guardar en historial
    conversaciones[sid].push({ role: "user", content: mensaje });
    conversaciones[sid].push({ role: "assistant", content: respuestaLocal });
  }
});

// Endpoint clásico (sin streaming) como fallback
app.post("/api/mensaje", async (req, res) => {
  const { mensaje, sessionId } = req.body;

  if (!mensaje) {
    return res.status(400).json({ error: "Mensaje requerido" });
  }

  const sid = sessionId || "default";
  if (!conversaciones[sid]) {
    conversaciones[sid] = [];
  }

  const notasRelevantes = buscarNotasRelevantes(mensaje);

  let contenidoUsuario = "";
  if (notasRelevantes) {
    contenidoUsuario = `NOTAS TÉCNICAS RELEVANTES DE LA BASE DE CONOCIMIENTO:\n${notasRelevantes}\n\n---\nPREGUNTA DEL TÉCNICO: ${mensaje}`;
  } else {
    contenidoUsuario = `No hay notas específicas en la base para esta consulta.\n\nPREGUNTA DEL TÉCNICO: ${mensaje}`;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversaciones[sid].slice(-10),
    { role: "user", content: contenidoUsuario }
  ];

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        messages: messages,
        stream: false,
        options: { temperature: 0.3, num_predict: 2048 }
      })
    });

    if (!response.ok) throw new Error("Ollama error");
    const data = await response.json();
    const respuesta = data.message.content;

    conversaciones[sid].push({ role: "user", content: mensaje });
    conversaciones[sid].push({ role: "assistant", content: respuesta });
    if (conversaciones[sid].length > 20) {
      conversaciones[sid] = conversaciones[sid].slice(-20);
    }

    res.json({ respuesta, notasEncontradas: !!notasRelevantes, usaIA: true });
  } catch (err) {
    const respuesta = generarRespuestaLocal(mensaje, notasRelevantes);
    conversaciones[sid].push({ role: "user", content: mensaje });
    conversaciones[sid].push({ role: "assistant", content: respuesta });
    res.json({ respuesta, notasEncontradas: !!notasRelevantes, usaIA: false });
  }
});

function generarRespuestaLocal(mensajeTecnico, notasEncontradas) {
  const mensaje = mensajeTecnico.toLowerCase();

  if (notasEncontradas) {
    const notas = require("./notas.json");
    const relevantes = notas.filter(nota => {
      return nota.sintomas.some(s => mensaje.includes(s.toLowerCase())) ||
             nota.componentes.some(c => mensaje.includes(c.toLowerCase()));
    });

    if (relevantes.length > 0) {
      const nota = relevantes[0];
      let r = "";
      r += `🔧 **Sistema identificado:** ${nota.sistema}\n\n`;
      r += `📋 **Nota técnica:** ${nota.titulo}\n`;
      r += `📊 **Nivel de evidencia:** ${nota.nivel_evidencia}\n\n`;
      r += `---\n\n`;
      r += `**Hipótesis:** ${nota.resumen}\n\n`;
      r += `**Causa raíz:** ${nota.causa_raiz}\n\n`;
      r += `---\n\n`;
      r += `**📐 Parámetros vitales:**\n`;
      nota.parametros_vitales.forEach(p => { r += `- ${p}\n`; });
      r += `\n**🌳 Lógica de diagnóstico:**\n`;
      nota.diagnostico_logico.forEach(d => { r += `- ${d}\n`; });
      r += `\n---\n\n`;
      r += `**✅ Verificación:** ${nota.verificacion}\n\n`;
      r += `**🔧 Resolución:** ${nota.resolucion}\n\n`;
      r += `**⚠️ Falso diagnóstico común:** ${nota.falso_diagnostico}`;
      return r;
    }
  }

  return `⚠️ **Ollama no está activo** — Necesitas Ollama para preguntas generales.\n\nDescarga: https://ollama.com/download/windows\nLuego ejecuta: \`ollama pull llama3.2\``;
}

app.get("/api/notas", (req, res) => {
  delete require.cache[require.resolve("./notas.json")];
  const notas = require("./notas.json");
  res.json(notas.map(n => ({
    id: n.id,
    titulo: n.titulo,
    categoria: n.categoria,
    sistema: n.sistema,
    nivel_evidencia: n.nivel_evidencia,
    sintomas: n.sintomas,
    video: n.video || ""
  })));
});

// Endpoint para añadir nueva nota
app.post("/api/notas", (req, res) => {
  const fs = require("fs");
  const notaPath = path.join(__dirname, "notas.json");

  try {
    const notas = JSON.parse(fs.readFileSync(notaPath, "utf8"));
    const nueva = req.body;

    // Validar campos mínimos
    if (!nueva.id || !nueva.titulo || !nueva.sistema) {
      return res.status(400).json({ error: "Faltan campos obligatorios: id, titulo, sistema" });
    }

    // Asegurar campos por defecto
    nueva.categoria = nueva.categoria || "CONOCIMIENTO DE SISTEMA";
    nueva.autor = nueva.autor || "Usuario";
    nueva.vehiculo = nueva.vehiculo || "General";
    nueva.sintomas = nueva.sintomas || [];
    nueva.componentes = nueva.componentes || [];
    nueva.parametros_vitales = nueva.parametros_vitales || [];
    nueva.diagnostico_logico = nueva.diagnostico_logico || [];
    nueva.resumen = nueva.resumen || "";
    nueva.verificacion = nueva.verificacion || "";
    nueva.resolucion = nueva.resolucion || "";
    nueva.falso_diagnostico = nueva.falso_diagnostico || "";
    nueva.causa_raiz = nueva.causa_raiz || "";
    nueva.nivel_evidencia = nueva.nivel_evidencia || "MEDIO";
    nueva.video = nueva.video || "";

    notas.push(nueva);
    fs.writeFileSync(notaPath, JSON.stringify(notas, null, 2), "utf8");

    res.json({ ok: true, total: notas.length });
  } catch (err) {
    res.status(500).json({ error: "Error guardando nota: " + err.message });
  }
});

app.post("/api/limpiar", (req, res) => {
  const { sessionId } = req.body;
  const sid = sessionId || "default";
  conversaciones[sid] = [];
  res.json({ ok: true });
});

// Endpoint: buscar videos en YouTube (scraping simple sin API key)
app.get("/api/buscar-videos", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Falta el parametro q" });

  // Evitar cache
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es&gl=ES`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9"
      }
    });
    const html = await response.text();

    // YouTube embute los resultados en una variable JS llamada ytInitialData
    const match = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
    if (!match) {
      return res.json({ videos: [] });
    }

    const data = JSON.parse(match[1]);
    const videos = [];

    try {
      const sections = data.contents.twoColumnSearchResultsRenderer.primaryContents.sectionListRenderer.contents;
      for (const section of sections) {
        const items = section.itemSectionRenderer ? section.itemSectionRenderer.contents : [];
        for (const item of items) {
          if (item.videoRenderer) {
            const v = item.videoRenderer;
            videos.push({
              id: v.videoId,
              title: v.title.runs ? v.title.runs[0].text : "",
              channel: v.ownerText && v.ownerText.runs ? v.ownerText.runs[0].text : "",
              thumbnail: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
              duration: v.lengthText ? v.lengthText.simpleText : "",
              views: v.viewCountText ? (v.viewCountText.simpleText || "") : "",
              published: v.publishedTimeText ? v.publishedTimeText.simpleText : ""
            });
            if (videos.length >= 12) break;
          }
        }
        if (videos.length >= 12) break;
      }
    } catch (parseErr) {
      console.log("Error parseando resultados YouTube:", parseErr.message);
    }

    res.json({ videos, query: q });
  } catch (err) {
    console.log("Error buscando videos:", err.message);
    res.json({ videos: [], error: err.message });
  }
});

app.get("/api/estado", async (req, res) => {
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    if (response.ok) {
      const data = await response.json();
      const modelos = data.models ? data.models.map(m => m.name) : [];
      res.json({ ollama: true, modelos, modeloActivo: MODELO });
    } else {
      res.json({ ollama: false, modelos: [], modeloActivo: MODELO });
    }
  } catch (err) {
    res.json({ ollama: false, modelos: [], modeloActivo: MODELO });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  🔧 ASISTENTE GUIADO PARA EL ELECTROMECÁNICO`);
  console.log(`  📡 Servidor: http://localhost:${PORT}`);
  console.log(`  📚 Notas: ${require("./notas.json").length}`);
  console.log(`  🤖 Modelo: ${MODELO} (Ollama)`);
  console.log(`  ⚡ Streaming: activado`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  fetch("http://localhost:11434/api/tags")
    .then(r => r.json())
    .then(data => {
      const modelos = data.models ? data.models.map(m => m.name) : [];
      if (modelos.length > 0) {
        console.log(`  ✅ Ollama conectado — Modelos: ${modelos.join(", ")}\n`);
      } else {
        console.log(`  ⚠️  Ollama activo pero sin modelos. Ejecuta: ollama pull ${MODELO}\n`);
      }
    })
    .catch(() => {
      console.log(`  ⚠️  Ollama no detectado. Motor local activo (solo notas).\n`);
    });
});
