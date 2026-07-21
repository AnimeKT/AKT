import { Buffer } from "buffer";
import bigInt from "big-integer";
import { Api, TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

let videoSeleccionado = null;

let listaDeVideos = []; // Aquí guardaremos todos los videos del Topic
let indiceActual = 0;
let portadasDesdeCanal = {};

// Función que lee el canal de notificaciones y extrae las portadas
async function obtenerPortadasDelCanal() {
    console.log("Buscando portadas en el canal de notificaciones...");
    try {
        const result = await client.invoke(new Api.messages.Search({
            peer: "@AnimeKaergsty", // <- El @ de tu canal de notificaciones
            q: "",
            filter: new Api.InputMessagesFilterEmpty(),
            limit: 50, // Revisa los últimos 50 mensajes (puedes subirlo)
        }));

        result.messages.forEach(mensaje => {
            // Verificamos que el mensaje tenga texto y multimedia (foto o gif)
            if (mensaje.message && mensaje.media) {
                // Buscamos la línea que dice "Anime: " o "𝑨𝒏𝒊𝒎𝒆: "
                const match = mensaje.message.match(/(?:Anime|𝑨𝒏𝒊𝒎𝒆):\s*(.+)/i);
                
                if (match && match[1]) {
                    // Limpiamos el nombre para que sea fácil de comparar
                    const nombreAnime = match[1].trim().toLowerCase();
                    
                    // Si no hemos guardado este anime aún, lo guardamos
                    if (!portadasDesdeCanal[nombreAnime]) {
                        portadasDesdeCanal[nombreAnime] = mensaje.media;
                    }
                }
            }
        });
        console.log("¡Portadas extraídas con éxito!", Object.keys(portadasDesdeCanal).length, "animes encontrados.");
    } catch (error) {
        console.error("Error obteniendo portadas del canal:", error);
    }
}


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

// 1. CONFIGURACIÓN DINÁMICA DE API (Para cada usuario)
let client = null; 

let apiId = localStorage.getItem("user_api_id") || "";
let apiHash = localStorage.getItem("user_api_hash") || "";
const savedSession = localStorage.getItem("telegram_session") || "";
const stringSession = new StringSession(savedSession);

function inicializarCliente() {
    client = new TelegramClient(stringSession, parseInt(apiId), apiHash, {
        connectionRetries: 5,
        deviceModel: "AnimeKaergsty Web", 
        systemVersion: "1.0.0",
        appVersion: "1.0.0",
        useWSS: true, 
    });
}

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

const apiCredentialsStep = document.getElementById("api-credentials-step");
const loginMethodsContainer = document.getElementById("login-methods-container");
const inputApiId = document.getElementById("user-api-id");
const inputApiHash = document.getElementById("user-api-hash");
const btnSaveApi = document.getElementById("btn-save-api");

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
        document.getElementById("step-password").classList.remove("hidden");
        
        alert("⚠️ El inicio de sesión con Verificación en 2 Pasos (2FA) no está soportado.\n\nPor favor, cambia a la pestaña de 'Código QR' para iniciar sesión.");
        
        // Lanzamos un error forzado para cancelar el flujo de Telegram
        throw new Error("2FA_NOT_SUPPORTED");
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
    await obtenerPortadasDelCanal();
    cargarContenidoInicial();

  } catch (error) {
    console.error("Fallo de conexión:", error);
    btnSendCode.textContent = "Enviar Código";
    btnSendCode.disabled = false;
  }
});

