function drawGraph(core, providers) {
    const ctx = document.getElementById("costChart");
    if (chart) chart.destroy();

    // 1. Detect Mode
    const activePill = document.querySelector('.calc-tab.active');
    const isTripMode = activePill && activePill.textContent.trim() === "Cost Reduction";

    // Define X-axis range
    const maxMiles = Math.max(core.journeyMiles * 1.5, 500);
    const labels = Array.from({ length: 11 }, (_, i) => Math.round((maxMiles * i) / 10));

    // Helper: Calculate initial range available from starting SOC
    const initialRange = (core.soc / 100) * core.batteryKwh * core.efficiency;

    // Helper: Calculate cost based on mode
    const calculateCost = (m, subFee, ratePerKwh) => {
        if (!isTripMode) {
            // BREAK-EVEN MODE
            return subFee + ((m / core.efficiency) * (ratePerKwh / 100));
        } else {
            // COST REDUCTION MODE (includes Pre-Charge and Initial Range flat-line)
            const preChargeKwh = Math.max(0, (core.soc - core.prechargesoc) / 100) * core.batteryKwh;
            const preChargeCost = preChargeKwh * (core.startChargeRate / 100);

            const publicMiles = Math.max(0, m - initialRange);
            const publicCost = (publicMiles / core.efficiency) * (ratePerKwh / 100);

            return subFee + preChargeCost + publicCost;
        }
    };

    // 2. Standard PAYG Dataset
    const adhocData = labels.map(m => calculateCost(m, 0, core.adhoc));
    const datasets = [{
        label: "Standard PAYG",
        data: adhocData,
        borderColor: "#f97316",
        borderWidth: 3,
        pointRadius: 0,
        fill: false,
        order: 2
    }];

    // 3. Initial Range Marker (For all lines in Cost-Reduction Mode)
    if (isTripMode && initialRange > 0 && initialRange <= maxMiles) {
        // We add a marker for the PAYG line's transition
        datasets.push({
            label: "Battery Exhausted",
            data: [{ x: initialRange, y: calculateCost(initialRange, 0, core.adhoc) }],
            pointBackgroundColor: "#f97316",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: 6,
            showLine: false,
            type: 'scatter',
            order: 1
        });
    }

    // 4. Provider Datasets
    providers.forEach((p, idx) => {
        const color = getProviderColor(p.name, idx);
        const subFee = parseFloat(p.subCost);
        const data = labels.map(m => calculateCost(m, subFee, p.rate));

        datasets.push({
            label: p.name,
            data: data,
            borderColor: color,
            borderWidth: 2,
            pointRadius: 0,
            fill: false,
            order: 2
        });

        // Mode-specific markers
        if (isTripMode) {
            // Marker where this specific provider starts charging
            if (initialRange > 0 && initialRange <= maxMiles) {
                datasets.push({
                    label: `${p.name} Start Charging`,
                    data: [{ x: initialRange, y: calculateCost(initialRange, subFee, p.rate) }],
                    pointBackgroundColor: color,
                    pointBorderColor: "#fff",
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    showLine: false,
                    type: 'scatter',
                    order: 1
                });
            }
        } else {
            // Break-even markers for Break-Even Mode
            const rateDiff = (core.adhoc - p.rate) / 100;
            if (rateDiff > 0) {
                const beMiles = (subFee * core.efficiency) / rateDiff;
                datasets.push({
                    label: `${p.name} Break-Even`,
                    data: [{ x: beMiles, y: calculateCost(beMiles, 0, core.adhoc) }],
                    pointBackgroundColor: "#fff",
                    pointBorderColor: color,
                    pointBorderWidth: 2,
                    pointRadius: 6,
                    showLine: false,
                    type: 'scatter',
                    order: 1
                });
            }
        }
    });

    // 5. Chart Configuration
    chart = new Chart(ctx, {
        type: "line",
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { 
                    title: { display: true, text: isTripMode ? 'Total Journey Cost (£)' : 'Total Monthly Cost (£)' },
                    beginAtZero: true 
                },
                x: { 
                    type: 'linear',
                    title: { display: true, text: 'Distance (Miles)' },
                    min: 0, 
                    max: maxMiles 
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        filter: (item) => !['Break-Even', 'Charging', 'Exhausted'].some(word => item.text.includes(word))
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const x = context.parsed.x.toFixed(0);
                            const y = context.parsed.y.toFixed(2);
                            if (label.includes('Exhausted')) return `Initial Battery Range: ${x} miles`;
                            if (label.includes('Charging')) return `${label.replace(' Start Charging', '')}: Public charging starts at ${x} miles`;
                            if (label.includes('Break-Even')) return `Break-Even: ${x} miles (£${y})`;
                            return `${label}: £${y}`;
                        }
                    }
                }
            }
        }
    });
}

