// ═══════════════════════════════════════════════════════════
// MECÁNICA AI — Cliente v4 (vistas funcionales)
// ═══════════════════════════════════════════════════════════

const API_URL = "";
let sessionId = localStorage.getItem("sessionId") || ("s_" + Date.now());
localStorage.setItem("sessionId", sessionId);

// DOM
const chatArea = document.getElementById("chat-area");
const messagesContainer = document.getElementById("messages");
const welcomeMessage = document.getElementById("welcome");
const inputMensaje = document.getElementById("input-mensaje");
const btnEnviar = document.getElementById("btn-enviar");
const btnLimpiar = document.getElementById("btn-limpiar");
const btnExportar = document.getElementById("btn-exportar");
const btnNuevaConv = document.getElementById("btn-nueva-conv");
const btnTheme = document.getElementById("btn-theme");
const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
const sidebar = document.getElementById("sidebar");
const estadoTexto = document.getElementById("estado-texto");
const estadoDot = document.getElementById("estado-dot");
const inputContainer = document.getElementById("input-container");
const headerTitle = document.getElementById("header-title");
const historialLista = document.getElementById("historial-lista");

let isStreaming = false;
let historialMensajes = JSON.parse(localStorage.getItem("historial") || "[]");
let conversaciones = JSON.parse(localStorage.getItem("conversaciones") || "[]");
let notasData = [];

// ═══ INIT ═══
document.addEventListener("DOMContentLoaded", () => {
  cargarTema();
  verificarEstado();
  restaurarHistorial();
  renderConversaciones();
  cargarNotas();
  setupEventListeners();
  inputMensaje.focus();
  setInterval(verificarEstado, 20000);
});

function setupEventListeners() {
  btnEnviar.addEventListener("click", enviarMensaje);
  inputMensaje.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
  });
  inputMensaje.addEventListener("input", () => {
    inputMensaje.style.height = "auto";
    inputMensaje.style.height = Math.min(inputMensaje.scrollHeight, 90) + "px";
  });
  btnLimpiar.addEventListener("click", limpiarConversacion);
  btnExportar.addEventListener("click", exportarConversacion);
  btnNuevaConv.addEventListener("click", nuevaConversacion);
  btnTheme.addEventListener("click", toggleTema);
  btnToggleSidebar.addEventListener("click", () => sidebar.classList.toggle("open"));

  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 768 && !sidebar.contains(e.target) && !btnToggleSidebar.contains(e.target)) {
      sidebar.classList.remove("open");
    }
  });

  // Welcome cards
  document.querySelectorAll(".welcome-card").forEach(card => {
    card.addEventListener("click", () => { inputMensaje.value = card.dataset.query; enviarMensaje(); });
  });

  // Nav items — cambiar vista
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      cambiarVista(view);
    });
  });

  // Chips (diagnóstico)
  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => chip.classList.toggle("selected"));
  });

  // Botón diagnosticar
  document.getElementById("btn-diagnosticar").addEventListener("click", ejecutarDiagnostico);

  // Buscador de notas
  document.getElementById("buscar-nota").addEventListener("input", filtrarNotas);

  // Formulario nueva nota
  document.getElementById("btn-mostrar-form-nota").addEventListener("click", () => {
    document.getElementById("form-nueva-nota").classList.toggle("hidden");
  });
  document.getElementById("btn-cancelar-nota").addEventListener("click", () => {
    document.getElementById("form-nueva-nota").classList.add("hidden");
  });
  document.getElementById("btn-guardar-nota").addEventListener("click", guardarNuevaNota);

  // Buscador de videos
  const btnBuscarVideo = document.getElementById("btn-buscar-video");
  const videoSearchInput = document.getElementById("video-search-input");
  const btnCerrarResults = document.getElementById("btn-cerrar-results");

  if (btnBuscarVideo) {
    btnBuscarVideo.addEventListener("click", buscarVideoYouTube);
    videoSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); buscarVideoYouTube(); }
    });
  }
  if (btnCerrarResults) {
    btnCerrarResults.addEventListener("click", () => {
      document.getElementById("video-results").classList.add("hidden");
      document.getElementById("video-iframe").src = "";
    });
  }
  document.querySelectorAll(".video-quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const search = btn.dataset.search;
      videoSearchInput.value = search;
      buscarVideoYouTube();
    });
  });
}

