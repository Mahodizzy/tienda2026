document.addEventListener('DOMContentLoaded', () => {
    // 1. Caché de Elementos y Estado
    const state = {
        currentWhatsappLink: "",
        cartCount: 0
    };

    const dom = {
        productGrid: document.getElementById('product-grid'),
        searchInput: document.getElementById('search-input'),
        filterButtons: document.querySelectorAll('.filter-btn'),
        loader: document.getElementById('loader-overlay'),
        modal: document.getElementById('confirmation-modal'),
        modalContent: {
            name: document.getElementById('modal-product-name'),
            price: document.getElementById('modal-product-price'),
            img: document.getElementById('modal-product-image'),
        },
        cartCounter: document.querySelector('.contador-carrito'),
        body: document.body
    };

    // --- 2. Gestión de Productos (Búsqueda y Filtro) ---
    // Pre-calculamos las referencias de las cards para no buscarlas en cada tecla
    const productCards = Array.from(document.querySelectorAll('.product-card')).map(card => ({
        element: card,
        name: card.querySelector('.product-name').textContent.toLowerCase(),
        category: card.dataset.category
    }));

    const updateVisibility = () => {
        const query = dom.searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('.filter-btn.active')?.dataset.filter || 'all';

        productCards.forEach(({ element, name, category }) => {
            const matchesSearch = name.includes(query);
            const matchesFilter = activeFilter === 'all' || category === activeFilter;
            element.style.display = (matchesSearch && matchesFilter) ? "flex" : "none";
        });
    };

    // --- 3. Controladores del Modal ---
    const toggleModal = (show, data = {}) => {
        if (show) {
            state.currentWhatsappLink = data.link;
            dom.modalContent.name.textContent = data.name;
            dom.modalContent.price.textContent = data.price;
            dom.modalContent.img.src = data.img;
            dom.modal.style.display = 'flex';
            setTimeout(() => dom.modal.classList.add('show'), 10);
        } else {
            dom.modal.classList.remove('show');
            setTimeout(() => dom.modal.style.display = 'none', 300);
        }
    };

    // --- 4. Delegación de Eventos (Un solo listener para todo) ---
    document.addEventListener('click', (e) => {
        // Filtros
        const filterBtn = e.target.closest('.filter-btn');
        if (filterBtn) {
            dom.filterButtons.forEach(btn => btn.classList.remove('active'));
            filterBtn.classList.add('active');
            updateVisibility();
        }

        // Botón Comprar (Abrir Modal)
        const buyLink = e.target.closest('.buy-link');
        if (buyLink) {
            e.preventDefault();
            const card = buyLink.closest('.product-card');
            toggleModal(true, {
                name: card.querySelector('.product-name').textContent.trim(),
                price: card.querySelector('.product-price').textContent.trim(),
                img: card.querySelector('img').src,
                link: buyLink.href
            });
        }

        // Añadir al Carrito
        const addCartBtn = e.target.closest('.btn-add-cart');
        if (addCartBtn) {
            state.cartCount++;
            if (dom.cartCounter) {
                dom.cartCounter.textContent = state.cartCount;
                dom.cartCounter.animate([
                    { transform: 'scale(1)' },
                    { transform: 'scale(1.4)' },
                    { transform: 'scale(1)' }
                ], { duration: 200 });
            }
        }

        // Cerrar Modal (Botones o fuera del contenido)
        if (e.target.closest('#cancel-button') || e.target === dom.modal) {
            toggleModal(false);
        }

        // Confirmar WhatsApp
        if (e.target.closest('#confirm-button')) {
            window.open(state.currentWhatsappLink, '_blank');
            toggleModal(false);
        }
    });

    dom.searchInput?.addEventListener('input', updateVisibility);

    // --- 5. Loader y Partículas ---
    window.addEventListener('load', () => {
        if (dom.loader) {
            dom.loader.classList.add('loader-hidden');
            setTimeout(() => dom.loader.remove(), 600); // Eliminamos del DOM para ahorrar recursos
        }
        initParticles();
    });

    function initParticles() {
        const canvas = document.getElementById('particles-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let particlesArray = [];
        
        const setSize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        setSize();
        window.addEventListener('resize', setSize);

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 1;
                this.speedX = Math.random() * 1 - 0.5;
                this.speedY = Math.random() * 1 - 0.5;
            }
            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
                if (this.y > canvas.height || this.y < 0) this.speedY *= -1;
            }
            draw() {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        const init = () => {
            particlesArray = Array.from({ length: 50 }, () => new Particle());
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particlesArray.forEach(p => { p.update(); p.draw(); });
            requestAnimationFrame(animate);
        };
        init();
        animate();
    }
});
