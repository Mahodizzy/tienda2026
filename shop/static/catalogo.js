/* =============================================================
   CATÁLOGO — Refills EC

   IMPORTANTE: desde que usas tu app de administrador (/admin),
   los productos, precios, categorías y combos se editan ALLÁ.
   Este archivo solo sirve como respaldo y para la primera
   importación al panel. Si lo cambias, no se verá en la tienda.

   Cómo se arma un servicio:
     id          → nombre corto sin espacios (no lo cambies si ya hay ventas)
     nombre      → lo que ve el cliente
     categoria   → "streaming" | "tarjetas" | "juegos" | "redes"
     imagen      → ruta de la imagen (déjala vacía "" para usar una portada automática)
     etiqueta    → texto de la esquina (ej. "10 disponibles"); vacío para ocultarla
     entrega     → "acceso" (correo y clave) | "codigo" | "recarga" | "servicio"
     planes      → las opciones del selector. Cada plan:
                     id, nombre, precio, dias (duración, opcional),
                     combo: true  → ese plan puede entrar en los combos
     campos      → datos que el cliente debe escribir (ej. ID de jugador)
     precioPrimera (en un plan) → precio especial para la primera recarga; el cliente
                   marca una casilla para recibirlo. Sin casilla, paga "precio".
     actualizacion → fecha (AAAA-MM-DD). El botón "Traer novedades" del panel copia
                   los productos nuevos o con fecha más reciente que la del panel.
     ejemplo     → true = producto de muestra (se oculta con
                   mostrarProductosDeEjemplo: false en config.js)
   ============================================================= */
