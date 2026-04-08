function drawGraph(core, providers) {
    const ctx = document.getElementById("costChart");
    if (chart) chart.destroy();

    // 1. Detect Mode
    const activePill = document.querySelector('.calc-tab.active');
    const isTripMode = activePill && activePill.textContent.trim() === "Cost Reduction";

    // Define X-axis range
    const maxMiles = Math.max(core.journeyMiles * 1.5, 500);
    const labels = Array.from({ length: 11 }, (_, i) => Math.round((maxMiles * i) / 10));

    // Helper: Initial range from starting SOC
    const initialRange = (core.soc / 100) * core.batteryKwh * core.efficiency;

    // Helper: Calculate cost based on mode
    const calculateCost = (m, subFee, ratePerKwh) => {
        if (!isTripMode) {
            // BREAK-EVEN MODE: Linear
            return subFee + ((m / core.efficiency) * (ratePerKwh / 100));
        } else {
            // COST REDUCTION MODE: Pre-Charge + Public after initial range
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

    // 3. Battery Exhausted Marker (Cost-Reduction Mode only)
    if (isTripMode && initialRange > 0 && initialRange <= maxMiles) {
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

        // 5. Break-Even Marker Logic (Calculated for both modes)
        const rateDiff = (core.adhoc - p.rate) / 100;
        if (rateDiff > 0) {
            let beMiles;
            if (!isTripMode) {
                // Simple Break-Even Miles
                beMiles = (subFee * core.efficiency) / rateDiff;
            } else {
                // Trip Mode Break-Even Miles (Relative to the point public charging starts)
                beMiles = initialRange + ((subFee * core.efficiency) / rateDiff);
            }

            if (beMiles <= maxMiles) {
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
                        filter: (item) => !['Break-Even', 'Exhausted'].some(word => item.text.includes(word))
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.dataset.label || '';
                            const x = context.parsed.x.toFixed(0);
                            const y = context.parsed.y.toFixed(2);
                            if (label.includes('Exhausted')) return `Initial Battery Range: ${x} miles`;
                            if (label.includes('Break-Even')) return `${label.replace(' Break-Even', '')} Break-Even: ${x} miles (£${y})`;
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
    
    if (speedTrip) {
        speedTrip.addEventListener('change', calculate);
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
            el.addEventListener('input', () => {
                // ADD THIS PART:
                if (id === 'minSpeed') {
                    // This forces every provider box to refresh its rates
                    document.querySelectorAll(".provider-box").forEach(box => {
                        const boxId = box.dataset.id;
                        const presetSelect = document.getElementById(`preset${boxId}`);
                        if (presetSelect && presetSelect.value !== 'Custom') {
                            updateProviderFields(boxId); 
                        }
                    });
                }
                // Keep your original call here
                calculate();
            });
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

        // MOVE THE VISIBILITY CHECK HERE (Inside the .then block)
        const isCollapsed = getCookie('providers_collapsed') === true;
        const providersContainer = document.getElementById("providers");

        if (isCollapsed && providersContainer && providersContainer.children.length > 0) {
            const controls = document.getElementById("providerControls");
            const collapsible = document.getElementById("collapsibleProviders");
            const hiddenMsg = document.getElementById("providersHiddenMsg");
            const toggleBtn = document.getElementById("toggleProvidersBtn");

            if (controls) controls.style.display = "none";
            if (collapsible) collapsible.style.display = "none";
            if (hiddenMsg) hiddenMsg.style.display = "block";
            if (toggleBtn) toggleBtn.textContent = "Expand Providers List";
        }
    });
}

function exportPdf() {
    const pdfBtn = document.getElementById("pdfBtn");
    const resultsTable = document.getElementById("providerResults");
    
    if (!resultsTable || !pdfBtn) return;

    // 1. Setup & Mode Detection
    const activePill = document.querySelector('.calc-tab.active');
    const isTripMode = activePill && activePill.textContent.trim() === "Cost Reduction";
    const reportTitle = isTripMode ? "EV JOURNEY COST REDUCTION REPORT" : "EV SUBSCRIPTIONS BREAK-EVEN REPORT";

    pdfBtn.textContent = "Generating...";
    pdfBtn.style.pointerEvents = "none";

    // 2. Create a clean, off-screen container
    const printContainer = document.createElement("div");
    printContainer.style.cssText = "position:absolute; left:-9999px; width:750px; padding:40px; background:#fff; color:#000; font-family:Arial, sans-serif;";

    // 3. Build Content String
    let contentHtml = `
        <style>
            #pdf-render-area, #pdf-render-area * { 
                color: #000 !important; 
                background: #fff !important; 
                border-color: #000 !important;
                filter: grayscale(100%) !important;
                text-shadow: none !important;
                box-shadow: none !important;
            }
            .pdf-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
            .pdf-section-title { font-size: 16px; font-weight: bold; border-bottom: 1px solid #000; margin: 30px 0 10px 0; text-transform: uppercase; }
            .pdf-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
            .pdf-table th, .pdf-table td { border: 1px solid #000; padding: 10px; text-align: left; }
            .pdf-table th { background: #eee !important; font-weight: bold; }
            .summary-box { border: 1px solid #000; padding: 15px; margin-bottom: 20px; }
        </style>
        
        <div id="pdf-render-area">
            <div class="pdf-header">
                <h1 style="margin:0; font-size:22px;">${reportTitle}</h1>
                <p>Date: ${new Date().toLocaleDateString('en-GB')}</p>
            </div>`;

    // Add PAYG Summary
    const payg = document.querySelector(".calc-lines");
    if (payg) contentHtml += `<div class="summary-box">${payg.innerHTML}</div>`;

    // 4. THE PROVIDER TABLE (The "Virtual Builder")
    contentHtml += `
        <div class="pdf-section-title">1. Provider Comparison Results</div>
        <table class="pdf-table">
            <thead>
                <tr>
                    <th>Provider</th>
                    <th>Sub. Fee</th>
                    <th>Disc. Rate</th>
                    ${isTripMode ? '<th>Journey Cost</th><th>vs. PAYG</th><th>Break-Even*</th>' : '<th colspan="3">Break-Even Miles</th>'}
                </tr>
            </thead>
            <tbody>`;

    const rows = resultsTable.querySelectorAll("tbody tr");
    rows.forEach(row => {
        const c = row.cells;
        if (c.length >= 4) {
            // Force text extraction from the cell directly, ignoring nested icons/tooltips
            const name = (c[0].querySelector('a') ? c[0].querySelector('a').innerText : c[0].innerText).replace('ℹ️', '').trim().split('\n').pop();
            const fee = c[1].innerText.trim();
            const rate = c[2].innerText.trim();
            const col3 = c[3].innerText.trim();

            contentHtml += `<tr><td><strong>${name}</strong></td><td>${fee}</td><td>${rate}</td>`;
            if (isTripMode && c.length >= 6) {
                contentHtml += `<td>${col3}</td><td style="font-weight:bold">${c[4].innerText.trim()}</td><td>${c[5].innerText.trim()}</td>`;
            } else {
                contentHtml += `<td colspan="3"><strong>${col3}</strong></td>`;
            }
            contentHtml += `</tr>`;
        }
    });
    contentHtml += `</tbody></table>`;

    // 5. Charging Durations & Itinerary
    if (isTripMode) {
        const dur = document.getElementById("chargingDurations");
        const itn = document.getElementById("realWorldAssessment");
        if (dur) contentHtml += `<div class="pdf-section-title">2. Estimated Public Charging Durations</div><div class="pdf-table-wrapper">${dur.innerHTML}</div>`;
        if (itn) contentHtml += `<div class="pdf-section-title">3. Real-World Charging Itinerary</div><div class="pdf-table-wrapper">${itn.innerHTML}</div>`;
    }

    // 6. Conclusion
    const conc = document.getElementById("conclusionsBox");
    if (conc) contentHtml += `<div class="pdf-section-title">Analysis Conclusion</div><div class="summary-box">${conc.innerHTML}</div>`;
    
    contentHtml += `
            <p style="font-size: 9px; margin-top: 10px;">* Break-Even calculation for Trip Mode excludes the cost of your initial battery pre-charge.</p>
        </div>`;

    printContainer.innerHTML = contentHtml;

    // Strip UI junk
    printContainer.querySelectorAll(".info-icon, .jump-btn-pulse, .mobile-only-text, button").forEach(el => el.remove());
    document.body.appendChild(printContainer);

    // 7. Multi-page Canvas Slicing
    html2canvas(printContainer, { scale: 2, useCORS: true, backgroundColor: "#ffffff" }).then(canvas => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF("p", "mm", "a4");
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgWidth = pageWidth - 20; 
        const pageHeightAvailable = pageHeight - 30; // 15mm margins

        let remainingHeight = canvas.height;
        let yCanvasOffset = 0;

        while (remainingHeight > 0) {
            const canvasHeightThatFits = Math.min(remainingHeight, (pageHeightAvailable * canvas.width) / imgWidth);
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvasHeightThatFits;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.fillStyle = "#ffffff";
            tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            tempCtx.drawImage(canvas, 0, yCanvasOffset, canvas.width, canvasHeightThatFits, 0, 0, canvas.width, canvasHeightThatFits);
            
            const sectionImgHeight = (canvasHeightThatFits * imgWidth) / canvas.width;
            pdf.addImage(tempCanvas.toDataURL("image/png"), "PNG", 10, 15, imgWidth, sectionImgHeight);
            
            remainingHeight -= canvasHeightThatFits;
            yCanvasOffset += canvasHeightThatFits;
            if (remainingHeight > 0) pdf.addPage();
        }

        pdf.save(isTripMode ? "EV-Journey-Analysis.pdf" : "EV-Break-Even-Analysis.pdf");
        document.body.removeChild(printContainer);
        pdfBtn.textContent = "Export as PDF";
        pdfBtn.style.pointerEvents = "auto";
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
                <label><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">ℹ️<span class="tooltip-box">The is the total distance for this additional journey, start to finish.</span></span></span>Journey Distance (Miles)</label>
                <input type="number" class="extra-journey-miles" placeholder="e.g. 150" oninput="calculate()">
            </div>
            <div class="input-group">
                <label><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">ℹ️<span class="tooltip-box">While it is to be expected that you will depart from your usual place (e.g., home) and charge at your usual rate, you may have other plans — so this allows the results to take that into account.</span></span></span>Pre-Charge Rate (p/kWh)</label>
                <input type="number" class="extra-journey-rate" placeholder="e.g. 7.5" value="${defaultRate}" oninput="calculate()">
            </div>
        </div>
        <div class="input-row">
        	<div class="input-group">
                    <label for="prechargesoc">
                        <span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">ℹ️<span class="tooltip-box">The battery percentage you expect your car to be at before you top up to your departure battery level. Used for calculating the cost of pre‑charging before the journey.</span></span></span>Pre‑Charge Battery Level (%)</label>
                    <input type="number"class="extra-journey-prechargesoc" oninput="calculate()" placeholder="e.g., 20" value="${defaultPreChargeSoc}">
                </div>
            <div class="input-group">
                <label><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)">ℹ️<span class="tooltip-box">The battery percentage your car will be at when you begin your journey. It is acceptable to slow charge up to 100% before departing on a long journey. It defaults to the departing SOC of your first journey, but you may adjust it if appropriate.</span></span></span>Departure Battery Level (%)</label>
                <input type="number" class="extra-journey-soc" placeholder="e.g. 100" oninput="calculate()" value="${defaultSoc}">
            </div>
        </div>
    `;
    
    container.appendChild(journeyDiv);
    reindexJourneys(); // Update numbers immediately after adding
    calculate();
}
