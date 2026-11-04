# Guía de configuración — Refills EC

Esta guía tiene tres partes:

- **Parte A (obligatoria):** tus datos, Firebase y publicar en Netlify. Con esto la tienda ya vende: tus clientes compran, pagan, suben su comprobante y ven el estado de su pedido.
- **Parte B (recomendada):** el bot de Telegram. Te llega cada pedido con la foto del comprobante y botones para aprobar, rechazar y entregar, y puedes chatear con tus clientes desde Telegram.
- **Parte C:** tu app de administrador. Cambias productos, precios, categorías, combos, nombre, redes y cuentas desde el celular, sin tocar código, y ves a tus clientes con los días que les quedan.
- **Parte D:** correos automáticos a tus clientes y recordatorios de renovación.
- **Parte E (nueva):** contador de visitas gratis, para ver si tu tienda crece.

Todo funciona con planes gratuitos: Firebase Spark (50.000 lecturas y 20.000 escrituras al día, 1 GB de datos), Cloudflare Workers Free (100.000 solicitudes al día) y tu Netlify actual.

---

## Qué hay en la carpeta

| Archivo | Para qué sirve | ¿Lo editas? |
|---|---|---|
| `admin/` | Tu app de administrador (Parte C) | No |
| `shop/static/config.js` | Datos técnicos (Firebase y dirección del bot). Antes de usar el panel, también tus datos | Solo `firebase` y `workerUrl` |
| `shop/static/catalogo.js` | Respaldo de productos y precios (desde que usas el panel, se editan allá) | No |
| `index.html` | La tienda | No hace falta |
| `pago.html` | Página de pago con las tarjetas que giran | No |
| `pedido.html` | Estado del pedido, datos de entrega y chat | No |
| `shop/static/style.css` | Tus estilos + los nuevos (todo lo nuevo empieza con `rf-`) | Solo si quieres |
| `firebase/firestore.rules` | Reglas de seguridad para pegar en Firebase | Se copian, no se editan |
| `worker/worker.js` | El puente con Telegram para Cloudflare | Se copia, no se edita |

---

# PARTE A — Lo necesario para vender

## A1. Tus datos de pago (`shop/static/config.js`)

Abre el archivo con el Bloc de notas o VS Code y llena lo que tiene `""` vacío:

```js
cuentasBancarias: [
  {
    banco: "Banco Pichincha",
    tema: "pichincha",          // color de la tarjeta
    tipo: "Ahorros",
    numero: "2201234567",       // ← tu número
    titular: "Marlon ...",      // ← nombre del titular
    correo: "tucorreo@gmail.com"  // ← opcional
  },
  ...
]
```

- Colores disponibles en `tema`: `pichincha` (amarillo), `guayaquil` (magenta), `pacifico` (celeste), `produbanco` (verde), `generico` (morado). Puedes agregar más bancos copiando un bloque `{ ... }`.
- **Binance:** llena `payId` y `usuario`. Si no lo usarás, pon `activo: false`.
- **Redes:** pega el enlace completo de Instagram, TikTok y Telegram. Las que dejes vacías no aparecen en el pie de página.

Mientras un dato esté vacío, la tarjeta muestra "Por configurar".

## A2. Productos y precios (`shop/static/catalogo.js`)

> **Si ya usas la app de administrador (Parte C), salta este paso:** los productos se editan desde el panel.

- **Precios de ejemplo:** las secciones *Tarjetas de regalo* y *Recargas de juegos* traen productos de muestra (Google Play, PlayStation, Xbox, Steam, Free Fire, PUBG, Mobile Legends) con **precios inventados**. Cámbialos por los tuyos, o escóndelos poniendo en `config.js`:

  ```js
  mostrarProductosDeEjemplo: false,
  ```

- **Cambiar un precio:** busca el servicio y cambia el número de `precio`. Usa punto para decimales: `3.50`, no `3,50`.
- **Agregar un plan** (por ejemplo, Prime Video cuenta completa):

  ```js
  { id: "completa", nombre: "Cuenta completa", precio: 6.00, dias: 30 }
  ```

