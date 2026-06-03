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
    // En movil, no enviar con Enter (el Enter en movil es nueva linea)
    const esMovil = window.innerWidth <= 768 || /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);
    if (e.key === "Enter" && !e.shiftKey && !esMovil) {
      e.preventDefault();
      enviarMensaje();
    }
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
  if (notas.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:20px 0;">No se encontraron notas.</p>';
    return;
  }
  grid.innerHTML = notas.map(n => {
    // Limpiar síntomas: filtrar los que parecen artefactos de parseo
    const sintomasLimpios = (n.sintomas || []).filter(s => s && s.trim().length > 2 && !s.trim().startsWith("- nodo:") && !s.trim().startsWith("\""));
    const nivel = (n.nivel_evidencia || "medio").toLowerCase();
    return `
    <div class="nota-card">
      <div class="nc-header">
        <span class="nc-id">${escapeHtml(n.id)}</span>
        <span class="nc-badge ${nivel}">${escapeHtml(n.nivel_evidencia || "MEDIO")}</span>
      </div>
      <div class="nc-title">${escapeHtml(n.titulo)}</div>
      <div class="nc-sistema">${escapeHtml(n.sistema)}</div>
      ${sintomasLimpios.length ? `<div class="nc-sintomas">${sintomasLimpios.slice(0, 5).map(s => `<span class="nc-sintoma">${escapeHtml(s)}</span>`).join("")}</div>` : ""}
      <div class="nc-actions">
        <button class="btn-ver-nota" data-nota-id="${escapeHtml(n.id)}">📄 Descargar nota PDF</button>
        ${n.video ? `<a href="${escapeHtml(n.video)}" target="_blank" rel="noopener" class="nc-video">▶️ Ver vídeo</a>` : ""}
      </div>
    </div>`;
  }).join("");

  // Eventos de los botones
  grid.querySelectorAll(".btn-ver-nota").forEach(btn => {
    btn.addEventListener("click", () => generarPDFNota(btn.dataset.notaId));
  });
}

