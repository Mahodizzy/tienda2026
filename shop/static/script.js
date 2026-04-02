// --- 1. DATOS DE RESEÑAS ---
const googleReviews = [
    { name: "Ariel Galarza Guaranda", initials: "AG", img: "https://lh3.googleusercontent.com/a-/ALV-UjU9snpb9693-kvLKSMSOvWssueMooV5GKaCKIL_qK50SN6XJxUk=w36-h36-p-rp-mo-br100", text: "El mejor distribuidor de cuentas, más efectivo que un buen encebollado cuando andas con chuchaqui 👐🏻…", date: "2026-03-03" },
    { name: "Beckeer Romero", initials: "B", img: "", text: "lo mejor de lo mejor seguro y confiable se los recomiendo", date: "2026-03-05" },
    { name: "Alex Gutierrez", initials: "A", img: "", text: "Buen servicio, buenos precios, son los mejores🙌", date: "2026-03-05" },
    { name: "Sebastian Rodriguez", initials: "S", img: "", text: "Increíble y confiable la mejor experiencia", date: "2026-03-17" },
    { name: "Leonel Palencia", initials: "L", img: "", text: "Super recomendado , 10000/10 el servicio, pronto y seguro 💥✨", date: "2026-03-17" },
    { name: "Andrea Itzel", initials: "A", img: "", text: "MUY RECOMENDABLE 100% CONFIABLE", date: "2026-03-17" },
    { name: "Victor Arias", initials: "V", img: "", text: "Exelente atención al cliente. Me atendieron con mucha amabilidad y el servicio fue muy confiable. Lo recomiendo.", date: "2026-03-17" }
];

// --- 2. FUNCIONES GLOBALES (FUERA DEL DOMCONTENTLOADED) ---
window.flipAuth = function() {
    const card = document.getElementById('auth-card');
    if(card) card.classList.toggle('flipped');
};

window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if(modal) modal.style.display = 'none';
};

// Función para el tiempo de las reseñas
function calcularTiempoTranscurrido(fecha) {
    const ahora = new Date();
    const pub = new Date(fecha);
    const diff = ahora - pub;
    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (dias === 0) return "Hoy";
    if (dias < 7) return `Hace ${dias} días`;
    const sem = Math.floor(dias / 7);
    return `Hace ${sem} ${sem === 1 ? 'semana' : 'semanas'}`;
}

