// ═══════════════════════════════════════════════════════════
// MECÁNICA AI — Cliente con login, base de datos y panel admin
// ═══════════════════════════════════════════════════════════

const API_URL = "";
let usuario = JSON.parse(localStorage.getItem("usuario") || "null");
let conversacionActual = null;
let sessionId = "s_" + Date.now();

// DOM
const loginScreen = document.getElementById("login-screen");
const appContainer = document.getElementById("app-container");
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
let historialMensajes = [];
let notasData = [];

// ═══ INIT ═══
document.addEventListener("DOMContentLoaded", () => {
  cargarTema();
  if (usuario) {
    iniciarApp();
  } else {
    mostrarLogin();
  }
});

// ═══ LOGIN ═══
function mostrarLogin() {
  loginScreen.classList.remove("hidden");
  appContainer.classList.add("hidden");
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = document.getElementById("login-nombre").value.trim();
    const email = document.getElementById("login-email").value.trim();
    if (!nombre || !email) return;

    try {
      const res = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email })
      });
      const data = await res.json();
      if (data.ok) {
        usuario = data.usuario;
        localStorage.setItem("usuario", JSON.stringify(usuario));
        loginScreen.classList.add("hidden");
        appContainer.classList.remove("hidden");
        iniciarApp();
      } else {
        alert("Error: " + (data.error || "no se pudo iniciar sesion"));
      }
    } catch (err) {
      alert("Error de conexion: " + err.message);
    }
  });
}

function iniciarApp() {
  loginScreen.classList.add("hidden");
  appContainer.classList.remove("hidden");

  // Mostrar info del usuario
  document.getElementById("user-name").textContent = usuario.nombre;
  document.getElementById("user-email").textContent = usuario.email;
  document.getElementById("user-avatar").textContent = usuario.nombre.charAt(0).toUpperCase();

  // Mostrar panel admin si es admin
  if (usuario.rol === "admin") {
    document.getElementById("nav-admin").classList.remove("hidden");
  }

  verificarEstado();
  cargarConversaciones();
  cargarNotas();
  setupEventListeners();
  inputMensaje.focus();
  setInterval(verificarEstado, 20000);
}

function cerrarSesion() {
  localStorage.removeItem("usuario");
  localStorage.removeItem("conversacionActual");
  usuario = null;
  conversacionActual = null;
  historialMensajes = [];
  location.reload();
}

function setupEventListeners() {
  btnEnviar.addEventListener("click", enviarMensaje);
  inputMensaje.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
  });
  inputMensaje.addEventListener("input", () => {
    inputMensaje.style.height = "auto";
    inputMensaje.style.height = Math.min(inputMensaje.scrollHeight, 100) + "px";
  });
  btnLimpiar.addEventListener("click", limpiarConversacion);
  btnExportar.addEventListener("click", exportarConversacion);
  btnNuevaConv.addEventListener("click", nuevaConversacion);
  btnTheme.addEventListener("click", toggleTema);
  document.getElementById("btn-logout").addEventListener("click", cerrarSesion);

  btnToggleSidebar.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    document.body.classList.toggle("sidebar-open");
  });

  const overlay = document.getElementById("sidebar-overlay");
  if (overlay) overlay.addEventListener("click", () => {
    sidebar.classList.remove("open");
    document.body.classList.remove("sidebar-open");
  });

  document.querySelectorAll(".welcome-card").forEach(card => {
    card.addEventListener("click", () => { inputMensaje.value = card.dataset.query; enviarMensaje(); });
  });

  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach(item => {
    item.addEventListener("click", () => {
      const view = item.dataset.view;
      cambiarVista(view);
      if (window.innerWidth <= 1024) {
        sidebar.classList.remove("open");
        document.body.classList.remove("sidebar-open");
      }
    });
  });

  document.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => chip.classList.toggle("selected"));
  });

  document.getElementById("btn-diagnosticar").addEventListener("click", ejecutarDiagnostico);
  document.getElementById("buscar-nota").addEventListener("input", filtrarNotas);
  document.getElementById("btn-mostrar-form-nota").addEventListener("click", () => {
    document.getElementById("form-nueva-nota").classList.toggle("hidden");
  });
  document.getElementById("btn-cancelar-nota").addEventListener("click", () => {
    document.getElementById("form-nueva-nota").classList.add("hidden");
  });
  document.getElementById("btn-guardar-nota").addEventListener("click", guardarNuevaNota);

  const btnSync = document.getElementById("btn-sync-drive");
  if (btnSync) btnSync.addEventListener("click", sincronizarDrive);

  // Buscador de videos
  const btnBuscarVideo = document.getElementById("btn-buscar-video");
  const videoSearchInput = document.getElementById("video-search-input");
  if (btnBuscarVideo) {
    btnBuscarVideo.addEventListener("click", buscarVideoYouTube);
    videoSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); buscarVideoYouTube(); }
    });
  }
  document.querySelectorAll(".video-quick-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      videoSearchInput.value = btn.dataset.search;
      buscarVideoYouTube();
    });
  });

  // Volver a lista de alumnos en panel admin
  const btnVolver = document.getElementById("btn-volver-admin");
  if (btnVolver) btnVolver.addEventListener("click", () => {
    document.getElementById("admin-detalle").classList.add("hidden");
    document.getElementById("admin-usuarios").parentElement.style.display = "block";
    document.getElementById("admin-stats").style.display = "grid";
  });
}

