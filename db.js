/**
 * BASE DE DATOS — SQLite local
 * Sin limites, sin APIs, sin dependencias externas.
 *
 * Tablas:
 *  - usuarios: cada alumno registrado
 *  - conversaciones: agrupa mensajes por sesion
 *  - mensajes: pregunta + respuesta de cada interaccion
 */

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "mecanicaai.db");
const db = new Database(DB_PATH);

// Habilitar mejoras de rendimiento
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ═══ CREAR TABLAS ═══
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT DEFAULT 'alumno',
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultimo_acceso DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER NOT NULL,
    titulo TEXT,
    fecha_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversacion_id INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL,
    pregunta TEXT NOT NULL,
    respuesta TEXT,
    nota_usada TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversacion_id) REFERENCES conversaciones(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
  );

  CREATE INDEX IF NOT EXISTS idx_mensajes_usuario ON mensajes(usuario_id);
  CREATE INDEX IF NOT EXISTS idx_mensajes_conv ON mensajes(conversacion_id);
  CREATE INDEX IF NOT EXISTS idx_conv_usuario ON conversaciones(usuario_id);
`);

console.log("📦 Base de datos lista en:", DB_PATH);

// ═══ FUNCIONES PARA USUARIOS ═══

function crearOActualizarUsuario(email, nombre) {
  const emailLimpio = email.toLowerCase().trim();
  const existente = db.prepare("SELECT * FROM usuarios WHERE email = ?").get(emailLimpio);

  if (existente) {
    db.prepare("UPDATE usuarios SET ultimo_acceso = CURRENT_TIMESTAMP, nombre = ? WHERE id = ?")
      .run(nombre, existente.id);
    return existente;
  }

  const result = db.prepare("INSERT INTO usuarios (email, nombre) VALUES (?, ?)")
    .run(emailLimpio, nombre);
  return db.prepare("SELECT * FROM usuarios WHERE id = ?").get(result.lastInsertRowid);
}

function obtenerUsuarioPorId(id) {
  return db.prepare("SELECT * FROM usuarios WHERE id = ?").get(id);
}

function obtenerUsuarioPorEmail(email) {
  return db.prepare("SELECT * FROM usuarios WHERE email = ?").get(email.toLowerCase().trim());
}

function listarUsuarios() {
  return db.prepare(`
    SELECT u.*,
      (SELECT COUNT(*) FROM mensajes m WHERE m.usuario_id = u.id) as total_preguntas,
      (SELECT COUNT(*) FROM conversaciones c WHERE c.usuario_id = u.id) as total_conversaciones
    FROM usuarios u
    ORDER BY u.ultimo_acceso DESC
  `).all();
}

// ═══ FUNCIONES PARA CONVERSACIONES ═══

function crearConversacion(usuarioId, titulo) {
  const result = db.prepare("INSERT INTO conversaciones (usuario_id, titulo) VALUES (?, ?)")
    .run(usuarioId, titulo || "Nueva conversacion");
  return result.lastInsertRowid;
}

function actualizarTituloConversacion(convId, titulo) {
  db.prepare("UPDATE conversaciones SET titulo = ? WHERE id = ?").run(titulo, convId);
}

function listarConversaciones(usuarioId) {
  return db.prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM mensajes m WHERE m.conversacion_id = c.id) as total_mensajes
    FROM conversaciones c
    WHERE c.usuario_id = ?
    ORDER BY c.fecha_inicio DESC
    LIMIT 50
  `).all(usuarioId);
}

function obtenerMensajesConversacion(convId) {
  return db.prepare(`
    SELECT * FROM mensajes
    WHERE conversacion_id = ?
    ORDER BY fecha ASC
  `).all(convId);
}

// ═══ FUNCIONES PARA MENSAJES ═══

function guardarMensaje(convId, usuarioId, pregunta, respuesta, notaUsada) {
  const result = db.prepare(`
    INSERT INTO mensajes (conversacion_id, usuario_id, pregunta, respuesta, nota_usada)
    VALUES (?, ?, ?, ?, ?)
  `).run(convId, usuarioId, pregunta, respuesta, notaUsada || null);
  return result.lastInsertRowid;
}

// ═══ ESTADISTICAS ═══

function estadisticas() {
  const totalUsuarios = db.prepare("SELECT COUNT(*) as n FROM usuarios").get().n;
  const totalMensajes = db.prepare("SELECT COUNT(*) as n FROM mensajes").get().n;
  const totalConversaciones = db.prepare("SELECT COUNT(*) as n FROM conversaciones").get().n;
  const usuariosActivosHoy = db.prepare(`
    SELECT COUNT(DISTINCT usuario_id) as n FROM mensajes
    WHERE fecha >= datetime('now', '-1 day')
  `).get().n;
  const top5 = db.prepare(`
    SELECT u.nombre, u.email, COUNT(m.id) as preguntas
    FROM usuarios u
    LEFT JOIN mensajes m ON m.usuario_id = u.id
    GROUP BY u.id
    ORDER BY preguntas DESC
    LIMIT 5
  `).all();

  return { totalUsuarios, totalMensajes, totalConversaciones, usuariosActivosHoy, top5 };
}

function preguntasDeUsuario(usuarioId, limite) {
  return db.prepare(`
    SELECT m.*, c.titulo as conversacion_titulo
    FROM mensajes m
    LEFT JOIN conversaciones c ON c.id = m.conversacion_id
    WHERE m.usuario_id = ?
    ORDER BY m.fecha DESC
    LIMIT ?
  `).all(usuarioId, limite || 100);
}

module.exports = {
  db,
  crearOActualizarUsuario,
  obtenerUsuarioPorId,
  obtenerUsuarioPorEmail,
  listarUsuarios,
  crearConversacion,
  actualizarTituloConversacion,
  listarConversaciones,
  obtenerMensajesConversacion,
  guardarMensaje,
  estadisticas,
  preguntasDeUsuario
};