- **Agregar un producto nuevo:** copia un servicio completo `{ ... },` y cambia `id` (sin espacios ni tildes), `nombre`, `categoria`, `imagen` y `planes`. Pon la imagen dentro de la carpeta `img/`.
- **Pedir un dato al cliente** (ID de jugador, usuario de TikTok): usa `campos`, como en Free Fire.
- **Etiquetas:** `etiqueta: "10 disponibles"` es el texto verde de la esquina; `destacado: "Más vendido"` es la etiqueta rosada.

### Combos

```js
reglasCombo: [
  { cantidad: 2, nombre: "Combo Dúo",  descuento: 1.00 },
  { cantidad: 3, nombre: "Combo Trío", descuento: 2.00 },
  { cantidad: 4, nombre: "Combo Full", descuento: 3.00 }
],
```

- Entran al combo los planes que tienen `combo: true` (hoy, la pantalla individual de cada servicio de streaming).
- Ejemplo: Netflix $3,50 + Disney+ $3,50 = $7,00 → con el Combo Dúo queda en **$6,00**.
- Para descontar por porcentaje usa `porcentaje: 10` en lugar de `descuento`.
- En `combosDestacados` eliges los "combos populares". Si le pones `precio`, ese precio manda (útil para promociones):

  ```js
  { servicios: ["netflix", "disney"], precio: 5.50, nombre: "Dúo de fin de mes" }
  ```

## A3. Firebase (5 minutos)

Entra a https://console.firebase.google.com y abre tu proyecto **refills-ec**.

1. **Authentication → Método de acceso (Sign-in method):** activa **Correo electrónico/contraseña** y **Google**.
2. **Authentication → Configuración (Settings) → Dominios autorizados:** agrega la dirección de tu tienda en Netlify (por ejemplo `refills-ec.netlify.app`) y tu dominio propio si tienes uno. Sin esto, el botón de Google no funciona en la página publicada.
3. **Firestore Database:** si aún no está creada, pulsa **Crear base de datos**, elige modo producción y la ubicación que te sugiera (no se puede cambiar después).
4. **Firestore Database → Reglas:** borra todo lo que haya, pega el contenido completo de `firebase/firestore.rules` y pulsa **Publicar**.

> No necesitas Storage ni el plan Blaze: las fotos de los comprobantes se guardan comprimidas dentro de Firestore.

## A4. Publicar en Netlify

1. Sube **todo el contenido** de la carpeta en una sola publicación (cada publicación gasta créditos de tu plan).
2. **Importante:** el archivo principal ahora se llama `index.html` en minúscula. Si en tu repositorio o carpeta existe el viejo `Index.html` (con mayúscula), **bórralo** antes de subir. En Windows, Git a veces no detecta el cambio de mayúscula: lo más seguro es borrar el viejo, publicar y luego subir el nuevo. El archivo `_redirects` manda los enlaces viejos `/Index.html` a la página principal.
3. Si antes usabas `historialclientes.html`, ya no hace falta: el historial ahora está en el perfil (botón con tu nombre, arriba a la derecha).

## A5. Prueba tu tienda

1. Crea una cuenta de prueba, agrega un producto y un combo, y paga con una captura cualquiera.
2. Deberías ver "¡Pedido enviado!" y el pedido en tu perfil.
3. **Mientras no configures el bot (Parte B):**
   - El cliente ve un botón para avisarte por WhatsApp con su código de pedido.
   - Tú ves los pedidos en Firebase → Firestore Database → colección `pedidos`.
   - Para aprobar: cambia el campo `estado` a `aprobado`.
   - Para entregar: cambia `estado` a `entregado` y agrega un campo `entrega` (tipo texto) con los datos (correo, clave, perfil, PIN).
   - El cliente lo ve al instante en su página.

---

# PARTE B — Tu bot de Telegram (recomendado)

Con el bot ya no entras a Firebase para nada: todo se maneja desde Telegram.

## B1. Crea el bot

1. En Telegram busca **@BotFather** y envíale `/newbot`.
2. Escribe un nombre (por ejemplo, *Refills EC Pedidos*) y un usuario que termine en `bot` (por ejemplo, `RefillsECPedidosBot`).
3. BotFather te da un **token** parecido a `7123456789:AAH...`. Guárdalo: es la llave de tu bot, no lo compartas.

