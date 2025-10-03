import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue, child, update } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

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
function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+\-*/\s¿?¡!.,;:#\[\]]/g, "") // permite #etiquetas y []
    .replace(/\s+/g, " ")
    .trim();
}
function esc(str = "") {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function toast(msg, ms=1600){
  let t = document.getElementById("toast");
  if(!t){
    t = document.createElement("div");
    t.id="toast";
    Object.assign(t.style,{
      position:"fixed",left:"50%",transform:"translateX(-50%)",
      bottom:"18px",zIndex:"120",background:"#111",color:"#fff",
      padding:"10px 14px",borderRadius:"10px",opacity:"0.96",fontFamily:"system-ui,Arial"
    });
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display="block";
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> t.style.display="none", ms);
}

// ============ Estado / Índice local ============
let cachePreguntas = []; // [{id,pregunta,respuesta,pregunta_norm,grupo?}]
let fuse = null;
const fuseOptions = {
  includeScore: true,
  threshold: 0.28,                // un poco más preciso
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: ["pregunta", "respuesta", "pregunta_norm"]
};

// “Bolsa barajada” por grupos (p.ej., #cuento) para no repetir
const shuffleBags = {
  // clave: nombre de grupo => { list:[ids], idx:number }
};
function makeShuffleList(items){
  // copia barajada (Fisher–Yates)
  const a = items.slice();
  for (let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function nextFromBag(groupName, ids){
  if (!shuffleBags[groupName] || shuffleBags[groupName].list.length === 0) {
    shuffleBags[groupName] = { list: makeShuffleList(ids), idx: 0 };
  }
  const bag = shuffleBags[groupName];
  const id = bag.list[bag.idx++];
  if (bag.idx >= bag.list.length) bag.idx = 0; // al final, vuelve a barajar la próxima vez
  return id;
}

function inferGrupoFromItem(item){
  // Preferencia explícita: campo grupo en DB si existe
  if (item.grupo) return String(item.grupo).toLowerCase().trim();
  // Inferencia simple por etiquetas en texto: #cuento, [cuento], #historia
  const mark = (item.pregunta + " " + item.respuesta).toLowerCase();
  if (/#cuento\b|\[cuento\]|\bhistoria corta\b/.test(mark)) return "cuento";
  return ""; // sin grupo
}

function buildCache(snapshotVal) {
  const lista = [];
  if (snapshotVal && typeof snapshotVal === "object") {
    Object.entries(snapshotVal).forEach(([key, val]) => {
      if (!val) return;
      const pregunta = val.pregunta ?? key;
      const respuesta = val.respuesta ?? "";
      const pregunta_norm = val.pregunta_norm ?? normalizeText(pregunta);
      const grupo = inferGrupoFromItem({pregunta, respuesta, grupo:val.grupo});
      lista.push({ id: key, pregunta, respuesta, pregunta_norm, grupo });
    });
  }
  cachePreguntas = lista;

  // (Re)construir índice Fuse si está disponible
  try {
    // @ts-ignore
    if (window.Fuse) fuse = new Fuse(cachePreguntas, fuseOptions);
    else fuse = null;
  } catch {
    fuse = null;
  }

  // reconstruir bolsas por grupo
  const byGroup = cachePreguntas.reduce((acc,it)=>{
    if (it.grupo){
      (acc[it.grupo] = acc[it.grupo] || []).push(it.id);
    }
    return acc;
  },{});
  Object.keys(byGroup).forEach(g=>{
    shuffleBags[g] = { list: makeShuffleList(byGroup[g]), idx: 0 };
  });
}

// Suscripción en vivo
const recordatoriosRef = ref(database, "recordatorios");
onValue(recordatoriosRef, (snapshot) => buildCache(snapshot.val()));

// ============ Guardar / Upsert en Firebase ============
function keyFromNorm(nq) {
  return encodeURIComponent(nq);
}
async function guardarDatos(p, r, grupo="") {
  const nq = normalizeText(p);
  const k = keyFromNorm(nq);
  const item = { pregunta: p, respuesta: r, pregunta_norm: nq };
  if (grupo) item.grupo = normalizeText("#"+grupo).replace(/^#/, "");

  try{
    await set(child(recordatoriosRef, k), item);
  }catch(e){
    console.error(e);
    toast("⚠️ Error guardando. Revisa conexión.");
    throw e;
  }

  // Cache local optimista
  const idx = cachePreguntas.findIndex(x => x.id === k);
  const cached = { id:k, ...item };
  if (idx >= 0) cachePreguntas[idx] = cached; else cachePreguntas.push(cached);

  // Reindexar
  try { if (window.Fuse) /* @ts-ignore */ fuse = new Fuse(cachePreguntas, fuseOptions); } catch {}
  return k;
}

// ============ Hora y fecha ============
function obtenerHoraActual() {
  const ahora = new Date();
  let h = ahora.getHours();
  const m = ahora.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `La hora actual es ${h}:${m} ${ampm}`;
}
function obtenerFechaActual() {
  return "Hoy es: " + new Date().toLocaleDateString("es-PE", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

// ============ Búsqueda HÍBRIDA ============
function buscarPregunta(query) {
  const qnorm = normalizeText(query);
  if (!qnorm) return null;

  // Respuestas dinámicas
  if (/\bhora\b/.test(qnorm)) return { respuesta: obtenerHoraActual() };
  if (/\bfecha\b/.test(qnorm)) return { respuesta: obtenerFechaActual() };

  // Si el usuario pide un cuento al azar
  if (/\b(cuento|cuentos)\b/.test(qnorm) && /\bazar|random|aleatori/.test(qnorm)) {
    const cuentos = cachePreguntas.filter(x => x.grupo === "cuento");
    if (cuentos.length){
      const id = nextFromBag("cuento", cuentos.map(x=>x.id));
      const sel = cachePreguntas.find(x=>x.id===id);
      if (sel) return sel;
    }
  }

  // 1) Exacto por normalizada
  const exact = cachePreguntas.find(p => p.pregunta_norm === qnorm);
  if (exact) return exact;

  // 2) Fuzzy (si hay Fuse y match confiable)
  if (fuse) {
    const res = fuse.search(query);
    if (res && res.length) {
      const best = res[0];
      if (best.score !== undefined && best.score <= fuseOptions.threshold) {
        return best.item;
      }
    }
  }

  // 3) Inclusión (substring) en normalizada
  const incl = cachePreguntas.find(p => p.pregunta_norm.includes(qnorm));
  if (incl) return incl;

  return null;
}

// ============ Voz: SIEMPRE MASCULINA (si existe) ============
let voiceReady = false;
let preferVoiceName = localStorage.getItem("chapi.voiceName") || "";
const preferMale = true; // fijo: CHAPI es hombre

function pickVoice() {
  const list = speechSynthesis.getVoices() || [];
  if (!list.length) return null;

  // Si hay preferida guardada, úsala
  if (preferVoiceName) {
    const v = list.find(v => v.name === preferVoiceName);
    if (v) return v;
  }

  // Intentar voces masculinas en español
  const candidates = list.filter(v =>
    /es(-|_)?(PE|ES|MX|US)?/i.test(v.lang) // español
  );

  // Heurística por nombre (varía por SO/navegador)
  const maleNames = /(male|hombre|miguel|jorge|diego|carlos|enrique|pablo|sergio|jaime|antonio|alberto|ramon|fernando|gonzalo|lucas)/i;

  let chosen = null;
  if (preferMale) {
    chosen = candidates.find(v => maleNames.test(v.name)) || candidates[0] || list[0];
  } else {
    chosen = candidates[0] || list[0];
  }
  if (chosen) {
    preferVoiceName = chosen.name;
    localStorage.setItem("chapi.voiceName", preferVoiceName);
  }
  return chosen;
}

function speakChunks(texto, onend){
  try {
    window.speechSynthesis.cancel();

    // Partir por pausas para mejor claridad
    const chunks = String(texto).split(/([.!?]+)\s+/).reduce((acc,part,idx,arr)=>{
      if (!part.trim()) return acc;
      if (/[.!?]+/.test(part) && acc.length){
        acc[acc.length-1] += part + " ";
      } else {
        acc.push(part.trim());
      }
      return acc;
    },[]);

    let i = 0;
    const playNext = ()=>{
      if (i >= chunks.length) { onend && onend(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = "es-PE";
      u.rate = 0.98;    // más claro
      u.pitch = 0.85;   // más grave
      u.volume = 1.0;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onend = playNext;
      speechSynthesis.speak(u);
    };
    playNext();
  } catch {}
}

(function initVoices(){
  try{
    if ('speechSynthesis' in window) {
      const iv = setInterval(()=>{
        const vs = speechSynthesis.getVoices();
        if (vs && vs.length){
          voiceReady = true;
          pickVoice();
          clearInterval(iv);
        }
      }, 250);
      speechSynthesis.onvoiceschanged = ()=>{
        voiceReady = true; pickVoice();
      };
    }
  }catch{}
})();

// ============ Chat / UI ============
let lastQuestion = "";

function mostrarChat(pregunta, respuesta) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  chatBox.innerHTML += `
    <div class="chat-bubble chat-user"><b>Tú:</b> ${esc(pregunta)}</div>
    <div class="chat-bubble chat-bot"><b>CHAPI:</b> ${esc(respuesta)}</div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
  const modal = document.getElementById("chatModal");
  if (modal) modal.style.display = "block";
}

function hablar(texto) {
  if (!('speechSynthesis' in window)) return;
  speakChunks(texto);
}

function recuperarDatos(q) {
  const best = buscarPregunta(q);
  if (best) {
    mostrarChat(q, best.respuesta);
    hablar(best.respuesta);
    const tb = document.getElementById("teachBox");
    if (tb) tb.style.display = "none";
    lastQuestion = "";
  } else {
    const msg = "No sé esa respuesta. ¿Quieres enseñármela?";
    mostrarChat(q, msg);
    const tb = document.getElementById("teachBox");
    if (tb) tb.style.display = "block";
    lastQuestion = q;
    hablar("Lo siento, no encontré respuesta. ¿Quieres enseñármela?");
  }
}

// ============ Mic/ASR ============
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
      document.getElementById("micBtn")?.classList.add("active");
      const st = document.getElementById("voiceStatus");
      if (st) st.textContent = "🎙️ Escuchando...";
    };
    recognition.onresult = e=>{
      const q = e?.results?.[0]?.[0]?.transcript || "";
      const st = document.getElementById("voiceStatus");
      if (st) st.textContent = "Pregunta escuchada: " + q;
      if (q) recuperarDatos(q);
    };
    recognition.onerror = ()=>{
      toast("No pude escuchar bien. Inténtalo otra vez.");
    };
    recognition.onend = ()=>{
      listening = false;
      document.getElementById("micBtn")?.classList.remove("active");
      const st = document.getElementById("voiceStatus");
      if (st) st.textContent = "";
    };
  } catch {}
})();
function startVoice(){
  if (!recognition) { alert("Tu navegador no soporta reconocimiento de voz."); return; }
  try { window.speechSynthesis.cancel(); } catch {}
  recognition.start();
}

// ============ Enlaces UI existentes ============
document.getElementById("btnVoz")?.addEventListener("click", startVoice);
document.getElementById("micBtn")?.addEventListener("click", startVoice);

function safeOnClick(id, fn){ const el = document.getElementById(id); if (el) el.onclick = fn; }
function mostrar(id){ const el = document.getElementById(id); if (el) el.style.display = "block"; }
function ocultar(id){ const el = document.getElementById(id); if (el) el.style.display = "none"; }

safeOnClick("btnAgregar", () => mostrar("modalAgregar"));
safeOnClick("closeAgregar", () => ocultar("modalAgregar"));
safeOnClick("closeChat", () => ocultar("chatModal"));
safeOnClick("btnConsultar", () => mostrar("modalConsultar"));
safeOnClick("closeConsultar", () => ocultar("modalConsultar"));

// Guardar una (UPsert por pregunta normalizada)
// Si pones en el campo “Grupo (opcional)” el texto: cuento => entrará a la bolsa sin repetición
safeOnClick("guardarBtn", async () => {
  const p = document.getElementById("inputPregunta")?.value.trim();
  const r = document.getElementById("inputRespuesta")?.value.trim();
  const g = document.getElementById("inputGrupo")?.value.trim() || ""; // NUEVO: input opcional para grupo
  if (p && r) {
    try{
      await guardarDatos(p, r, g);
      toast("¡Guardado! ✅");
      const a = id=>{ const el = document.getElementById(id); if (el) el.value=""; };
      a("inputPregunta"); a("inputRespuesta"); a("inputGrupo");
      ocultar("modalAgregar");
    }catch{}
  } else {
    toast("Completa pregunta y respuesta");
  }
});

// Guardar varias (formato: Pregunta | Respuesta | Grupo?)
safeOnClick("guardarLoteBtn", async () => {
  const area = document.getElementById("inputLote");
  if (!area) return;
  const t = area.value.trim();
  if (!t) return;
  const lines = t.split("\n").map(l=>l.trim()).filter(Boolean);
  let ok = 0, fail = 0;
  for (const l of lines){
    const parts = l.split("|").map(x=>x.trim());
    if (parts.length >= 2){
      const [p, r, g=""] = parts;
      if (p && r){
        try{ await guardarDatos(p, r, g); ok++; }catch{ fail++; }
        continue;
      }
    }
    fail++;
  }
  if (ok) {
    toast(`Cargadas ${ok}${fail?` • Fallidas: ${fail}`:""}`);
    area.value = "";
    ocultar("modalAgregar");
  } else {
    toast("No se pudo cargar. Verifica el formato.");
  }
});

// Consultar manual
safeOnClick("consultarBtn", () => {
  const el = document.getElementById("consultaPregunta");
  const q = el?.value.trim();
  if (q) {
    recuperarDatos(q);
    ocultar("modalConsultar");
  } else {
    toast("Escribe una pregunta");
  }
});

// Guardar enseñanza cuando no hubo match
safeOnClick("teachBtn", async () => {
  const inp = document.getElementById("teachInput");
  const g = document.getElementById("teachGrupo")?.value.trim() || "";
  const nuevaRespuesta = inp?.value.trim();
  if (lastQuestion && nuevaRespuesta) {
    try{
      await guardarDatos(lastQuestion, nuevaRespuesta, g);
      mostrarChat("Enseñanza", `He aprendido: "${lastQuestion}" = "${nuevaRespuesta}"${g?` (#${g})`:""}`);
      if (inp) inp.value = "";
      const tb = document.getElementById("teachBox"); if (tb) tb.style.display = "none";
      lastQuestion = "";
    }catch{}
  } else {
    toast("Escribe la respuesta para enseñar");
  }
});

// Cerrar modal clic fuera
window.addEventListener("click", (event)=>{
  if (event.target?.classList?.contains("modal")) {
    ocultar(event.target.id);
  }
});

// Accesos rápidos: Enter para consultar / enseñar
document.getElementById("consultaPregunta")?.addEventListener("keydown", e=>{
  if (e.key === "Enter") document.getElementById("consultarBtn")?.click();
});
document.getElementById("teachInput")?.addEventListener("keydown", e=>{
  if (e.key === "Enter") document.getElementById("teachBtn")?.click();
});

// Mensaje de primera vez
(function firstRunTip(){
  try{
    const K = "chapi.meta";
    const meta = JSON.parse(localStorage.getItem(K) || "{}");
    if (!meta.tipShown){
      const chatBox = document.getElementById("chatBox");
      const modal = document.getElementById("chatModal");
      if (chatBox && modal){
        modal.style.display = "block";
        chatBox.innerHTML += `<div class="chat-bubble chat-bot"><b>CHAPI:</b> Soy CHAPI (voz masculina). Pregúntame algo, por ejemplo: "¿Capital de Perú?"</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      meta.tipShown = true;
      localStorage.setItem(K, JSON.stringify(meta));
    }
  }catch{}
})();
