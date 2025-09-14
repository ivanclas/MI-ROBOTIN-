import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, push, onValue } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// --- Configuración Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyD8Qixd8Q5DFYu0a5l5jiYC2ODrUbnjwuk",
  authDomain: "guardar-fotos-ec316.firebaseapp.com",
  databaseURL: "https://guardar-fotos-ec316-default-rtdb.firebaseio.com",
  projectId: "guardar-fotos-ec316",
  storageBucket: "guardar-fotos-ec316.appspot.com",
  messagingSenderId: "529201655026",
  appId: "1:529201655026:web:f10e873d825a72b5d8b46b",
  measurementId: "G-SMEHYGBPRR"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// --- Normalizador ---
function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+\-*/\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let cachePreguntas = [];
let fuse = null;
const fuseOptions = { includeScore: true, threshold: 0.35, keys: ['pregunta_norm'], ignoreLocation: true };

function buildCache(snapshotVal) {
  const lista = [];
  if (snapshotVal) {
    Object.entries(snapshotVal).forEach(([key, val]) => {
      const pregunta = val.pregunta || key;
      const respuesta = val.respuesta || "";
      lista.push({ id: key, pregunta, respuesta, pregunta_norm: normalizeText(pregunta) });
    });
  }
  cachePreguntas = lista;
  fuse = new Fuse(cachePreguntas, fuseOptions);
}

const recordatoriosRef = ref(database, 'recordatorios/');
onValue(recordatoriosRef, (snapshot) => buildCache(snapshot.val()));

function guardarDatos(p, r) {
  const refPush = push(recordatoriosRef);
  set(refPush, { pregunta: p, respuesta: r, pregunta_norm: normalizeText(p) });
}

function obtenerHoraActual() {
  return "La hora actual es " + new Date().toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
}

function obtenerFechaActual() {
  return "Hoy es: " + new Date().toLocaleDateString("es-ES", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

function buscarPregunta(query) {
  const qnorm = normalizeText(query);
  if (!qnorm) return null;

  if (qnorm.includes("hora")) return { respuesta: obtenerHoraActual() };
  if (qnorm.includes("fecha")) return { respuesta: obtenerFechaActual() };

  const exact = cachePreguntas.find(p => p.pregunta_norm === qnorm);
  if (exact) return exact;

  const substr = cachePreguntas.find(p => p.pregunta_norm.includes(qnorm));
  if (substr) return substr;

  const res = fuse.search(qnorm, { limit: 1 });
  return res.length ? res[0].item : null;
}

let lastQuestion = "";

function recuperarDatos(q) {
  const best = buscarPregunta(q);
  if (best) {
    mostrarChat(q, best.respuesta);
    hablar(best.respuesta);
  } else {
    mostrarChat(q, "No sé esa respuesta. ¿Quieres enseñármela?");
    document.getElementById("teachBox").style.display = "block";
    lastQuestion = q;
    hablar("Lo siento, no encontré respuesta. ¿Quieres enseñármela?");
  }
}

function mostrarChat(pregunta, respuesta) {
  const chatBox = document.getElementById("chatBox");
  chatBox.innerHTML += `
    <div class="chat-bubble chat-user"><b>Tú:</b> ${pregunta}</div>
    <div class="chat-bubble chat-bot"><b>CHAPI:</b> ${respuesta}</div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
  document.getElementById("chatModal").style.display = "block";
}

// --- Voz ---
let recognition;
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = "es-ES";
  recognition.onresult = e => {
    const q = e.results[0][0].transcript;
    document.getElementById("voiceStatus").textContent = "Pregunta escuchada: " + q;
    recuperarDatos(q);
  };
}

function startVoice(){
  if (!recognition) return alert("Tu navegador no soporta reconocimiento de voz.");
  window.speechSynthesis.cancel();
  recognition.start();
  document.getElementById("voiceStatus").textContent = "🎙️ Escuchando...";
}

document.getElementById("btnVoz").addEventListener("click", startVoice);
document.getElementById("micBtn").addEventListener("click", startVoice);

function hablar(texto) {
  const sp = new SpeechSynthesisUtterance(texto);
  sp.lang = "es-ES";
  window.speechSynthesis.speak(sp);
}

// --- Botones UI ---
document.getElementById("btnAgregar").onclick = () => mostrar("modalAgregar");
document.getElementById("closeAgregar").onclick = () => ocultar("modalAgregar");
document.getElementById("closeChat").onclick = () => ocultar("chatModal");
document.getElementById("btnConsultar").onclick = () => mostrar("modalConsultar");
document.getElementById("closeConsultar").onclick = () => ocultar("modalConsultar");

// Guardar una
document.getElementById("guardarBtn").onclick = () => {
  const p = document.getElementById("inputPregunta").value.trim();
  const r = document.getElementById("inputRespuesta").value.trim();
  if (p && r) {
    guardarDatos(p,r);
    alert("¡Pregunta registrada con éxito!");
    document.getElementById("inputPregunta").value="";
    document.getElementById("inputRespuesta").value="";
    ocultar("modalAgregar");
  }
};

// Guardar varias
document.getElementById("guardarLoteBtn").onclick = () => {
  const t = document.getElementById("inputLote").value.trim();
  if (!t) return;
  let count = 0;
  t.split("\n").forEach(l => {
    const [p,...rr] = l.split("|");
    if (p && rr.length) { guardarDatos(p.trim(), rr.join("|").trim()); count++; }
  });
  if (count > 0) {
    alert("¡Preguntas registradas con éxito!");
    document.getElementById("inputLote").value="";
    ocultar("modalAgregar");
  }
};

// Consultar manualmente
document.getElementById("consultarBtn").onclick = () => {
  const q = document.getElementById("consultaPregunta").value.trim();
  if(q){
    recuperarDatos(q);
    ocultar("modalConsultar");
  }
};

// Guardar respuesta enseñada
document.getElementById("teachBtn").onclick = () => {
  const nuevaRespuesta = document.getElementById("teachInput").value.trim();
  if (lastQuestion && nuevaRespuesta) {
    guardarDatos(lastQuestion, nuevaRespuesta);
    mostrarChat("Enseñanza", `He aprendido: "${lastQuestion}" = "${nuevaRespuesta}"`);
    document.getElementById("teachInput").value = "";
    document.getElementById("teachBox").style.display = "none";
    lastQuestion = "";
  }
};

// Cerrar modal si se hace clic fuera
window.onclick = function(event) {
  if (event.target.classList.contains("modal")) {
    ocultar(event.target.id);
  }
};

function mostrar(id){ document.getElementById(id).style.display="block"; }
function ocultar(id){ document.getElementById(id).style.display="none"; }