## B2. Crea tu grupo de trabajo

1. Crea un **grupo nuevo** solo contigo (y quien te ayude a despachar).
2. Agrega a tu bot al grupo.
3. En la configuración del grupo, **activa "Temas" (Topics)**. Cada cliente que te escriba tendrá su propio tema con su nombre, como chats separados.
4. Haz al bot **administrador** con permiso para **gestionar temas**.

## B3. Llave de Firebase para el bot

1. Firebase → ⚙️ **Configuración del proyecto → Cuentas de servicio**.
2. Pulsa **Generar nueva clave privada**. Se descarga un archivo `.json`.
3. Ábrelo con el Bloc de notas: lo vas a copiar completo en el paso B4.

> Esa llave da acceso total a tu base de datos. No la subas a Netlify, ni a GitHub, ni la mandes por chat.

## B4. Publica el puente en Cloudflare (gratis)

1. Crea una cuenta en https://dash.cloudflare.com (gratis, sin tarjeta).
2. Ve a **Workers y Pages → Crear → Worker**. Ponle un nombre, por ejemplo `refills-puente`, y pulsa **Implementar (Deploy)**.
3. Pulsa **Editar código**, borra todo, pega el contenido completo de `worker/worker.js` y pulsa **Implementar**.
4. Ve a **Configuración (Settings) → Variables y secretos** y agrega:

| Nombre | Valor | Tipo |
|---|---|---|
| `BOT_TOKEN` | el token de BotFather | Secreto |
| `WEBHOOK_SECRET` | una clave inventada, **solo letras y números**, ej. `RefillsClave2026x` | Secreto |
| `FIREBASE_API_KEY` | la `apiKey` que está en `config.js` | Texto |
| `FIREBASE_PROJECT_ID` | `refills-ec` | Texto |
| `GOOGLE_SERVICE_ACCOUNT` | todo el contenido del `.json` del paso B3 | Secreto |
| `TG_CHAT_ID` | lo obtienes en el paso B5 | Texto |

5. Guarda e **Implementa** de nuevo. Copia la dirección de tu worker; se ve así: `https://refills-puente.tu-usuario.workers.dev`.

## B5. Conecta el bot (una sola vez)

1. En el navegador abre (con tu dirección y tu clave):

   ```
   https://refills-puente.tu-usuario.workers.dev/setup?clave=RefillsClave2026x
   ```

   Debe decir **"Bot conectado"**.
2. En tu grupo de Telegram escribe `/id`. El bot responde **"ID de este chat: -100…"**.
3. Copia ese número (con el signo menos) en la variable `TG_CHAT_ID` de Cloudflare e implementa otra vez.
4. *(Opcional)* Si quieres los pedidos en un tema aparte: crea un tema "📦 Pedidos", escribe `/id` dentro y copia el **ID de este tema** en una variable nueva `TG_PEDIDOS_TEMA`.

## B6. Activa el bot en tu tienda

En `shop/static/config.js` pega la dirección de tu worker:

```js
workerUrl: "https://refills-puente.tu-usuario.workers.dev",
```

Publica de nuevo en Netlify y haz un pedido de prueba. Debe llegarte a Telegram con la foto del comprobante.

---

# Cómo se usa día a día

**Llega un pedido:** ves la foto del comprobante con el detalle (productos, ID de jugador si aplica, banco y total) y dos botones:

- **✅ Aprobar:** el cliente ve "Pago aprobado" al instante.
- **❌ Rechazar:** el cliente ve "Pago rechazado" con la opción de escribirte. Si te equivocaste, toca **↩️ Volver a revisión**.

**Entregar:** después de aprobar, toca **📦 Entregar datos**. El bot te manda un mensaje; **respóndelo** con los datos (puedes usar varias líneas):

```
Correo: cuenta@correo.com
Clave: Refills2026
Perfil: Juan · PIN 4821
```

El cliente los ve en su página con un botón para copiarlos y la fecha en que vence cada servicio. Si te equivocaste, toca **✏️ Corregir entrega**: los días no se reinician.

**Chat:**