window.REFILLS_CATALOGO = {

  categorias: [
    { id: "streaming", nombre: "Streaming",          corto: "Streaming", icono: "fa-solid fa-tv",       descripcion: "Pantallas y cuentas completas" },
    { id: "tarjetas",  nombre: "Tarjetas de regalo", corto: "Tarjetas",  icono: "fa-solid fa-gift",     descripcion: "Códigos digitales que llegan a tu pedido" },
    { id: "juegos",    nombre: "Recargas de juegos", corto: "Recargas",  icono: "fa-solid fa-gamepad",  descripcion: "Recarga directa con tu ID de jugador" },
    { id: "redes",     nombre: "Redes sociales",     corto: "Redes",     icono: "fa-solid fa-hashtag",  descripcion: "Seguidores, likes y vistas" }
  ],

  /* ---------- COMBOS ----------
     Al elegir varios servicios (su plan con combo: true), se resta el descuento.
     Ejemplo: Netflix $3,50 + Disney+ $3,50 = $7,00 → Combo Dúo = $6,00.
     Puedes usar "descuento" (dólares) o "porcentaje" (ej. porcentaje: 10). */
  reglasCombo: [
    { cantidad: 2, nombre: "Combo Dúo",  descuento: 1.00 },
    { cantidad: 3, nombre: "Combo Trío", descuento: 2.00 },
    { cantidad: 4, nombre: "Combo Full", descuento: 3.00 }
  ],

  // Combos que aparecen como "populares". Si les pones "precio",
  // ese precio manda sobre la regla (útil para promociones).
  combosDestacados: [
    { servicios: ["netflix", "disney"] },
    { servicios: ["netflix", "max"] },
    { servicios: ["netflix", "disney", "max"] }
  ],

  servicios: [

    /* ===================== STREAMING ===================== */
    {
      id: "netflix", nombre: "Netflix", categoria: "streaming", entrega: "acceso",
      imagen: "img/Netflix.jpeg", etiqueta: "10 disponibles", destacado: "Más vendido",
      descripcion: "Elige cuántas pantallas necesitas. Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p",       nombre: "1 pantalla",      precio: 3.50, dias: 30, combo: true },
        { id: "2p",       nombre: "2 pantallas",     precio: 6.00, dias: 30 },
        { id: "3p",       nombre: "3 pantallas",     precio: 9.00, dias: 30 },
        { id: "completa", nombre: "Cuenta completa", precio: 11.00, dias: 30 }
      ]
    },
    {
      id: "disney", nombre: "Disney+", categoria: "streaming", entrega: "acceso",
      imagen: "img/Disney cuenta.jpg", etiqueta: "10 disponibles",
      descripcion: "Plan Premium. Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla Premium",  precio: 3.50, dias: 30, combo: true },
        { id: "2p", nombre: "2 pantallas Premium", precio: 6.00, dias: 30 },
        { id: "3p", nombre: "3 pantallas Premium", precio: 9.00, dias: 30 }
      ]
    },
    {
      id: "max", nombre: "Max", categoria: "streaming", entrega: "acceso",
      imagen: "img/Max.jpeg", etiqueta: "10 disponibles",
      descripcion: "Plan Standard. Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla",  precio: 2.00, dias: 30, combo: true },
        { id: "2p", nombre: "2 pantallas", precio: 3.50, dias: 30 }
      ]
    },
    {
      id: "prime", nombre: "Prime Video", categoria: "streaming", entrega: "acceso",
      imagen: "img/Prime.jpeg", etiqueta: "8 disponibles",
      descripcion: "Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla",  precio: 2.50, dias: 30, combo: true },
        { id: "2p", nombre: "2 pantallas", precio: 3.50, dias: 30 }
      ]
    },
    {
      id: "crunchyroll", nombre: "Crunchyroll", categoria: "streaming", entrega: "acceso",
      imagen: "img/crunchy.jpeg", etiqueta: "7 perfiles",
      descripcion: "Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla",  precio: 2.00, dias: 30, combo: true },
        { id: "2p", nombre: "2 pantallas", precio: 3.50, dias: 30 }
      ]
    },
    {
      id: "paramount", nombre: "Paramount+", categoria: "streaming", entrega: "acceso",
      imagen: "img/paramount.jpeg", etiqueta: "7 perfiles",
      descripcion: "Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla", precio: 2.00, dias: 30, combo: true }
      ]
    },
    {
      id: "vix", nombre: "Vix", categoria: "streaming", entrega: "acceso",
      imagen: "img/vix.jpeg", etiqueta: "7 perfiles",
      descripcion: "Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla", precio: 2.00, dias: 30, combo: true }
      ]
    },
    {
      id: "flujo", nombre: "Flujo TV", categoria: "streaming", entrega: "acceso",
      imagen: "img/Flujo.jpeg", etiqueta: "7 perfiles",
      descripcion: "Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla", precio: 3.00, dias: 30, combo: true }
      ]
    },
    {
      id: "oleada", nombre: "Oleada TV", categoria: "streaming", entrega: "acceso",
      imagen: "img/oleada.jpeg", etiqueta: "5 disponibles",
      descripcion: "Los datos de acceso llegan a tu pedido.",
      planes: [
        { id: "1p", nombre: "1 pantalla", precio: 3.00, dias: 30, combo: true }
      ]
    },
    {
      id: "canva", nombre: "Canva Pro Edu", categoria: "streaming", entrega: "acceso",
      imagen: "img/canva.jpeg", etiqueta: "7 perfiles",
      descripcion: "Acceso a Canva Pro Edu. Los datos llegan a tu pedido.",
      planes: [
        { id: "edu", nombre: "Acceso Pro Edu", precio: 5.00 }
      ]
    },

    /* ===================== REDES SOCIALES ===================== */
    {
      id: "tiktok", nombre: "TikTok", categoria: "redes", entrega: "servicio",
      imagen: "img/Tk seguidores.jpeg", etiqueta: "1k-100k",
      descripcion: "Impulsa tu cuenta o tu video. Escribe tu usuario o el enlace.",
      campos: [
        { id: "usuario", etiqueta: "Usuario o enlace de TikTok", ejemplo: "@tuusuario o enlace del video" }
      ],
      planes: [
        { id: "seg1k",    nombre: "1k seguidores", precio: 8.00, imagen: "img/Tk seguidores.jpeg" },
        { id: "likes1k",  nombre: "1k likes",      precio: 3.00, imagen: "img/tk likes.jpeg" },
        { id: "vistas1k", nombre: "1k vistas",     precio: 3.00, imagen: "img/tk vistas.jpeg" }
      ]
    },

    /* ============ TARJETAS DE REGALO (EJEMPLOS: cambia precios) ============ */
    {
      id: "googleplay", nombre: "Google Play", categoria: "tarjetas", entrega: "codigo", ejemplo: true,
      imagen: "", portada: { de: "#0f3b2e", a: "#0b1f3a", icono: "fa-solid fa-play" },
      descripcion: "Código digital para la tienda de Google. Llega a tu pedido.",
      planes: [
        { id: "10", nombre: "Tarjeta $10", precio: 11.50 },
        { id: "25", nombre: "Tarjeta $25", precio: 28.00 }
      ]
    },
    {
      id: "playstation", nombre: "PlayStation USA", categoria: "tarjetas", entrega: "codigo", actualizacion: "2026-10-12",
      imagen: "img/playstation.jpg", portada: { de: "#0b2a6b", a: "#1a0b3d", icono: "fa-solid fa-gamepad" },
      descripcion: "Saldo PlayStation Store USA para juegos y complementos. Tarjeta digital: verifica que tu cuenta PSN sea de USA. El código llega a tu pedido.",
      planes: [
        { id: "10",  nombre: "PlayStation $10",  precio: 12.00 },
        { id: "25",  nombre: "PlayStation $25",  precio: 28.00 },
        { id: "50",  nombre: "PlayStation $50",  precio: 55.00 },
        { id: "100", nombre: "PlayStation $100", precio: 110.00 }
      ]
    },
    {
      id: "xbox", nombre: "Xbox", categoria: "tarjetas", entrega: "codigo", actualizacion: "2026-10-12",
      imagen: "img/xbox.jpg", portada: { de: "#0d3b12", a: "#081a0b", icono: "fa-solid fa-gamepad" },
      descripcion: "Código digital para tu cuenta de Xbox. Llega a tu pedido.",
      planes: [
        { id: "10",  nombre: "Tarjeta $10",  precio: 12.00 },
        { id: "15",  nombre: "Tarjeta $15",  precio: 17.00 },
        { id: "25",  nombre: "Tarjeta $25",  precio: 28.00 },
        { id: "100", nombre: "Tarjeta $100", precio: 105.00 }
      ]
    },
    {
      id: "roblox", nombre: "Roblox", categoria: "tarjetas", entrega: "codigo", actualizacion: "2026-10-12",
      imagen: "img/roblox.jpg", portada: { de: "#2a2a36", a: "#0b0b10", icono: "fa-solid fa-cube" },
      descripcion: "Tarjeta de regalo de Roblox para canjear por Robux. El código llega a tu pedido.",
      planes: [
        { id: "10",  nombre: "Tarjeta $10 · 1000 Robux",   precio: 12.00 },
        { id: "15",  nombre: "Tarjeta $15 · 1500 Robux",   precio: 17.00 },
        { id: "20",  nombre: "Tarjeta $20 · 2000 Robux",   precio: 23.00 },
        { id: "25",  nombre: "Tarjeta $25 · 2500 Robux",   precio: 28.00 },
        { id: "50",  nombre: "Tarjeta $50 · 5250 Robux",   precio: 55.00 },
        { id: "100", nombre: "Tarjeta $100 · 11000 Robux", precio: 110.00 }
      ]
    },
    {
      id: "nintendo", nombre: "Nintendo eShop USA", categoria: "tarjetas", entrega: "codigo", actualizacion: "2026-10-12",
      imagen: "img/nintendo.jpg", portada: { de: "#8a1c2b", a: "#3a0a12", icono: "fa-solid fa-gamepad" },
      descripcion: "Tarjeta digital Nintendo eShop USA. Comprueba la región de tu cuenta Nintendo antes de comprar. El código llega a tu pedido.",
      planes: [
        { id: "10", nombre: "Nintendo $10", precio: 12.00 },
        { id: "20", nombre: "Nintendo $20", precio: 23.00 },
        { id: "50", nombre: "Nintendo $50", precio: 55.00 }
      ]
    },
    {
      id: "steam", nombre: "Steam", categoria: "tarjetas", entrega: "codigo", ejemplo: true,
      imagen: "", portada: { de: "#11253d", a: "#0a0f1c", icono: "fa-solid fa-desktop" },
      descripcion: "Saldo para tu cartera de Steam. Llega a tu pedido.",
      planes: [
        { id: "10", nombre: "Tarjeta $10", precio: 11.50 },
        { id: "20", nombre: "Tarjeta $20", precio: 22.50 }
      ]
    },

    /* ============ RECARGAS DE JUEGOS (EJEMPLOS: cambia precios) ============ */
    {
      id: "freefire", nombre: "Free Fire", categoria: "juegos", entrega: "recarga", actualizacion: "2026-10-12",
      imagen: "img/freefire.jpg", portada: { de: "#5a1d00", a: "#2a0a12", icono: "fa-solid fa-gem" },
      descripcion: "Diamantes directo a tu cuenta. Solo necesitas tu ID de jugador.",
      campos: [
        { id: "idJugador", etiqueta: "ID de jugador", ejemplo: "Ej. 123456789", patron: "^[0-9]{5,15}$", ayuda: "Solo números" }
      ],
      planes: [
        { id: "100",  nombre: "100 diamantes",  precio: 1.25,  precioPrimera: 0.90 },
        { id: "310",  nombre: "310 diamantes",  precio: 3.50,  precioPrimera: 2.90 },
        { id: "520",  nombre: "520 diamantes",  precio: 5.50,  precioPrimera: 4.50 },
        { id: "1060", nombre: "1060 diamantes", precio: 11.00, precioPrimera: 8.50 },
        { id: "2180", nombre: "2180 diamantes", precio: 21.00, precioPrimera: 17.00 },
        { id: "5600", nombre: "5600 diamantes", precio: 51.00, precioPrimera: 40.00 }
      ]
    },
    {
      id: "pubg", nombre: "PUBG Mobile (Global)", categoria: "juegos", entrega: "recarga", actualizacion: "2026-10-13",
      imagen: "img/pubg.jpg", portada: { de: "#4a3a06", a: "#1c1606", icono: "fa-solid fa-crosshairs" },
      descripcion: "UC directo a tu cuenta. Solo necesitas tu ID de jugador.",
      campos: [
        { id: "idJugador", etiqueta: "ID de jugador", ejemplo: "Ej. 5123456789", patron: "^[0-9]{5,15}$", ayuda: "Solo números" }
      ],
      planes: [
        { id: "60",   nombre: "60 UC",         precio: 1.50 },
        { id: "300",  nombre: "300 + 25 UC",   precio: 6.00 },
        { id: "600",  nombre: "600 + 60 UC",   precio: 11.25 },
        { id: "1500", nombre: "1500 + 300 UC", precio: 27.25 },
        { id: "3000", nombre: "3000 + 850 UC", precio: 54.25 },
        { id: "6000", nombre: "6000 + 2100 UC", precio: 108.50 }
      ]
    },
    {
      id: "codm", nombre: "Call of Duty Mobile", categoria: "juegos", entrega: "recarga", ejemplo: true, actualizacion: "2026-10-14",
      imagen: "img/codm.jpg", portada: { de: "#2a2a06", a: "#0c0c05", icono: "fa-solid fa-crosshairs" },
      descripcion: "CP directo a tu cuenta. Solo necesitas tu UID de jugador.",
      campos: [
        { id: "idJugador", etiqueta: "UID de jugador", ejemplo: "Ej. 6742000000000000000", patron: "^[0-9]{5,25}$", ayuda: "Solo números" }
      ],
      planes: [
        { id: "88",    nombre: "88 CP",                      precio: 1.40 },
        { id: "160",   nombre: "160 CP",                     precio: 5.00,   precioPrimera: 1.50 },
        { id: "460",   nombre: "460 CP",                     precio: 8.00,   precioPrimera: 4.50 },
        { id: "pase",  nombre: "Pase de batalla",            precio: 10.00 },
        { id: "960",   nombre: "960 CP",                     precio: 15.00,  precioPrimera: 9.00 },
        { id: "2600",  nombre: "2600 CP",                    precio: 35.00,  precioPrimera: 20.00 },
        { id: "pase-paquete", nombre: "Paquete de Pase de Batalla", precio: 35.00 },
        { id: "5400",  nombre: "5400 CP",                    precio: 60.00,  precioPrimera: 39.00 },
        { id: "10800", nombre: "10800 CP (8000 + 2800)",     precio: 120.00 }
      ]
    },
    {
      id: "mlbb", nombre: "Mobile Legends", categoria: "juegos", entrega: "recarga", ejemplo: true,
      imagen: "", portada: { de: "#1b2a6b", a: "#2a0b3d", icono: "fa-solid fa-shield-halved" },
      descripcion: "Diamantes directo a tu cuenta con tu ID y tu zona.",
      campos: [
        { id: "idJugador", etiqueta: "ID de jugador", ejemplo: "Ej. 12345678", patron: "^[0-9]{5,15}$", ayuda: "Solo números" },
        { id: "zona", etiqueta: "Zona (server)", ejemplo: "Ej. 2001", patron: "^[0-9]{3,6}$", ayuda: "Solo números" }
      ],
      planes: [
        { id: "86",  nombre: "86 diamantes",  precio: 1.80 },
        { id: "172", nombre: "172 diamantes", precio: 3.50 },
        { id: "257", nombre: "257 diamantes", precio: 5.00 }
      ]
    }
  ]
};