// ═══ VISTAS ═══
function cambiarVista(viewId) {
  document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
  const navSidebar = document.querySelector(`.nav-item[data-view="${viewId}"]`);
  if (navSidebar) navSidebar.classList.add("active");

  document.querySelectorAll(".mobile-nav-item").forEach(i => i.classList.remove("active"));
  const navMobile = document.querySelector(`.mobile-nav-item[data-view="${viewId}"]`);
  if (navMobile) {
    navMobile.classList.add("active");
    navMobile.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  document.querySelectorAll(".view-panel").forEach(p => p.classList.remove("active"));
  document.getElementById(`view-${viewId}`).classList.add("active");

  const titles = { chat: "Nueva conversación", diagnostico: "Diagnóstico Guiado", notas: "Notas Técnicas", videos: "Vídeos Técnicos", admin: "Panel del Profesor" };
  headerTitle.textContent = titles[viewId] || "";

  if (viewId === "admin") cargarPanelAdmin();
}

// ═══ TEMA ═══
function cargarTema() {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("tema") || "dark");
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
      estadoTexto.textContent = "Solo notas";
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
  if (!grid) return;
  grid.innerHTML = notas.map(n => `
    <div class="nota-card">
      <div class="nc-header">
        <span class="nc-id">${n.id}</span>
        <span class="nc-badge ${n.nivel_evidencia.toLowerCase()}">${n.nivel_evidencia}</span>
      </div>
      <div class="nc-title">${escapeHtml(n.titulo)}</div>
      <div class="nc-sistema">${escapeHtml(n.sistema)}</div>
      ${n.sintomas ? `<div class="nc-sintomas">${n.sintomas.slice(0, 6).map(s => `<span class="nc-sintoma">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      ${n.video ? `<a href="${n.video}" target="_blank" class="nc-video">▶️ Ver vídeo</a>` : ""}
    </div>
  `).join("");
}

function filtrarNotas() {
  const q = document.getElementById("buscar-nota").value.toLowerCase();
  if (!q) { renderNotas(notasData); return; }
  const f = notasData.filter(n =>
    n.titulo.toLowerCase().includes(q) || n.id.toLowerCase().includes(q) ||
    n.sistema.toLowerCase().includes(q) || (n.sintomas && n.sintomas.some(s => s.includes(q)))
  );
  renderNotas(f);
}

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
    video: document.getElementById("nota-video").value.trim()
  };
  if (!nota.id || !nota.titulo || !nota.sistema) { alert("ID, Título y Sistema son obligatorios"); return; }

  try {
    const res = await fetch(`${API_URL}/api/notas`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(nota) });
    const data = await res.json();
    if (data.ok) {
      alert(`✅ Nota guardada. Total: ${data.total}`);
      document.getElementById("form-nueva-nota").classList.add("hidden");
      document.querySelectorAll("#form-nueva-nota input, #form-nueva-nota textarea").forEach(el => el.value = "");
      cargarNotas();
    } else alert("Error: " + (data.error || ""));
  } catch (err) { alert("Error: " + err.message); }
}