- Cuando un cliente escribe desde la página de su pedido, se crea un tema con su nombre.
- Lo que escribas dentro de ese tema le llega al cliente en su página. El 👍 que pone el bot confirma que llegó.
- También puedes **responder a la foto de un pedido** para escribirle a ese cliente.
- Los mensajes normales del grupo (sin responder a nada) no se le envían a nadie.

---

# Problemas comunes

| Lo que pasa | Solución |
|---|---|
| "No se pudo guardar tu pedido" | Publica las reglas del paso A3.4 y revisa que Firestore esté creada. |
| El botón de Google no funciona | Agrega tu dominio en *Dominios autorizados* (A3.2). Dentro de TikTok o Instagram, Google bloquea el acceso: la tienda le avisa al cliente que entre con su correo o abra Chrome/Safari. |
| No llegan los pedidos a Telegram | Revisa `workerUrl` en `config.js`, que `/setup` diga "Bot conectado" y que `TG_CHAT_ID` sea el número del grupo con el signo menos. |
| El bot no crea temas para el chat | Activa los Temas en el grupo y dale al bot permiso de administrador para gestionar temas. |
| La dirección del worker dice "Faltan variables" | Te indica exactamente cuál falta; agrégala en Cloudflare e implementa de nuevo. |
| Cambié un precio y no se ve | Publica de nuevo y recarga la página con Ctrl+F5 (en el celular, cierra y abre el navegador). |

# Más adelante: tarjeta y PayPal

La página de pago ya muestra "Tarjeta o PayPal — pronto". Antes de activarlos, revisa las condiciones de la pasarela que elijas: algunas no aceptan la venta de cuentas compartidas de streaming ni de seguidores.

---

# PARTE C — Tu app de administrador

Con esta app cambias productos, precios, categorías, combos, nombre, redes y cuentas desde el celular. Los cambios se ven al instante en tu tienda, sin volver a publicar en Netlify.

## C1. Publica y actualiza las reglas (una vez)

1. Sube a GitHub todo como siempre, **incluida la carpeta nueva `admin/`**.
2. Firebase → **Firestore Database → Reglas**: borra todo, pega el contenido **nuevo** de `firebase/firestore.rules` y pulsa **Publicar**. Sin este paso, el panel te mostrará "Falta un paso en Firebase".

## C2. Entra y actívate como administrador (una vez)

1. Abre `https://TU-TIENDA.netlify.app/admin/` (tu dirección de Netlify más `/admin/`).
2. Entra con tu cuenta. Puede ser la misma con la que compras en la tienda.
3. La primera vez verás **"Activa tu cuenta de administrador"** con tu código. Cópialo.
4. Firebase → **Firestore Database → Datos** → **Iniciar colección** → escribe `admins`.
   - **ID del documento:** pega tu código.
   - Agrega un campo: nombre `nombre`, tipo texto, valor tu nombre.
   - Pulsa **Guardar**.
5. En el panel toca **"Ya lo hice"**.

Solo las cuentas que estén en `admins` pueden cambiar la tienda. Para dar acceso a alguien que te ayude, repite el paso 4 con el código de esa persona. Para quitárselo, borra su documento.

### Cómo entras después

- **Desde tu tienda:** inicia sesión con tu cuenta como cualquier cliente. La tienda te reconoce como administrador y te lleva a tu panel. El botón de arriba dice **"Mi panel"**.
- **Desde la app instalada**, o escribiendo tu dirección de Netlify seguida de `/admin/` (o `refillsec.com/admin/` cuando conectes tu dominio).
- Si inicias sesión en medio de una compra de prueba, la tienda no te saca del pago.
- Tus clientes nunca ven el panel. Aunque alguien encuentre la dirección `/admin/`, no puede cambiar nada porque su cuenta no está en `admins`.

## C3. Importa tu tienda (una vez)

El panel te muestra cuántos productos, categorías y cuentas encontró. Toca **"Importar mi tienda"**. Desde ese momento la tienda usa los datos del panel.

> Después de importar, `catalogo.js` y `config.js` solo quedan como respaldo: si los editas, la tienda no cambia. En `config.js` solo seguirás tocando `firebase` y `workerUrl`.

## C4. Instálala en tu celular

- **Android (Chrome):** toca el botón de descarga de arriba, o el menú ⋮ → **Instalar app**.
- **iPhone (Safari):** botón Compartir → **Agregar a inicio**.

