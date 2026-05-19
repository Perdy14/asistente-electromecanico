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

// ═══ CONFIGURACIÓN DE IA ═══
// Si hay GROQ_API_KEY, usa Groq (cloud, gratis, rápido)
// Si no, usa Ollama local (requiere tener Ollama instalado)
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const USE_GROQ = GROQ_API_KEY.length > 0;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "llama3.2";

const MODELO = USE_GROQ ? GROQ_MODEL : OLLAMA_MODEL;


// ═══════════════════════════════════════════════════════════
// STREAMING ENDPOINT — Soporta Groq y Ollama
// ═══════════════════════════════════════════════════════════

app.post("/api/mensaje/stream", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje) return res.status(400).json({ error: "Mensaje requerido" });

  const sid = sessionId || "default";
  if (!conversaciones[sid]) conversaciones[sid] = [];

  const notasRelevantes = buscarNotasRelevantes(mensaje);

  let contenidoUsuario = "";
  if (notasRelevantes) {
    contenidoUsuario = `NOTAS TÉCNICAS RELEVANTES:\n${notasRelevantes}\n\n---\nPREGUNTA DEL TÉCNICO: ${mensaje}`;
  } else {
    contenidoUsuario = `No hay notas específicas para esta consulta. Responde con tu conocimiento de mecánica automotriz.\n\nPREGUNTA: ${mensaje}`;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversaciones[sid].slice(-10),
    { role: "user", content: contenidoUsuario }
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({ type: "info", notasEncontradas: !!notasRelevantes })}\n\n`);

  try {
    let respuestaCompleta = "";

    if (USE_GROQ) {
      // ═══ GROQ (cloud) ═══
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: messages,
          stream: true,
          temperature: 0.3,
          max_tokens: 2048
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq error ${response.status}: ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              respuestaCompleta += content;
              res.write(`data: ${JSON.stringify({ type: "token", content })}\n\n`);
            }
          } catch (e) {}
        }
      }
    } else {
      // ═══ OLLAMA (local) ═══
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages: messages,
          stream: true,
          options: { temperature: 0.3, num_predict: 2048 }
        })
      });

      if (!response.ok) throw new Error(`Ollama error ${response.status}`);

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
          } catch (e) {}
        }
      }
    }

    // Guardar en historial
    conversaciones[sid].push({ role: "user", content: mensaje });
    conversaciones[sid].push({ role: "assistant", content: respuestaCompleta });
    if (conversaciones[sid].length > 20) {
      conversaciones[sid] = conversaciones[sid].slice(-20);
    }

    res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
    res.end();

  } catch (err) {
    console.log("Error en stream:", err.message);
    const respuestaLocal = generarRespuestaLocal(mensaje, notasRelevantes);
    res.write(`data: ${JSON.stringify({ type: "token", content: respuestaLocal })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done", fallback: true })}\n\n`);
    res.end();
    conversaciones[sid].push({ role: "user", content: mensaje });
    conversaciones[sid].push({ role: "assistant", content: respuestaLocal });
  }
});


