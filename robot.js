// Inicializando el reconocimiento de voz
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recognition = new SpeechRecognition();
recognition.lang = 'es-ES';
recognition.interimResults = false;
recognition.continuous = true;

// Elementos del DOM
const startBtn = document.getElementById('start-btn');
const chatBox = document.getElementById('chat-box');

// Variables para mantener el estado de la conversación
let nombreUsuario = '';
let estado = 'inicio'; // Puede cambiar a "pregunta nombre", "conversación", etc.
let mencionLorena = false;

// Evento para empezar a escuchar cuando haces clic en el botón
startBtn.addEventListener('click', () => {
    recognition.start();
});

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
    chatBox.scrollTop = chatBox.scrollHeight; // Scroll automático
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
            respuesta = 'Estoy bien, gracias por preguntar. ¿Y tú?';
        } else if (texto.includes('y qué haces')) {
            respuesta = 'Pensando en lo que me dijiste en la mañana.';
        } else if (texto.includes('qué te dije en la mañana')) {
            respuesta = 'Me dijiste que me ibas a lograr desarrollar, y que tu enamorada Lorena no lo creía.';
            mencionLorena = true;
        } else if (texto.includes('ahora ves que nada es imposible')) {
            respuesta = 'Así es. Nunca dudes de mí, Lorena. Soy tu novio.';
            mencionLorena = false; // Reinicia la mención
        } else if (texto.includes('adiós') || texto.includes('hasta luego')) {
            respuesta = `Adiós, ${nombreUsuario}. ¡Que tengas un buen día!`;
            estado = 'inicio'; // Reinicia la conversación
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
    utterance.lang = 'es-ES';
    window.speechSynthesis.speak(utterance);
}