function getProviderColor(name, index) {
    const colors = { "Be.EV": "#00d1ff", "Tesla": "#e81010", "BP Pulse": "#00a14b", "Shell Recharge": "#ffda00", "Osprey": "#f97316" };
    if (colors[name]) return colors[name];
    const palette = ["#38bdf8", "#22c55e", "#a855f7", "#ec4899", "#eab308"];
    return palette[index % palette.length];
}

function setToggle(mode, btn) {
    document.querySelectorAll('.calc-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    setCookie('calcMode', mode);
    setCookie('comparisonMode', mode);
    calculate();
}

function init() {
    const savedValues = getCookie("ev_trip_values");
    const urlParams = new URLSearchParams(window.location.search);
    
    const speedTrip = document.getElementById("minSpeed");
    const speedBE = document.getElementById("minSpeedBE");

    const syncAndCalc = (e) => {
        const newValue = e.target.value;
        speedTrip.value = newValue;
        speedBE.value = newValue;
        calculate(); 
    };

    if (speedTrip && speedBE) {
        speedTrip.addEventListener('change', syncAndCalc);
        speedBE.addEventListener('change', syncAndCalc);
    }

    fetch("providers.json").then(r => r.json()).then(data => {
        PRESETS = data.providers;

        const tripIds = ["journeyMiles", "batteryKwh", "prechargesoc", "soc", "efficiency", "adhoc", "startChargeRate", "maxChargingSpeed", "rechargeAt", "minSpeed"];        
        tripIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            if (urlParams.has(id)) {
                el.value = urlParams.get(id);
            } else if (savedValues && savedValues[id] !== undefined) {
                el.value = savedValues[id];
            }
            el.addEventListener('input', calculate);
        });

        const effTrip = document.getElementById("efficiency");
        const effBE = document.getElementById("efficiencyBE");
        const adhocTrip = document.getElementById("adhoc");
        const adhocBE = document.getElementById("adhocBE");
        
        const syncFields = (source, target) => {
            source.addEventListener('input', () => {
                target.value = source.value;
                calculate();
            });
        };
        
        if (effTrip && effBE) {
            effBE.value = effTrip.value; 
            syncFields(effTrip, effBE);
            syncFields(effBE, effTrip);
        }
        
        if (adhocTrip && adhocBE) {
            adhocBE.value = adhocTrip.value;
            syncFields(adhocTrip, adhocBE);
            syncFields(adhocBE, adhocTrip);
        }

        if (urlParams.has("p")) {
            try {
                const sharedProviders = JSON.parse(urlParams.get("p"));
                document.getElementById("providers").innerHTML = ""; 
                sharedProviders.forEach(p => {
                    createProviderBox(); 
                    const id = providerCount;
                    document.getElementById(`name${id}`).value = p.name;
                    document.getElementById(`subCost${id}`).value = p.subCost;
                    document.getElementById(`rate${id}`).value = p.rate;
                    document.getElementById(`preset${id}`).value = p.preset;
                    if(p.preset !== 'Custom') {
                        updateProviderFields(id);
                        document.getElementById(`rate${id}`).value = p.rate;
                    }
                });
            } catch (e) {
                console.error("Error parsing shared providers:", e);
            }
        }

        const modeParam = urlParams.get("mode");
        if (modeParam === "trip-savings") {
            const tripBtn = document.querySelector('.calc-tab:nth-child(2)'); 
            if (tripBtn) setToggle('trip-savings', tripBtn);
        } else {
            const activeTab = document.querySelector('.calc-tab.active');
            const currentMode = activeTab.textContent.trim() === "Cost Reduction" ? 'trip-savings' : 'break-even';
            setToggle(currentMode, activeTab);
        }

        const provEl = document.getElementById("provider");
        if (provEl && savedValues && savedValues.provider) {
            provEl.value = savedValues.provider;
        }

        updateProviderInfo();
        calculate();
    });
}