// ═══ VISTAS ═══
function cambiarVista(viewId) {
  // Actualizar nav
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  document.querySelector(`[data-view="${viewId}"]`).classList.add("active");

  // Mostrar panel
  document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`view-${viewId}`).classList.add("active");

  // Actualizar título
  const titles = { chat: "Nueva conversación", diagnostico: "Diagnóstico Guiado", notas: "Notas Técnicas", videos: "Vídeos Técnicos" };
  headerTitle.textContent = titles[viewId] || "";

  // Si vuelve al chat, restaurar título
  if (viewId === "chat") {
    const primer = historialMensajes.find(m => m.role === "user");
    if (primer) headerTitle.textContent = primer.content.length > 40 ? primer.content.substring(0, 40) + "..." : primer.content;
  }
}

// ═══ TEMA ═══
function cargarTema() {
  const tema = localStorage.getItem("tema") || "dark";
  document.documentElement.setAttribute("data-theme", tema);
}
function toggleTema() {
  const nuevo = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nuevo);
  localStorage.setItem("tema", nuevo);
}

// ═══ ESTADO ═══
async function verificarEstado() {
  try {
    const res = await fetch(`${API_URL}/api/estado`);
    const data = await res.json();
    if (data.ollama) {
      estadoTexto.textContent = `IA: ${data.modeloActivo}`;
      estadoDot.className = "estado-dot active";
    } else {
      estadoTexto.textContent = "Solo notas locales";
      estadoDot.className = "estado-dot warning";
    }
  } catch {
    estadoTexto.textContent = "Servidor offline";
    estadoDot.className = "estado-dot";
  }
}

// ═══ NOTAS ═══
async function cargarNotas() {
  try {
    const res = await fetch(`${API_URL}/api/notas`);
    notasData = await res.json();
    renderNotas(notasData);
  } catch (e) {}
}

function renderNotas(notas) {
  const grid = document.getElementById("notas-grid");
  grid.innerHTML = notas.map(n => `
    <div class="nota-card">
      <div class="nc-header">
        <span class="nc-id">${n.id}</span>
        <span class="nc-badge ${n.nivel_evidencia.toLowerCase()}">${n.nivel_evidencia}</span>
      </div>
      <div class="nc-title">${n.titulo}</div>
      <div class="nc-sistema">${n.sistema}</div>
      ${n.sintomas ? `<div class="nc-sintomas">${n.sintomas.slice(0, 6).map(s => `<span class="nc-sintoma">${s}</span>`).join("")}</div>` : ""}
      ${n.video ? `<a href="${n.video}" target="_blank" class="nc-video">▶️ Ver vídeo</a>` : ""}
    </div>
  `).join("");
}

function filtrarNotas() {
  const q = document.getElementById("buscar-nota").value.toLowerCase();
  if (!q) { renderNotas(notasData); return; }
  const filtradas = notasData.filter(n =>
    n.titulo.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) ||
    n.sistema.toLowerCase().includes(q) || (n.sintomas && n.sintomas.some(s => s.includes(q)))
  );
  renderNotas(filtradas);
}

// ═══ GUARDAR NUEVA NOTA ═══
async function guardarNuevaNota() {
  const nota = {
    id: document.getElementById("nota-id").value.trim(),
    titulo: document.getElementById("nota-titulo").value.trim(),
    sistema: document.getElementById("nota-sistema").value.trim(),
    categoria: document.getElementById("nota-categoria").value,
    vehiculo: document.getElementById("nota-vehiculo").value.trim(),
    sintomas: document.getElementById("nota-sintomas").value.split(",").map(s => s.trim().toLowerCase()).filter(s => s),
    componentes: document.getElementById("nota-componentes").value.split(",").map(s => s.trim()).filter(s => s),
    resumen: document.getElementById("nota-resumen").value.trim(),
    verificacion: document.getElementById("nota-verificacion").value.trim(),
    resolucion: document.getElementById("nota-resolucion").value.trim(),
    falso_diagnostico: document.getElementById("nota-falso").value.trim(),
    causa_raiz: document.getElementById("nota-causa").value.trim(),
    nivel_evidencia: document.getElementById("nota-evidencia").value,
    video: document.getElementById("nota-video").value.trim(),
    parametros_vitales: [],
    diagnostico_logico: []
  };

  if (!nota.id || !nota.titulo || !nota.sistema) {
    alert("Rellena al menos: ID, Título y Sistema.");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nota)
    });
    const data = await res.json();
    if (data.ok) {
      alert(`✅ Nota guardada. Total notas: ${data.total}`);
      document.getElementById("form-nueva-nota").classList.add("hidden");
      // Limpiar formulario
      document.querySelectorAll("#form-nueva-nota input, #form-nueva-nota textarea").forEach(el => el.value = "");
      // Recargar notas
      cargarNotas();
    } else {
      alert("❌ Error: " + (data.error || "desconocido"));
    }
  } catch (err) {
    alert("❌ Error de conexión: " + err.message);
  }
}

