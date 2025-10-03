import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue, child, get, update } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// ============ Firebase ============
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

// ============ Utils ============

// Normaliza pero conserva + - * / para consultas matemáticas
function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+\-*/\s¿?¡!.,;:]/g, "")  // permite signos básicos
    .replace(/\s+/g, " ")
    .trim();
}

// Escapar HTML para evitar XSS al pintar en chat
function esc(str = "") {
  return String(str)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

// Toast simple
function toast(msg, ms=1600){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id="toast";
    t.style.position="fixed";
    t.style.left="50%";
    t.style.transform="translateX(-50%)";
    t.style.bottom="18px";
    t.style.zIndex="120";
    t.style.background="#111";
    t.style.color="#fff";
    t.style.padding="10px 14px";
    t.style.borderRadius="10px";
    t.style.opacity="0.92";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display="block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.style.display="none", ms);
}

// ============ Estado / Índice local ============

let cachePreguntas = []; // [{id,pregunta,respuesta,pregunta_norm}]
let fuse = null;
const fuseOptions = {
  includeScore: true,
  threshold: 0.33,          // más exigente para mayor precisión
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: ["pregunta", "respuesta", "pregunta_norm"]
};

// Construir cache e índice
function buildCache(snapshotVal) {
  const lista = [];
  if (snapshotVal && typeof snapshotVal === "object") {
    Object.entries(snapshotVal).forEach(([key, val]) => {
      if (!val) return;
      const pregunta = val.pregunta || key;
      const respuesta = val.respuesta || "";
      const pregunta_norm = val.pregunta_norm || normalizeText(pregunta);
      lista.push({ id: key, pregunta, respuesta, pregunta_norm });
    });
  }
  cachePreguntas = lista;
  try {
    // Fuse viene del <script src="...fuse.js"> en el HTML
    // @ts-ignore
    fuse = new Fuse(cachePreguntas, fuseOptions);
  } catch {
    fuse = null;
  }
}

// Suscripción en vivo
const recordatoriosRef = ref(database, "recordatorios");
onValue(recordatoriosRef, (snapshot) => buildCache(snapshot.val()));

// ============ Guardar / Upsert en Firebase ============

// Clave canónica: pregunta normalizada => evita duplicados
function keyFromNorm(nq) {
  // encodeURIComponent para usar como child key válida
  return encodeURIComponent(nq);
}

// Upsert: si ya existe esa pregunta (norm), se sobrescribe; si no, se crea
async function guardarDatos(p, r) {
  const nq = normalizeText(p);
  const k = keyFromNorm(nq);
  const item = { pregunta: p, respuesta: r, pregunta_norm: nq };

  // Guardar/actualizar en Firebase
  await set(child(recordatoriosRef, k), item);

  // Actualizar cache local inmediato (optimista)
  const idx = cachePreguntas.findIndex(x => x.id === k);
  if (idx >= 0) {
    cachePreguntas[idx] = { id:k, ...item };
  } else {
    cachePreguntas.push({ id:k, ...item });
  }
  // Reindexar
  try { /* @ts-ignore */ fuse = new Fuse(cachePreguntas, fuseOptions); } catch {}
  return k;
}

// ============ Hora y fecha (tiempo real) ============
function obtenerHoraActual() {
  const ahora = new Date();
  let horas = ahora.getHours();
  const minutos = ahora.getMinutes().toString().padStart(2, "0");
  const ampm = horas >= 12 ? "PM" : "AM";
  horas = horas % 12 || 12;
  return `La hora actual es ${horas}:${minutos} ${ampm}`;
}
function obtenerFechaActual() {
  return "Hoy es: " + new Date().toLocaleDateString("es-PE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

// ============ Búsqueda HÍBRIDA (impecable) ============

function buscarPregunta(query) {
  const qnorm = normalizeText(query);
  if (!qnorm) return null;

  // Respuestas dinámicas
  if (/\bhora\b/.test(qnorm)) return { respuesta: obtenerHoraActual() };
  if (/\bfecha\b/.test(qnorm)) return { respuesta: obtenerFechaActual() };

  // 1) Exacto por normalizada
  const exacts = cachePreguntas.filter(p => p.pregunta_norm === qnorm);
  if (exacts.length) return exacts[0]; // determinístico (mejor reproducibilidad)

  // 2) Fuzzy (semántico)
  if (fuse) {
    const res = fuse.search(query);
    if (res && res.length) {
      const best = res[0];
      if (best.score !== undefined && best.score <= 0.33) {
        return best.item;
      }
    }
  }

  // 3) Inclusión (substring) en normalizada
  const incl = cachePreguntas.find(p => p.pregunta_norm.includes(qnorm));
  if (incl) return incl;

  return null;
}

// ============ Chat / Voz / UI ============

let lastQuestion = "";

function mostrarChat(pregunta, respuesta) {
  const chatBox = document.getElementById("chatBox");
  chatBox.innerHTML += `
    <div class="chat-bubble chat-user"><b>Tú:</b> ${esc(pregunta)}</div>
    <div class="chat-bubble chat-bot"><b>CHAPI:</b> ${esc(respuesta)}</div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
  document.getElementById("chatModal").style.display = "block";
}

function hablar(texto) {
  try {
    const sp = new SpeechSynthesisUtterance(texto);
    sp.lang = "es-PE";
    sp.rate = 1.0;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(sp);
  } catch {}
}

function recuperarDatos(q) {
  const best = buscarPregunta(q);
  if (best) {
    mostrarChat(q, best.respuesta);
    hablar(best.respuesta);
    document.getElementById("teachBox").style.display = "none";
    lastQuestion = "";
  } else {
    const msg = "No sé esa respuesta. ¿Quieres enseñármela?";
    mostrarChat(q, msg);
    document.getElementById("teachBox").style.display = "block";
    lastQuestion = q;
    hablar("Lo siento, no encontré respuesta. ¿Quieres enseñármela?");
  }
}

// Mic/ASR
let recognition;
let listening = false;

(function setupASR(){
  try {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    recognition = new SR();
    recognition.lang = "es-PE";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = ()=>{
      listening = true;
      const mic = document.getElementById("micBtn");
      mic && mic.classList.add("active");
      document.getElementById("voiceStatus").textContent = "🎙️ Escuchando...";
    };
    recognition.onresult = e=>{
      const q = e?.results?.[0]?.[0]?.transcript || "";
      document.getElementById("voiceStatus").textContent = "Pregunta escuchada: " + q;
      if (q) recuperarDatos(q);
    };
    recognition.onerror = ()=>{
      toast("No pude escuchar bien. Inténtalo otra vez.");
    };
    recognition.onend = ()=>{
      listening = false;
      const mic = document.getElementById("micBtn");
      mic && mic.classList.remove("active");
      document.getElementById("voiceStatus").textContent = "";
    };
  } catch {}
})();

function startVoice(){
  if (!recognition) {
    alert("Tu navegador no soporta reconocimiento de voz.");
    return;
  }
  try { window.speechSynthesis.cancel(); } catch {}
  recognition.start();
}

// ============ Enlaces UI existentes ============

document.getElementById("btnVoz").addEventListener("click", startVoice);
document.getElementById("micBtn").addEventListener("click", startVoice);

document.getElementById("btnAgregar").onclick = () => mostrar("modalAgregar");
document.getElementById("closeAgregar").onclick = () => ocultar("modalAgregar");
document.getElementById("closeChat").onclick = () => ocultar("chatModal");
document.getElementById("btnConsultar").onclick = () => mostrar("modalConsultar");
document.getElementById("closeConsultar").onclick = () => ocultar("modalConsultar");

// Guardar una (UPsert por pregunta normalizada)
document.getElementById("guardarBtn").onclick = async () => {
  const p = document.getElementById("inputPregunta").value.trim();
  const r = document.getElementById("inputRespuesta").value.trim();
  if (p && r) {
    await guardarDatos(p, r);
    toast("¡Guardado! ✅");
    document.getElementById("inputPregunta").value = "";
    document.getElementById("inputRespuesta").value = "";
    ocultar("modalAgregar");
  } else {
    toast("Completa pregunta y respuesta");
  }
};

// Guardar varias (formato: Pregunta | Respuesta)
document.getElementById("guardarLoteBtn").onclick = async () => {
  const t = document.getElementById("inputLote").value.trim();
  if (!t) return;
  const lines = t.split("\n").map(l=>l.trim()).filter(Boolean);
  let ok = 0, fail = 0;
  for (const l of lines){
    const [p, ...rr] = l.split("|");
    if (p && rr.length){
      const r = rr.join("|").trim();
      if (r){
        await guardarDatos(p.trim(), r);
        ok++;
        continue;
      }
    }
    fail++;
  }
  if (ok) {
    toast(`Cargadas ${ok}${fail?` • Fallidas: ${fail}`:""}`);
    document.getElementById("inputLote").value = "";
    ocultar("modalAgregar");
  } else {
    toast("No se pudo cargar. Verifica el formato.");
  }
};

// Consultar manual
document.getElementById("consultarBtn").onclick = () => {
  const q = document.getElementById("consultaPregunta").value.trim();
  if (q) {
    recuperarDatos(q);
    ocultar("modalConsultar");
  } else {
    toast("Escribe una pregunta");
  }
};

// Guardar enseñanza cuando no hubo match
document.getElementById("teachBtn").onclick = async () => {
  const nuevaRespuesta = document.getElementById("teachInput").value.trim();
  if (lastQuestion && nuevaRespuesta) {
    await guardarDatos(lastQuestion, nuevaRespuesta);
    mostrarChat("Enseñanza", `He aprendido: "${lastQuestion}" = "${nuevaRespuesta}"`);
    document.getElementById("teachInput").value = "";
    document.getElementById("teachBox").style.display = "none";
    lastQuestion = "";
  } else {
    toast("Escribe la respuesta para enseñar");
  }
};

// Cerrar modal clic fuera
window.onclick = function(event) {
  if (event.target.classList && event.target.classList.contains("modal")) {
    ocultar(event.target.id);
  }
};

function mostrar(id){ document.getElementById(id).style.display = "block"; }
function ocultar(id){ document.getElementById(id).style.display = "none"; }

// Accesos rápidos: Enter para consultar / enseñar
document.getElementById("consultaPregunta")?.addEventListener("keydown", e=>{
  if (e.key === "Enter") document.getElementById("consultarBtn").click();
});
document.getElementById("teachInput")?.addEventListener("keydown", e=>{
  if (e.key === "Enter") document.getElementById("teachBtn").click();
});

// Mensaje de primera vez
(function firstRunTip(){
  try{
    const K = "chapi.meta";
    const meta = JSON.parse(localStorage.getItem(K) || "{}");
    if (!meta.tipShown){
      document.getElementById("chatModal").style.display = "block";
      const chatBox = document.getElementById("chatBox");
      chatBox.innerHTML += `<div class="chat-bubble chat-bot"><b>CHAPI:</b> Soy CHAPI. Pregúntame algo, por ejemplo: "¿Capital de Perú?"</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
      meta.tipShown = true;
      localStorage.setItem(K, JSON.stringify(meta));
    }
  }catch{}
})();