// ── Utilidad: carga imagen desde URL proxy y devuelve dataURL ──
async function cargarImagenProxy(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Limpia texto de artefactos del parser ──
function limpiarTexto(t) {
  if (!t) return "";
  return t.replace(/\r\n/g, "\n")
          .replace(/\r/g, "\n")
          .replace(/\*/g, "")
          .replace(/^[\/\-]\s*/gm, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
}

function limpiarSintomas(arr) {
  return (arr || []).filter(s => {
    const t = (s || "").trim();
    return t.length > 2
      && !t.startsWith("- nodo:")
      && !t.startsWith('"')
      && !t.startsWith("* ")
      && !/^[0-9]{3}"$/.test(t)
      && t !== '001"' && t !== '002"' && t !== '003"';
  }).map(s => s.replace(/^[-*"]+\s*/, "").replace(/"$/, "").trim());
}

async function generarPDFNota(notaId) {
  const btn = document.querySelector(`.btn-ver-nota[data-nota-id="${notaId}"]`);
  if (btn) { btn.textContent = "⏳ Generando PDF..."; btn.disabled = true; }

  try {
    const res = await fetch(`${API_URL}/api/notas/${encodeURIComponent(notaId)}`);
    if (!res.ok) throw new Error("Nota no encontrada");
    const n = await res.json();

    // ── Pre-cargar imágenes antes de crear el doc ──
    const ytMatch = (n.video || "").match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = ytMatch ? ytMatch[1] : null;
    let thumbMain = null;
    let fotogramas = [];
    if (videoId) {
      const [p, f1, f2, f3] = await Promise.all([
        cargarImagenProxy(`${API_URL}/api/yt-thumb/${videoId}/0`),
        cargarImagenProxy(`${API_URL}/api/yt-thumb/${videoId}/1`),
        cargarImagenProxy(`${API_URL}/api/yt-thumb/${videoId}/2`),
        cargarImagenProxy(`${API_URL}/api/yt-thumb/${videoId}/3`),
      ]);
      thumbMain = p;
      // Si algún fotograma no cargó, usamos thumbMain como fallback
      // pero solo si es distinto al anterior para no repetir
      const raw = [f1, f2, f3];
      raw.forEach((f, i) => {
        const img = f || thumbMain;
        if (img) fotogramas.push(img);
      });
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // ── Paleta de colores ──
    const AZUL    = [25,  65, 160];
    const AZUL_L  = [215, 228, 255];
    const AZUL_M  = [60, 100, 200];
    const GRIS_D  = [40,  42,  54];
    const GRIS_M  = [95,  98, 112];
    const GRIS_L  = [238, 240, 245];
    const BLANCO  = [255, 255, 255];
    const VERDE   = [16, 148, 64];
    const VERDE_L = [220, 252, 231];
    const AMARILLO= [195, 130,  0];
    const AMAR_L  = [254, 249, 220];
    const ROJO    = [200,  30,  30];
    const ROJO_L  = [254, 226, 226];
    const NARANJA = [200, 100, 10];
    const NARANL  = [255, 237, 213];

    const PW = 210; const PH = 297; const ML = 14; const MR = 14; const CW = PW - ML - MR;
    let y = 0;

    function colorNivel(niv) {
      const v = (niv||"").toUpperCase();
      if (v==="ALTO") return [VERDE, VERDE_L];
      if (v==="BAJO") return [ROJO, ROJO_L];
      return [AMARILLO, AMAR_L];
    }
    function nuevaPagina() {
      doc.addPage(); y = 16;
      doc.setFillColor(...AZUL); doc.rect(0,0,PW,7,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...BLANCO);
      doc.text("MecánicaAI — IES La Palma", ML, 4.8);
      doc.text(n.id, PW-MR, 4.8, {align:"right"});
    }
    function checkY(needed=12) { if (y+needed > PH-14) nuevaPagina(); }
    function secTitulo(t, color=AZUL) {
      checkY(12);
      doc.setFillColor(...color); doc.rect(ML,y,3,7,"F");
      doc.setFillColor(...GRIS_L); doc.rect(ML+3,y,CW-3,7,"F");
      doc.setFont("helvetica","bold"); doc.setFontSize(8.5); doc.setTextColor(...color);
      doc.text(t.toUpperCase(), ML+6, y+5); y+=10;
    }
    function txtBlk(t, opts={}) {
      if (!t||!t.trim()) return;
      const sz=opts.size||9, col=opts.color||GRIS_D, bold=opts.bold||false, indent=opts.indent||0;
      doc.setFont("helvetica", bold?"bold":"normal"); doc.setFontSize(sz); doc.setTextColor(...col);
      const lines=doc.splitTextToSize(t.trim(), CW-indent);
      lines.forEach(l=>{ checkY(5); doc.text(l, ML+indent, y); y+=4.8; });
      y += opts.after!==undefined ? opts.after : 1;
    }
    function itemLista(t, bullet="•", cb=AZUL_M) {
      if (!t||!t.trim()) return;
      const lines=doc.splitTextToSize(t.trim(), CW-9);
      checkY(5);
      doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.setTextColor(...cb); doc.text(bullet,ML+2,y);
      doc.setFont("helvetica","normal"); doc.setTextColor(...GRIS_D); doc.text(lines[0],ML+8,y); y+=4.8;
      for(let i=1;i<lines.length;i++){checkY(5);doc.text(lines[i],ML+8,y);y+=4.8;}
    }
    function cajaBorde(t, bg, border, tc) {
      if(!t||!t.trim()) return;
      const lines=doc.splitTextToSize(limpiarTexto(t), CW-10);
      const h=lines.length*4.8+6; checkY(h+4);
      doc.setFillColor(...bg); doc.setDrawColor(...border); doc.setLineWidth(0.4);
      doc.roundedRect(ML,y,CW,h,2,2,"FD");
      doc.setFont("helvetica","normal"); doc.setFontSize(8.5); doc.setTextColor(...tc);
      lines.forEach((l,i)=>doc.text(l,ML+5,y+5+i*4.8)); y+=h+4;
    }
    function tablaParams(items) {
      if(!items||!items.length) return;
      const col2=ML+CW/2+2, cW=CW/2-3;
      for(let i=0;i<items.length;i+=2){
        const p1=items[i], p2=items[i+1];
        const l1=doc.splitTextToSize(p1.trim(),cW), l2=p2?doc.splitTextToSize(p2.trim(),cW):[];
        const rH=Math.max(l1.length,l2.length)*4.5+5; checkY(rH+2);
        const bg=i%4===0?GRIS_L:BLANCO;
        doc.setFillColor(...bg); doc.rect(ML,y,CW,rH,"F");
        doc.setDrawColor(220,224,232); doc.setLineWidth(0.15); doc.rect(ML,y,CW,rH,"S");
        doc.line(col2-2,y,col2-2,y+rH);
        doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...GRIS_D);
        l1.forEach((l,li)=>doc.text(l,ML+2,y+4.2+li*4.5));
        doc.setTextColor(...AZUL); l2.forEach((l,li)=>doc.text(l,col2,y+4.2+li*4.5));
        doc.setTextColor(...GRIS_D); y+=rH;
      }
      y+=4;
    }
    function insImg(dataUrl, w, h, cap="") {
      checkY(h+(cap?8:2));
      const x=ML+(CW-w)/2;
      doc.setDrawColor(...GRIS_M); doc.setLineWidth(0.3);
      doc.roundedRect(x-0.5,y-0.5,w+1,h+1,1.5,1.5,"S");
      doc.addImage(dataUrl,"JPEG",x,y,w,h,undefined,"MEDIUM"); y+=h+1.5;
      if(cap){doc.setFont("helvetica","italic");doc.setFontSize(7.5);doc.setTextColor(...GRIS_M);
              doc.text(cap,ML+CW/2,y,{align:"center"});y+=5;}
    }

    function lineaDivisoria() {
      checkY(4);
      doc.setDrawColor(210, 215, 225);
      doc.setLineWidth(0.2);
      doc.line(ML, y, ML + CW, y);
      y += 4;
    }

    // ════ PORTADA ════
    doc.setFillColor(...AZUL); doc.rect(0,0,PW,80,"F");
    doc.setFillColor(35,90,185); doc.rect(0,60,PW,25,"F");
    doc.setFillColor(50,110,200); doc.rect(0,75,PW,12,"F");
    doc.setFillColor(255,200,0); doc.rect(0,82,PW,1.2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(28); doc.setTextColor(...BLANCO);
    doc.text("MecánicaAI", ML, 22);
    doc.setFont("helvetica","normal"); doc.setFontSize(10); doc.setTextColor(180,210,255);
    doc.text("Asistente Técnico Electromecánico — IES La Palma", ML, 30);
    doc.setDrawColor(255,255,255); doc.setLineWidth(0.5); doc.line(ML,34,ML+CW,34);
    const [nivColor, nivBg] = colorNivel(n.nivel_evidencia);
    const cat=(n.categoria||"NOTA TÉCNICA").toUpperCase();
    doc.setFillColor(60,110,200); doc.roundedRect(ML,38,72,8,2,2,"F");
    doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...BLANCO);
    doc.text(cat, ML+3, 43.2);
    doc.setFillColor(...nivColor); doc.roundedRect(ML+76,38,40,8,2,2,"F");
    doc.text("EVIDENCIA: "+(n.nivel_evidencia||"MEDIO").toUpperCase(), ML+79, 43.2);
    const fecha=new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"});
    doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(180,210,255);
    doc.text(fecha, PW-MR, 43.2, {align:"right"});
    doc.setFont("courier","bold"); doc.setFontSize(8.5); doc.setTextColor(255,230,100);
    doc.text(n.id, ML, 55);
    doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...BLANCO);
    const tituloL=doc.splitTextToSize(n.titulo,CW);
    tituloL.forEach((l,i)=>doc.text(l, ML, 64+i*8));
    y = 88;
    if (thumbMain) {
      const imgW=CW, imgH=Math.round(imgW*9/16);
      insImg(thumbMain, imgW, imgH, videoId ? `Miniatura del video · youtube.com/watch?v=${videoId}` : "");
    }
    // Ficha técnica
    checkY(28);
    doc.setFillColor(...GRIS_L); doc.setDrawColor(210,215,228); doc.setLineWidth(0.3);
    doc.roundedRect(ML,y,CW,24,2,2,"FD");
    [["SISTEMA",n.sistema||"-"],["VEHÍCULO",n.vehiculo||"General"],["AUTOR",n.autor||"-"],["CATEGORÍA",n.categoria||"-"]].forEach(([label,val],i)=>{
      const fx=ML+4+(i%2)*(CW/2), fy=y+6+Math.floor(i/2)*10;
      doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...GRIS_M); doc.text(label+":", fx, fy);
      doc.setFont("helvetica","normal"); doc.setTextColor(...GRIS_D);
      doc.text(doc.splitTextToSize(val, CW/2-22)[0], fx+22, fy);
    });
    y += 28;

    // ════ CONTENIDO ════
    nuevaPagina();

    // ── SÍNTOMAS ──
    const sintomas = limpiarSintomas(n.sintomas);
    if (sintomas.length) {
      secTitulo("SINTOMAS IDENTIFICADOS", ROJO);
      sintomas.forEach(s => itemLista(s, "▸", ROJO));
      y += 3;
    }

    // ── RESUMEN ──
    const resumen = limpiarTexto(n.resumen);
    if (resumen) {
      secTitulo("RESUMEN TECNICO", AZUL);
      resumen.split("\n").filter(b=>b.trim()).forEach(b => txtBlk(b, {size:9, after:1}));
      y += 2;
    }

    // ── PARÁMETROS VITALES ──
    const params = (n.parametros_vitales||[]).filter(p=>p&&p.trim().length>3);
    if (params.length) {
      secTitulo("PARAMETROS VITALES DE REFERENCIA", AZUL_M);
      tablaParams(params);
    }

    // ── COMPONENTES ──
    const comps = (n.componentes||[]).filter(c=>c&&c.trim());
    if (comps.length) {
      secTitulo("COMPONENTES IMPLICADOS", GRIS_M);
      comps.forEach(c => itemLista(c, "◆", AZUL_M));
      y += 3;
    }

    // ── DIAGNÓSTICO LÓGICO ──
    const diag = (n.diagnostico_logico||[]).filter(d=>d&&d.trim());
    if (diag.length) {
      secTitulo("ARBOL DE DIAGNOSTICO LOGICO", AZUL);
      diag.forEach((d, i) => {
        const partes = d.trim().split(/\s*->\s*ENTONCES\s*/i);
        const condLines = doc.splitTextToSize((partes[0]||"").replace(/^SI\s*/i,"").trim(), CW-24);
        const acciLines = partes[1] ? doc.splitTextToSize(partes[1].trim(), CW-24) : [];
        const h = Math.max(condLines.length, acciLines.length)*4.5+10;
        checkY(h+4);
        doc.setFillColor(...AZUL_L); doc.setDrawColor(...AZUL_M); doc.setLineWidth(0.4);
        doc.roundedRect(ML, y, CW, h, 2, 2, "FD");
        doc.setFillColor(...AZUL); doc.circle(ML+6, y+h/2, 4, "F");
        doc.setFont("helvetica","bold"); doc.setFontSize(8); doc.setTextColor(...BLANCO);
        doc.text(String(i+1), ML+6, y+h/2+2.5, {align:"center"});
        doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...AZUL);
        doc.text("SI", ML+14, y+5.5);
        doc.setFont("helvetica","normal"); doc.setTextColor(...GRIS_D);
        condLines.forEach((l,li)=>doc.text(l, ML+20, y+5.5+li*4.5));
        if (partes[1]) {
          const yEnt=y+5.5+condLines.length*4.5+1;
          doc.setFont("helvetica","bold"); doc.setFontSize(7.5); doc.setTextColor(...VERDE);
          doc.text("=>", ML+14, yEnt);
          doc.setFont("helvetica","normal"); doc.setTextColor(...GRIS_D);
          acciLines.forEach((l,li)=>doc.text(l, ML+20, yEnt+li*4.5));
        }
        y += h+3;
      });
      y += 2;
    }

    // ── VERIFICACIÓN ──
    const verif = limpiarTexto(n.verificacion);
    if (verif && verif.length > 6) {
      secTitulo("PROCESO DE VERIFICACION", AZUL_M);
      txtBlk(verif);
    }

    // ── RESOLUCIÓN ──
    const resol = limpiarTexto(n.resolucion);
    if (resol && resol.length > 4 && resol !== "Y FALSO DIAGNÓSTICO") {
      secTitulo("RESOLUCION", VERDE);
      cajaBorde(resol, VERDE_L, VERDE, GRIS_D);
    }

    // ── FALSO DIAGNÓSTICO ──
    const falso = limpiarTexto(n.falso_diagnostico);
    if (falso && falso.length > 6) {
      secTitulo("FALSO DIAGNOSTICO / INTERVENCION CORRECTIVA", ROJO);
      cajaBorde(falso, ROJO_L, ROJO, ROJO);
    }

    // ── CAUSA RAÍZ ──
    const causa = limpiarTexto(n.causa_raiz);
    if (causa && causa.length > 4) {
      secTitulo("CAUSA RAIZ", NARANJA);
      cajaBorde(causa, NARANL, NARANJA, NARANJA);
    }

    // ════ PÁGINA DE IMÁGENES ════
    if (thumbMain || videoId) {
      nuevaPagina();
      secTitulo("CAPTURAS DEL VIDEO DE REFERENCIA", AZUL);

      // ── Miniatura principal grande (portada del vídeo) ──
      if (thumbMain) {
        const imgW = CW;
        const imgH = Math.round(imgW * 9 / 16);
        insImg(thumbMain, imgW, imgH, "Miniatura oficial del vídeo");
        y += 4;
      }

      // ── Fotogramas reales del vídeo con texto explicativo ──
      // Los textos los sacamos del diagnóstico lógico y resumen
      const diagItems = (n.diagnostico_logico || []).filter(d => d && d.trim());
      const resumenLineas = limpiarTexto(n.resumen).split("\n").filter(l => l.trim().length > 10);
      const textosCaptura = [
        diagItems[0] ? diagItems[0].replace(/^SI\s*/i,"").split(/->.*ENTONCES/i)[0].trim() : (resumenLineas[0] || "Inicio del procedimiento de diagnóstico"),
        diagItems[1] ? diagItems[1].replace(/^SI\s*/i,"").split(/->.*ENTONCES/i)[0].trim() : (resumenLineas[1] || "Desarrollo del análisis técnico"),
        diagItems[2] ? diagItems[2].replace(/^SI\s*/i,"").split(/->.*ENTONCES/i)[0].trim() : (resumenLineas[2] || "Verificación y resolución del fallo"),
      ];

      if (fotogramas.length > 0) {
        secTitulo("FOTOGRAMAS DEL VIDEO (MOMENTOS CLAVE)", AZUL_M);

        fotogramas.forEach((img, i) => {
          const momento = i === 0 ? "25% del vídeo" : i === 1 ? "50% del vídeo" : "75% del vídeo";
          const descripcion = textosCaptura[i] || "";

          checkY(45);
          // Layout: imagen izquierda (60%) + texto derecho (40%)
          const imgW = CW * 0.58;
          const imgH = Math.round(imgW * 9 / 16);
          const textX = ML + imgW + 5;
          const textW = CW - imgW - 5;

          // Borde imagen
          doc.setDrawColor(...GRIS_M); doc.setLineWidth(0.3);
          doc.roundedRect(ML - 0.5, y - 0.5, imgW + 1, imgH + 1, 1.5, 1.5, "S");
          doc.addImage(img, "JPEG", ML, y, imgW, imgH, undefined, "FAST");

          // Texto derecho
          doc.setFillColor(...AZUL_L);
          doc.roundedRect(textX, y, textW, imgH, 2, 2, "F");

          // Número de fotograma
          doc.setFillColor(...AZUL);
          doc.roundedRect(textX + 2, y + 2, textW - 4, 8, 1.5, 1.5, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...BLANCO);
          doc.text(`FOTOGRAMA ${i + 1}  ·  ${momento}`, textX + 4, y + 7);

          // Descripción
          doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...GRIS_D);
          const descLines = doc.splitTextToSize(descripcion, textW - 6);
          descLines.slice(0, 5).forEach((l, li) => {
            doc.text(l, textX + 3, y + 14 + li * 5);
          });

          // Etiqueta "Ver en vídeo"
          if (n.video) {
            doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...AZUL);
            doc.text("► Ver en el vídeo completo", textX + 3, y + imgH - 4);
          }

          // Caption bajo imagen
          doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRIS_M);
          doc.text(`Fotograma ${i + 1} — ${momento}`, ML + imgW / 2, y + imgH + 4, { align: "center" });

          y += imgH + 8;
        });
      }

      // ── Enlace al vídeo ──
      y += 2; checkY(22);
      const videoUrl = n.video || `https://www.youtube.com/watch?v=${videoId}`;
      doc.setFillColor(...ROJO_L); doc.setDrawColor(...ROJO); doc.setLineWidth(0.5);
      doc.roundedRect(ML, y, CW, 20, 3, 3, "FD");
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(180, 30, 30);
      doc.text("►  Video de referencia completo", ML + 6, y + 7);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...AZUL);
      doc.textWithLink(videoUrl, ML + 6, y + 14, { url: videoUrl });
      doc.setFont("helvetica", "italic"); doc.setFontSize(7.5); doc.setTextColor(...GRIS_M);
      doc.text("Haz clic en el enlace para ver el video completo en YouTube", ML + 6, y + 19);
      y += 24;
    }

    // ════ PIE EN TODAS LAS PÁGINAS ════
    const APP_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "https://mecanicaai.tailabb588.ts.net"
      : window.location.origin;
    const totalPages = doc.getNumberOfPages();
    for (let i=1; i<=totalPages; i++) {
      doc.setPage(i);
      doc.setFillColor(...GRIS_L); doc.rect(0, PH-11, PW, 11, "F");
      doc.setFillColor(...AZUL); doc.rect(0, PH-11, 2, 11, "F");
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...GRIS_M);
      doc.text(`MecánicaAI  ·  IES La Palma  ·  ${APP_URL}`, ML, PH-4.5);
      doc.setFont("helvetica","bold");
      doc.text(`${i} / ${totalPages}`, PW-MR, PH-4.5, {align:"right"});
    }

    const nombreArchivo = `NT_${n.id.replace(/[^a-zA-Z0-9_-]/g,"_")}.pdf`;
    doc.save(nombreArchivo);

  } catch (err) {
    alert("Error al generar el PDF: " + err.message);
  } finally {
    if (btn) { btn.textContent = "📄 Descargar nota PDF"; btn.disabled = false; }
  }
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
  let recibioToken = false;

  // Si el servidor tarda mucho en responder (Render Free), mostrar aviso
  const avisoLento = setTimeout(() => {
    if (!recibioToken) {
      contentEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--text-muted);">
          <div class="typing-indicator"><span></span><span></span><span></span></div>
          <div>⏳ El servidor está despertando (puede tardar hasta 1 minuto la primera vez)...</div>
        </div>
      `;
    }
  }, 5000);

  // Timeout maximo de 90 segundos
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 90000);

  try {
    const response = await fetch(`${API_URL}/api/mensaje/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensaje, sessionId, usuarioId: usuario.id, conversacionId: conversacionActual }),
      signal: controlador.signal
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
            recibioToken = true;
            clearTimeout(avisoLento);
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
    clearTimeout(avisoLento);
    if (err.name === "AbortError") {
      contentEl.innerHTML = renderMarkdown("⚠️ El servidor tardó demasiado en responder. Inténtalo de nuevo en unos segundos.");
    } else {
      contentEl.innerHTML = renderMarkdown("⚠️ Error de conexión. Verifica tu internet e inténtalo de nuevo.");
    }
  } finally {
    clearTimeout(timeout);
    clearTimeout(avisoLento);
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