// ═══ DIAGNÓSTICO GUIADO ═══
function ejecutarDiagnostico() {
  const vehiculo = document.getElementById("diag-vehiculo").value.trim();
  const dtc = document.getElementById("diag-dtc").value.trim();
  const km = document.getElementById("diag-km").value.trim();
  const sintomas = document.getElementById("diag-sintomas").value.trim();

  const cuando = [...document.querySelectorAll("#view-diagnostico .chip-group:first-of-type .chip.selected")].map(c => c.dataset.value);
  const sistema = [...document.querySelectorAll("#view-diagnostico .chip-group:last-of-type .chip.selected")].map(c => c.dataset.value);

  if (!sintomas && !dtc) {
    alert("Describe al menos los síntomas o un código DTC.");
    return;
  }

  // Construir pregunta completa
  let pregunta = "Necesito un diagnóstico guiado:\n";
  if (vehiculo) pregunta += `- Vehículo: ${vehiculo}\n`;
  if (km) pregunta += `- Kilometraje: ${km}\n`;
  if (dtc) pregunta += `- Código DTC: ${dtc}\n`;
  if (sintomas) pregunta += `- Síntomas: ${sintomas}\n`;
  if (cuando.length) pregunta += `- Cuándo ocurre: ${cuando.join(", ")}\n`;
  if (sistema.length) pregunta += `- Sistema sospechoso: ${sistema.join(", ")}\n`;
  pregunta += "\nDame un diagnóstico estructurado con hipótesis, verificaciones y posible resolución.";

  // Cambiar a vista chat y enviar
  cambiarVista("chat");
  inputMensaje.value = pregunta;
  enviarMensaje();
}