async function sincronizarDrive() {
  const status = document.getElementById("sync-status");
  status.classList.remove("hidden", "success", "error");
  status.classList.add("loading");
  status.innerHTML = `<div class="ss-title">🔄 Sincronizando con Google Drive...</div><div class="ss-detail">Descargando documentos...</div>`;

  try {
    const res = await fetch(`${API_URL}/api/sync-drive`, { method: "POST" });
    const data = await res.json();
    if (data.ok) {
      status.classList.remove("loading", "error");
      status.classList.add("success");
      status.innerHTML = `<div class="ss-title">✅ Sincronización completada</div><div class="ss-detail">${data.total} documentos procesados${data.errores > 0 ? `, ${data.errores} errores` : ""}</div>`;
      cargarNotas();
    } else {
      status.classList.remove("loading", "success");
      status.classList.add("error");
      status.innerHTML = `<div class="ss-title">❌ Error</div><div class="ss-detail">${escapeHtml(data.error || "")}</div>`;
    }
  } catch (err) {
    status.classList.remove("loading", "success");
    status.classList.add("error");
    status.innerHTML = `<div class="ss-title">❌ Error</div><div class="ss-detail">${escapeHtml(err.message)}</div>`;
  }
}

// ═══ DIAGNOSTICO GUIADO ═══
function ejecutarDiagnostico() {
  const v = document.getElementById("diag-vehiculo").value.trim();
  const dtc = document.getElementById("diag-dtc").value.trim();
  const km = document.getElementById("diag-km").value.trim();
  const s = document.getElementById("diag-sintomas").value.trim();
  const cuando = [...document.querySelectorAll("#view-diagnostico .chip-group:first-of-type .chip.selected")].map(c => c.dataset.value);
  const sistema = [...document.querySelectorAll("#view-diagnostico .chip-group:last-of-type .chip.selected")].map(c => c.dataset.value);

  if (!s && !dtc) { alert("Describe sintomas o un codigo DTC"); return; }
  let p = "Necesito un diagnostico:\n";
  if (v) p += `- Vehiculo: ${v}\n`;
  if (km) p += `- Km: ${km}\n`;
  if (dtc) p += `- DTC: ${dtc}\n`;
  if (s) p += `- Sintomas: ${s}\n`;
  if (cuando.length) p += `- Cuando: ${cuando.join(", ")}\n`;
  if (sistema.length) p += `- Sistema sospechoso: ${sistema.join(", ")}\n`;

  cambiarVista("chat");
  inputMensaje.value = p;
  enviarMensaje();
}

// ═══ ENVIAR MENSAJE ═══
async function enviarMensaje() {
  const mensaje = inputMensaje.value.trim();
  if (!mensaje || isStreaming || !usuario) return;

  welcomeMessage.classList.add("hidden");
  agregarMensaje(mensaje, "user");
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
      body: JSON.stringify({ mensaje, sessionId, usuarioId: usuario.id, conversacionId: conversacionActual })
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
          if (data.type === "info") {
            if (data.conversacionId) {
              conversacionActual = data.conversacionId;
              localStorage.setItem("conversacionActual", conversacionActual);
            }
            if (data.notasEncontradas) {
              const meta = messageEl.querySelector(".message-meta");
              if (meta) meta.innerHTML += `<span class="nota-badge-msg">📚 Nota técnica</span>`;
            }
          } else if (data.type === "token") {
            textoCompleto += data.content;
            contentEl.innerHTML = renderMarkdown(textoCompleto) + '<span class="streaming-cursor"></span>';
            scrollToBottom();
          } else if (data.type === "done") {
            contentEl.innerHTML = renderMarkdown(textoCompleto);
            cargarConversaciones();
          }
        } catch (e) {}
      }
    }
  } catch (err) {
    contentEl.innerHTML = renderMarkdown("⚠️ Error de conexión.");
  }

  isStreaming = false;
  btnEnviar.disabled = false;
  inputContainer.classList.remove("disabled");
  inputMensaje.focus();
}

function agregarMensaje(texto, role) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  const avatar = role === "user" ? (usuario ? usuario.nombre.charAt(0).toUpperCase() : "👤") : "🔧";
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

// ═══ CONVERSACIONES ═══
async function cargarConversaciones() {
  if (!usuario) return;
  try {
    const res = await fetch(`${API_URL}/api/conversaciones/${usuario.id}`);
    const convs = await res.json();
    historialLista.innerHTML = convs.map(c => `
      <button class="historial-item ${c.id === conversacionActual ? 'active' : ''}" data-conv-id="${c.id}">
        <span class="h-icon">💬</span>
        <span>${escapeHtml(c.titulo || "Conversación")}</span>
      </button>
    `).join("") || '<div style="font-size:10px;color:var(--text-muted);padding:6px 8px;">Sin conversaciones</div>';

    document.querySelectorAll(".historial-item").forEach(btn => {
      btn.addEventListener("click", () => abrirConversacion(parseInt(btn.dataset.convId)));
    });
  } catch (e) {}
}

