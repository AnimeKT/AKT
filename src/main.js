import { Buffer } from "buffer";
import bigInt from "big-integer";
import { Api } from "telegram";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

let videoSeleccionado = null;

let listaDeVideos = []; // Aquí guardaremos todos los videos del Topic
let indiceActual = 0;

// REGISTRO DEL SERVICE WORKER
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then((registration) => {
      console.log('✅ Service Worker registrado con alcance:', registration.scope);
    })
    .catch((error) => {
      console.error('❌ Error al registrar el Service Worker:', error);
    });
}

// 1. REEMPLAZA ESTO CON TUS DATOS DE my.telegram.org
const apiId = 37849964; // <- Pon tu API_ID aquí (sin comillas, es un número)
const apiHash = "274305508ef10ef30b8d6d980c98cb5b"; // <- Pon tu API_HASH aquí (entre comillas)

// 2. Revisamos si ya hay una sesión guardada para no pedir código de nuevo
const savedSession = localStorage.getItem("telegram_session") || "";
const stringSession = new StringSession(savedSession);

const client = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
  // Le decimos qué dispositivo es manualmente para evitar el error "os"
  deviceModel: "AnimeKaergsty Web", 
  systemVersion: "1.0.0",
  appVersion: "1.0.0",
  // ¡VITAL PARA NAVEGADORES! Obliga a usar WebSockets
  useWSS: true, 
});

// 3. Capturamos los elementos de la interfaz (UI)
const phoneInput = document.getElementById("phone-input");
const btnSendCode = document.getElementById("btn-send-code");

const stepPhone = document.getElementById("step-phone");
const stepCode = document.getElementById("step-code");
const codeInput = document.getElementById("code-input");
const btnVerifyCode = document.getElementById("btn-verify-code");

const stepPassword = document.getElementById("step-password");
const passwordInput = document.getElementById("password-input");
const btnVerifyPassword = document.getElementById("btn-verify-password");

const loginSection = document.getElementById("login-section");
const videoContainer = document.getElementById("video-container");