// ═══ ENVIAR (STREAMING) ═══
async function enviarMensaje() {
  const mensaje = inputMensaje.value.trim();
  if (!mensaje || isStreaming) return;

  welcomeMessage.classList.add("hidden");
  agregarMensaje(mensaje, "user");
  guardarEnHistorial("user", mensaje);
  actualizarTitulo(mensaje);

  inputMensaje.value = "";
  inputMensaje.style.height = "auto";
  isStreaming = true;
  btnEnviar.disabled = true;
  inputContainer.classList.add("disabled");

  const { messageEl, contentEl } = crearMensajeAsistente();
  let textoCompleto = "";

  try {
    const response = await fetch(`${API_URL}/api/mensaje/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje, sessionId })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "info" && data.notasEncontradas) {
            const meta = messageEl.querySelector(".message-meta");
            if (meta) meta.innerHTML += `<span class="nota-badge-msg">📚 Nota técnica</span>`;
          } else if (data.type === "token") {
            textoCompleto += data.content;
            contentEl.innerHTML = renderMarkdown(textoCompleto) + '<span class="streaming-cursor"></span>';
            scrollToBottom();
          } else if (data.type === "done") {
            contentEl.innerHTML = renderMarkdown(textoCompleto);
          }
        } catch (e) {}
      }
    }
    guardarEnHistorial("assistant", textoCompleto);
  } catch (err) {
    contentEl.innerHTML = renderMarkdown("⚠️ Error de conexión. Verifica que el servidor está corriendo.");
  }

  isStreaming = false;
  btnEnviar.disabled = false;
  inputContainer.classList.remove("disabled");
  inputMensaje.focus();
}

// ═══ MENSAJES ═══
function agregarMensaje(texto, role) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  const avatar = role === "user" ? "👨‍🔧" : "🔧";
  const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-meta"><span>${hora}</span></div>
      <div class="message-content">${role === "user" ? escapeHtml(texto) : renderMarkdown(texto)}</div>
    </div>`;
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function crearMensajeAsistente() {
  const el = document.createElement("div");
  el.className = "message assistant";
  const hora = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  el.innerHTML = `
    <div class="message-avatar">🔧</div>
    <div class="message-body">
      <div class="message-meta"><span>${hora}</span></div>
      <div class="message-content"><div class="typing-indicator"><span></span><span></span><span></span></div></div>
    </div>`;
  messagesContainer.appendChild(el);
  scrollToBottom();
  return { messageEl: el, contentEl: el.querySelector(".message-content") };
}

// ═══ BUSCAR VIDEOS EN YOUTUBE ═══
async function buscarVideoYouTube() {
  const input = document.getElementById("video-search-input");
  const query = input.value.trim();
  if (!query) return;

  const resultsDiv = document.getElementById("video-results");

  // Mostrar loader inmediato
  resultsDiv.classList.remove("hidden");
  resultsDiv.innerHTML = `
    <div class="video-results-header">
      <span>🔍 Buscando: "${escapeHtml(query)}"</span>
      <button class="btn-icon-sm btn-cerrar-r">✕</button>
    </div>
    <div class="video-loading">
      <div class="typing-indicator"><span></span><span></span><span></span></div>
      <p>Buscando vídeos en YouTube...</p>
    </div>
  `;
  bindCerrar(resultsDiv);
  resultsDiv.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const res = await fetch(`${API_URL}/api/buscar-videos?q=${encodeURIComponent(query)}&t=${Date.now()}`, {
      cache: "no-store"
    });
    const data = await res.json();

    if (data.videos && data.videos.length > 0) {
      resultsDiv.innerHTML = `
        <div class="video-results-header">
          <span>📺 ${data.videos.length} vídeos para "${escapeHtml(query)}"</span>
          <button class="btn-icon-sm btn-cerrar-r">✕</button>
        </div>
        <div class="video-results-grid">
          ${data.videos.map(v => `
            <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener" class="video-result-card">
              <div class="vrc-thumb-wrap">
                <img class="vrc-thumb" src="${v.thumbnail}" alt="" loading="lazy">
                ${v.duration ? `<span class="vrc-duration">${escapeHtml(v.duration)}</span>` : ""}
              </div>
              <div class="vrc-info">
                <div class="vrc-title">${escapeHtml(v.title)}</div>
                <div class="vrc-channel">${escapeHtml(v.channel || "")}</div>
                <div class="vrc-meta">${escapeHtml(v.views || "")} ${v.published ? "· " + escapeHtml(v.published) : ""}</div>
              </div>
            </a>
          `).join("")}
        </div>
        <div class="video-results-footer">
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" class="btn-link-yt">Ver más resultados en YouTube →</a>
        </div>
      `;
    } else {
      resultsDiv.innerHTML = `
        <div class="video-results-header">
          <span>Resultados de "${escapeHtml(query)}"</span>
          <button class="btn-icon-sm btn-cerrar-r">✕</button>
        </div>
        <div class="video-fallback">
          <p>No se pudieron cargar los vídeos automáticamente.</p>
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" class="btn-primary">🔍 Abrir resultados en YouTube</a>
        </div>
      `;
    }
    bindCerrar(resultsDiv);
  } catch (err) {
    resultsDiv.innerHTML = `
      <div class="video-results-header">
        <span>Error</span>
        <button class="btn-icon-sm btn-cerrar-r">✕</button>
      </div>
      <div class="video-fallback">
        <p>Error al buscar (${escapeHtml(err.message)}).</p>
        <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" class="btn-primary">🔍 Abrir en YouTube</a>
      </div>
    `;
    bindCerrar(resultsDiv);
  }
}

function bindCerrar(resultsDiv) {
  const btn = resultsDiv.querySelector(".btn-cerrar-r");
  if (btn) btn.addEventListener("click", () => {
    resultsDiv.classList.add("hidden");
    resultsDiv.innerHTML = "";
  });
}

// ═══ MARKDOWN ═══
function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);

  // YouTube links — convertir a tarjeta visual
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)[^)]*)\)/g, (match, title, url, videoId) => {
    return `<a href="${url}" target="_blank" rel="noopener" class="yt-card">
      <img class="yt-thumb" src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="">
      <div class="yt-info">
        <span class="yt-label">📺 Vídeo recomendado</span>
        <span class="yt-title">${title}</span>
        <span class="yt-url">youtube.com</span>
      </div>
    </a>`;
  });

  // URLs de YouTube sueltas (sin formato markdown)
  html = html.replace(/(https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)[^\s<]*)/g, (match, url, videoId) => {
    // No reemplazar si ya está dentro de un yt-card
    if (html.indexOf(`href="${url}"`) !== -1) return match;
    return `<a href="${url}" target="_blank" rel="noopener" class="yt-card">
      <img class="yt-thumb" src="https://img.youtube.com/vi/${videoId}/mqdefault.jpg" alt="">
      <div class="yt-info">
        <span class="yt-label">📺 Vídeo en YouTube</span>
        <span class="yt-title">Ver vídeo</span>
        <span class="yt-url">${url.length > 45 ? url.substring(0, 45) + '...' : url}</span>
      </div>
    </a>`;
  });

  // Links normales (no YouTube)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/<\/(h[1-3]|ul|hr|blockquote)><br>/g, "</$1>");
  html = html.replace(/<hr><br>/g, "<hr>");
  return html;
}