function exportPdf() {
    const pdfBtn = document.getElementById("pdfBtn");
    const providerRows = document.querySelectorAll("#providerResults tbody tr");
    const paygSummary = document.querySelector(".calc-lines");
    const conclusion = document.getElementById("conclusionsBox");

    if (!providerRows.length || !pdfBtn) return;

    const originalText = pdfBtn.textContent;
    pdfBtn.textContent = "Generating...";
    pdfBtn.style.pointerEvents = "none";
    pdfBtn.style.opacity = "0.7";

    const printContainer = document.createElement("div");
    printContainer.id = "pdf-render-area";
    printContainer.style.cssText = "position:absolute; left:-9999px; width:800px; padding:40px; background:#fff; color:#000; font-family:Arial, sans-serif;";

    let contentHtml = `
        <style>
            #pdf-render-area * { color: #000 !important; }
            .pdf-header { text-align: center; margin-bottom: 10px; }
            .pdf-section-title { font-size: 22px; margin-top: 20px; }
            .pdf-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; margin-bottom: 30px; }
            .pdf-table th, .pdf-table td { border: 1px solid #000; padding: 8px; text-align: left; }
            .pdf-table th { background: #f2f2f2; }
            .conclusion-white-border { border: none !important; }
            .pdf-conclusion-wrapper { 
                background: #f4f4f4 !important; 
                padding: 0px; 
                border: 1px solid #ccc; 
                border-radius: 8px; 
                margin-top: 20px;
            }
            .calc-lines div { margin-bottom: 5px; }
        </style>
        
        <div class="pdf-header">
            <strong style="font-size:24px; color:#000">EV SUBSCRIPTIONS COMPARISON REPORT</strong>
            <p>Generated on ${new Date().toLocaleDateString('en-GB')}</p>
        </div>
        
        <div class="calc-lines">
            ${paygSummary ? paygSummary.innerHTML : ""}
        </div>

        <h2 class="pdf-section-title">Comparison Results</h2>
        <table class="pdf-table">
            <thead>
                <tr>
                    <th>Provider</th>
                    <th>Sub. Fee</th>
                    <th>Disc. Rate</th>
                    <th>Journey Cost</th>
                    <th>vs. PAYG</th>
                    <th>Break Even<br />(Exc. Battery Pre-Charge)</th>
                </tr>
            </thead>
            <tbody>`;

    providerRows.forEach(row => {
        const cols = row.querySelectorAll("td");
        if (cols.length >= 6) {
            contentHtml += `
                <tr>
                    <td><strong>${cols[0].innerText.split('\n')[0]}</strong></td>
                    <td>${cols[1].innerText}</td>
                    <td>${cols[2].innerText}</td>
                    <td>${cols[3].innerText}</td>
                    <td>${cols[4].innerText}</td>
                    <td>${cols[5].innerText}</td>
                </tr>`;
        }
    });

    contentHtml += `</tbody></table>
        <h2 class="pdf-section-title">Estimated Total Public Charging Duration Required</h2>`;
    
    // Add charging times table
    const chargingTimesTable = document.querySelector(".speed-comparison-container table");
    if (chargingTimesTable) {
        contentHtml += `<table class="pdf-table">`;
        const chargingHeaders = chargingTimesTable.querySelectorAll("thead th");
        contentHtml += `<thead><tr>`;
        chargingHeaders.forEach(header => {
            contentHtml += `<th>${header.innerText}</th>`;
        });
        contentHtml += `</tr></thead><tbody>`;
        
        const chargingRows = chargingTimesTable.querySelectorAll("tbody tr");
        chargingRows.forEach(row => {
            const cells = row.querySelectorAll("td");
            contentHtml += `<tr>`;
            cells.forEach(cell => {
                contentHtml += `<td>${cell.innerText}</td>`;
            });
            contentHtml += `</tr>`;
        });
        contentHtml += `</tbody></table>`;
    }
    
    contentHtml += `
        <h2 class="pdf-section-title">Analysis Conclusion</h2>
        <div class="pdf-conclusion-wrapper">
            ${conclusion ? conclusion.innerHTML : ""}
        </div>`;

    printContainer.innerHTML = contentHtml;

    printContainer.querySelectorAll(".info-icon, .jump-btn-pulse, .mini-table, .mobile-only-text, p[style*='opacity:0.8']").forEach(el => el.remove());

    document.body.appendChild(printContainer);

    html2canvas(printContainer, { 
        scale: 2,
        useCORS: true 
    }).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth - 20; // 10mm margins
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Handle multiple pages if content is taller than one page
        let yPosition = 15;
        const pageHeightAvailable = pageHeight - 30; // 15mm top and bottom margins
        
        if (imgHeight <= pageHeightAvailable) {
            // Content fits on one page
            pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 15, imgWidth, imgHeight);
        } else {
            // Content spans multiple pages
            let remainingHeight = canvas.height;
            let yCanvasOffset = 0;
            
            while (remainingHeight > 0) {
                // Calculate how much of the canvas we can fit on this page
                const canvasHeightThatFits = Math.min(remainingHeight, (pageHeightAvailable * canvas.width) / imgWidth);
                
                // Create a temporary canvas for this section
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvasHeightThatFits;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(canvas, 0, yCanvasOffset, canvas.width, canvasHeightThatFits, 0, 0, canvas.width, canvasHeightThatFits);
                
                // Add this section to the PDF
                const sectionImgHeight = (canvasHeightThatFits * imgWidth) / canvas.width;
                pdf.addImage(tempCanvas.toDataURL("image/png"), "PNG", 10, 15, imgWidth, sectionImgHeight);
                
                // Move to next page and update positions
                remainingHeight -= canvasHeightThatFits;
                yCanvasOffset += canvasHeightThatFits;
                
                if (remainingHeight > 0) {
                    pdf.addPage();
                }
            }
        }

        pdf.save("EV-Journey-Analysis.pdf");

        document.body.removeChild(printContainer);
        pdfBtn.textContent = originalText;
        pdfBtn.style.pointerEvents = "auto";
        pdfBtn.style.opacity = "1";
    });
}

