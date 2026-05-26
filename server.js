const express = require("express");
const cors = require("cors");
const path = require("path");
const SYSTEM_PROMPT = require("./system_prompt");
const buscarNotasRelevantes = require("./buscar_notas");
const dbModule = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ═══ CONFIGURACIÓN ═══
// Clave de admin (cambiar en produccion via variable de entorno)
const ADMIN_KEY = process.env.ADMIN_KEY || "mecanicaai-admin-2026";
// Email del admin principal (se le da rol admin automaticamente al registrarse)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "antoniibeltran2@gmail.com";

// ═══ CONFIGURACION DE IA ═══
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const USE_GROQ = GROQ_API_KEY.length > 0;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const OLLAMA_URL = "http://localhost:11434/api/chat";
const OLLAMA_MODEL = "llama3.2";
const MODELO = USE_GROQ ? GROQ_MODEL : OLLAMA_MODEL;


// ═══════════════════════════════════════════════════════════
// AUTENTICACION
// ═══════════════════════════════════════════════════════════

// Login simple: el usuario da nombre y email, se registra/loguea
app.post("/api/login", (req, res) => {
  const { email, nombre } = req.body;
  if (!email || !nombre) {
    return res.status(400).json({ error: "Email y nombre son obligatorios" });
  }
  if (!email.includes("@") || !email.includes(".")) {
    return res.status(400).json({ error: "Email no valido" });
  }

  const usuario = dbModule.crearOActualizarUsuario(email, nombre);

  // Si es el admin principal, darle rol admin
  if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase() && usuario.rol !== "admin") {
    dbModule.db.prepare("UPDATE usuarios SET rol = 'admin' WHERE id = ?").run(usuario.id);
    usuario.rol = "admin";
  }

  res.json({
    ok: true,
    usuario: {
      id: usuario.id,
      email: usuario.email,
      nombre: usuario.nombre,
      rol: usuario.rol
    }
  });
});

// Verificar usuario (para reanudar sesion)
app.get("/api/usuario/:id", (req, res) => {
  const usuario = dbModule.obtenerUsuarioPorId(parseInt(req.params.id));
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json({ usuario: { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol } });
});

// ═══════════════════════════════════════════════════════════
// MENSAJES (con guardado en DB)
// ═══════════════════════════════════════════════════════════