function escapeHtml(text) { const d = document.createElement("div"); d.textContent = text; return d.innerHTML; }

// ═══ HISTORIAL ═══
function guardarEnHistorial(role, content) {
  historialMensajes.push({ role, content, timestamp: Date.now() });
  if (historialMensajes.length > 100) historialMensajes = historialMensajes.slice(-100);
  localStorage.setItem("historial", JSON.stringify(historialMensajes));
  renderConversaciones();
}

function restaurarHistorial() {
  if (historialMensajes.length === 0) return;
  welcomeMessage.classList.add("hidden");
  historialMensajes.forEach(msg => {
    const el = document.createElement("div");
    el.className = `message ${msg.role}`;
    const avatar = msg.role === "user" ? "👨‍🔧" : "🔧";
    const hora = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
    el.innerHTML = `
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">
        <div class="message-meta"><span>${hora}</span></div>
        <div class="message-content">${msg.role === "user" ? escapeHtml(msg.content) : renderMarkdown(msg.content)}</div>
      </div>`;
    messagesContainer.appendChild(el);
  });
  scrollToBottom();
  const primer = historialMensajes.find(m => m.role === "user");
  if (primer) actualizarTitulo(primer.content);
}

function actualizarTitulo(msg) {
  headerTitle.textContent = msg.length > 40 ? msg.substring(0, 40) + "..." : msg;
}

function renderConversaciones() {
  let html = "";
  if (historialMensajes.length > 0) {
    const primer = historialMensajes.find(m => m.role === "user");
    const t = primer ? (primer.content.length > 28 ? primer.content.substring(0, 28) + "..." : primer.content) : "Conversación actual";
    html += `<div class="historial-item"><span class="h-icon">💬</span>${t}</div>`;
  }
  conversaciones.slice(-5).reverse().forEach(c => {
    html += `<div class="historial-item"><span class="h-icon">📝</span>${c.titulo}</div>`;
  });
  historialLista.innerHTML = html || '<div style="font-size:10px;color:var(--text-muted);padding:6px 8px;">Sin conversaciones</div>';
}

// ═══ ACCIONES ═══
async function limpiarConversacion() {
  try { await fetch(`${API_URL}/api/limpiar`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ sessionId }) }); } catch(e) {}
  historialMensajes = [];
  localStorage.setItem("historial", "[]");
  messagesContainer.innerHTML = "";
  welcomeMessage.classList.remove("hidden");
  headerTitle.textContent = "Nueva conversación";
  renderConversaciones();
  inputMensaje.focus();
}

function nuevaConversacion() {
  if (historialMensajes.length > 0) {
    const primer = historialMensajes.find(m => m.role === "user");
    conversaciones.push({ titulo: primer ? primer.content.substring(0, 35) : "Conversación", fecha: Date.now() });
    if (conversaciones.length > 10) conversaciones = conversaciones.slice(-10);
    localStorage.setItem("conversaciones", JSON.stringify(conversaciones));
  }
  sessionId = "s_" + Date.now();
  localStorage.setItem("sessionId", sessionId);
  limpiarConversacion();
  cambiarVista("chat");
}

function exportarConversacion() {
  if (historialMensajes.length === 0) { alert("No hay mensajes."); return; }
  let texto = "═══ MECÁNICA AI — Exportación ═══\n" + new Date().toLocaleString("es-ES") + "\n\n";
  historialMensajes.forEach(msg => {
    const quien = msg.role === "user" ? "👨‍🔧 TÉCNICO" : "🔧 ASISTENTE";
    texto += `${quien}:\n${msg.content}\n\n---\n\n`;
  });
  const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `mecanica_${new Date().toISOString().slice(0,10)}.txt`; a.click();
}

function scrollToBottom() { chatArea.scrollTop = chatArea.scrollHeight; }