Queda con tu logo en la pantalla de inicio y se abre como cualquier app.

## Cómo se usa

El menú tiene 5 secciones: **Pedidos**, **Clientes**, **Productos** (con Categorías y Combos dentro), **Ventas** y **Tienda** (con Pagos y Preguntas y garantía dentro).

**Pedidos** (se actualiza en vivo)
- El número rosado en el menú son los pedidos pendientes. Si tienes el panel abierto, te avisa cuando llega uno nuevo.
- **Por revisar:** toca el pedido para ver el comprobante, el cliente y lo que compró. **Aprobar**, **Rechazar** (le llega un correo) o **Entregar ya** (aprueba y entrega en un paso).
- **Por entregar:** ya viene lista la plantilla con cada servicio (correo, contraseña, perfil, PIN) y, en recargas, el ID del jugador. Complétala y toca **Entregar al cliente**: lo ve en su pedido y le llega por correo.
- **Te costó:** viene llenado con el costo de tus planes. Si ese día tu proveedor te cobró distinto, cámbialo antes de entregar.
- **Entregados:** puedes **Corregir entrega** o anotar el costo de pedidos antiguos (los que no tienen costo llevan un ícono de alerta).
- **Panel y Telegram están sincronizados:** lo que hagas en uno se ve en el otro. Si un pedido ya fue entregado en cualquiera de los dos, el otro no te deja entregarlo de nuevo; solo te ofrece corregir. Lo mismo al aprobar o rechazar.

**Ventas**
- Elige el mes con las flechas. **Ingresos** es lo que te pagaron, **Egresos** lo que te costó en tus proveedores y **Ganancia neta** la diferencia, con tu margen y la comparación con el mes pasado.
- **Últimos 6 meses:** el gráfico de ingresos y ganancia (toca una barra para ver la cifra, o "Ver en tabla").
- **Más vendidos del mes** (los combos cuentan para cada servicio que incluyen) y **Clientes**: nuevos, los que volvieron a comprar y qué porcentaje renovó al vencer su servicio.
- Si algún pedido no tiene costo, te avisa: no entra en la ganancia hasta que se lo pongas.

**Productos**
- Toca un producto para editarlo. Arriba ves cómo se verá en la tienda mientras escribes.
- El interruptor de cada producto lo muestra u oculta al instante. Ocultar es mejor que eliminar si lo vas a volver a vender.
- **Ordenar:** cambia el orden con las flechas y toca Guardar.
- **Imagen:** elige una de tus imágenes, usa **Automática** (un ícono con dos colores), o **Otra imagen**: sube la imagen a la carpeta `img` de tu repositorio y escribe `img/nombre-de-la-imagen.jpg`.
- **Planes:** nombre, precio (con coma: `3,50`) y días. Marca **"Entra en combos"** en el plan de 1 pantalla.
- **Te cuesta (proveedor):** lo que te cobra tu proveedor por ese plan. Debajo ves cuánto ganas por venta. Se usa para llenar solo el costo al entregar y para tus estadísticas.
- **Datos que pides:** por ejemplo, ID de jugador o usuario de TikTok. Marca "Solo números" si aplica.
- Los productos que venían con precios de ejemplo muestran **"Precio de ejemplo"** hasta que los revises y guardes.

**Categorías** (botón dentro de Productos): crea, renombra, cambia el ícono y el orden. Solo se puede borrar una categoría vacía.

**Combos** (botón dentro de Productos): los descuentos por cantidad (en dólares o porcentaje) y los combos populares, con precio especial opcional.

**Tienda:** la promoción de bienvenida, nombre, la parte en naranja, la frase de abajo, WhatsApp y redes.