// 4. Lógica cuando el usuario presiona "Enviar Código"
btnSendCode.addEventListener("click", async () => {
  const phoneNumber = phoneInput.value;
  if (!phoneNumber) return alert("Ingresa un número válido");

  btnSendCode.textContent = "Cargando...";
  btnSendCode.disabled = true;
  
  try {
    // client.start() maneja automáticamente el flujo de login
    await client.start({
      phoneNumber: async () => phoneNumber,
      
      // Si Telegram pide el código, mostramos el modal del código
      phoneCode: async () => {
        stepPhone.classList.add("hidden");
        stepCode.classList.remove("hidden");
        return new Promise((resolve) => {
          btnVerifyCode.onclick = () => resolve(codeInput.value);
        });
      },
      
      // Si el usuario tiene Verificación en 2 Pasos, pedimos la contraseña
      password: async () => {
        stepCode.classList.add("hidden");
        stepPassword.classList.remove("hidden");
        return new Promise((resolve) => {
          btnVerifyPassword.onclick = () => resolve(passwordInput.value);
        });
      },
      onError: (err) => {
        console.error("Error en login:", err);
        alert("Ocurrió un error: " + err.message);
      },
    });

    console.log("¡Conectado exitosamente!");
    
    // Guardamos la sesión en el navegador para futuras visitas
    localStorage.setItem("telegram_session", client.session.save());
    

  // Ocultamos el login y mostramos el área del video
    loginSection.classList.add("hidden");
    videoContainer.classList.remove("hidden");

    // LECTURA DINÁMICA DE LA URL (Para usuarios que se loguean por 1ra vez)
    const ruta = window.location.pathname.replace(/\//g, ""); 
    const topicId = parseInt(ruta, 10);

    if (!isNaN(topicId)) {
        console.log(`📂 Amigo logueado por 1ra vez. Abriendo Topic: ${topicId}`);
        buscarVideo("", topicId);
    } else {
        buscarVideo(""); // Búsqueda general si no hay link
    }

  } catch (error) {
    console.error("Fallo de conexión:", error);
    btnSendCode.textContent = "Enviar Código";
    btnSendCode.disabled = false;
  }
});

// 5. Autologin: Si ya teníamos sesión, nos conectamos en silencio
if (savedSession) {
  console.log("Sesión encontrada. Conectando silenciosamente...");
  client.connect().then(() => {
    loginSection.classList.add("hidden");
    videoContainer.classList.remove("hidden");

    // LECTURA DINÁMICA DE LA URL
    // Extraemos el número de la ruta (ej. /2726 se convierte en 2726)
    const ruta = window.location.pathname.replace(/\//g, ""); 
    const topicId = parseInt(ruta, 10);

    if (!isNaN(topicId)) {
        console.log(`📂 Amigo logueado. Abriendo Topic directamente: ${topicId}`);
        buscarVideo("", topicId);
    } else {
        buscarVideo(""); // Búsqueda general si no hay link
    }

  }).catch(error => {
    console.log("Ajustando conexión de Telegram en segundo plano...");
  });
}

// 6. Lógica para buscar la lista de videos
async function buscarVideo(textoBusqueda, topicId = null) {
  try {
    const parametrosBusqueda = {
        peer: "@AnimeKTe", 
        q: textoBusqueda, 
        filter: new Api.InputMessagesFilterVideo(), 
        limit: 50, // Aumentamos el límite para capturar toda la temporada
    };

    if (topicId) parametrosBusqueda.topMsgId = topicId;

    const result = await client.invoke(new Api.messages.Search(parametrosBusqueda));

    // Filtramos para asegurarnos de que solo haya mensajes con documentos (videos)
    listaDeVideos = result.messages.filter(msg => msg.media && msg.media.document);

    if (listaDeVideos.length > 0) {
        console.log(`¡Encontramos ${listaDeVideos.length} videos en esta lista!`);
        
        // Telegram devuelve los resultados del más nuevo al más viejo.
        // Los invertimos para que el Capítulo 1 sea el primero y el Capítulo 2 el siguiente.
        listaDeVideos.reverse(); 
        
        indiceActual = 0; // Empezamos por el primer video
        cargarVideoEnReproductor(); // Llamamos a la nueva función
    } else {
        document.getElementById("video-title").textContent = "No se encontraron videos en este tema.";
    }
  } catch (error) {
    console.error("Error buscando el video:", error);
  }
}

// NUEVA FUNCIÓN: Encargada de poner el video en pantalla y limpiar el título
function cargarVideoEnReproductor() {
    const mensajeActual = listaDeVideos[indiceActual];
    const videoDoc = mensajeActual.media.document;
    
    videoSeleccionado = videoDoc; // Guardamos para el Service Worker
    const videoId = videoDoc.id.toString();
    
    // 1. Extraer y limpiar el nombre del archivo
    let nombreOriginal = "Video sin título";
    const atributoNombre = videoDoc.attributes.find(attr => attr.className === 'DocumentAttributeFilename');
    if (atributoNombre) nombreOriginal = atributoNombre.fileName;
    
    // MAGIA: Cortamos el texto justo donde encuentre un "[" o un "."
    const nombreLimpio = nombreOriginal.split(/\[|\./)[0].trim(); 
    
    // Actualizamos la interfaz
    document.getElementById("video-title").textContent = nombreLimpio;
    
    // 2. Controlar si las flechas deben encenderse o apagarse
    document.getElementById("btn-prev").disabled = (indiceActual === 0);
    document.getElementById("btn-next").disabled = (indiceActual === listaDeVideos.length - 1);
    
    // 3. Enviar al reproductor
    const reproductor = document.getElementById("reproductor");
    reproductor.src = `/stream/${videoId}`;
    reproductor.preload = "auto";
    reproductor.play().catch(() => console.log("Play automático bloqueado por el navegador"));
}

// 4. Lógica de las flechas (Añade esto justo debajo de la función cargarVideoEnReproductor)
document.getElementById("btn-prev").addEventListener("click", () => {
    if (indiceActual > 0) {
        indiceActual--;
        cargarVideoEnReproductor();
    }
});

document.getElementById("btn-next").addEventListener("click", () => {
    if (indiceActual < listaDeVideos.length - 1) {
        indiceActual++;
        cargarVideoEnReproductor();
    }
});

// 7. MOTOR DE DESCARGA: Escuchar pedidos del Service Worker
navigator.serviceWorker.addEventListener('message', async (event) => {
  if (event.data && event.data.type === 'REQUEST_CHUNK') {
    const { range } = event.data;
    const port = event.ports[0];
    
    if (!videoSeleccionado) return port.postMessage({ error: "No hay video guardado" });

    // Calculamos qué pedazo pide el reproductor
    let start = 0;
    let end = videoSeleccionado.size - 1;
    const parts = range.replace(/bytes=/, "").split("-");
    
    if (parts[0]) start = parseInt(parts[0], 10);
    // NUEVO 1: Si el navegador exige un byte final exacto, lo respetamos estrictamente
    if (parts[1]) end = parseInt(parts[1], 10); 
    
    // Regla de Oro: Descargamos máximo 3MB a la vez para no trabar el navegador
    const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB
    // Hacemos que el final sea el menor entre: lo que pide el navegador, nuestro límite de 3MB o el fin del archivo
    end = Math.min(end, start + CHUNK_SIZE - 1, videoSeleccionado.size - 1);
    
    console.log(`📥 Descargando pedazo de Telegram: bytes ${start} al ${end}...`);
    
    try {
        const ubicacionArchivo = new Api.InputDocumentFileLocation({
            id: videoSeleccionado.id,
            accessHash: videoSeleccionado.accessHash,
            fileReference: videoSeleccionado.fileReference,
            thumbSize: "" 
        });

        const chunks = [];
        
        for await (const chunk of client.iterDownload({
            file: ubicacionArchivo,
            offset: bigInt(start), 
            requestSize: 1048576, 
        })) {
            chunks.push(chunk);
            const currentSize = chunks.reduce((acc, val) => acc + val.length, 0);
            if (currentSize >= (end - start + 1)) break; 
        }
        
        let finalBuffer = Buffer.concat(chunks);
        finalBuffer = finalBuffer.slice(0, end - start + 1); 

        console.log(`✅ Pedazo de ${finalBuffer.length} bytes listo. Enviando al reproductor.`);
        
        // NUEVO: Calculamos el final exacto por si acaso Telegram devolvió menos bytes de los pedidos
        const realEnd = start + finalBuffer.length - 1; 
        const pureArray = new Uint8Array(finalBuffer);
        
        port.postMessage({
            chunk: pureArray, 
            start: start,
            end: realEnd, // Enviamos el final matemáticamente perfecto
            totalSize: videoSeleccionado.size.toString()
        });
        
    } catch (error) {
        console.error("Error en descarga:", error);
        port.postMessage({ error: error.message });
    }
  }
});

// 8. LÓGICA DEL REPRODUCTOR PERSONALIZADO
const video = document.getElementById("reproductor");
const btnPlay = document.getElementById("btn-play");
const playIcon = document.getElementById("play-icon");
const progressContainer = document.getElementById("progress-container");
const progressBar = document.getElementById("progress-bar");
const timeCurrent = document.getElementById("time-current");
const timeDuration = document.getElementById("time-duration");
const btnMute = document.getElementById("btn-mute");
const volumeSlider = document.getElementById("volume-slider");
const btnFullscreen = document.getElementById("btn-fullscreen");
const videoWrapper = document.getElementById("video-wrapper");

// Formatear segundos a minutos (Ej: 03:10)
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Alternar Play y Pausa
function togglePlay() {
    if (video.paused) {
        video.play();
        // Cambiar a icono de pausa
        playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
    } else {
        video.pause();
        // Cambiar a icono de play
        playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    }
}

btnPlay.addEventListener("click", togglePlay);
video.addEventListener("click", togglePlay); // Play/Pausa al tocar el video

// Actualizar barra de progreso
video.addEventListener("timeupdate", () => {
    const percent = (video.currentTime / video.duration) * 100;
    progressBar.style.width = `${percent}%`;
    timeCurrent.textContent = formatTime(video.currentTime);
});

// Mostrar tiempo total cuando el video carga
video.addEventListener("loadedmetadata", () => {
    timeDuration.textContent = formatTime(video.duration);
});

// Adelantar/Atrasar al hacer clic en la barra
progressContainer.addEventListener("click", (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
});

// Control de Volumen
// Control de Volumen y Mute
let volumenAnterior = 1; // Guarda el volumen antes de mutear
const muteIconPath = btnMute.querySelector("path");

function actualizarIconoVolumen() {
    if (video.muted || video.volume === 0) {
        // Cambia al ícono de "Silenciado" y se pone morado
        muteIconPath.setAttribute("d", "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z");
        btnMute.style.color = "var(--primary-color)"; 
    } else {
        // Cambia al ícono de "Audio Activado"
        muteIconPath.setAttribute("d", "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z");
        btnMute.style.color = "white"; 
    }
}

volumeSlider.addEventListener("input", (e) => {
    e.stopPropagation(); 
    const valor = parseFloat(e.target.value); // Convertir estrictamente a número decimal
    video.volume = valor;
    video.muted = (valor === 0);
    
    if (valor > 0) volumenAnterior = valor; // Guardar el último volumen válido
    actualizarIconoVolumen();
});

btnMute.addEventListener("click", (e) => {
    e.stopPropagation(); // ESTO ES CLAVE: Evita que el clic traspase al video en celulares
    video.muted = !video.muted;
    
    if (video.muted) {
        volumeSlider.value = 0;
        video.volume = 0;
    } else {
        video.volume = volumenAnterior;
        volumeSlider.value = volumenAnterior;
    }
    actualizarIconoVolumen();
});

// Pantalla Completa
btnFullscreen.addEventListener("click", () => {
    if (!document.fullscreenElement) {
        videoWrapper.requestFullscreen().catch(err => console.error(err));
    } else {
        document.exitFullscreen();
    }
});

// Configuración de Velocidad
const btnSpeed = document.getElementById("btn-speed");
const speedMenu = document.getElementById("speed-menu");
const speedOptions = document.querySelectorAll(".speed-option");

// Mostrar/Ocultar menú de velocidad
btnSpeed.addEventListener("click", (e) => {
    e.stopPropagation(); // Evita que el clic se propague al documento
    speedMenu.classList.toggle("active");
});

// Ocultar menú si haces clic fuera de él
document.addEventListener("click", (e) => {
    if (!e.target.closest(".speed-container")) {
        speedMenu.classList.remove("active");
    }
});

// Cambiar la velocidad del video
speedOptions.forEach(option => {
    option.addEventListener("click", () => {
        const speed = parseFloat(option.getAttribute("data-speed"));
        video.playbackRate = speed;
        
        // Actualizamos el texto del botón (ej: 1.5x)
        btnSpeed.textContent = speed === 1 ? "1x" : speed + "x";
        
        // Cerramos el menú
        speedMenu.classList.remove("active");
    });
});