// --- 3. INICIO DEL SCRIPT PRINCIPAL ---
document.addEventListener('DOMContentLoaded', async () => {
    
    // --- SELECTORES DOM ---
    const dom = {
        searchInput: document.getElementById('search-input'),
        filterButtons: document.querySelectorAll('.filter-btn'),
        productCards: document.querySelectorAll('.product-card'),
        itemsContainer: document.getElementById('cart-items'),
        totalAmount: document.getElementById('cart-total-amount'),
        cartCounter: document.querySelector('.contador-carrito'),
        drawer: document.getElementById('cart-drawer'),
        overlay: document.getElementById('cart-overlay'),
        loader: document.getElementById('loader-overlay'),
        authModal: document.getElementById('auth-modal'),
        reviewsGrid: document.getElementById('reviews-grid'),
        loginForm: document.getElementById('login-form-3d'),
        registerForm: document.getElementById('register-form-3d'),
        googleBtn: document.getElementById('google-login-btn'),
        userDrawer: document.getElementById('user-drawer'),
        userOverlay: document.getElementById('user-overlay'),
        closeUserDrawer: document.getElementById('close-user-drawer'),
        userWelcomeName: document.getElementById('user-welcome-name'),
        logoutBtnDrawer: document.getElementById('btn-logout-drawer'),
        loginBtn: document.getElementById('btn-login-open')
    };

    let cart = JSON.parse(localStorage.getItem('refills_cart')) || [];

    // --- 4. PERSISTENCIA FIREBASE ---
    try {
        await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) { console.error(e); }

    // --- 5. RENDERIZAR RESEÑAS ---
    if (dom.reviewsGrid) {
        const allReviews = [...googleReviews, ...googleReviews]; // Duplicado para loop
        dom.reviewsGrid.innerHTML = allReviews.map(r => `
            <div class="review-card">
                <div class="review-header">
                    <div class="review-avatar">${r.img ? `<img src="${r.img}" class="avatar-img">` : `<span>${r.initials}</span>`}</div>
                    <div class="review-info">
                        <h4>${r.name}</h4>
                        <div class="review-stars"><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i><i class="fa-solid fa-star"></i></div>
                    </div>
                </div>
                <p class="review-body">"${r.text}"</p>
                <div class="review-footer">
                    <span>${calcularTiempoTranscurrido(r.date)}</span> 
                    <img src="https://www.svgrepo.com/show/475656/google-color.svg" width="16">
                </div>
            </div>
        `).join('');
    }

    // --- 6. LÓGICA DEL CARRITO ---
    const updateCartUI = () => {
        if (!dom.itemsContainer) return;
        dom.itemsContainer.innerHTML = cart.length === 0 ? `<p class="text-center opacity-30 mt-10 text-white">Tu carrito está vacío</p>` : '';
        let subtotal = 0;
        cart.forEach((p, i) => {
            const price = parseFloat(p.price.replace('$', '').replace(',', '.').trim());
            subtotal += price * p.quantity;
            dom.itemsContainer.insertAdjacentHTML('beforeend', `
                <div class="cart-item flex items-center gap-3 p-4 border-b border-white/5 bg-white/5 mb-2 rounded-xl">
                    <img src="${p.img}" class="w-12 h-12 rounded-lg object-cover">
                    <div class="flex-grow">
                        <p class="text-sm font-bold text-white">${p.name}</p>
                        <div class="flex items-center gap-4 mt-2">
                            <div class="quantity-controls flex items-center bg-white/10 rounded-lg p-1">
                                <button class="btn-qty minus px-2 text-white" data-index="${i}">-</button>
                                <span class="qty-number px-2 text-blue-400 font-bold">${p.quantity}</span>
                                <button class="btn-qty plus px-2 text-white" data-index="${i}">+</button>
                            </div>
                            <button class="btn-remove-item text-red-500 ml-2" data-index="${i}"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </div>
                    <div class="text-right"><p class="text-sm text-blue-400 font-bold">$ ${(price * p.quantity).toFixed(2).replace('.',',')}</p></div>
                </div>
            `);
        });
        if (dom.totalAmount) dom.totalAmount.textContent = `$ ${subtotal.toFixed(2).replace('.', ',')}`;
        if (dom.cartCounter) dom.cartCounter.textContent = cart.reduce((acc, p) => acc + p.quantity, 0);
        localStorage.setItem('refills_cart', JSON.stringify(cart));
    };

    // --- 7. EVENTOS DE CLICK (Boton Pago incluido) ---
    document.addEventListener('click', (e) => {
        // Añadir producto
        if (e.target.closest('.buy-link')) {
            e.preventDefault(); 
            e.stopPropagation();
            const card = e.target.closest('.product-card');
            const product = {
                name: card.querySelector('.product-name').textContent.trim(),
                price: card.querySelector('.product-price').textContent.trim(),
                img: card.querySelector('img').src,
                quantity: 1
            };
            const existing = cart.find(item => item.name === product.name);
            if (existing) existing.quantity++; else cart.push(product);
            updateCartUI();
        }

        // Cantidades y Borrar
        if (e.target.classList.contains('btn-qty')) {
            const idx = e.target.dataset.index;
            if (e.target.classList.contains('plus')) cart[idx].quantity++;
            else if (cart[idx].quantity > 1) cart[idx].quantity--;
            updateCartUI();
        }
        if (e.target.closest('.btn-remove-item')) {
            cart.splice(e.target.closest('.btn-remove-item').dataset.index, 1);
            updateCartUI();
        }

        // Abrir/Cerrar Carritos y Modales
        if (e.target.closest('.btn-flotante') || e.target.id === 'close-cart' || e.target === dom.overlay) {
            dom.drawer.classList.toggle('open');
            dom.overlay.classList.toggle('show');
        }

        // REDIRECCIÓN AL PAGO (Botón Finalizar Pedido)
        if (e.target.id === 'btn-finalize-order') {
            if (cart.length === 0) return alert("Tu carrito está vacío");
            localStorage.setItem('refills_total', dom.totalAmount.textContent);
            window.location.href = "pago.html";
        }
    });

    // --- 8. BUSCADOR Y FILTROS ---
    if (dom.searchInput) {
        dom.searchInput.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            dom.productCards.forEach(c => {
                const name = c.querySelector('.product-name').textContent.toLowerCase();
                c.style.display = name.includes(q) ? 'flex' : 'none';
            });
        });
    }
    dom.filterButtons.forEach(btn => {
        btn.onclick = () => {
            dom.filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            dom.productCards.forEach(c => c.style.display = (btn.dataset.filter === 'all' || c.dataset.category === btn.dataset.filter) ? 'flex' : 'none');
        };
    });

    // --- 9. FIREBASE AUTH (Login/Registro/Google) ---
    auth.onAuthStateChanged(user => {
        if (user) {
            if (dom.userWelcomeName) dom.userWelcomeName.textContent = `¡Hola, ${user.displayName || 'Usuario'}!`;
            if (dom.loginBtn) {
                dom.loginBtn.innerHTML = `<i class="fa-solid fa-user"></i> ${user.displayName || 'Cuenta'}`;
                dom.loginBtn.onclick = (e) => { e.preventDefault(); dom.userDrawer.classList.add('open'); dom.userOverlay.classList.add('show'); };
            }
        } else {
            if (dom.loginBtn) {
                dom.loginBtn.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> Entrar`;
                dom.loginBtn.onclick = () => dom.authModal.style.display = 'flex';
            }
        }
    });

    if (dom.googleBtn) {
        dom.googleBtn.onclick = async () => {
            const provider = new firebase.auth.GoogleAuthProvider();
            try { await auth.signInWithPopup(provider); location.reload(); } catch (e) { console.error(e); }
        };
    }

    if (dom.logoutBtnDrawer) {
        dom.logoutBtnDrawer.onclick = async () => { if(confirm("¿Cerrar sesión?")) { await auth.signOut(); location.reload(); }};
    }

    // Cerrar User Drawer
    if (dom.closeUserDrawer) dom.closeUserDrawer.onclick = () => { dom.userDrawer.classList.remove('open'); dom.userOverlay.classList.remove('show'); };

    // --- 10. PARTÍCULAS ---
    function initParticles() {
        const canvas = document.getElementById('particles-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let pts = [];
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        window.onresize = resize; resize();
        for(let i=0; i<80; i++) pts.push({x:Math.random()*canvas.width, y:Math.random()*canvas.height, s:Math.random()*1.5+0.5, vx:Math.random()*0.5-0.25, vy:Math.random()*0.5-0.25, o:Math.random()*0.5+0.3});
        function anim() {
            ctx.clearRect(0,0,canvas.width,canvas.height);
            pts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                if(p.x<0 || p.x>canvas.width || p.y<0 || p.y>canvas.height) { p.x=Math.random()*canvas.width; p.y=Math.random()*canvas.height; }
                ctx.fillStyle=`rgba(255,255,255,${p.o})`; ctx.beginPath(); ctx.arc(p.x,p.y,p.s,0,Math.PI*2); ctx.fill();
            });
            requestAnimationFrame(anim);
        }
        anim();
    }

    // --- INICIALIZACIÓN FINAL ---
    updateCartUI();
    initParticles();
    if (dom.loader) setTimeout(() => dom.loader.classList.add('loader-hidden'), 500);
});