// 5. Lógica de inicio y comprobación de API
if (apiId && apiHash) {
    // Si ya tiene las credenciales, ocultamos la caja del API y mostramos los métodos
    if(apiCredentialsStep) apiCredentialsStep.classList.add("hidden");
    if(loginMethodsContainer) loginMethodsContainer.classList.remove("hidden");
    
    inicializarCliente();
    
    // Si además tiene sesión, hacemos el autologin silencioso
    if (savedSession) {
        console.log("Credenciales y sesión encontradas. Conectando silenciosamente...");
        
        // ¡NUEVO!: Ocultamos el login y mostramos el reproductor forzosamente
        if(loginSection) loginSection.classList.add("hidden");
        if(videoContainer) videoContainer.classList.remove("hidden");

        client.connect().then(async () => {
            await obtenerPortadasDelCanal();
            cargarContenidoInicial();
        }).catch(error => {
            console.log("Ajustando conexión de Telegram en segundo plano...", error);
            // Si falla la conexión, lo devolvemos a la pantalla de login
            if(loginSection) loginSection.classList.remove("hidden");
            if(videoContainer) videoContainer.classList.add("hidden");
        });
    } else {
        // Tiene API pero NO ha iniciado sesión. Mostramos el Login, ocultamos el Video.
        console.log("Esperando que el usuario inicie sesión...");
        if(loginSection) loginSection.classList.remove("hidden");
        if(videoContainer) videoContainer.classList.add("hidden");
    }
} else {
    // Si NO hay API, ocultamos el Video, mostramos el Login y pedimos la API
    console.log("No hay API configurada. Pidiendo credenciales...");
    if(loginSection) loginSection.classList.remove("hidden");
    if(videoContainer) videoContainer.classList.add("hidden");
    
    if(loginMethodsContainer) loginMethodsContainer.classList.add("hidden");
    if(apiCredentialsStep) apiCredentialsStep.classList.remove("hidden");
}

// Acción de guardar el API ID y HASH
btnSaveApi.addEventListener("click", () => {
    const enteredId = inputApiId.value.trim();
    const enteredHash = inputApiHash.value.trim();

    if (!enteredId || !enteredHash) {
        return alert("Debes ingresar tanto el API ID como el API HASH.");
    }

    // Guardamos en memoria local
    apiId = enteredId;
    apiHash = enteredHash;
    localStorage.setItem("user_api_id", apiId);
    localStorage.setItem("user_api_hash", apiHash);

    // Inicializamos el cliente ahora que tenemos los datos
    inicializarCliente();

    // Hacemos el cambio visual
    apiCredentialsStep.classList.add("hidden");
    loginMethodsContainer.classList.remove("hidden");
    
});

