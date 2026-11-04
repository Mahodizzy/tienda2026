# Registrar ventas de WhatsApp desde tu iPhone

Tienes **dos formas** de registrar una venta que hiciste por WhatsApp o en persona.
Las dos guardan lo mismo: la venta queda **entregada**, entra en tus Ventas (ingresos, costo y ganancia),
aparece en Clientes con su fecha de vencimiento (para los recordatorios por WhatsApp) y te llega un aviso a Telegram.

---

## Forma 1 — Desde el panel (la más fácil, ya funciona)

1. Abre tu panel → **Pedidos** → botón **+ Registrar venta**.
2. Elige el producto (el precio se llena solo; puedes cambiarlo), el WhatsApp del cliente, el método de pago y toca **Registrar venta**.

Si quieres abrirlo con **un solo toque** desde el iPhone, crea este Atajo (1 minuto):

1. App **Atajos** → **+** (nuevo atajo).
2. Agrega la acción **Abrir URLs** y escribe: `https://TU-SITIO/admin/#vender`
   (cambia TU-SITIO por tu dirección, por ejemplo `refillsec.com`).
3. Ponle nombre **Registrar venta** y un ícono.

Al tocarlo se abre el formulario directamente (ya con tu sesión iniciada).

---

## Forma 2 — Atajo completo (te hace las preguntas y registra sin abrir el panel)

Es lo que viste en el TikTok: tocas el botón, el iPhone te pregunta y listo.

### Paso 0 — Crear tu clave secreta (una sola vez)

1. Inventa una clave larga (30 letras y números mezclados, sin espacios). Ejemplo de forma: `k8Tq2mXz9...` (no uses esta, haz la tuya).
2. En **Cloudflare → tu Worker → Settings → Variables and Secrets** agrega:
   - Nombre: `ATAJO_TOKEN` · Valor: tu clave · tipo **Secret**.
3. Sube el nuevo `worker/worker.js` y pulsa **Deploy** (si no lo hiciste ya).
4. Guarda la clave en un lugar seguro: la pondrás en el Atajo. **No la pongas en GitHub ni la compartas.**

Prueba rápida: abre en Safari
`https://refillsec-puente.marlondominguez1012.workers.dev/atajo/productos?token=TU_CLAVE`
y debe mostrar tu lista de productos, una por línea. (Si dice "Clave incorrecta", revisa la clave.)

### Paso 1 — Crear el Atajo

En la app **Atajos** → **+**. Agrega estas acciones **en este orden**:

| # | Acción (búscala por su nombre) | Cómo configurarla |
|---|---|---|
| 1 | **Obtener contenido de URL** | URL: `https://refillsec-puente.marlondominguez1012.workers.dev/atajo/productos?token=TU_CLAVE` · Método: GET |
| 2 | **Dividir texto** | Texto: *Contenido de la URL* · Separador: **Líneas nuevas** |
| 3 | **Elegir de la lista** | Lista: *Texto dividido* · Mensaje: "¿Qué vendiste?" |
| 4 | **Establecer variable** | Nombre: `producto` · Valor: *Elemento elegido* |
| 5 | **Solicitar entrada** | Tipo: Texto · Pregunta: "Si elegiste *Otro producto*, ¿cómo se llama? (si no, deja vacío)" → *Establecer variable* `otro` |
| 6 | **Solicitar entrada** | Tipo: Número · "¿Cantidad?" · Respuesta por defecto: 1 → variable `cantidad` |
| 7 | **Solicitar entrada** | Tipo: Texto · "¿Cuánto cobraste en total? (vacío = precio normal)" → variable `total` |
| 8 | **Solicitar entrada** | Tipo: Número · "WhatsApp del cliente" → variable `whatsapp` |
| 9 | **Solicitar entrada** | Tipo: Texto · "Nombre del cliente (opcional)" → variable `nombre` |
| 10 | **Elegir del menú** | Mensaje "¿Cómo pagó?" · Opciones: Efectivo, Transferencia, Binance, Deuna, Otro. En cada opción pon **Establecer variable** `metodo` con ese mismo texto |
| 11 | **Obtener contenido de URL** | URL: `https://refillsec-puente.marlondominguez1012.workers.dev/atajo/venta` · Método: **POST** · Encabezado: `Authorization` = `Bearer TU_CLAVE` · Cuerpo de la solicitud: **JSON** con estos campos (tipo Texto, y como valor toca la variable correspondiente): `producto`, `nombreProducto` (variable `otro`), `cantidad`, `total`, `whatsapp`, `nombre`, `metodo` |
| 12 | **Obtener valor del diccionario** | Clave: `codigo` · de: *Contenido de la URL* |
| 13 | **Mostrar notificación** | "Venta registrada ✅ " + el valor anterior |

Ponle nombre **Registrar venta**.

Si algo falla (por ejemplo precio vacío y producto "Otro"), el puente responde con el motivo en el campo `error`; puedes
agregar una acción **Mostrar resultado** al final para verlo.

### Paso 2 — Ponerlo como botón rápido

- **Centro de control** (iOS 18 o superior): desliza desde arriba a la derecha → mantén presionado un espacio vacío →
  **Añadir un control** → **Atajos** → elige *Registrar venta*.
- **Botón de acción** (iPhone 15 Pro o más nuevo): Ajustes → Botón de acción → **Atajo** → elige *Registrar venta*.
- **Pantalla de inicio**: en el Atajo → ícono de compartir → **Añadir a pantalla de inicio**.
- **Pantalla bloqueada**: Personalizar pantalla bloqueada → agrega el control de Atajos.

### Qué hace por dentro

- Lee tu lista de productos y precios **en vivo** desde tu tienda: si cambias un precio en el panel, el Atajo lo ve solo.
- Si dejas el total vacío, usa el precio normal del plan × cantidad, y el costo que le pusiste al plan.
- Todo lo que registras aparece en el panel como pedido con la etiqueta "WhatsApp".

> Seguridad: la clave del Atajo solo sirve para **registrar ventas**. No permite ver pedidos ni cambiar nada más.
> Si la pierdes o se filtra, cámbiala en Cloudflare y en el Atajo.
