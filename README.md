# Refills EC — Tienda digital

Tienda de streaming, tarjetas de regalo, recargas de juegos y redes sociales.

- **Catálogo por categorías** con selector de plan (1 pantalla, 2 pantallas, cuenta completa…).
- **Combos** con descuento automático (Dúo, Trío, Full) y combos populares.
- **Pago** por transferencia (tarjetas bancarias que giran) o Binance Pay, con subida del comprobante.
- **Seguimiento del pedido** en vivo: en revisión → aprobado → entregado, con datos de entrega y fecha de vencimiento.
- **Perfil** con historial de pedidos.
- **Bot de Telegram** (opcional) para aprobar, entregar y chatear con los clientes.
- **App de administrador** (`/admin/`), instalable en el celular, para editar productos, precios, categorías, combos, redes y cuentas sin código, y ver a tus clientes con los días que les quedan.
- **Pedidos y ventas en el panel:** aprobar y entregar sincronizado con Telegram, costos de proveedor, ingresos, egresos y ganancia por mes.
- **Preguntas frecuentes y Términos y garantía** (`ayuda.html`), editables desde el panel.
- **Contador de visitas** gratis con Cloudflare Web Analytics.
- **Promoción emergente** al abrir la tienda, que subes, cambias o quitas desde el panel.
- **Correos automáticos** (Resend): entrega de datos, respuestas del chat, pagos rechazados y recordatorios de renovación.

👉 Empieza por **GUIA-CONFIGURACION.md**.

Todo se edita desde la app de administrador. En `shop/static/config.js` solo quedan los datos técnicos (Firebase y la dirección del bot).
