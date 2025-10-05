// ========= CARGA OPCIONAL DE FUSE (si no existe) =========
(function ensureFuse(){
  if (!window.Fuse) {
    const s = document.createElement('script');
    s.src = "https://cdn.jsdelivr.net/npm/fuse.js@7.0.0/dist/fuse.min.js";
    s.defer = true;
    document.head.appendChild(s);
  }
})();

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getDatabase, ref, set, onValue, child } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

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
    .replace(/[^a-z0-9+\-*/()\s¿?¡!.,;:#\[\]]/g, "")
    .replace(/\s+/g, " ").trim();
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

// ===== Helpers de grupo / seen =====
function slugGrupo(g){
  const raw = String(g||"").toLowerCase().replace(/^#/, "").trim();
  if (!raw) return "";
  return raw.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g,"-").replace(/^[-_]+|[-_]+$/g,"");
}

// Persistencia de “ya vistos”
const SEEN_GLOBAL_KEY = "chapi.seen.global";
const SEEN_GROUP_PREFIX = "chapi.seen.group.";
function loadSeen(key){
  try{ return new Set(JSON.parse(localStorage.getItem(key) || "[]")); }catch{ return new Set(); }
}
function saveSeen(key, setObj){
  try{ localStorage.setItem(key, JSON.stringify(Array.from(setObj))); }catch{}
}
let seenGlobal = loadSeen(SEEN_GLOBAL_KEY);
function seenGroupKey(g){ return SEEN_GROUP_PREFIX + slugGrupo(g); }
function loadSeenGroup(g){ return loadSeen(seenGroupKey(g)); }
function markSeen(id, group=""){
  if (!id) return;
  seenGlobal.add(id); saveSeen(SEEN_GLOBAL_KEY, seenGlobal);
  if (group){
    const k = seenGroupKey(group);
    const s = loadSeen(k); s.add(id); saveSeen(k, s);
  }
}
function notSeen(id, group=""){
  if (!id) return false;
  if (seenGlobal.has(id)) return false;
  if (group){
    const s = loadSeenGroup(group);
    if (s.has(id)) return false;
  }
  return true;
}

// === Contexto de sesión para "otro/otra/uno más"
const lastContext = {
  group: "",   // último grupo usado
  lastId: "",  // último id servido
};

// ======== Nombre del usuario (memoria local) ========
const USER_NAME_KEY = "chapi.user.name";
function getUserName(){
  try { return localStorage.getItem(USER_NAME_KEY) || ""; } catch { return ""; }
}
function setUserName(name){
  const nice = capitalizeName(name);
  try { localStorage.setItem(USER_NAME_KEY, nice); } catch {}
  return nice;
}
function clearUserName(){
  try { localStorage.removeItem(USER_NAME_KEY); } catch {}
}
function hasName(){ return !!getUserName(); }
function capitalizeName(s=""){
  const t = String(s).trim().toLowerCase();
  if (!t) return "";
  return t.replace(/(?:^|\s|-)([a-záéíóúñ])/g, (m, c) => m.replace(c, c.toUpperCase()));
}
/**
 * Extrae nombre de frases:
 * - hola chapi, mi nombre es X
 * - yo me llamo X / me llaman X / me dicen X / soy X
 * - #nombre=X  /  nombre: X
 */
function extractNameFromSentence(raw=""){
  const txt = String(raw || "").trim();

  // Comando explícito
  let m = txt.match(/(?:#?\s*nombre\s*[:=]\s*)([A-Za-zÁÉÍÓÚÑ][\w'’áéíóúñ-]{1,30}(?:\s+[A-Za-zÁÉÍÓÚÑ][\w'’áéíóúñ-]{1,30}){0,3})/i);
  if (m) return m[1].replace(/[.,;:!?]+$/, "").trim();

  // Frases naturales (tolera “hola chapi,”)
  const re = new RegExp(
    String.raw`(?:^|\b)(?:hola(?:\s+\w+)*,\s*)?(?:yo\s+)?(?:me\s+llamo|mi\s+nombre\s+es|me\s+dicen|me\s+llaman|soy)\s*[:,-]?\s*` +
    String.raw`([a-záéíóúñ][a-záéíóúñ'’\-]{1,30}(?:\s+[a-záéíóúñ][a-záéíóúñ'’\-]{1,30}){0,3})`,
    "i"
  );
  const m2 = txt.match(re);
  if (m2) return m2[1].replace(/[.,;:!?]+$/, "").trim();

  return "";
}
/** Personaliza salida:
 * - Reemplaza {nombre} si existe (solo si tú lo pones en tus datos)
 * - NO antepone ni repite el nombre automáticamente
 */
function personalize(texto){
  const name = getUserName();
  let out = String(texto || "");
  if (/\{nombre\}/i.test(out)) {
    return name ? out.replace(/\{nombre\}/gi, name) : out.replace(/\{nombre\}/gi, "");
  }
  return out;
}

// ===== SMART UTILS =====
const STOP = new Set("a al algo algun alguna algunos algunas ante antes aquel aquella aquellas aquellos aqui asi aunque bien cada como con contra cual cuales cuando de del desde donde dos e el ella ellas ellos en entre era eran ese esa eso esta estas este estos fue fueron ha habia había han hasta hay la las le les lo los mas más me mi mis mientras muy ni no nos o otro otra otros otras para pero poco por porque que quien se sin sobre su sus suya suyo susya tal tambien también te ti tiene tienen tuvo un una unas unos y ya".split(/\s+/));
function keywords(s){
  return normalizeText(s).split(/\s+/).filter(w => w && w.length > 2 && !STOP.has(w));
}
// Cálculo matemático simple seguro
function computeMath(q){
  const expr = q.replace(/,/g,".").match(/[-+/*()\d.\s]+/g)?.join("") || "";
  if (!expr || /[^\d+\-*/().\s]/.test(expr)) return null;
  try{
    const val = Function('"use strict"; return (' + expr + ');')();
    if (typeof val === "number" && isFinite(val)) {
      const out = Math.round((val + Number.EPSILON) * 1e6)/1e6;
      return `Resultado: ${out}`;
    }
  }catch{}
  return null;
}

// ============ Estado / Índice local ============
let cachePreguntas = []; // [{id,pregunta,respuesta,pregunta_norm,grupo?}]
let fuse = null;
const fuseOptions = {
  includeScore: true,
  threshold: 0.28,
  ignoreLocation: true,
  minMatchCharLength: 2,
  keys: ["pregunta", "respuesta", "pregunta_norm"]
};
function buildCache(snapshotVal) {
  const lista = [];
  if (snapshotVal && typeof snapshotVal === "object") {
    const entries = Object.entries(snapshotVal);
    for (const [key, val] of entries){
      if (!val) continue;
      const pregunta = (val.pregunta != null) ? val.pregunta : key;
      const respuesta = (val.respuesta != null) ? val.respuesta : "";
      const pregunta_norm = (val.pregunta_norm != null) ? val.pregunta_norm : normalizeText(pregunta);
      const grupo = slugGrupo(val.grupo || "");
      lista.push({ id: key, pregunta, respuesta, pregunta_norm, grupo });
    }
  }
  cachePreguntas = lista;
  try { if (window.Fuse) /* @ts-ignore */ fuse = new Fuse(cachePreguntas, fuseOptions); }
  catch { fuse = null; }
}
// Suscripción en vivo
const recordatoriosRef = ref(database, "recordatorios");
onValue(recordatoriosRef, (snapshot) => buildCache(snapshot.val()));

// ============ Guardar / Upsert ============
function keyFromNorm(nq) { return encodeURIComponent(nq); }
async function guardarDatos(p, r, grupo="") {
  const nq = normalizeText(p);
  const k = keyFromNorm(nq);
  const g = slugGrupo(grupo);
  const item = { pregunta: p, respuesta: r, pregunta_norm: nq };
  if (g) item.grupo = g;
  try{
    await set(child(recordatoriosRef, k), item);
  }catch(e){
    console.error(e); toast("⚠️ Error guardando. Revisa conexión."); throw e;
  }
  // cache optimista
  let idx = -1;
  for (let i=0;i<cachePreguntas.length;i++){ if (cachePreguntas[i].id === k){ idx = i; break; } }
  const cached = { id:k, ...item };
  if (idx >= 0) cachePreguntas[idx] = cached; else cachePreguntas.push(cached);
  try { if (window.Fuse) /* @ts-ignore */ fuse = new Fuse(cachePreguntas, fuseOptions); } catch {}
  return k;
}

// ============ Fecha y Hora ============
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

// ============ Detección de intención ============
function knownGroups(){
  const set = new Set();
  for (let i=0;i<cachePreguntas.length;i++){ const g = cachePreguntas[i].grupo; if (g) set.add(g); }
  return Array.from(set);
}
function detectRandomIntent(qnorm){
  return /\b(azar|random|cualquiera|sorprendeme|sorpréndeme)\b/.test(qnorm);
}
// *** Corregida: usa último grupo para "otro/otra/uno más/más" ***
function inferGroupFromQuery(qnorm){
  // explícitos
  let g = "";
  const mHash  = qnorm.match(/(?:^|\s)#([a-z0-9\-_]+)/);
  const mGrupo = qnorm.match(/\bgrupo\s+(?:de\s+)?([a-z0-9\-_]+)/);
  if (mHash)  g = slugGrupo(mHash[1]);
  else if (mGrupo) g = slugGrupo(mGrupo[1]);
  if (g) return g;

  // heurística: palabra exacta
  const toks = new Set(qnorm.split(/\s+/));
  const ks = knownGroups();
  for (const kg of ks){ if (kg && toks.has(kg)) return kg; }

  // NUEVO: “otro/otra/uno más/más” → usa último grupo
  if (/\b(otro|otra|otra\s+vez|uno\s+m[aá]s|m[aá]s)\b/.test(qnorm) && lastContext.group){
    return lastContext.group;
  }
  return "";
}

// ============ Selección orientada a NO repetir ============
function firstUnseen(candidates, group=""){
  for (let i=0;i<candidates.length;i++){
    const it = candidates[i];
    if (notSeen(it.id, group)) return it;
  }
  return null;
}

// ============ Búsqueda HÍBRIDA con grupos y NO repetición ============
function buscarPregunta(query) {
  const qTrim = String(query || "").trim();
  const qnorm = normalizeText(query);

  // ---- Comandos / consultas sobre NOMBRE ----
  if (/^#\s*quien_soy$/i.test(qTrim)) {
    const name = getUserName();
    return { respuesta: name ? `Te llamas ${name}.` : "Aún no me has dicho tu nombre. Dime: me llamo TU NOMBRE." };
  }
  if (/^#\s*olvida_nombre$/i.test(qTrim)) {
    clearUserName();
    return { respuesta: "Listo, olvidé tu nombre. Dime “me llamo TU NOMBRE” para guardarlo de nuevo." };
  }
  if (/\b(c[oó]mo\s+me\s+llamo|cu[aá]l\s+es\s+mi\s+nombre|dime\s+mi\s+nombre|mi\s+nombre\?)\b/i.test(qnorm)) {
    const name = getUserName();
    return { respuesta: name ? `Te llamas ${name}.` : "Aún no me has dicho tu nombre. Dime: me llamo TU NOMBRE." };
  }

  if (!qnorm) return null;

  // 0) Dinámicas
  if (/\bhora\b/.test(qnorm)) return { respuesta: obtenerHoraActual() };
  if (/\bfecha\b/.test(qnorm)) return { respuesta: obtenerFechaActual() };

  const randomIntent = detectRandomIntent(qnorm);
  const groupName = inferGroupFromQuery(qnorm);

  // 1) Matemáticas simples
  if (!groupName && /[\d)(+\-*/]/.test(qnorm)) {
    const m = computeMath(qnorm);
    if (m) return { respuesta: m };
  }

  // Universo por grupo
  const universe = groupName
    ? cachePreguntas.filter(it => it.grupo === groupName)
    : cachePreguntas.slice();

  // 2) Exacto SIN repetir
  const exactCandidates = universe.filter(it => it.pregunta_norm === qnorm);
  const exactUnseen = exactCandidates.find(it => notSeen(it.id, groupName));
  if (exactUnseen) return exactUnseen;
  // (si no hay exacto unseen, NO devolvemos el visto; seguimos abajo)

  // 3) Fuzzy SIN repetir
  if (fuse) {
    const res = fuse.search(query);
    if (res && res.length) {
      const ordered = res.map(r => r.item).filter(it => !groupName || it.grupo === groupName);
      const fuzzyUnseen = ordered.find(it => notSeen(it.id, groupName));
      if (fuzzyUnseen) return fuzzyUnseen;
    }
  }

  // 4) Keywords SIN repetir
  const ks = new Set(keywords(qnorm));
  if (ks.size && universe.length) {
    const ranked = [];
    for (const item of universe){
      const words = item.pregunta_norm.split(/\s+/);
      let hits = 0; for (const w of words) if (ks.has(w)) hits++;
      if (hits > 0) ranked.push({ item, hits });
    }
    ranked.sort((a,b)=> b.hits - a.hits || a.item.pregunta.length - b.item.pregunta.length);
    const kwUnseen = ranked.map(x=>x.item).find(it => notSeen(it.id, groupName));
    if (kwUnseen) return kwUnseen;
  }

  // 5) Si HAY grupo y NO hay match, NO usar azar salvo que lo pidan: intenta cualquier "unseen"
  if (groupName && !randomIntent) {
    const anyUnseen = universe.find(it => notSeen(it.id, groupName));
    if (anyUnseen) return anyUnseen;
    return { respuesta: `Ya te mostré todo lo del grupo #${groupName}. Agrega más o pide otro grupo.` };
  }

  // 6) Azar SIN repetir
  if (groupName) {
    const pool = universe.filter(it => notSeen(it.id, groupName));
    if (pool.length) return pool[Math.floor(Math.random()*pool.length)];
    return { respuesta: `No quedan elementos nuevos en #${groupName}.` };
  } else if (randomIntent) {
    const pool = cachePreguntas.filter(it => notSeen(it.id, ""));
    if (pool.length) return pool[Math.floor(Math.random()*pool.length)];
    return { respuesta: "No quedan elementos nuevos para mostrar. Agrega más contenido." };
  }

  // 7) Nada
  return null;
}

// ============ Voz Masculina ============
let preferVoiceName = localStorage.getItem("chapi.voiceName") || "";
const preferMale = true;
function pickVoice() {
  const list = speechSynthesis.getVoices() || [];
  if (!list.length) return null;
  if (preferVoiceName) {
    const keep = list.find(v => v.name === preferVoiceName);
    if (keep) return keep;
  }
  const candidates = list.filter(v => /es(-|_)?(PE|ES|MX|US)?/i.test(v.lang));
  const maleNames = /(male|hombre|miguel|jorge|diego|carlos|enrique|pablo|sergio|jaime|antonio|alberto|ramon|fernando|gonzalo|lucas)/i;
  let chosen = null;
  if (preferMale){ chosen = candidates.find(v => maleNames.test(v.name)) || candidates[0] || list[0]; }
  else { chosen = candidates[0] || list[0]; }
  if (chosen) { preferVoiceName = chosen.name; localStorage.setItem("chapi.voiceName", preferVoiceName); }
  return chosen;
}
function speakChunks(texto, onend){
  try {
    window.speechSynthesis.cancel();
    const parts = String(texto).split(/([.!?]+)\s+/);
    const chunks = [];
    for (const part of parts){
      if (!part || !part.trim()) continue;
      if (/[.!?]+/.test(part) && chunks.length) chunks[chunks.length-1] += part + " ";
      else chunks.push(part.trim());
    }
    let i = 0;
    const playNext = ()=>{
      if (i >= chunks.length) { onend && onend(); return; }
      const u = new SpeechSynthesisUtterance(chunks[i++]);
      u.lang = "es-PE"; u.rate = 0.98; u.pitch = 0.85; u.volume = 1.0;
      const v = pickVoice(); if (v) u.voice = v;
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
        if (vs && vs.length){ pickVoice(); clearInterval(iv); }
      }, 250);
      speechSynthesis.onvoiceschanged = ()=>{ pickVoice(); };
    }
  }catch{}
})();

// ============ Chat / UI ============
let lastQuestion = "";
function mostrarChat(pregunta, respuesta) {
  const chatBox = document.getElementById("chatBox");
  if (!chatBox) return;
  const respuestaOut = personalize(respuesta); // respeta {nombre}
  chatBox.innerHTML += `
    <div class="chat-bubble chat-user"><b>Tú:</b> ${esc(pregunta)}</div>
    <div class="chat-bubble chat-bot"><b>CHAPI:</b> ${esc(respuestaOut)}</div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;
  const modal = document.getElementById("chatModal");
  if (modal) modal.style.display = "block";
}
function hablar(texto) {
  if (!('speechSynthesis' in window)) return;
  speakChunks(personalize(texto));
}

// Separar “Respuesta | grupo”
function splitRespuestaGrupo(respuesta) {
  let r = (respuesta || "").trim();
  let g = "";
  const m = r.match(/\|\s*([a-z0-9\-_#]+)\s*$/i);
  if (m) {
    g = slugGrupo(m[1]);
    r = r.replace(/\|\s*([a-z0-9\-_#]+)\s*$/i, "").trim();
  }
  return { r, g };
}

function recuperarDatos(q) {
  // ---- 1) Detectar nombre y saludar SOLO si es la primera vez o si cambió ----
  const saidName = extractNameFromSentence(q);
  if (saidName) {
    const prev = getUserName();
    const nice = capitalizeName(saidName);
    if (!prev) {
      setUserName(nice);
      const saludo = `Hola, ${nice}. ¡Qué gusto! Desde ahora te llamaré por tu nombre.`;
      mostrarChat(q, saludo);
      hablar(saludo);
      return; // ya respondimos esta interacción con el saludo
    } else if (prev && prev !== nice) {
      setUserName(nice);
      const upd = `Perfecto, actualicé tu nombre a ${nice}.`;
      mostrarChat(q, upd);
      hablar(upd);
      return;
    }
    // Si dijo el mismo nombre que ya teníamos, sigue flujo normal.
  }

  // ---- 2) Buscar respuesta normal ----
  const best = buscarPregunta(q);

  if (!best) {
    const msg = "No tengo esa respuesta todavía. ¿Quieres enseñármela?";
    mostrarChat(q, msg);
    const tb = document.getElementById("teachBox"); if (tb) tb.style.display = "block";
    lastQuestion = q;
    hablar("Puedo aprenderla ahora mismo si me la enseñas.");
    return;
  }

  const titulo = best.pregunta || q;
  const texto  = best.respuesta || "";

  // Guarda contexto para “otro/otra/más”
  lastContext.group = (best.grupo || inferGroupFromQuery(normalizeText(q)) || "");
  lastContext.lastId = best.id || "";

  // Muestra y habla
  mostrarChat(titulo, texto);
  hablar(texto);

  // Marca visto
  if (best.id) markSeen(best.id, best.grupo || "");
  const tb = document.getElementById("teachBox"); if (tb) tb.style.display = "none";
  lastQuestion = "";
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
      const mic = document.getElementById("micBtn"); if (mic) mic.classList.add("active");
      const st = document.getElementById("voiceStatus"); if (st) st.textContent = "🎙️ Escuchando...";
    };
    recognition.onresult = e=>{
      const q = (e && e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) ? e.results[0][0].transcript : "";
      const st = document.getElementById("voiceStatus"); if (st) st.textContent = "Pregunta escuchada: " + q;
      if (q) recuperarDatos(q);
    };
    recognition.onerror = ()=>{ toast("No pude escuchar bien. Inténtalo otra vez."); };
    recognition.onend = ()=>{
      listening = false;
      const mic = document.getElementById("micBtn"); if (mic) mic.classList.remove("active");
      const st = document.getElementById("voiceStatus"); if (st) st.textContent = "";
    };
  } catch {}
})();
function startVoice(){
  if (!recognition) { alert("Tu navegador no soporta reconocimiento de voz."); return; }
  try { window.speechSynthesis.cancel(); } catch {}
  recognition.start();
}

// ============ Enlaces UI ============
const byId = (id)=> document.getElementById(id);
function safeOnClick(id, fn){ const el = byId(id); if (el) el.onclick = fn; }
function mostrar(id){ const el = byId(id); if (el) el.style.display = "block"; }
function ocultar(id){ const el = byId(id); if (el) el.style.display = "none"; }

safeOnClick("btnVoz", startVoice);
safeOnClick("micBtn", startVoice);
safeOnClick("btnAgregar", () => mostrar("modalAgregar"));
safeOnClick("closeAgregar", () => ocultar("modalAgregar"));
safeOnClick("closeChat", () => ocultar("chatModal"));
safeOnClick("btnConsultar", () => mostrar("modalConsultar"));
safeOnClick("closeConsultar", () => ocultar("modalConsultar"));

// Guardar una
safeOnClick("guardarBtn", async () => {
  const p = byId("inputPregunta") ? byId("inputPregunta").value.trim() : "";
  const rRaw = byId("inputRespuesta") ? byId("inputRespuesta").value.trim() : "";
  const gInput = byId("inputGrupo") ? byId("inputGrupo").value.trim() : "";
  const sr = splitRespuestaGrupo(rRaw);
  const r = sr.r;
  const g = gInput || sr.g;
  if (!p || !r) { toast("Completa pregunta y respuesta"); return; }
  try{
    await guardarDatos(p, r, g);
    toast("¡Guardado! ✅");
    for (const id of ["inputPregunta","inputRespuesta","inputGrupo"]) { const el = byId(id); if (el) el.value = ""; }
    ocultar("modalAgregar");
  }catch{}
});

// Parser de lote
function parseLinea(raw){
  const m = raw.match(/^(.*?)\s*\|\s*(.*?)\s*(?:\|\s*([a-z0-9\-_#]+))?\s*$/i);
  if (!m) return null;
  let p = (m[1] || "").trim();
  let r = (m[2] || "").trim();
  let g = (m[3] || "").trim();
  const cola = r.match(/\|\s*([a-z0-9\-_#]+)\s*$/i);
  if (cola && !g) { g = cola[1]; r = r.replace(/\|\s*([a-z0-9\-_#]+)\s*$/i, "").trim(); }
  g = slugGrupo(g);
  return { p, r, g };
}
safeOnClick("guardarLoteBtn", async () => {
  const area = byId("inputLote"); if (!area) return;
  const t = area.value.trim(); if (!t) return;
  const lines = t.split("\n").map(l=>l.trim()).filter(Boolean);
  let ok = 0, fail = 0; const errores = [];
  for (let i=0;i<lines.length;i++){
    const parsed = parseLinea(lines[i]);
    if (!parsed || !parsed.p || !parsed.r){ fail++; errores.push(`Línea ${i+1}: formato inválido`); continue; }
    if (/\|\s*[a-z0-9\-_#]+\s*$/i.test(parsed.r)){ fail++; errores.push(`Línea ${i+1}: el grupo quedó pegado a la respuesta`); continue; }
    try { await guardarDatos(parsed.p, parsed.r, parsed.g); ok++; }
    catch { fail++; errores.push(`Línea ${i+1}: error al guardar`); }
  }
  if (ok) { toast(`Cargadas ${ok}${fail?` • Fallidas: ${fail}`:""}`); area.value = ""; ocultar("modalAgregar"); }
  else { toast("No se pudo cargar. Revisa los errores."); }
  if (errores.length){ console.warn("Problemas al cargar:", errores); try{ alert("Errores:\n- " + errores.join("\n- ")); }catch{} }
});

// Consultar
safeOnClick("consultarBtn", () => {
  const el = byId("consultaPregunta");
  const q = el ? el.value.trim() : "";
  if (q) { recuperarDatos(q); ocultar("modalConsultar"); }
  else { toast("Escribe una pregunta"); }
});

// Enseñar desde chat
safeOnClick("teachBtn", async () => {
  const inp = byId("teachInput");
  const rRaw = inp ? inp.value.trim() : "";
  const gInput = byId("teachGrupo") ? byId("teachGrupo").value.trim() : "";
  const sr = splitRespuestaGrupo(rRaw);
  const r = sr.r;
  const g = gInput || sr.g;
  if (lastQuestion && r) {
    try{
      await guardarDatos(lastQuestion, r, g);
      mostrarChat("Enseñanza", `He aprendido: "${lastQuestion}" = "${r}"${g?` (#${g})`:""}`);
      if (inp) inp.value = "";
      const tb = byId("teachBox"); if (tb) tb.style.display = "none";
      lastQuestion = "";
    }catch{}
  } else {
    toast("Escribe la respuesta para enseñar");
  }
});

// Cerrar modal clic fuera
window.addEventListener("click", (event)=>{
  const t = event.target;
  if (t && t.classList && t.classList.contains("modal")) {
    ocultar(t.id);
  }
});

// Enters
const cq = byId("consultaPregunta");
if (cq) cq.addEventListener("keydown", e=>{ if (e.key === "Enter") { const b = byId("consultarBtn"); if (b) b.click(); } });
const ti = byId("teachInput");
if (ti) ti.addEventListener("keydown", e=>{ if (e.key === "Enter") { const b = byId("teachBtn"); if (b) b.click(); } });

// Primera vez (no dice nombre)
(function firstRunTip(){
  try{
    const K = "chapi.meta";
    const meta = JSON.parse(localStorage.getItem(K) || "{}");
    if (!meta.tipShown){
      const chatBox = byId("chatBox");
      const modal = byId("chatModal");
      if (chatBox && modal){
        modal.style.display = "block";
        chatBox.innerHTML += `<div class="chat-bubble chat-bot"><b>CHAPI:</b> Hola. Si quieres, dime “hola chapi, mi nombre es TU NOMBRE” o “yo me llamo TU NOMBRE”. También puedes preguntar “¿cómo me llamo?” para que te lo recuerde.</div>`;
        chatBox.scrollTop = chatBox.scrollHeight;
      }
      meta.tipShown = true;
      localStorage.setItem(K, JSON.stringify(meta));
    }
  }catch{}
})();
