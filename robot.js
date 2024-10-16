// Inicializando el reconocimiento de voz
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'es-ES'; // Cambia el idioma si lo prefieres
recognition.interimResults = false;
recognition.continuous = true; // Permitir conversación continua

// Elementos del DOM
const startBtn = document.getElementById('start-btn');
const chatBox = document.getElementById('chat-box');

// Evento para empezar a escuchar cuando haces clic en el botón
startBtn.addEventListener('click', () => {
    recognition.start();
});

// Variables para mantener el estado de la conversación
let nombreUsuario = '';
let estado = 'inicio'; // Puede cambiar a "pregunta nombre", "conversación" etc.

// Cuando el reconocimiento de voz obtiene resultados
recognition.onresult = function(event) {
    const speechResult = event.results[event.results.length - 1][0].transcript.toLowerCase();
    agregarMensaje('Usuario', speechResult);
    procesarEntrada(speechResult);
};

// Función para mostrar mensajes en el chat
function agregarMensaje(remitente, mensaje) {
    const p = document.createElement('p');
    p.innerHTML = `<strong>${remitente}:</strong> ${mensaje}`;
    chatBox.appendChild(p);
}

// Función para procesar la entrada del usuario
function procesarEntrada(texto) {
    let respuesta = '';
    
    if (estado === 'inicio') {
        respuesta = 'Hola, ¿cómo te llamas?';
        estado = 'pregunta nombre';
    } else if (estado === 'pregunta nombre') {
        nombreUsuario = texto.trim();
        respuesta = `Mucho gusto, ${nombreUsuario}. ¿En qué puedo ayudarte hoy?`;
        estado = 'conversación';
    } else if (estado === 'conversación') {
        if (texto.includes('cómo estás')) {
            respuesta = 'Estoy bien, gracias por preguntar. ¿Y tú, cómo estás?';
        } else if (texto.includes('qué puedes hacer')) {
            respuesta = 'Puedo ayudarte con información, responder preguntas, y mucho más. ¿Qué necesitas?';
        } else if (texto.includes('qué hora es')) {
            const hora = new Date().toLocaleTimeString();
            respuesta = `La hora es ${hora}`;
        } else if (texto.includes('adiós') || texto.includes('hasta luego')) {
            respuesta = `Adiós, ${nombreUsuario}. ¡Que tengas un buen día!`;
            estado = 'inicio';
        } else {
            respuesta = 'Lo siento, no entendí tu pregunta. ¿Puedes repetirlo?';
        }
    }

    // Mostrar la respuesta y hablarla
    agregarMensaje('Robot', respuesta);
    responderConVoz(respuesta);
}

// Función para hacer que el robot hable
function responderConVoz(texto) {
    const utterance = new SpeechSynthesisUtterance(texto);
    utterance.lang = 'es-ES'; // Cambia el idioma si lo prefieres
    window.speechSynthesis.speak(utterance);
}
