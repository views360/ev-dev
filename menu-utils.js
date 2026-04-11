// ===================================================================
// menu-utils.js
// Shared utility functions for menu and tooltips across all pages
// ===================================================================

function resetAll() {
    localStorage.clear();

    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    }

    const inputs = document.querySelectorAll('input');
    inputs.forEach(input => {
        if (input.type === 'number' || input.type === 'text') {
            input.value = '';
        }
    });

    const providersContainer = document.getElementById("providers");
    if (providersContainer) {
        providersContainer.innerHTML = "";
    }
    window.location.href = "index.html";
}

const setCookie = (name, value) => {
    const date = new Date();
    date.setTime(date.getTime() + (30 * 24 * 60 * 60 * 1000));
    const cookieValue = encodeURIComponent(JSON.stringify(value));
    document.cookie = `${name}=${cookieValue};expires=${date.toUTCString()};path=/;SameSite=Lax`;
};

const getCookie = (name) => {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(nameEQ) === 0) {
            try {
                return JSON.parse(decodeURIComponent(c.substring(nameEQ.length)));
            } catch (e) {
                return null;
            }
        }
    }
    return null;
};

function toggleTheme() {
    const isLight = document.documentElement.classList.toggle("light-mode");
    setCookie('themePref', isLight ? 'light' : 'dark');
}

// ---------------------------------------------------------------------------
// Floating viewport-safe tooltip
// ---------------------------------------------------------------------------
let _ftDiv = null;
let _ftCaret = null;
let _ftOverlay = null;
let _ftActive = null;
let _ftTimer = null;

function _initTooltipDOM() {
    if (_ftDiv) return; // Already initialized

    _ftDiv = document.createElement('div');
    _ftDiv.id = 'floatingTooltip';
    _ftDiv.style.cssText = [
        'position:fixed',
        'z-index:9999',
        'width:200px',
        'padding:10px 14px 16px',
        'border-radius:8px',
        'text-align:center',
        'font-size:0.85rem',
        'line-height:1.4',
        'pointer-events:none',
        'background:#1e293b',
        'color:#f1f5f9',
        'border:1px solid #38bdf8',
        'box-shadow:0 0 12px rgba(56,189,248,0.3)',
        'visibility:hidden',
    ].join(';') + ';';

    // Caret arrow
    _ftCaret = document.createElement('div');
    _ftCaret.style.cssText = [
        'position:absolute',
        'bottom:-6px',
        'left:50%',
        'width:0',
        'height:0',
        'border-left:6px solid transparent',
        'border-right:6px solid transparent',
        'border-top:6px solid #38bdf8',
        'transform:translateX(-50%)',
    ].join(';') + ';';
    _ftDiv.appendChild(_ftCaret);
    document.body.appendChild(_ftDiv);

    // Transparent overlay
    _ftOverlay = document.createElement('div');
    _ftOverlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:transparent;display:none;';
    document.body.appendChild(_ftOverlay);

    _ftOverlay.addEventListener('touchstart', (e) => {
        _ftHide();
    }, { passive: true });
}

function _ftPosition(iconEl) {
    if (!_ftDiv) return;
    const ir     = iconEl.getBoundingClientRect();
    const vw     = window.innerWidth;
    const W      = _ftDiv.offsetWidth  || 200;
    const H      = _ftDiv.offsetHeight || 60;
    const MARGIN = 12;

    let left = ir.left + ir.width / 2 - W / 2;
    let top  = ir.top - H - 6;

    // Clamp using actual rendered width
    left = Math.max(MARGIN, Math.min(left, vw - W - MARGIN));

    // Flip below if not enough room above
    const flipped = top < MARGIN;
    if (flipped) top = ir.bottom + 6;

    _ftDiv.style.left = left + 'px';
    _ftDiv.style.top  = top  + 'px';

    // Measure the actual visual centre of the emoji text node via a Range,
    // which is precise regardless of browser glyph spacing quirks.
    let iconCentreX = ir.left + ir.width / 2; // fallback
    try {
        const range = document.createRange();
        range.selectNode(iconEl.firstChild);
        const tr = range.getBoundingClientRect();
        if (tr.width > 0) iconCentreX = tr.left + tr.width / 2;
    } catch(e) {}
    const caretLeft = Math.max(12, Math.min(iconCentreX - left, W - 12));
    _ftCaret.style.left = caretLeft + 'px';

    if (flipped) {
        _ftCaret.style.bottom        = 'auto';
        _ftCaret.style.top           = '-6px';
        _ftCaret.style.borderTop     = 'none';
        _ftCaret.style.borderBottom  = '6px solid #38bdf8';
    } else {
        _ftCaret.style.top           = 'auto';
        _ftCaret.style.bottom        = '-6px';
        _ftCaret.style.borderBottom  = 'none';
        _ftCaret.style.borderTop     = '6px solid #38bdf8';
    }
}

function _ftHide() {
    if (!_ftDiv) return;
    clearTimeout(_ftTimer);
    _ftDiv.style.visibility = 'hidden';
    if (_ftOverlay) _ftOverlay.style.display = 'none';
    _ftActive = null;
}