function cargarContenidoInicial() {
    const ruta = window.location.pathname.replace(/\//g, ""); 
    const topicId = parseInt(ruta, 10);

    if (!isNaN(topicId)) {
        console.log(`📂 Abriendo Topic: ${topicId}`);
        buscarVideo("", topicId);
    } else {
        buscarVideo(""); 
        // Eliminamos el llamado a configurarNombresAnime() porque no existe y rompía el código
    }
}

// 6. Lógica para buscar la lista de videos
async function buscarVideo(textoBusqueda, topicId = null) {
  try {
    const parametrosBusqueda = {
        peer: "@AnimeKTe", 
        q: textoBusqueda, 
        filter: new Api.InputMessagesFilterVideo(), 
        // MAGIA AQUÍ: 
        // Si hay topicId (ej. /2233), pedimos un límite altísimo para que salgan infinitos.
        // Si no hay topicId (estamos en /), pedimos solo 20.
        limit: topicId !== null ? 10000 : 20, 
    };

    if (topicId) parametrosBusqueda.topMsgId = topicId;

    const result = await client.invoke(new Api.messages.Search(parametrosBusqueda));

    // Filtramos para asegurarnos de que solo haya mensajes con documentos (videos)
    listaDeVideos = result.messages.filter(msg => msg.media && msg.media.document);

    // CORTAFUEGOS EXTRA: Nos aseguramos de cortar la lista estrictamente a 20 
    // en la página principal por si Telegram envía datos adicionales.
    if (topicId === null) {
        listaDeVideos = listaDeVideos.slice(0, 20);
    }

    if (listaDeVideos.length > 0) {
        console.log(`¡Encontramos ${listaDeVideos.length} videos en esta lista!`);
        
        // Telegram devuelve los resultados del más nuevo al más viejo.
        // Los invertimos para que el Capítulo 1 sea el primero y el Capítulo 2 el siguiente.
        if (topicId !== null) {
            listaDeVideos.reverse(); 
        } 
        
        indiceActual = 0; // Empezamos por el primer video
        cargarVideoEnReproductor(); // Llamamos a la nueva función
        
        // <--- LÍNEA NUEVA AÑADIDA AQUÍ --->
        renderizarGridCapitulos(); 
    } else {
        document.getElementById("video-title").textContent = "No se encontraron videos en este tema.";
    }
  } catch (error) {
    console.error("Error buscando el video:", error);
  }
}

// ==========================================
// DICCIONARIO INVERSO: ID PREMIUM -> NÚMERO
// ==========================================
const EMOJI_A_NUMERO = {
    '5217565067620394545': '𝟬',
    '5215582188594016044': '𝟭',
    '5217780859662250453': '𝟮',
    '5217890123630260160': '𝟯',
    '5217751121308690608': '𝟰',
    '5217881379076843813': '𝟱',
    '5215728329151228731': '𝟲',
    '5217787607055869474': '𝟳',
    '5217949372704108415': '𝟴',
    '5217907505362907029': '𝟵'
};
// NUEVA FUNCIÓN: Encargada de poner el video en pantalla y limpiar el título
function cargarVideoEnReproductor() {
    const mensajeActual = listaDeVideos[indiceActual];
    const videoDoc = mensajeActual.media.document;
    
    videoSeleccionado = videoDoc; 
    const videoId = videoDoc.id.toString();
    
    let tituloVideo = "Video sin descripción";
    let numeroEpisodio = "";
    
    // 1. Extraer y limpiar el texto base
    if (mensajeActual.message && mensajeActual.message !== "") {
        // Usamos el texto original (sin trim) para mantener offsets correctos
        let textoBruto = mensajeActual.message;

        // Si hay entidades, removemos las entidades de emoji numérico
        if (mensajeActual.entities && mensajeActual.entities.length > 0) {
            const entidadesParaRemover = mensajeActual.entities.slice().sort((a, b) => a.offset - b.offset);
            let resultado = "";
            let ultimo = 0;

            for (const entidad of entidadesParaRemover) {
                if (entidad.className === 'MessageEntityCustomEmoji') {
                    const emojiId = entidad.documentId && entidad.documentId.toString && entidad.documentId.toString();
                    if (emojiId && EMOJI_A_NUMERO[emojiId]) {
                        // Añadimos el texto antes de esta entidad y saltamos la entidad
                        resultado += textoBruto.substring(ultimo, entidad.offset);
                        ultimo = entidad.offset + entidad.length;
                        continue;
                    }
                }
            }

            // Añadimos lo que queda después de la última entidad
            resultado += textoBruto.substring(ultimo);
            textoBruto = resultado;
        }

        // Limpiamos los adornos (incluyendo el punto para que no ensucie el nombre del anime)
        tituloVideo = textoBruto.replace(/💠/g, "")
                                .replace(/𝙈𝙀𝙉𝙐/g, "")
                                .replace(/\./g, "")
                                .replace(/\s+/g, " ")
                                .trim();
    }

    // 2. Extraer los Custom Emojis y detectar puntos normales intermedios
    if (mensajeActual.entities && mensajeActual.entities.length > 0) {
        // Ordenamos las entidades de izquierda a derecha
        const entidades = mensajeActual.entities.sort((a, b) => a.offset - b.offset);
        let posicionUltimoEmoji = 0;

        for (const entidad of entidades) {
            if (entidad.className === 'MessageEntityCustomEmoji') {
                const emojiId = entidad.documentId.toString();
                
                if (EMOJI_A_NUMERO[emojiId]) {
                    // MAGIA AQUÍ: Leemos el texto normal que quedó entre el número anterior y este
                    const textoIntermedio = mensajeActual.message.substring(posicionUltimoEmoji, entidad.offset);
                    
                    // Si ya habíamos guardado un número (ej: el 1) y vemos un punto en medio, lo añadimos
                    if (numeroEpisodio !== "" && textoIntermedio.includes('.')) {
                        numeroEpisodio += ".";
                    }
                    
                    // Guardamos el número que acabamos de traducir
                    numeroEpisodio += EMOJI_A_NUMERO[emojiId];
                }
            }
            // Actualizamos la posición para el siguiente ciclo
            posicionUltimoEmoji = entidad.offset + entidad.length;
        }
    }

    // 3. Construir el título final
    if (numeroEpisodio !== "") {
        tituloVideo = `${tituloVideo} - Episodio ${numeroEpisodio}`;
    }
    
    // <--- LÍNEAS NUEVAS AÑADIDAS AQUÍ --->
    const tituloSeccion = document.querySelector(".episodes-title");
    const rutaActual = window.location.pathname.replace(/\//g, ""); 
    const esSubPagina = !isNaN(parseInt(rutaActual, 10)) && rutaActual !== "";

    // CÁLCULO DEL NÚMERO (Se adapta si la lista está invertida o no)
    const numeroFallback = esSubPagina ? (indiceActual + 1) : (listaDeVideos.length - indiceActual);
    const textoDelEpisodio = numeroEpisodio !== "" ? `Episodio ${numeroEpisodio}` : `Episodio ${numeroFallback}`;
    document.getElementById("current-episode-text").textContent = textoDelEpisodio;

    // 🟢 AQUÍ SE INTEGRA EL NUEVO DISEÑO INTERACTIVO DEL TÍTULO / BOTÓN
    if (tituloSeccion) {
        if (esSubPagina) {
            // SI ES UNA SUBPÁGINA: Toda la frase actúa como botón de regreso con su flecha
            tituloSeccion.innerHTML = `
                <a href="/" style="text-decoration: none; display: inline-flex; align-items: center; gap: 8px; padding: 4px 8px; margin-left: -8px; border-radius: 8px; transition: background 0.2s ease; cursor: pointer;" onmouseover="this.style.background='rgba(255,255,255,0.1)'" onmouseout="this.style.background='transparent'" title="Volver a la página principal">
                    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" style="color: #4ba3e3;">
                        <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                    <div style="display: flex; flex-direction: column;">
                        <span style="font-size: 13px; color: var(--secondary-text-color); font-weight: normal; line-height: 1.2;">Estás viendo</span>
                        <span style="font-size: 15px; color: #ffffff; line-height: 1.2; font-weight: bold;">${textoDelEpisodio}</span>
                    </div>
                </a>
            `;
        } else {
            // SI ES LA PÁGINA PRINCIPAL: Texto estático normal sin diseño de botón
            tituloSeccion.innerHTML = `
                <div style="display: flex; flex-direction: column; padding: 4px 0;">
                    <span style="font-size: 13px; color: var(--secondary-text-color); font-weight: normal; line-height: 1.2;">Episodios</span>
                    <span style="font-size: 15px; color: #ffffff; line-height: 1.2; font-weight: bold;">Recientes</span>
                </div>
            `;
        }
    }

    actualizarCapituloActivo(); 
    
    // Actualizamos la interfaz
    document.getElementById("video-title").textContent = tituloVideo;
    
    // Controlar si las flechas deben encenderse o apagarse
    document.getElementById("btn-prev").disabled = (indiceActual === 0);
    document.getElementById("btn-next").disabled = (indiceActual === listaDeVideos.length - 1);
    
    // Enviar al reproductor
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
    const CHUNK_SIZE = 1 * 1024 * 1024; // 3 MB
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
const progressSlider = document.getElementById("progress-slider");
const progressWrapper = document.getElementById("progress-wrapper");
const timeTooltip = document.getElementById("time-tooltip");
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

// Variable para saber si estamos arrastrando la bolita (para evitar que el video salte bruscamente)
let isDraggingProgress = false;

// 1. Actualizar barra mientras el video se reproduce
video.addEventListener("timeupdate", () => {
    if (!isDraggingProgress && video.duration) {
        const percent = (video.currentTime / video.duration) * 100;
        progressSlider.value = percent;
        // Pintar la barra de lila hasta donde va el progreso
        progressSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`;
    }
    timeCurrent.textContent = formatTime(video.currentTime);
});

// ¡MANTENEMOS ESTO! Mostrar tiempo total cuando el video carga
video.addEventListener("loadedmetadata", () => {
    timeDuration.textContent = formatTime(video.duration);
});

// 2. Control al arrastrar la bolita (para que la barra se pinte mientras mueves, pero el video no salte hasta soltar)
progressSlider.addEventListener("input", (e) => {
    isDraggingProgress = true;
    const percent = e.target.value;
    progressSlider.style.background = `linear-gradient(to right, var(--primary-color) ${percent}%, rgba(255, 255, 255, 0.3) ${percent}%)`;
    
    // Opcional: Actualizar el tiempo actual en pantalla mientras arrastras
    if (video.duration) {
        timeCurrent.textContent = formatTime((percent / 100) * video.duration);
    }
});

// 3. Cuando sueltas la bolita (o haces clic), saltar a ese punto del video
progressSlider.addEventListener("change", (e) => {
    if (video.duration) {
        const percent = e.target.value;
        video.currentTime = (percent / 100) * video.duration;
    }
    isDraggingProgress = false;
});

// 4. Lógica para el Tooltip flotante
progressWrapper.addEventListener("mousemove", (e) => {
    if (!video.duration) return;

    // 1. Calculamos el tiempo usando los límites EXACTOS de la línea del slider
    const sliderRect = progressSlider.getBoundingClientRect();
    let pos = (e.clientX - sliderRect.left) / sliderRect.width;
    
    // Limitar posición entre 0 y 1 para que el tiempo no dé negativo o se pase
    pos = Math.max(0, Math.min(1, pos)); 

    // Escribir el tiempo en el tooltip
    const hoverTime = pos * video.duration;
    timeTooltip.textContent = formatTime(hoverTime);

    // 2. Mover el tooltip al pixel exacto donde está el ratón (para que la flecha quede perfecta)
    const wrapperRect = progressWrapper.getBoundingClientRect();
    const mouseX = e.clientX - wrapperRect.left;
    
    timeTooltip.style.left = `${mouseX}px`; 
});

// Control de Volumen
volumeSlider.addEventListener("input", (e) => {
    const valor = e.target.value;
    video.volume = valor;
    video.muted = valor === "0";
    // MAGIA VISUAL: Pinta la barra exactamente hasta donde esté la bolita
    volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${valor * 100}%, rgba(255, 255, 255, 0.3) ${valor * 100}%)`;
});

btnMute.addEventListener("click", () => {
    video.muted = !video.muted;
    const nuevoValor = video.muted ? 0 : video.volume;
    volumeSlider.value = nuevoValor;
    // MAGIA VISUAL: Vacía o llena la barra al pulsar Mute
    volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${nuevoValor * 100}%, rgba(255, 255, 255, 0.3) ${nuevoValor * 100}%)`;
});

// Esto asegura que la barra empiece pintada al 100% cuando cargas la página
volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${volumeSlider.value * 100}%, rgba(255, 255, 255, 0.3) ${volumeSlider.value * 100}%)`;

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

// NUEVO: ATAJOS DE TECLADO (TIPO YOUTUBE)
// ==========================================
document.addEventListener("keydown", (e) => {
    // Solo aplicar los atajos si el usuario ya inició sesión y ve el reproductor[cite: 9]
    if (document.getElementById("video-container").classList.contains("hidden")) return;

    // Ignorar si el usuario está escribiendo en algún input (por si a futuro añades un buscador)
    if (document.activeElement.tagName === "INPUT") return;

    // Evitar que la página haga scroll accidentalmente al presionar espacio o flechas
    if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
    }

    const saltarSegundos = 5; // Tiempo que adelanta/retrocede cada flechazo

    switch (e.key) {
        case "ArrowRight":
            // Adelantar 5 segundos
            video.currentTime = Math.min(video.duration || 0, video.currentTime + saltarSegundos);
            break;
        case "ArrowLeft":
            // Retroceder 5 segundos
            video.currentTime = Math.max(0, video.currentTime - saltarSegundos);
            break;
        case " ":
            // Pausa/Play con la barra espaciadora (reutilizamos tu función)[cite: 9]
            togglePlay();
            break;
        case "ArrowUp":
            // Subir volumen
            video.volume = Math.min(1, video.volume + 0.1);
            video.muted = video.volume === 0;
            actualizarBarraVolumen(video.volume);
            break;
        case "ArrowDown":
            // Bajar volumen
            video.volume = Math.max(0, video.volume - 0.1);
            video.muted = video.volume === 0;
            actualizarBarraVolumen(video.volume);
            break;
        case "f":
        case "F":
            // Pantalla completa con la letra F (reutilizamos tu lógica)[cite: 9]
            if (!document.fullscreenElement) {
                videoWrapper.requestFullscreen().catch(err => console.error(err));
            } else {
                document.exitFullscreen();
            }
            break;
    }
});

// Función auxiliar para que la barrita visual del volumen se actualice
// si usamos las flechas del teclado.
function actualizarBarraVolumen(valor) {
    volumeSlider.value = valor;
    volumeSlider.style.background = `linear-gradient(to right, var(--primary-color) ${valor * 100}%, rgba(255, 255, 255, 0.3) ${valor * 100}%)`;
}

// ==========================================
// CERRAR SESIÓN
// ==========================================
const btnLogout = document.getElementById("btn-logout");

if (btnLogout) {
    // Le agregamos un pequeño efecto hover con JavaScript para que resalte
    btnLogout.addEventListener("mouseenter", () => {
        btnLogout.style.backgroundColor = "rgba(255, 85, 85, 0.1)";
    });
    btnLogout.addEventListener("mouseleave", () => {
        btnLogout.style.backgroundColor = "transparent";
    });

    // Acción de cerrar sesión
    btnLogout.addEventListener("click", async () => {
        const confirmar = confirm("¿Estás seguro de que deseas cerrar sesión?");
        if (confirmar) {
            // 1. Borramos la llave guardada en el navegador
            localStorage.removeItem("telegram_session");
            localStorage.removeItem("user_api_id");   // <-- NUEVO
            localStorage.removeItem("user_api_hash");
            
            // 2. Desconectamos el cliente de Telegram
            await client.disconnect();
            
            // 3. Recargamos la página para volver a la pantalla de Login
            window.location.reload();
        }
    });
}

// Función para descargar de Telegram guardando copia en la memoria del navegador
async function obtenerMediaConCache(cacheKey, media, opciones = {}) {
    try {
        const cache = await caches.open("anime-media-cache-v1");
        const cachedResponse = await cache.match(`https://cache.local/${cacheKey}`);
        
        // 1. Si ya está guardada en la caché local, devolverla AL INSTANTE
        if (cachedResponse) {
            const arrayBuffer = await cachedResponse.arrayBuffer();
            return Buffer.from(arrayBuffer);
        }

        // 2. Si no está en caché, descargar de Telegram
        const buffer = await client.downloadMedia(media, opciones);
        
        // 3. Guardar una copia en la caché para la próxima vez
        if (buffer) {
            const response = new Response(buffer);
            await cache.put(`https://cache.local/${cacheKey}`, response);
        }
        
        return buffer;
    } catch (error) {
        console.error("Error gestionando caché de media:", error);
        // Si la caché falla por alguna razón, intenta descargar directo
        return await client.downloadMedia(media, opciones);
    }
}

// ==========================================
// RENDERIZADO DE LA LISTA DE CAPÍTULOS
// ==========================================
function renderizarGridCapitulos() {
    const grid = document.getElementById("episodes-grid");
    const container = document.getElementById("episodes-container");
    
    // --- COMPROBAR LA URL PARA SEPARAR LA LÓGICA ---
    const rutaActual = window.location.pathname.replace(/\//g, "");
    const esSubPagina = !isNaN(parseInt(rutaActual, 10)) && rutaActual !== "";

    // ¡ELIMINAMOS EL RETURN OCULTO! Ahora la función seguirá corriendo en /881
    if (!grid || listaDeVideos.length === 0) {
        if (container) container.style.display = "none";
        return;
    }
    
    container.style.display = "block"; 
    grid.innerHTML = ""; 
    
    listaDeVideos.forEach((mensajeActual, index) => {
        const btn = document.createElement("button");
        btn.className = "episode-card"; // Reutilizamos tu CSS actual

        // --- 1. EXTRACCIÓN DE NOMBRE Y NÚMERO ---
        let nombreAnime = "Anime";
        let textoNumero = "";

        if (mensajeActual.message) {
            let textoBruto = mensajeActual.message;
            if (mensajeActual.entities) {
                const entidades = mensajeActual.entities.slice().sort((a, b) => a.offset - b.offset);
                let pos = 0;
                let numTemp = "";
                let textoSinEmojis = "";

                for (const ent of entidades) {
                    if (ent.className === 'MessageEntityCustomEmoji' && EMOJI_A_NUMERO[ent.documentId.toString()]) {
                        const emojiStr = EMOJI_A_NUMERO[ent.documentId.toString()];
                        const textoIntermedio = mensajeActual.message.substring(pos, ent.offset);
                        if (numTemp !== "" && textoIntermedio.includes('.')) numTemp += ".";
                        numTemp += emojiStr;

                        textoSinEmojis += textoBruto.substring(pos, ent.offset);
                        pos = ent.offset + ent.length;
                    }
                }
                textoSinEmojis += textoBruto.substring(pos);
                textoNumero = numTemp;
                textoBruto = textoSinEmojis;
            }
            nombreAnime = textoBruto.replace(/💠/g, "").replace(/𝙈𝙀𝙉𝙐/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
        }

        // Si no hay emojis numéricos, calcular por su posición
        if (!textoNumero) {
            // NUEVO: En la sub-página la lista va al revés (1, 2, 3...), en la principal va hacia atrás (20, 19...)
            textoNumero = esSubPagina ? (index + 1).toString() : (listaDeVideos.length - index).toString();
        }
        // --- FIN DE LA EXTRACCIÓN ---

        // ====================================================
        // NUEVO: CREAR EL BOTÓN PARA IR AL TEMA DEL ANIME
        // ====================================================
        let urlTopic = "/"; 
        // Telegram guarda el ID del Topic en replyToTopId o replyToMsgId
        if (mensajeActual.replyTo) {
            let topId = mensajeActual.replyTo.replyToTopId || mensajeActual.replyTo.replyToMsgId;
            if (topId) urlTopic = `/${topId}`;
        }
        
        // IMPORTANTE: onclick="event.stopPropagation();" evita que al darle clic al botón se reproduzca el video
        const botonTopicHTML = `
            <a href="${urlTopic}" class="series-link-btn" title="Ir a la lista de capítulos" onclick="event.stopPropagation();">
                <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>
            </a>
        `;
        // ====================================================

        // 2. Preparamos datos cruzados dependiendo de dónde estemos
        const mediaId = `media-${mensajeActual.id}`;
        const nombreVideoLimpio = nombreAnime.trim().toLowerCase();
        let mediaAsignada = null;

        if (!esSubPagina) {
            // LÓGICA PÁGINA PRINCIPAL: Buscamos coincidencia en el canal de notificaciones
            for (let nombreEnCanal in portadasDesdeCanal) {
                if (nombreVideoLimpio.includes(nombreEnCanal) || nombreEnCanal.includes(nombreVideoLimpio)) {
                    mediaAsignada = portadasDesdeCanal[nombreEnCanal];
                    break;
                }
            }
        } else {
            // LÓGICA LINKS CON NÚMERO (/881): Pasamos el propio mensaje del video
            mediaAsignada = mensajeActual;
        }

        // 3. Estructura HTML de la tarjeta (Idéntica para ambas páginas)
        btn.innerHTML = `
            <div class="episode-card-image-wrapper" id="wrapper-${mediaId}">
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #888;">Cargando...</div>
                <span class="episode-badge">Episodio ${textoNumero}</span>
                <span class="time-badge">Reciente</span> 
                ${botonTopicHTML}
            </div>
            <div class="episode-card-title" title="${nombreAnime}">
                ${nombreAnime}
            </div>
        `;

        // 4. Descargar e inyectar el GIF/Imagen/Miniatura
        if (mediaAsignada) {
            if (!esSubPagina) {
                // ==========================================
                // DESCARGA PARA PÁGINA PRINCIPAL (GIFS/FOTOS)
                // ==========================================
                const esGif = mediaAsignada.className === 'MessageMediaDocument';
                const claveCache = `portada-${nombreVideoLimpio}`;

                obtenerMediaConCache(claveCache, mediaAsignada).then(buffer => {
                    if (buffer) {
                        const wrapper = document.getElementById(`wrapper-${mediaId}`);
                        if (!wrapper) return;

                        wrapper.innerHTML = `
                            <span class="episode-badge">Episodio ${textoNumero}</span>
                            <span class="time-badge">Reciente</span>
                            ${botonTopicHTML}
                        `;

                        if (esGif) {
                            const blob = new Blob([buffer], { type: 'video/mp4' });
                            const url = URL.createObjectURL(blob);
                            wrapper.innerHTML += `<video src="${url}" class="episode-card-img" autoplay loop muted playsinline style="object-fit: cover; pointer-events: none;"></video>`;
                        } else {
                            const blob = new Blob([buffer], { type: 'image/jpeg' });
                            const url = URL.createObjectURL(blob);
                            wrapper.innerHTML += `<img src="${url}" class="episode-card-img" style="object-fit: cover;">`;
                        }
                    }
                }).catch(err => console.log("Error descargando portada del canal para:", nombreAnime));
                
            } else {
                // ==========================================
                // DESCARGA PARA ENLACES CON NÚMEROS (MINIATURA DEL VIDEO)
                // ==========================================
                const claveCache = `thumb-${mensajeActual.id}`;

                obtenerMediaConCache(claveCache, mediaAsignada, { thumb: 1 }).then(buffer => {
                    if (buffer) {
                        const wrapper = document.getElementById(`wrapper-${mediaId}`);
                        if (!wrapper) return;

                        wrapper.innerHTML = `
                            <span class="episode-badge">Episodio ${textoNumero}</span>
                            <span class="time-badge">Reciente</span>
                        `;
                        const blob = new Blob([buffer], { type: 'image/jpeg' });
                        const url = URL.createObjectURL(blob);
                        wrapper.innerHTML += `<img src="${url}" class="episode-card-img" style="object-fit: cover;">`;
                    }
                }).catch(err => console.log("Error descargando miniatura interna del video para:", nombreAnime));
            }
        }

        // 5. Asignar el clic
        btn.addEventListener("click", () => {
            indiceActual = index;
            cargarVideoEnReproductor();
            // Desplazamos suavemente al usuario hacia arriba para ver el video seleccionado
            document.getElementById("video-wrapper").scrollIntoView({ behavior: "smooth", block: "center" });
        });
        
        grid.appendChild(btn);
    });
    
    actualizarCapituloActivo();
}

function actualizarCapituloActivo() {
    const botones = document.querySelectorAll(".episode-card");
    botones.forEach((btn, index) => {
        if (index === indiceActual) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });
}

// ==========================================
// LÓGICA EXCLUSIVA PARA MÓVILES (Doble Tap y Ocultar Volumen)
// ==========================================
const esDispositivoMovil = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

if (esDispositivoMovil) {
    // 1. Ocultar la barra de volumen (los usuarios usarán botones físicos)
    const contenedorVolumen = document.querySelector(".volume-container");
    if (contenedorVolumen) {
        contenedorVolumen.style.display = "none";
    }

    // 2. Lógica del Doble Tap (Retroceder, Adelantar, Fullscreen)
    let tiempoUltimoToque = 0;

    videoWrapper.addEventListener('touchstart', (e) => {
        // Evitar que el doble tap interfiera con los controles 
        const esControl = e.target.closest('button, input, a') || 
                          e.target.id.includes('slider') || 
                          e.target.id.includes('btn') || 
                          e.target.id.includes('progress');
                          
        if (esControl) return; 

        const tiempoActual = new Date().getTime();
        const diferenciaTiempo = tiempoActual - tiempoUltimoToque;

        // Si la diferencia es menor a 300ms, es un doble toque
        if (diferenciaTiempo < 300 && diferenciaTiempo > 0) {
            e.preventDefault(); // Evitamos que el navegador haga zoom nativo
            
            const toqueX = e.changedTouches[0].clientX;
            const anchoPantalla = window.innerWidth;
            
            // Dividimos la pantalla en 3 tercios
            const tercio = anchoPantalla / 3;

            if (toqueX < tercio) {
                // ZONA IZQUIERDA: Retroceder 10 segundos
                video.currentTime = Math.max(0, video.currentTime - 10);
                video.play(); // <-- NUEVO: Fuerza a que el video siga corriendo
            } else if (toqueX > tercio * 2) {
                // ZONA DERECHA: Adelantar 10 segundos
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 10);
                video.play(); // <-- NUEVO: Fuerza a que el video siga corriendo
            } else {
                // ZONA CENTRAL: Pantalla Completa
                if (!document.fullscreenElement) {
                    videoWrapper.requestFullscreen().catch(err => console.error(err));
                } else {
                    document.exitFullscreen();
                }
            }
        }
        tiempoUltimoToque = tiempoActual;
    }, { passive: false });
}