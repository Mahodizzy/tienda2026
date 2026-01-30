document.addEventListener('DOMContentLoaded', () => {
    // 1. Referencias Únicas al DOM
    const elements = {
        productGrid: document.getElementById('product-grid'),
        searchInput: document.getElementById('search-input'),
        filterButtons: document.querySelectorAll('.filter-btn'),
        loader: document.getElementById('loader-overlay'),
        modal: document.getElementById('confirmation-modal'), 
        modalProductName: document.getElementById('modal-product-name'),
        modalProductPrice: document.getElementById('modal-product-price'),
        modalProductImage: document.getElementById('modal-product-image'),
        confirmButton: document.getElementById('confirm-button'),
        cancelButton: document.getElementById('cancel-button'),
        body: document.body,
        themeToggle: document.getElementById('theme-toggle')
    };

    // --- FUERZA EL CIERRE INMEDIATO AL CARGAR ---
    if (elements.modal) {
        elements.modal.classList.remove('show');
        elements.modal.style.display = 'none';
    }

    let currentWhatsappLink = "";

    // --- 2. Lógica de Búsqueda y Filtros ---
    const filterProducts = () => {
        const searchTerm = elements.searchInput.value.toLowerCase();
        const activeFilterBtn = document.querySelector('.filter-btn.active');
        const filterValue = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';
        
        const productCards = document.querySelectorAll('.product-card');

        productCards.forEach(card => {
            const productName = card.querySelector('.product-name').textContent.toLowerCase();
            const category = card.getAttribute('data-category');
            
            const matchesSearch = productName.includes(searchTerm);
            const matchesFilter = (filterValue === 'all' || category === filterValue);

            card.style.display = (matchesSearch && matchesFilter) ? "flex" : "none";
        });
    };

    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', filterProducts);
    }

    elements.filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            elements.filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            filterProducts();
        });
    });

    // --- 3. Funciones del Modal ---
    const showModal = (name, price, img, link) => {
        currentWhatsappLink = link;
        elements.modalProductName.textContent = name;
        elements.modalProductPrice.textContent = price;
        elements.modalProductImage.src = img;

        elements.modal.style.display = 'flex';
        setTimeout(() => {
            elements.modal.classList.add('show');
        }, 10);
    };

    const hideModal = () => {
        elements.modal.classList.remove('show');
        setTimeout(() => {
            if (!elements.modal.classList.contains('show')) {
                elements.modal.style.display = 'none';
            }
        }, 300);
    };

    // --- 4. Eventos de Clic ---
    if (elements.productGrid) {
        elements.productGrid.addEventListener('click', (e) => {
            const buyLink = e.target.closest('.buy-link');
            if (buyLink) {
                e.preventDefault();
                const card = buyLink.closest('.product-card');
                
                showModal(
                    card.querySelector('.product-name').textContent.trim(),
                    card.querySelector('.product-price').textContent.trim(),
                    card.querySelector('img').src,
                    buyLink.href
                );
            }
        });
    }

    if (elements.cancelButton) elements.cancelButton.addEventListener('click', hideModal);
    
    if (elements.confirmButton) {
        elements.confirmButton.addEventListener('click', () => {
            window.open(currentWhatsappLink, '_blank');
            hideModal();
        });
    }

    if (elements.modal) {
        const handleOutsideClick = (e) => {
            if (e.target === elements.modal) hideModal();
        };
        elements.modal.addEventListener('click', handleOutsideClick);
        elements.modal.addEventListener('touchstart', handleOutsideClick, { passive: true });
    }

    // --- 5. Loader y Tema ---
    window.addEventListener('load', () => {
        if (elements.loader) {
            setTimeout(() => {
                elements.loader.classList.add('loader-hidden');
            }, 500);
        }
    });

    if (localStorage.getItem('theme') === 'light') elements.body.classList.add('light-mode');
    
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', () => {
            elements.body.classList.toggle('light-mode');
            localStorage.setItem('theme', elements.body.classList.contains('light-mode') ? 'light' : 'dark');
        });
    }
     // --- SISTEMA DE PARTÍCULAS INTERACTIVAS (NUEVO) ---
    const initParticles = () => {
        const canvas = document.getElementById('particles-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        let particlesArray;

        // Ajustar tamaño al cargar
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        // Posición del Mouse / Toque
        const mouse = {
            x: null,
            y: null,
            radius: 150 // Radio de interacción
        };

        // Eventos de Mouse (PC)
        window.addEventListener('mousemove', (event) => {
            mouse.x = event.x;
            mouse.y = event.y;
        });

        // Eventos de Touch (Móvil)
        window.addEventListener('touchmove', (event) => {
            mouse.x = event.touches[0].clientX;
            mouse.y = event.touches[0].clientY;
        }, { passive: true });

        window.addEventListener('touchstart', (event) => {
            mouse.x = event.touches[0].clientX;
            mouse.y = event.touches[0].clientY;
        }, { passive: true });

        window.addEventListener('touchend', () => {
            mouse.x = null;
            mouse.y = null;
        });

        window.addEventListener('mouseout', () => {
            mouse.x = null;
            mouse.y = null;
        });

        class Particle {
            constructor(x, y, directionX, directionY, size, color) {
                this.x = x;
                this.y = y;
                this.directionX = directionX;
                this.directionY = directionY;
                this.size = size;
                this.color = color;
                this.baseX = x;
                this.baseY = y;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2, false);
                ctx.fillStyle = this.color;
                ctx.fill();
            }

            update() {
                let dx = mouse.x - this.x;
                let dy = mouse.y - this.y;
                let distance = Math.sqrt(dx * dx + dy * dy);


                if (mouse.x != null && distance < mouse.radius) {
                    const forceDirectionX = dx / distance;
                    const forceDirectionY = dy / distance;
                    const force = (mouse.radius - distance) / mouse.radius;
                    const directionX = forceDirectionX * force * 3;
                    const directionY = forceDirectionY * force * 3;

                    this.x += directionX;
                    this.y += directionY;
                } else {
                    if (this.x !== this.baseX) {
                        this.x += this.directionX;
                        this.y += this.directionY;
                    } else {
                        this.x += this.directionX;
                        this.y += this.directionY;
                    }
                }

                if (this.x > canvas.width || this.x < 0) this.directionX = -this.directionX;
                if (this.y > canvas.height || this.y < 0) this.directionY = -this.directionY;

                this.draw();
            }
        }

        function init() {
            particlesArray = [];
            let numberOfParticles = (canvas.height * canvas.width) / 9000;

            for (let i = 0; i < numberOfParticles; i++) {
                let size = (Math.random() * 2) + 1;
                let x = (Math.random() * ((innerWidth - size * 2) - (size * 2)) + size * 2);
                let y = (Math.random() * ((innerHeight - size * 2) - (size * 2)) + size * 2);
                let directionX = (Math.random() * 1) - 0.5;
                let directionY = (Math.random() * 1) - 0.5;
                let color = `rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1})`;

                particlesArray.push(new Particle(x, y, directionX, directionY, size, color));
            }
        }

        function animate() {
            requestAnimationFrame(animate);
            ctx.clearRect(0, 0, innerWidth, innerHeight);
            for (let i = 0; i < particlesArray.length; i++) {
                particlesArray[i].update();
            }
        }

        window.addEventListener('resize', () => {
            canvas.width = innerWidth;
            canvas.height = innerHeight;
            init();
        });

        init();
        animate();
    };

    initParticles();

});