app.post("/api/mensaje/stream", async (req, res) => {
  const { mensaje, sessionId, usuarioId, conversacionId } = req.body;
  if (!mensaje) return res.status(400).json({ error: "Mensaje requerido" });
  if (!usuarioId) return res.status(401).json({ error: "Usuario no autenticado" });

  // Crear o usar conversacion
  let convId = conversacionId;
  if (!convId) {
    convId = dbModule.crearConversacion(usuarioId, mensaje.substring(0, 60));
  }

  // Cargar historial de la conversacion
  const historialDB = dbModule.obtenerMensajesConversacion(convId);
  const historial = [];
  historialDB.slice(-10).forEach(m => {
    historial.push({ role: "user", content: m.pregunta });
    if (m.respuesta) historial.push({ role: "assistant", content: m.respuesta });
  });

  const notasRelevantes = buscarNotasRelevantes(mensaje);
  let contenidoUsuario = "";
  if (notasRelevantes) {
    contenidoUsuario = `NOTAS TECNICAS DE LA BASE DE CONOCIMIENTO (UNICA FUENTE PERMITIDA):\n${notasRelevantes}\n\n---\nPREGUNTA DEL TECNICO: ${mensaje}\n\nResponde USANDO SOLO la informacion de las notas anteriores. Si la pregunta no se puede responder con esas notas, responde con "Informacion no disponible".`;
  } else {
    contenidoUsuario = `NO HAY NOTAS RELEVANTES EN LA BASE DE CONOCIMIENTO PARA ESTA CONSULTA.\n\nPREGUNTA: ${mensaje}\n\nResponde EXACTAMENTE con el mensaje de "Informacion no disponible" tal como te indica el system prompt. NO uses tu conocimiento general.`;
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...historial,
    { role: "user", content: contenidoUsuario }
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({ type: "info", notasEncontradas: !!notasRelevantes, conversacionId: convId })}\n\n`);

  let respuestaCompleta = "";

  try {
    if (USE_GROQ) {
      const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: GROQ_MODEL, messages, stream: true, temperature: 0.2, max_tokens: 2048 })
      });
      if (!response.ok) throw new Error(`Groq error ${response.status}`);

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
      const response = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true, options: { temperature: 0.2, num_predict: 2048 } })
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

    // Guardar en BD
    let notaUsada = "";
    if (notasRelevantes) {
      const m = notasRelevantes.match(/NODO:\s*([^\s]+)/);
      if (m) notaUsada = m[1];
    }
    dbModule.guardarMensaje(convId, usuarioId, mensaje, respuestaCompleta, notaUsada);

    res.write(`data: ${JSON.stringify({ type: "done", conversacionId: convId })}\n\n`);
    res.end();

  } catch (err) {
    console.log("Error en stream:", err.message);
    const respuestaLocal = "⚠️ Informacion no disponible.\n\nEsta consulta no se encuentra en la base de conocimiento actual.";
    res.write(`data: ${JSON.stringify({ type: "token", content: respuestaLocal })}\n\n`);
    res.write(`data: ${JSON.stringify({ type: "done", fallback: true, conversacionId: convId })}\n\n`);
    res.end();
    dbModule.guardarMensaje(convId, usuarioId, mensaje, respuestaLocal, "");
  }
});

// ═══ Conversaciones ═══
app.get("/api/conversaciones/:usuarioId", (req, res) => {
  const convs = dbModule.listarConversaciones(parseInt(req.params.usuarioId));
  res.json(convs);
});

app.get("/api/conversacion/:id/mensajes", (req, res) => {
  const msgs = dbModule.obtenerMensajesConversacion(parseInt(req.params.id));
  res.json(msgs);
});

// ═══════════════════════════════════════════════════════════
// PANEL ADMIN (protegido)
// ═══════════════════════════════════════════════════════════

function verificarAdmin(req, res, next) {
  const key = req.headers["x-admin-key"] || req.query.admin_key;
  if (key !== ADMIN_KEY) {
    return res.status(403).json({ error: "Acceso no autorizado" });
  }
  next();
}

app.get("/api/admin/usuarios", verificarAdmin, (req, res) => {
  res.json(dbModule.listarUsuarios());
});

app.get("/api/admin/usuario/:id/preguntas", verificarAdmin, (req, res) => {
  const preguntas = dbModule.preguntasDeUsuario(parseInt(req.params.id), 200);
  const usuario = dbModule.obtenerUsuarioPorId(parseInt(req.params.id));
  res.json({ usuario, preguntas });
});

app.get("/api/admin/estadisticas", verificarAdmin, (req, res) => {
  res.json(dbModule.estadisticas());
});

// ═══════════════════════════════════════════════════════════
// NOTAS Y SINCRONIZACION
// ═══════════════════════════════════════════════════════════

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

app.post("/api/sync-drive", async (req, res) => {
  try {
    const { sincronizar } = require("./sync_drive");
    const resultado = await sincronizar();
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/limpiar", (req, res) => {
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
  console.log(`  🔧 MECANICA AI`);
  console.log(`  📡 Servidor: puerto ${PORT}`);
  console.log(`  📚 Notas: ${require("./notas.json").length}`);
  console.log(`  🤖 Proveedor IA: ${USE_GROQ ? "Groq (cloud)" : "Ollama (local)"}`);
  console.log(`  🤖 Modelo: ${MODELO}`);
  console.log(`  👤 Admin email: ${ADMIN_EMAIL}`);
  console.log(`  🔑 Admin key: ${ADMIN_KEY}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
});
