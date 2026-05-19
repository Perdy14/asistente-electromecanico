# 🔧 MecánicaAI — Asistente Guiado para el Electromecánico

Sistema experto de diagnóstico automotriz con IA local, sin límites y sin coste.

Proyecto desarrollado para el IES La Palma.

## ✨ Características

- 🤖 **IA local con Ollama** — Sin API de pago, sin límites, sin internet (una vez instalado)
- 📚 **Base de notas técnicas** verificadas con procedimientos reales de taller
- 🔍 **Diagnóstico guiado** mediante formulario inteligente
- 📺 **Buscador de vídeos de YouTube** integrado para apoyo visual
- 💬 **Streaming en tiempo real** — Las respuestas aparecen palabra a palabra
- 🌙 **Tema claro/oscuro** y diseño responsive (PC y móvil)
- 💾 **Historial persistente** y exportación de conversaciones

## 🚀 Instalación

### 1. Requisitos
- [Node.js](https://nodejs.org/) (versión LTS)
- [Ollama](https://ollama.com/download) para la IA local

### 2. Clonar el repositorio
```bash
git clone https://github.com/TU_USUARIO/asistente-electromecanico.git
cd asistente-electromecanico
```

### 3. Instalar dependencias
```bash
npm install
```

### 4. Descargar el modelo de IA
```bash
ollama pull llama3.2
```

### 5. Arrancar el servidor
```bash
npm start
```

### 6. Abrir en el navegador
```
http://localhost:3000
```

## 📚 Sistemas cubiertos

- Postratamiento de gases (EGR, DPF/FAP, SCR, AdBlue)
- Inyección Common Rail (Bosch, Delphi)
- Sobrealimentación (turbo VGT)
- Diagnóstico con osciloscopio
- Sistema de carga (alternador)
- Refrigeración (termostato)
- Y mucho más...

## 🛠️ Stack tecnológico

- **Backend:** Node.js + Express
- **Frontend:** HTML + CSS + JavaScript vanilla (sin frameworks)
- **IA:** Ollama (Llama 3.2) corriendo en local
- **Persistencia:** JSON + localStorage

## 📂 Estructura

```
asistente-electromecanico/
├── server.js              # Servidor Express
├── system_prompt.js       # Personalidad del agente
├── buscar_notas.js        # Motor de búsqueda en notas
├── notas.json             # Base de conocimiento
├── package.json           # Dependencias
├── public/
│   ├── index.html         # Interfaz web
│   ├── styles.css         # Estilos
│   └── app.js             # Lógica del cliente
└── README.md
```

## 📝 Cómo añadir nuevas notas técnicas

Desde la propia web hay un formulario en la sección "Notas Técnicas" → "+ Añadir nueva nota".

También se pueden añadir manualmente editando `notas.json` con esta estructura:

```json
{
  "id": "SISTEMA.SUBSISTEMA.001",
  "categoria": "RESOLUCION DE AVERIA",
  "sistema": "Nombre del sistema",
  "titulo": "Título descriptivo",
  "sintomas": ["sintoma1", "sintoma2"],
  "componentes": ["Componente1"],
  "parametros_vitales": ["Parámetro: valor"],
  "diagnostico_logico": ["SI condición -> ENTONCES efecto"],
  "resumen": "Descripción",
  "verificacion": "Pasos de verificación",
  "resolucion": "Cómo resolver",
  "falso_diagnostico": "Error a evitar",
  "causa_raiz": "Causa del fallo",
  "nivel_evidencia": "ALTO",
  "video": "https://youtube.com/watch?v=..."
}
```

## 🤝 Créditos

Notas técnicas formativas basadas en contenido de:
- **ATDIAG** — Francisco Javier Rosales Tovar
- **MIAC DIAGNOSIS**

## 📄 Licencia

Proyecto educativo del IES La Palma.