async function abrirConversacion(convId) {
  conversacionActual = convId;
  localStorage.setItem("conversacionActual", convId);
  messagesContainer.innerHTML = "";
  welcomeMessage.classList.add("hidden");

  try {
    const res = await fetch(`${API_URL}/api/conversacion/${convId}/mensajes`);
    const msgs = await res.json();
    msgs.forEach(m => {
      agregarMensajeHistorial("user", m.pregunta, m.fecha);
      if (m.respuesta) agregarMensajeHistorial("assistant", m.respuesta, m.fecha);
    });
    cambiarVista("chat");
    cargarConversaciones();
  } catch (e) {}
}

function agregarMensajeHistorial(role, texto, fecha) {
  const el = document.createElement("div");
  el.className = `message ${role}`;
  const avatar = role === "user" ? (usuario.nombre.charAt(0).toUpperCase()) : "🔧";
  const hora = fecha ? new Date(fecha).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";
  el.innerHTML = `
    <div class="message-avatar">${avatar}</div>
    <div class="message-body">
      <div class="message-meta"><span>${hora}</span></div>
      <div class="message-content">${role === "user" ? escapeHtml(texto) : renderMarkdown(texto)}</div>
    </div>`;
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function nuevaConversacion() {
  conversacionActual = null;
  localStorage.removeItem("conversacionActual");
  messagesContainer.innerHTML = "";
  welcomeMessage.classList.remove("hidden");
  headerTitle.textContent = "Nueva conversación";
  cargarConversaciones();
  cambiarVista("chat");
  inputMensaje.focus();
}

function limpiarConversacion() {
  if (!confirm("¿Limpiar la conversación actual?")) return;
  nuevaConversacion();
}

function actualizarTitulo(msg) {
  headerTitle.textContent = msg.length > 40 ? msg.substring(0, 40) + "..." : msg;
}

function exportarConversacion() {
  if (messagesContainer.children.length === 0) { alert("No hay mensajes."); return; }
  let texto = `═══ MecanicaAI — ${usuario.nombre} ═══\n${new Date().toLocaleString("es-ES")}\n\n`;
  document.querySelectorAll(".message").forEach(m => {
    const quien = m.classList.contains("user") ? `👤 ${usuario.nombre}` : "🔧 ASISTENTE";
    const content = m.querySelector(".message-content").innerText;
    texto += `${quien}:\n${content}\n\n---\n\n`;
  });
  const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${usuario.nombre.replace(/\s/g,"_")}_${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
}

// ═══ PANEL ADMIN ═══
const ADMIN_KEY = "mecanicaai-admin-2026";

async function cargarPanelAdmin() {
  if (!usuario || usuario.rol !== "admin") return;

  document.getElementById("admin-detalle").classList.add("hidden");
  document.getElementById("admin-stats").style.display = "grid";

  try {
    // Estadisticas
    const resStats = await fetch(`${API_URL}/api/admin/estadisticas`, { headers: { "x-admin-key": ADMIN_KEY } });
    const stats = await resStats.json();
    document.getElementById("admin-stats").innerHTML = `
      <div class="stat-card"><div class="stat-label">Alumnos</div><div class="stat-value">${stats.totalUsuarios}</div></div>
      <div class="stat-card"><div class="stat-label">Conversaciones</div><div class="stat-value">${stats.totalConversaciones}</div></div>
      <div class="stat-card"><div class="stat-label">Preguntas totales</div><div class="stat-value">${stats.totalMensajes}</div></div>
      <div class="stat-card"><div class="stat-label">Activos hoy</div><div class="stat-value">${stats.usuariosActivosHoy}</div></div>
    `;

    // Lista de usuarios
    const resUsers = await fetch(`${API_URL}/api/admin/usuarios`, { headers: { "x-admin-key": ADMIN_KEY } });
    const users = await resUsers.json();
    const cont = document.getElementById("admin-usuarios");
    cont.parentElement.style.display = "block";
    cont.innerHTML = users.map(u => `
      <div class="admin-usuario" data-uid="${u.id}">
        <div class="au-avatar">${u.nombre.charAt(0).toUpperCase()}</div>
        <div class="au-info">
          <div class="au-nombre">${escapeHtml(u.nombre)} ${u.rol === "admin" ? '<span class="au-badge admin">ADMIN</span>' : ''}</div>
          <div class="au-email">${escapeHtml(u.email)}</div>
        </div>
        <div class="au-stats">
          ${u.total_preguntas} preguntas<br>
          <span style="color:var(--text-muted);font-size:10px;">${new Date(u.ultimo_acceso).toLocaleDateString("es-ES")}</span>
        </div>
      </div>
    `).join("");

    document.querySelectorAll(".admin-usuario").forEach(item => {
      item.addEventListener("click", () => verPreguntasAlumno(parseInt(item.dataset.uid)));
    });
  } catch (err) {
    console.log("Error admin:", err);
  }
}

async function verPreguntasAlumno(uid) {
  try {
    const res = await fetch(`${API_URL}/api/admin/usuario/${uid}/preguntas`, { headers: { "x-admin-key": ADMIN_KEY } });
    const data = await res.json();

    document.getElementById("admin-stats").style.display = "none";
    document.getElementById("admin-usuarios").parentElement.style.display = "none";
    document.getElementById("admin-detalle").classList.remove("hidden");
    document.getElementById("admin-detalle-titulo").textContent = `📝 ${data.usuario.nombre} (${data.preguntas.length} preguntas)`;

    document.getElementById("admin-preguntas").innerHTML = data.preguntas.length === 0 ?
      '<p style="color:var(--text-muted);font-size:12px;">Este alumno aún no ha hecho preguntas.</p>' :
      data.preguntas.map(p => `
        <div class="admin-pregunta">
          <div class="ap-fecha">${new Date(p.fecha).toLocaleString("es-ES")}</div>
          <div class="ap-pregunta">❓ ${escapeHtml(p.pregunta)}</div>
          <div class="ap-respuesta">${escapeHtml((p.respuesta || "").substring(0, 500))}${(p.respuesta || "").length > 500 ? "..." : ""}</div>
          ${p.nota_usada ? `<span class="ap-nota">📚 ${escapeHtml(p.nota_usada)}</span>` : ""}
        </div>
      `).join("");
  } catch (e) {}
}

// ═══ BUSCAR VIDEOS ═══
async function buscarVideoYouTube() {
  const input = document.getElementById("video-search-input");
  const query = input.value.trim();
  if (!query) return;
  const resultsDiv = document.getElementById("video-results");
  resultsDiv.classList.remove("hidden");
  resultsDiv.innerHTML = `
    <div class="video-results-header">
      <span>🔍 Buscando: "${escapeHtml(query)}"</span>
      <button class="btn-icon-sm btn-cerrar-r">✕</button>
    </div>
    <div class="video-loading"><div class="typing-indicator"><span></span><span></span><span></span></div><p>Buscando...</p></div>
  `;
  bindCerrar(resultsDiv);

  try {
    const res = await fetch(`${API_URL}/api/buscar-videos?q=${encodeURIComponent(query)}&t=${Date.now()}`, { cache: "no-store" });
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
          <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" class="btn-link-yt">Ver más en YouTube →</a>
        </div>
      `;
    } else {
      resultsDiv.innerHTML = `
        <div class="video-results-header"><span>Sin resultados</span><button class="btn-icon-sm btn-cerrar-r">✕</button></div>
        <div class="video-fallback"><a href="https://www.youtube.com/results?search_query=${encodeURIComponent(query)}" target="_blank" class="btn-primary">🔍 Abrir en YouTube</a></div>
      `;
    }
    bindCerrar(resultsDiv);
  } catch (err) {
    resultsDiv.innerHTML = `<div class="video-fallback"><p>Error</p></div>`;
  }
}

function bindCerrar(resultsDiv) {
  const btn = resultsDiv.querySelector(".btn-cerrar-r");
  if (btn) btn.addEventListener("click", () => { resultsDiv.classList.add("hidden"); resultsDiv.innerHTML = ""; });
}

// ═══ MARKDOWN ═══
function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)[^)]*)\)/g, (m, t, u, vid) => {
    return `<a href="${u}" target="_blank" rel="noopener" class="yt-card">
      <img class="yt-thumb" src="https://img.youtube.com/vi/${vid}/mqdefault.jpg" alt="">
      <div class="yt-info">
        <span class="yt-label">📺 Vídeo</span>
        <span class="yt-title">${t}</span>
        <span class="yt-url">youtube.com</span>
      </div>
    </a>`;
  });
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
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/<\/(h[1-3]|ul|hr|blockquote)><br>/g, "</$1>");
  html = html.replace(/<hr><br>/g, "<hr>");
  return html;
}

function escapeHtml(text) { const d = document.createElement("div"); d.textContent = text || ""; return d.innerHTML; }
function scrollToBottom() { chatArea.scrollTop = chatArea.scrollHeight; }