window.addEventListener("DOMContentLoaded", init);

let currentSlide = 0;

function moveSlide(step) {
    const container = document.getElementById('helpSlides');
    const slides = document.querySelectorAll('.help-slide'); 
    const totalSlides = slides.length; 

    currentSlide += step;
    if (currentSlide < 0) currentSlide = 0;
    if (currentSlide >= totalSlides) currentSlide = totalSlides - 1;

    const slideWidthPercent = 100 / totalSlides;
    const offset = currentSlide * -slideWidthPercent;
    container.style.transform = `translateX(${offset}%)`;
}

function closeHelp() {
    const overlay = document.getElementById('helpOverlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 300);
    }
}


function toggleProviders() {
    const container = document.getElementById("collapsibleProviders");
    const controls = document.getElementById("providerControls"); 
    const btn = document.getElementById("toggleProvidersBtn");
    const hiddenMsg = document.getElementById("providersHiddenMsg"); 
    
    if (container.style.display === "none") {
        container.style.display = "block";
        if (controls) controls.style.display = "block"; 
        btn.textContent = "Collapse Providers List";
        hiddenMsg.style.display = "none";
        setCookie('providers_collapsed', false);
    } else {
        container.style.display = "none";
        if (controls) controls.style.display = "none"; 
        btn.textContent = "Expand Providers List";
        hiddenMsg.style.display = "block";
        setCookie('providers_collapsed', true);
    }

    btn.classList.remove("empty-pulse");
}