**Promoción al abrir la tienda** (en Tienda, arriba):
- Toca **"Toca para subir tu imagen"** y elige la imagen de tu promoción. Se ve mejor vertical o cuadrada (por ejemplo 1080 × 1350). El panel la comprime sola.
- **Al tocar la imagen:** a dónde lleva el botón (Arma tu combo, una categoría, un producto, tu WhatsApp u otro enlace), o "Solo la imagen".
- **¿Cada cuánto la ven?:** cada vez que entran, o una vez al día.
- **Mostrar hasta:** opcional. Ese día a las 23:59 deja de mostrarse sola.
- Toca **Publicar promoción**. Para la promo de la semana siguiente, toca la imagen → **Cambiar imagen** → **Guardar cambios**. Para retirarla, **Quitar**.
- Tus clientes pueden cerrarla con la **X** o tocando fuera de la imagen. No se muestra a quien llega por un enlace de renovar.

**Pagos** (botón dentro de Tienda): cuentas bancarias (con su color) y Binance Pay.

**Preguntas y garantía** (botón dentro de Tienda): edita las preguntas frecuentes y tus términos y garantía. Vienen con textos de ejemplo que ya se ven en tu tienda; **revisa sobre todo el plazo de la garantía (24 horas) y el horario de atención**, ajústalos y toca **Guardar**. Tus clientes los ven en `ayuda.html`, con enlaces en el pie de la tienda, en la página de pago y en cada pedido.

En Combos, Tienda y Pagos aparece abajo **"Tienes cambios sin guardar"**: toca **Guardar** para publicarlos.

**Copia de seguridad:** en el menú de tu cuenta (arriba a la derecha) → **Descargar copia de seguridad**. Hazlo de vez en cuando y guarda el archivo.

### Novedades del catálogo y precio de primera recarga

- **Traer novedades.** Cuando yo agrego o cambio productos en el archivo `shop/static/catalogo.js` (por ejemplo Roblox o Nintendo) y subes los archivos nuevos a GitHub, esos productos **no aparecen solos** en tu tienda, porque tus productos ahora viven en el panel. En **Productos** te sale un aviso morado con el botón **Traer novedades**: tócalo y se agregan (o se actualizan) con un solo toque. Se conservan tus costos y si el producto está visible u oculto. Los productos de ejemplo quedan ocultos hasta que les pongas tus precios.
- **Subir las imágenes.** Las fotos nuevas están en la carpeta `img` del ZIP: súbelas a GitHub junto con lo demás.
- **Precio de primera recarga.** En **Productos → (un producto) → cada plan** hay un campo **Precio 1.ª recarga (opcional)**. Si lo llenas, la ficha del producto muestra una casilla "Es mi primera recarga con Refills EC". Sin marcarla, el cliente paga el precio normal. Marcada, paga el precio especial y el pedido te llega a Telegram y al panel con la etiqueta **PRIMERA RECARGA**. Si esa misma cuenta ya tenía pedidos de ese juego, además te sale una alerta amarilla para que revises. Para quitar la promo de un plan, deja el campo vacío.

## Problemas comunes del panel

| Lo que pasa | Solución |
|---|---|
| "Falta un paso en Firebase" | Publica las reglas nuevas (C1, paso 2). |
| La promoción no se guarda | Publica las reglas nuevas de `firebase/firestore.rules` (incluyen el permiso para la promoción). |
| Pedidos o Ventas dicen "Publica las reglas nuevas" | Pega otra vez `firebase/firestore.rules` en Firebase y pulsa Publicar. |
| Al entregar dice "No pudimos conectar con tu puente" | Pega el `worker/worker.js` nuevo en Cloudflare y pulsa Deploy: el panel usa una función nueva del puente. |
| Sigue pidiendo activar la cuenta | Revisa que el ID del documento en `admins` sea exactamente tu código, sin espacios. |
| "Estos datos se cambiaron desde otro dispositivo" | Editaste desde dos lugares a la vez. Si aceptas, se reemplaza lo otro; si cancelas, recarga el panel. |
| No aparece el botón de instalar | En iPhone usa Safari → Compartir → Agregar a inicio. En Android, menú ⋮ → Instalar app. |
| Cambié algo y no se ve | Recarga la tienda. Si estabas en la página, los cambios aparecen al volver a abrirla. |

---

# PARTE D — Correos y recordatorios de renovación

Con esto tus clientes reciben un correo (al correo con el que se registraron):