function toggleTooltip(iconEl) {
    if (!_ftDiv) _initTooltipDOM(); // Initialize if not yet done
    if (_ftActive === iconEl) { _ftHide(); return; }
    const src = iconEl.querySelector('.tooltip-box');
    if (!src) return;
    _ftActive = iconEl;
    if (_ftDiv.firstChild && _ftDiv.firstChild.nodeType === 3) {
        _ftDiv.firstChild.textContent = src.textContent;
    } else {
        _ftDiv.insertBefore(document.createTextNode(src.textContent), _ftCaret);
    }
    requestAnimationFrame(() => {
        _ftPosition(iconEl);
        _ftDiv.style.visibility = 'visible';
        // Show overlay on touch devices so any subsequent touch hides the tooltip
        if (window.matchMedia('(hover: none)').matches) {
            _ftOverlay.style.display = 'block';
        }
    });
}

function expandActiveSections() {
    // Get the current page filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Check all menu items with data-page attribute or href matching current page
    const activeItem = document.querySelector(`a[data-page][href="${currentPage}"]`) || 
                       document.querySelector(`a[href="${currentPage}"]`);
    
    if (activeItem) {
        // Add active class to the link
        document.querySelectorAll('a.menu-item-clean').forEach(link => {
            link.classList.remove('active-page');
        });
        activeItem.classList.add('active-page');
        
        // Find parent section and expand it
        let parent = activeItem.closest('.menu-section-items');
        if (parent) {
            const toggle = parent.previousElementSibling;
            if (toggle && toggle.classList.contains('menu-section-toggle')) {
                toggle.classList.add('open');
                parent.classList.add('open');
            }
        }
    }
}

// Desktop: hide on click outside, show/hide on hover, reposition on scroll
document.addEventListener('click', (e) => {
    if (_ftActive && !e.target.closest('.info-icon')) _ftHide();
}, true);

document.addEventListener('mouseover', (e) => {
    const icon = e.target.closest('.info-icon');
    if (icon && icon !== _ftActive) toggleTooltip(icon);
});

document.addEventListener('mouseout', (e) => {
    const icon = e.target.closest('.info-icon');
    if (icon && !icon.contains(e.relatedTarget)) _ftHide();
});

document.addEventListener('scroll', () => {
    if (_ftActive) _ftPosition(_ftActive);
}, true);

window.addEventListener('resize', () => {
    if (_ftActive) _ftPosition(_ftActive);
});

document.addEventListener('click', (e) => {
    const menu = document.getElementById('sideMenu');
    // Adjust '.android-dots-trigger' if your menu button has a different class
    const trigger = document.querySelector('.android-dots-trigger'); 
    
    if (menu && menu.classList.contains('active')) {
        // If the click is NOT on the menu and NOT on the trigger button, close the menu
        if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
            menu.classList.remove('active');
        }
    }
});

async function loadMenu() {
    // 1. ALWAYS create the footer first so it doesn't depend on the menu
    if (!document.querySelector('footer')) {
        const footer = document.createElement('footer');
        footer.innerHTML = `<p>&copy; ${new Date().getFullYear()} EV Subs UK. All rights reserved.</p>`;
        document.body.appendChild(footer);
    }

    // 2. Then try to load the menu
    try {
        const response = await fetch('menu.html');
        if (!response.ok) throw new Error('Menu fetch failed');
        
        const menuHtml = await response.text();
        const placeholder = document.getElementById('menu-placeholder');
        
        if (placeholder) {
            placeholder.innerHTML = menuHtml;
            initSearch();
        }
        
        // Use a safety check before calling this
        setTimeout(() => {
            if (typeof expandActiveSections === 'function') {
                expandActiveSections();
            }
        }, 50);

    } catch (error) {
        console.error('Menu load failed:', error);
    }
}

function initSearch() {
    const isGitHub = window.location.hostname.includes('github.io');
    const jsonPath = isGitHub ? '/ev-dev/search.json' : '/search.json';

    console.log("Searching for database at:", jsonPath);

    fetch(jsonPath)
      .then(res => res.json())
      .then(data => {
        console.log("Search database loaded! Total pages:", data.length);
        
        const fuse = new Fuse(data, { 
            keys: ['title', 'content'], 
            threshold: 0.4 
        });

        const input = document.getElementById('search-input');
        const list = document.getElementById('results-list');

        if (!input) {
            console.error("Search input not found in the menu!");
            return;
        }

        input.oninput = () => {
          const results = fuse.search(input.value);
          if (input.value.length > 0 && results.length > 0) {
            list.style.display = 'block';
            list.innerHTML = results.map(r => 
              `<li><a href="${r.item.url}">${r.item.title}</a></li>`
            ).join('');
          } else {
            list.style.display = 'none';
          }
        };
      })
      .catch(err => console.error("Search fetch failed:", err));
}

function toggleMenu() {
    const menu = document.getElementById('sideMenu');
    if (menu) {
        menu.classList.toggle('active');
        if (menu.classList.contains('active')) {
            expandActiveSections();
        }
    }
}

function toggleMenuSection(toggleId, itemsId) {
    const toggle = document.getElementById(toggleId);
    const items = document.getElementById(itemsId);

    if (toggle && items) {
        // If we are about to open this section...
        if (!items.classList.contains('open')) {
            // ...close all other open sections first
            document.querySelectorAll('.menu-section-toggle').forEach(t => t.classList.remove('open'));
            document.querySelectorAll('.menu-section-items').forEach(i => i.classList.remove('open'));
        }

        // Now toggle the clicked section
        toggle.classList.toggle('open');
        items.classList.toggle('open');
    }
}