document.addEventListener('DOMContentLoaded', () => {
    const track = document.getElementById('helpSlides');
    
    // --- 1. YOUR REQUESTED ANIMATION SEQUENCE ---
    if (track) {
        // Start the automatic sequence
        track.classList.add('intro-animation');

        // When the 5-second animation finishes on Slide 3
        track.addEventListener('animationend', () => {
            track.classList.remove('intro-animation');
            // Lock the position on Slide 3 (Index 2)
            track.style.transform = `translateX(-25%)`;
            // Sync the manual index so 'Next' starts from Slide 3
            currentSlide = 2; 
        });
    }

    // --- 2. YOUR ORIGINAL COOKIE/BANNER LOGIC ---
    const savedMode = getCookie('calcMode');

    if (savedMode) {
        const modeBtn = document.querySelector(`.calc-tab[onclick*="${savedMode}"]`);
        if (modeBtn) {
            modeBtn.click();
        }

        const helpOverlay = document.getElementById('helpOverlay');
        if (helpOverlay) {
            helpOverlay.style.display = 'none';
        }

        const cookieBanner = document.getElementById('cookieBanner');
        if (cookieBanner) {
            cookieBanner.style.display = 'none';
        }
    } else {
        if (!getCookie('cookiesAccepted')) {
            setTimeout(function() {
                const banner = document.getElementById('cookieBanner');
                if (banner) banner.style.display = 'block';
            }, 4000);
        }
    }
});

function acceptCookies() {
    const date = new Date();
    date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000));
    document.cookie = `cookiesAccepted=true;expires=${date.toUTCString()};path=/;SameSite=Lax`;
    
    closeCookieBanner();
}

function closeCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => banner.style.display = 'none', 400);
}

function toggleMenu() {
    const menu = document.getElementById('sideMenu');
    if (menu) {
        menu.classList.toggle('active');
        // When menu opens, expand sections containing the active page
        if (menu.classList.contains('active')) {
            expandActiveSections();
        }
    }
}