| Cuándo | Qué reciben |
|---|---|
| Entregas sus datos desde Telegram | "Tu pedido está listo" con correo, contraseña, perfil, PIN y fecha de vencimiento |
| Corriges una entrega | "Datos actualizados" (los días no se reinician) |
| Les respondes en el chat | "Tienes una respuesta" con tu mensaje (máximo un aviso cada 10 minutos) |
| Rechazas un pago | Aviso para que te escriban y lo resuelvan |
| Faltan 2 días para que venza | "Tu servicio vence pronto" con el botón **Renovar ahora**, que pone el mismo pedido en su carrito |

Además, cada mañana te llega a Telegram la lista de quién vence pronto y quién ya venció sin renovar, con su WhatsApp.

Los correos se envían con **Resend** (plan gratis: 3.000 correos al mes, máximo 100 por día). Si dejas una dirección para responder, cuando el cliente responde el correo te llega a ti.

## D1. Crea tu cuenta en Resend y verifica tu dominio

1. Entra a https://resend.com y crea tu cuenta gratis.
2. Ve a **Domains → Add Domain** y escribe **`envios.refillsec.com`**. Se usa un subdominio para no tocar tu correo actual de Ofer Hosting.
3. Resend te muestra 3 o 4 registros (tipo **TXT** y **MX**). Déjala abierta.
4. En tu cPanel de Ofer Hosting entra a **Editor de zona → refillsec.com → Administrar** y agrega cada registro con **+ Agregar registro**:
   - **Tipo:** el mismo que dice Resend (TXT o MX).
   - **Nombre:** el que dice Resend. Si cPanel pide el nombre completo, agrégale `.refillsec.com.` al final (por ejemplo `resend._domainkey.envios.refillsec.com.`).
   - **Valor / Registro:** cópialo exacto. En el MX, la prioridad es la que indica Resend (normalmente 10).
5. **No borres ni cambies** los registros que ya tienes: tu correo de siempre sigue igual.
6. En Resend pulsa **Verify DNS Records**. Suele tardar entre 15 minutos y unas horas. Cuando diga **Verified**, sigue.

> Mientras el dominio no esté verificado, Resend solo deja enviar correos a tu propio correo de Resend. Por eso los clientes no recibirán nada hasta que diga **Verified**.

## D2. Crea tu clave de Resend

**API Keys → Create API Key**, permiso **Sending access**. Cópiala; solo se muestra una vez.

## D3. Actualiza tu puente en Cloudflare

1. Workers y Pages → **refillsec-puente** → **Editar código**: borra todo, pega el nuevo `worker/worker.js` y pulsa **Implementar (Deploy)**.
2. **Settings → Variables and Secrets**, agrega:

| Nombre | Valor | Tipo |
|---|---|---|
| `RESEND_API_KEY` | la clave del paso D2 | Secret |
| `CORREO_REMITENTE` | `Refills EC <pedidos@envios.refillsec.com>` | Text |
| `CORREO_RESPUESTA` | tu correo, para que te respondan (ej. tu Gmail) | Text |
| `SITIO_URL` | `https://refillsec.com` (o tu dirección de Netlify si aún no conectas el dominio) | Text |
| `DIAS_RECORDATORIO` | `2` (opcional: con cuántos días de anticipación avisar) | Text |
| `CORREO_APROBADO` | `si` (opcional: avisar también cuando apruebas el pago) | Text |

3. Pulsa **Deploy**.

## D4. Activa la revisión diaria (recordatorios automáticos)

1. En tu worker: **Settings → Triggers (o Trigger events) → Cron Triggers → Add**.
2. Escribe **`0 14 * * *`** y guarda. Significa "todos los días a las 9:00 de Ecuador".
3. Para probarla sin esperar, abre en el navegador:
   `https://refillsec-puente.marlondominguez1012.workers.dev/revisar?clave=TU_WEBHOOK_SECRET`

Si alguien vence en los próximos 2 días, le llega el correo y a ti el resumen en Telegram. Cada cliente recibe el aviso una sola vez por vencimiento.

## D5. Publica la tienda y las reglas

1. Firebase → **Firestore Database → Reglas**: pega el contenido nuevo de `firebase/firestore.rules` y **Publicar**. Sin esto, la sección Clientes del panel no puede ver los pedidos.
2. Sube los archivos de la tienda a GitHub como siempre.

## D6. Prueba