// ═══ Endpoint clasico (no streaming) ═══
app.post("/api/mensaje", async (req, res) => {
  const { mensaje, sessionId } = req.body;
  if (!mensaje) return res.status(400).json({ error: "Mensaje requerido" });

  const sid = sessionId || "default";
  if (!conversaciones[sid]) conversaciones[sid] = [];

  const notasRelevantes = buscarNotasRelevantes(mensaje);
  const contenidoUsuario = notasRelevantes
    ? `NOTAS RELEVANTES:\n${notasRelevantes}\n\n---\nPREGUNTA: ${mensaje}`
    : `Sin notas. PREGUNTA: ${mensaje}`;

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversaciones[sid].slice(-10),
    { role: "user", content: contenidoUsuario }
  ];

  try {
    let respuesta;
    if (USE_GROQ) {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: 2048
        })
      });
      if (!response.ok) throw new Error("Groq error");
      const data = await response.json();
      respuesta = data.choices[0].message.content;
    } else {
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
          stream: false,
          options: { temperature: 0.3, num_predict: 2048 }
        })
      });
      if (!response.ok) throw new Error("Ollama error");
      const data = await response.json();
      respuesta = data.message.content;
    }

    conversaciones[sid].push({ role: "user", content: mensaje });
    conversaciones[sid].push({ role: "assistant", content: respuesta });
    if (conversaciones[sid].length > 20) conversaciones[sid] = conversaciones[sid].slice(-20);

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
    delete require.cache[require.resolve("./notas.json")];
    const notas = require("./notas.json");
    const relevantes = notas.filter(nota =>
      nota.sintomas.some(s => mensaje.includes(s.toLowerCase())) ||
      nota.componentes.some(c => mensaje.includes(c.toLowerCase()))
    );
    if (relevantes.length > 0) {
      const nota = relevantes[0];
      let r = `🔧 **Sistema:** ${nota.sistema}\n\n`;
      r += `📋 **Hipótesis:** ${nota.resumen}\n\n`;
      r += `**Causa raíz:** ${nota.causa_raiz}\n\n`;
      r += `**📐 Parámetros:**\n${nota.parametros_vitales.map(p => "- " + p).join("\n")}\n\n`;
      r += `**✅ Verificación:** ${nota.verificacion}\n\n`;
      r += `**🔧 Resolución:** ${nota.resolucion}\n\n`;
      r += `**⚠️ Falso diagnóstico:** ${nota.falso_diagnostico}`;
      return r;
    }
  }
  return `⚠️ Servicio de IA no disponible temporalmente. Inténtalo de nuevo en unos segundos.`;
}

app.get("/api/notas", (req, res) => {
  delete require.cache[require.resolve("./notas.json")];
  const notas = require("./notas.json");
  res.json(notas.map(n => ({
    id: n.id, titulo: n.titulo, categoria: n.categoria,
    sistema: n.sistema, nivel_evidencia: n.nivel_evidencia,
    sintomas: n.sintomas, video: n.video || ""
  })));
});

app.post("/api/notas", (req, res) => {
  const fs = require("fs");
  const notaPath = path.join(__dirname, "notas.json");
  try {
    const notas = JSON.parse(fs.readFileSync(notaPath, "utf8"));
    const nueva = req.body;
    if (!nueva.id || !nueva.titulo || !nueva.sistema) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }
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
    res.status(500).json({ error: "Error: " + err.message });
  }
});

app.post("/api/limpiar", (req, res) => {
  const sid = req.body.sessionId || "default";
  conversaciones[sid] = [];
  res.json({ ok: true });
});

// Buscar videos en YouTube
app.get("/api/buscar-videos", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Falta el parametro q" });
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&hl=es&gl=ES`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9"
      }
    });
    const html = await response.text();
    const match = html.match(/var ytInitialData = (\{.+?\});<\/script>/s);
    if (!match) return res.json({ videos: [] });
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
    } catch (e) {}
    res.json({ videos, query: q });
  } catch (err) {
    res.json({ videos: [], error: err.message });
  }
});

app.get("/api/estado", async (req, res) => {
  if (USE_GROQ) {
    res.json({ ollama: true, modelos: [GROQ_MODEL], modeloActivo: GROQ_MODEL, proveedor: "Groq" });
    return;
  }
  try {
    const response = await fetch("http://localhost:11434/api/tags");
    if (response.ok) {
      const data = await response.json();
      const modelos = data.models ? data.models.map(m => m.name) : [];
      res.json({ ollama: true, modelos, modeloActivo: OLLAMA_MODEL, proveedor: "Ollama" });
    } else {
      res.json({ ollama: false, modelos: [], modeloActivo: OLLAMA_MODEL, proveedor: "Ollama" });
    }
  } catch (err) {
    res.json({ ollama: false, modelos: [], modeloActivo: OLLAMA_MODEL, proveedor: "Ollama" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  🔧 ASISTENTE GUIADO PARA EL ELECTROMECÁNICO`);
  console.log(`  📡 Servidor: puerto ${PORT}`);
  console.log(`  📚 Notas: ${require("./notas.json").length}`);
  console.log(`  🤖 Proveedor IA: ${USE_GROQ ? "Groq (cloud)" : "Ollama (local)"}`);
  console.log(`  🤖 Modelo: ${MODELO}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
});