function toggleMenuSection(toggleId, itemsId) {
    const toggle = document.getElementById(toggleId);
    const items = document.getElementById(itemsId);
    
    if (toggle && items) {
        toggle.classList.toggle('open');
        items.classList.toggle('open');
    }
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

// Initialize page highlighting on load
document.addEventListener('DOMContentLoaded', () => {
    expandActiveSections();
    loadProviderState();
    setTimeout(loadProvidersFromCookie, 100);
});

document.addEventListener('click', (e) => {
    const menu = document.getElementById('sideMenu');
    const trigger = document.querySelector('.android-dots-trigger');
    if (menu && menu.classList.contains('active')) {
        if (!menu.contains(e.target) && (!trigger || !trigger.contains(e.target))) {
            menu.classList.remove('active');
        }
    }
});


let beReminderShown = false;

function showBeReminder() {
    const overlay = document.getElementById('beReminderOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        void overlay.offsetWidth; 
        overlay.classList.add('active');
        overlay.style.opacity = '1';
    }
}

function closeBeReminder() {
    const overlay = document.getElementById('beReminderOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 400); 
    }
}

function saveProvidersToCookie() {
    const providers = [];
    document.querySelectorAll(".provider-box").forEach(box => {
        const id = box.dataset.id;
        providers.push({
            name: document.getElementById(`name${id}`).value,
            subCost: document.getElementById(`subCost${id}`).value,
            rate: document.getElementById(`rate${id}`).value,
            preset: document.getElementById(`preset${id}`).value,
            speed: document.getElementById(`speed${id}`) ? document.getElementById(`speed${id}`).value : null
        });
    });
    setCookie('ev_providers', providers); // Uses your existing setCookie function
}

function loadProvidersFromCookie() {
    const saved = getCookie('ev_providers'); // Uses your existing getCookie function
    if (saved && Array.isArray(saved)) {
        // Clear any default or existing boxes first
        document.getElementById("providers").innerHTML = "";
        
        saved.forEach(p => {
            // Use your existing function to create the box structure
            createProviderBox(); 
            const id = providerCount;
            
            // Repopulate the fields
            document.getElementById(`name${id}`).value = p.name;
            document.getElementById(`subCost${id}`).value = p.subCost;
            document.getElementById(`rate${id}`).value = p.rate;
            document.getElementById(`preset${id}`).value = p.preset;
            
            // Handle speed dropdown if it exists for this preset
            if (p.speed && document.getElementById(`speed${id}`)) {
                updateProviderFields(id); // Rebuilds speed options
                document.getElementById(`speed${id}`).value = p.speed;
            }
        });
        calculate(); // Refresh the results
    }
}

function loadProviderState() {
    const isCollapsed = getCookie('providers_collapsed');
    const container = document.getElementById("collapsibleProviders");
    const controls = document.getElementById("providerControls");
    const btn = document.getElementById("toggleProvidersBtn");
    const hiddenMsg = document.getElementById("providersHiddenMsg");

    // Only apply if the cookie explicitly says the list was collapsed
    if (isCollapsed === true && container && btn) {
        container.style.display = "none";
        if (controls) controls.style.display = "none";
        btn.textContent = "Expand Providers List";
        if (hiddenMsg) hiddenMsg.style.display = "block";
        btn.classList.remove("empty-pulse");
    }
}

let journeyCount = 0;
// Helper function to re-number all journey headings
function reindexJourneys() {
    const container = document.getElementById("additionalJourneysContainer");
    const journeyBoxes = container.querySelectorAll(".additional-journey-box");
    
    journeyBoxes.forEach((box, index) => {
        const title = box.querySelector("h4");
        if (title) {
            title.textContent = `Additional Journey #${index + 1}`;
        }
    });
}

function addJourneyField() {
    const container = document.getElementById("additionalJourneysContainer");
    const defaultSoc = document.getElementById("soc").value || "";
    const defaultRate = document.getElementById("startChargeRate").value || "";
    const defaultPreChargeSoc = document.getElementById("prechargesoc").value || "";
    
    const journeyDiv = document.createElement("div");
    journeyDiv.className = "additional-journey-box";
    journeyDiv.style.borderTop = "1px solid var(--accent)";
    journeyDiv.style.marginTop = "15px";
    journeyDiv.style.paddingTop = "10px";

    // The removal logic now removes the element and then re-indexes the list
    journeyDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h4>Additional Journey</h4>
            <button class="remove-btn" onclick="this.closest('.additional-journey-box').remove(); reindexJourneys(); calculate();">×</button>
        </div>
        <p style="font-size: 0.8rem">Enter or adjust the following details for this additional journey, which may differ from the first.</p>
        <div class="input-row">
            <div class="input-group">
                <label><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">💡<span class="tooltip-box">The is the total distance for this additional journey, start to finish.</span></span></span>Journey Distance (Miles)</label>
                <input type="number" class="extra-journey-miles" placeholder="e.g. 150" oninput="calculate()">
            </div>
            <div class="input-group">
                <label><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">💡<span class="tooltip-box">While it is to be expected that you will depart from your usual place (e.g., home) and charge at your usual rate, you may have other plans — so this allows the results to take that into account.</span></span></span>Pre-Charge Rate (p/kWh)</label>
                <input type="number" class="extra-journey-rate" placeholder="e.g. 7.5" value="${defaultRate}" oninput="calculate()">
            </div>
        </div>
        <div class="input-row">
        	<div class="input-group">
                    <label for="prechargesoc">
                        <span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">💡<span class="tooltip-box">The battery percentage you expect your car to be at before you top up to your departure battery level. Used for calculating the cost of pre‑charging before the journey.</span></span></span>Pre‑Charge Battery Level (%)</label>
                    <input type="number"class="extra-journey-prechargesoc" oninput="calculate()" placeholder="e.g., 20" value="${defaultPreChargeSoc}">
                </div>
            <div class="input-group">
                <label><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">💡<span class="tooltip-box">The battery percentage your car will be at when you begin your journey. It is acceptable to slow charge up to 100% before departing on a long journey. It defaults to the departing SOC of your first journey, but you may adjust it if appropriate.</span></span></span>Departure Battery Level (%)</label>
                <input type="number" class="extra-journey-soc" placeholder="e.g. 100" oninput="calculate()" value="${defaultSoc}">
            </div>
        </div>
    `;
    
    container.appendChild(journeyDiv);
    reindexJourneys(); // Update numbers immediately after adding
    calculate();
}