1. Abre tu panel → **Tienda → Enviarme un correo de prueba**. Te debe llegar en un minuto (si no, mira en Spam).
2. Haz una compra de prueba con otra cuenta y entrégala desde Telegram: el bot te confirma "📧 También se lo enviamos a…".

## Tu sección Clientes (en el panel)

- **Por vencer / Activas / Vencidas / Clientes:** toca cada recuadro para filtrar. Los días se cuentan solos desde el día en que entregaste.
- **Enviar recordatorio:** le manda el correo de renovación en ese momento.
- **WhatsApp:** si el cliente dejó su número, abre WhatsApp con un mensaje listo y el enlace para renovar.
- **Descargar reporte:** un archivo que abres con Excel o Google Sheets, con todos tus clientes, servicios, fechas y días restantes.
- Tus clientes ven la misma cuenta regresiva en su pedido y en "Mis pedidos", con un botón **Renovar mi servicio** cuando faltan 3 días o menos.

## Problemas comunes de los correos

| Lo que pasa | Solución |
|---|---|
| El panel dice "domain is not verified" | Espera a que Resend marque el dominio como **Verified** (D1) o revisa que copiaste bien los registros. |
| El bot dice "No se pudo enviar el correo" | El mensaje trae el motivo. Casi siempre es la clave (`RESEND_API_KEY`) o el dominio sin verificar. La entrega igual queda en la web. |
| Los correos llegan a Spam | Pasa los primeros días con dominios nuevos. Pídele a tus primeros clientes que lo marquen como "No es spam". |
| No llegan recordatorios automáticos | Revisa el Cron Trigger (D4) y prueba con el enlace `/revisar`. |
| No quieres mostrar "Te avisaremos por correo" | En `shop/static/config.js` cambia `avisosPorCorreo` a `false`. |

---

# PARTE E — Contador de visitas (gratis)

Usamos **Cloudflare Web Analytics**: es gratis, no muestra publicidad, no usa cookies (no hace falta el aviso de "aceptar cookies") y usa la misma cuenta de Cloudflare de tu bot.

1. Entra a https://dash.cloudflare.com → **Web Analytics** (en el menú de la izquierda, a veces dentro de *Analytics & Logs*).
2. Toca **Add a site** y escribe la dirección de tu tienda sin `https://` (por ejemplo `refillsec.com`, o tu dirección de Netlify). Toca **Done**.
3. Cloudflare te muestra un código que contiene algo así: `data-cf-beacon='{"token": "abc123..."}'`. Copia **solo el token** (lo que va entre las comillas después de `"token":`).
4. Pégalo en `shop/static/config.js`:

   ```js
   analyticsToken: "abc123...",
   ```

5. Sube la tienda a GitHub. En unos minutos empiezas a ver en Cloudflare las visitas por día y por mes, qué páginas ven, de qué país y si entran por celular o computadora.

Notas:
- Tu panel de administrador no se cuenta, solo la tienda.
- Quienes usan bloqueadores de anuncios (por ejemplo, el navegador Brave) no se cuentan, así que la cifra real es un poco mayor. Para ver si creces mes a mes, sirve perfecto.
- Si conectas tu dominio después, en **Manage site** puedes cambiar la dirección sin cambiar el token.


## WhatsApp del cliente, mensajes rápidos y ventas por WhatsApp

- **WhatsApp obligatorio:** al comprar, el cliente debe escribir su número (0991234567 o con código de país). Se guarda en el pedido.
- **Mensajes rápidos:** en Pedidos → toca un pedido → sección Cliente: botones *Saludo*, *Estoy verificando tu pago*, *Pedido entregado*,
  *Recordatorio de vencimiento* y *¿Tienes algún problema?*. Cada uno abre el chat de ese cliente en WhatsApp con el mensaje ya escrito
  (tú solo tocas enviar).
- **Registrar venta:** Pedidos → **+ Registrar venta** (o abre `/admin/#vender`). Sirve para ventas hechas por WhatsApp o en persona.
- **Atajo del iPhone:** mira `GUIA-ATAJO-IPHONE.md`. Requiere agregar la variable `ATAJO_TOKEN` en Cloudflare y volver a desplegar `worker.js`.
