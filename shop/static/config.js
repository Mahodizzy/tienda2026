/* =============================================================
   CONFIGURACIÓN DE TU TIENDA — Refills EC
   Aquí cambias tus datos sin tocar el resto del código.
   Después de editar, guarda el archivo y vuelve a publicar.
   ============================================================= */
window.REFILLS_CONFIG = {

  nombreTienda: "Refills EC",

  // WhatsApp con código de país, sin "+" ni espacios.
  whatsapp: "593999293698",

  // Firebase: login, pedidos y chat (son los mismos datos que ya usabas).
  firebase: {
    apiKey: "AIzaSyBRTyPjBFVBtZS0cO-CDiWTlTfYx7_8w8s",
    authDomain: "refills-ec.firebaseapp.com",
    projectId: "refills-ec",
    storageBucket: "refills-ec.firebasestorage.app",
    messagingSenderId: "498663677908",
    appId: "1:498663677908:web:f76cb508fbb77425774041",
    measurementId: "G-YKQ64J9ZJL"
  },

  // Dirección de tu puente de Cloudflare (GUIA-CONFIGURACION.md, paso 5).
  // Ejemplo: "https://refills-puente.tu-usuario.workers.dev"
  // Mientras esté vacío, la tienda funciona igual, pero los pedidos y mensajes
  // no llegan a tu Telegram: el cliente verá un botón para avisarte por WhatsApp.
  workerUrl: "https://refillsec-puente.marlondominguez1012.workers.dev",

  // Productos de ejemplo en "Tarjetas de regalo" y "Recargas de juegos".
  // Cambia a false cuando cargue tus productos reales en catalogo.js.
  mostrarProductosDeEjemplo: true,

  // Tus redes. Si una queda vacía, su botón no aparece en el pie de página.
  redes: {
    instagram: "https://www.instagram.com/refills.ec?stkn=MTIxaThrMGtsZzd6ZQ==",
    tiktok: "https://www.tiktok.com/@refills.ec?_r=1&_t=ZS-9AGf8fPlbCU",
    telegram: ""
  },

  // Cuentas para transferencias: cada una aparece como una tarjeta que gira.
  // tema: "pichincha" | "guayaquil" | "pacifico" | "produbanco" | "generico"
  cuentasBancarias: [
    {
      banco: "Banco Pichincha",
      tema: "pichincha",
      tipo: "Ahorros",
      numero: "2206998626",          // ← tu número de cuenta
      titular: "Marlon Dominguez",         // ← nombre del titular
      correo: "refills.ec@gmail.com"           // ← correo para enviar el comprobante (opcional)
    },
    {
      banco: "Banco Guayaquil",
      tema: "guayaquil",
      tipo: "Ahorros",
      numero: "44322515",
      titular: "Ely Piccinini",
      correo: "refills.ec@gmail.com"
    }
  ],

  // Binance Pay. Pon activo: false si no quieres mostrarlo.
  binance: {
    activo: true,
    payId: "194868509",     // ← tu Pay ID
    usuario: "mahodizzy",   // ← tu nombre de usuario en Binance
    correo: "marlondominguez1012@gmail.com"     // ← opcional
  }
};
