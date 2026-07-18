import { Buffer } from "buffer";
import bigInt from "big-integer";
import { Api } from "telegram";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

let videoSeleccionado = null;

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
    videoContainer.style.display = "block";

    buscarVideo("");

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
    videoContainer.style.display = "block";

    // LECTURA DINÁMICA DE LA URL
    // Extraemos el número de la ruta (ej. /2726 se convierte en 2726)
    const ruta = window.location.pathname.replace(/\//g, ""); 
    const topicId = parseInt(ruta, 10);

    if (!isNaN(topicId)) {
        console.log(`📂 Abriendo Topic dinámico ID: ${topicId}`);
        buscarVideo("", topicId); // Pasamos el ID a nuestra función
    } else {
        console.log("🏠 Cargando página principal");
        buscarVideo(""); // Búsqueda general
    }

  }).catch(error => {
    console.log("Ajustando conexión de Telegram en segundo plano...");
  });
}
// 6. Lógica para buscar videos en el canal o grupo
async function buscarVideo(textoBusqueda, topicId = null) {
  try {
    // Preparamos los parámetros base de la búsqueda
    const parametrosBusqueda = {
        peer: "@AnimeKTe", // Actualizado al grupo de tu imagen
        q: textoBusqueda, 
        filter: new Api.InputMessagesFilterVideo(), 
        limit: 10,
    };

    // Si detectamos un número en la URL, se lo inyectamos a Telegram
    if (topicId) {
        parametrosBusqueda.topMsgId = topicId;
    }

    // Ejecutamos la búsqueda con los parámetros dinámicos
    const result = await client.invoke(
      new Api.messages.Search(parametrosBusqueda)
    );

    if (result.messages.length > 0) {
        console.log(`¡Encontramos ${result.messages.length} video(s) en esta ruta!`);
        
        const primerMensaje = result.messages[0];
        
        if (primerMensaje.media && primerMensaje.media.document) {
            const videoDoc = primerMensaje.media.document;
            videoSeleccionado = videoDoc;
            const videoId = videoDoc.id.toString(); 
            const videoSize = videoDoc.size; 
            
            console.log(`🎬 Preparando video ID: ${videoId} (${(videoSize / (1024 * 1024)).toFixed(2)} MB)`);

            const reproductor = document.getElementById("reproductor");
            
            if(reproductor) {
                reproductor.src = `/stream/${videoId}`;
                reproductor.preload = "auto"; 
                console.log("▶️ Reproductor enlazado a la ruta virtual.");
                
                reproductor.play().catch(() => {
                    console.log("Pausa automática: El navegador espera que le des Play manualmente.");
                });
            }
        }
    } else {
        console.log("No se encontraron videos en este Topic.");
    }
  } catch (error) {
    console.error("Error buscando el video:", error);
  }
}

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