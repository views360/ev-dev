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

let PRESETS = [];
let providerCount = 0;
let chart = null;

function toggleSection(header) {
    const section = header.parentElement;
    section.classList.toggle('active');

    const icon = header.querySelector('.toggle-icon');
    if (icon) {
        icon.textContent = section.classList.contains('active') ? '−' : '+';
    }
}

// Stub function - called in init() but doesn't need to do anything
// The calculate() function handles all necessary updates
function updateProviderInfo() {
    // Intentionally empty - this function is called but not needed
}

function getInputs() {
    const extraMiles = Array.from(document.querySelectorAll(".extra-journey-miles")).map(el => parseFloat(el.value) || 0);
    const extraSocs = Array.from(document.querySelectorAll(".extra-journey-soc")).map(el => parseFloat(el.value) || 0);
    const extraRates = Array.from(document.querySelectorAll(".extra-journey-rate")).map(el => parseFloat(el.value) || 0);
    const extraPreSocs = Array.from(document.querySelectorAll(".extra-journey-prechargesoc")).map(el => parseFloat(el.value) || 0);

    return {
        journeyMiles: parseFloat(document.getElementById("journeyMiles").value) || 0,
        batteryKwh: parseFloat(document.getElementById("batteryKwh").value) || 0,
        prechargesoc: parseFloat(document.getElementById("prechargesoc").value) || 0,
        soc: parseFloat(document.getElementById("soc").value) || 0,
        efficiency: parseFloat(document.getElementById("efficiency").value) || 0,
        adhoc: parseFloat(document.getElementById("adhoc").value) || 0,
        startChargeRate: parseFloat(document.getElementById("startChargeRate").value) || 0,
        maxChargingSpeed: parseFloat(document.getElementById("maxChargingSpeed").value) || 0,
        rechargeAt: parseFloat(document.getElementById("rechargeAt").value) || 20,
        minSpeed: parseFloat(document.getElementById("minSpeed").value) || 0,
        additionalJourneys: extraMiles.map((miles, i) => ({
            miles: miles,
            soc: extraSocs[i],
            rate: extraRates[i],
            prechargesoc: extraPreSocs[i]
        }))
    };
}

function shareLink() {
    const params = new URLSearchParams();
    params.set("mode", "trip-savings");

    const tripIds = ["journeyMiles", "batteryKwh", "soc", "efficiency", "adhoc", "startChargeRate", "maxChargingSpeed", "rechargeAt", "minSpeed"];
    
    tripIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) params.set(id, el.value);
    });

    const providers = [];
    document.querySelectorAll(".provider-box").forEach(box => {
        const id = box.dataset.id;
        providers.push({
            name: document.getElementById(`name${id}`).value,
            subCost: document.getElementById(`subCost${id}`).value,
            rate: document.getElementById(`rate${id}`).value,
            preset: document.getElementById(`preset${id}`).value
        });
    });
    params.set("p", JSON.stringify(providers));

    const newUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    
    navigator.clipboard.writeText(newUrl).then(() => {
        const btn = document.getElementById("shareBtn");
        const originalText = btn.textContent;
        btn.textContent = "Copied!";
        btn.classList.add("good");
        setTimeout(() => {
            btn.textContent = originalText;
            btn.classList.remove("good");
        }, 2000);
    });
}

function createProviderBox(preset) {
    providerCount++;
    const id = providerCount;
    const { minSpeed } = getInputs();
    const sortedPresets = getSortedPresets(minSpeed);
    const presetOptions = ['Custom', ...sortedPresets.map(p => p.name)]
        .map(name => `<option value="${name}">${name}</option>`).join("");

    const box = document.createElement("div");
    box.className = "provider-box";
    box.dataset.id = id;
    box.innerHTML = `
        <div class="provider-header">
            <input type="text" id="name${id}" placeholder="Provider Name" oninput="calculate()">
            <div style="display: flex; align-items: center; gap: 12px; margin-left: 8px;">
                <a href="#resultsHeader" class="jump-btn-pulse" title="Jump to results">↓</a>
                <button class="remove-btn" onclick="this.parentElement.parentElement.parentElement.remove(); calculate();">×</button>
            </div>
        </div>
        <div class="input-group">
            <label>Preset</label>
            <select id="preset${id}" class="preset-select-pulse" onchange="updateProviderFields(${id})">${presetOptions}</select>
        </div>
        <div class="input-row">
            <div class="input-group">
                <label>Monthly Sub (£)</label>
                <input type="number" id="subCost${id}" step="0.01" value="0" oninput="calculate()">
            </div>
            <div class="input-group">
                <label>Rate (p/kWh)</label>
                <input type="number" id="rate${id}" step="0.1" value="0" oninput="calculate()">
            </div>
        </div>
        <div class="input-group" id="speedRow${id}" style="display:none">
            <label>Charging Speed</label>
            <select id="speed${id}" onchange="updateRateFromSpeed(${id})"></select>
        </div>
    `;
    document.getElementById("providers").appendChild(box);
    if (preset) {
        document.getElementById(`preset${id}`).value = preset.name;
        updateProviderFields(id);
    }
    calculate();
}

function addAllProviders() {
    const { minSpeed } = getInputs();
    const providersContainer = document.getElementById("providers");
    const addAllBtn = document.getElementById("addAllBtn"); 
    const collapseBtn = document.getElementById("toggleProvidersBtn");

    providersContainer.innerHTML = "";
    PRESETS.forEach(p => {
        const canSupport = p.rates.default || Object.keys(p.rates).some(s => Number(s) >= minSpeed);
        if (canSupport) createProviderBox(p);
    });

    if (addAllBtn) {
        addAllBtn.classList.remove("empty-pulse");
    }
    
    if (collapseBtn) {
        collapseBtn.classList.add("empty-pulse");
    }
}

function updateProviderFields(id) {
    const presetName = document.getElementById(`preset${id}`).value;
    const p = PRESETS.find(x => x.name === presetName);
    const speedRow = document.getElementById(`speedRow${id}`);
    
    if (presetName === 'Custom' || !p) {
        if (speedRow) speedRow.style.display = "none";
        calculate();
        return;
    }

    document.getElementById(`name${id}`).value = p.name;
    document.getElementById(`subCost${id}`).value = p.subscription.subCost;

    if (p.rates) {
        const { minSpeed } = getInputs();
        const availableSpeeds = Object.keys(p.rates).map(Number).sort((a, b) => a - b);
        
        // 1. Determine the "Best Fit" speed
        // If minSpeed is higher than the fastest offered, use the fastest (max).
        // Otherwise, find the first speed that is >= minSpeed.
        const maxProviderSpeed = Math.max(...availableSpeeds);
        let bestFitSpeed;

        if (minSpeed >= maxProviderSpeed) {
            bestFitSpeed = maxProviderSpeed;
        } else {
            bestFitSpeed = availableSpeeds.find(s => s >= minSpeed) || availableSpeeds[0];
        }

        // 2. Filter the dropdown to only show sensible options (Standard or >= bestFit)
        const validSpeeds = Object.keys(p.rates).filter(s => {
            const sNum = parseFloat(s);
            return sNum === 0 || sNum >= bestFitSpeed;
        });

        const speedSelect = document.getElementById(`speed${id}`);
        if (speedSelect) {
            speedSelect.innerHTML = validSpeeds.map(s => 
                `<option value="${s}">${parseFloat(s) === 0 ? 'Standard' : s + 'kW'}</option>`
            ).join("");

            // Set the value to our calculated best fit
            speedSelect.value = bestFitSpeed;
            document.getElementById(`rate${id}`).value = p.rates[bestFitSpeed];
        }

        if (speedRow) {
            speedRow.style.display = (validSpeeds.length === 1 && parseFloat(validSpeeds[0]) === 0) ? "none" : "flex";
        }
    }
    calculate();
}

function updateRateFromSpeed(id) {
    const presetName = document.getElementById(`preset${id}`).value;
    const speed = document.getElementById(`speed${id}`).value;
    const p = PRESETS.find(x => x.name === presetName);
    if (p?.rates) document.getElementById(`rate${id}`).value = p.rates[speed];
    calculate();
}

function getSortedPresets(minSpeed) {
    return PRESETS.filter(p => {
        if (p.rates?.default) return true;
        return Object.keys(p.rates).some(s => Number(s) >= minSpeed);
    }).sort((a, b) => {
        const aSub = a.subscription.hasSubscription;
        const bSub = b.subscription.hasSubscription;
        return (aSub === bSub) ? a.name.localeCompare(b.name) : aSub ? -1 : 1;
    });
}

function enforceSpeedRules() {
    const { minSpeed } = getInputs();
    const sortedPresets = getSortedPresets(minSpeed);
    document.querySelectorAll(".provider-box").forEach(box => {
        const id = box.dataset.id;
        const presetSelect = document.getElementById(`preset${id}`);
        const current = presetSelect.value;
        presetSelect.innerHTML = ['Custom', ...sortedPresets.map(p => p.name)].map(n => `<option value="${n}">${n}</option>`).join("");
        presetSelect.value = (sortedPresets.some(p => p.name === current) || current === 'Custom') ? current : 'Custom';
        updateProviderFields(id);
    });
}

function buildItineraryTable(stopsRows, rechargethreshold) {
    return `
        <div class="results-scroll" style="width: fit-content; max-width: 100%; margin: 0;">
            <table style="border-collapse: collapse; margin-top: 10px; border: 1px solid var(--border); font-size: 0.8rem;">
                <thead>
                    <tr style="background: rgba(57, 255, 20, 0.05); color: var(--text);">
                        <th style="padding: 10px; border: 1px solid var(--border);">Stop</th>
                        <th style="padding: 10px; border: 1px solid var(--border); text-align: left;">Event</th>
                        <th style="padding: 10px; border: 1px solid var(--border);">Mile Mark</th>
                        <th style="padding: 10px; border: 1px solid var(--border); text-align: left;">Action</th>
                        <th style="padding: 10px; border: 1px solid var(--border);">
                            ⚡ Duration<br />${document.getElementById("maxChargingSpeed").value}kW
                        </th>
                        <th style="padding: 10px; border: 1px solid var(--border);">
                            🐢 Duration<br />${document.getElementById("minSpeed").value}kW
                        </th>


                    </tr>
                </thead>
                <tbody>
                    ${stopsRows || `<tr><td colspan="5" style="padding: 20px; text-align: center;">No public charging stops required for this journey distance.</td></tr>`}
                </tbody>
            </table>
        </div>
    `;
}

function buildTabbedItinerary(journeys, itineraryRowsArray, rechargethreshold) {
    let tabs = '';
    let contents = '';

    journeys.forEach((j, index) => {
        const active = index === 0 ? 'active' : '';
        tabs += `<div class="itinerary-tab-btn ${active}" onclick="selectItineraryTab(${index})">Journey ${index + 1}</div>`;

        contents += `
            <div class="itinerary-tab-panel" id="itinerary-panel-${index}" style="display:${index === 0 ? 'block' : 'none'};">
                ${buildItineraryTable(itineraryRowsArray[index], rechargethreshold)}
            </div>
        `;
    });

    return `
        <div class="conclusion-white-border guide-section" id="real-world-assessment">
            <div id="itineraryTabs">
                <div class="itinerary-tab-buttons">${tabs}</div>
                <div class="itinerary-tab-content">${contents}</div>
            </div>
            <p class="itinerary-note">Note: the final charge is calculated so you will reach your destination at the specified journey recharge threshold. Allow +/- 1 minute for rounding.</p>
        </div>
    `;
}

function selectItineraryTab(index) {
    document.querySelectorAll('.itinerary-tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === index);
    });

    document.querySelectorAll('.itinerary-tab-panel').forEach((panel, i) => {
        panel.style.display = i === index ? 'block' : 'none';
    });
}

function formatDuration(totalMinutes) {
    if (totalMinutes < 60) {
        return `${totalMinutes} mins`;
    }
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${h}h ${m}m`;
}

function buildStopsRowsForJourney(journeyMiles, startSoc, rechargeAt, efficiency, batteryKwh, maxChargingSpeed, minSpeed) {
    let rows = "";
    let stop = 1;
    let distanceDriven = 0;
    let currentSoc = startSoc;

    const chargeToPercent = 80;
    const kwhFullCharge = ((chargeToPercent - rechargeAt) / 100) * batteryKwh;
    const maxRangeFromFullCharge = kwhFullCharge * efficiency;
    const preChargedRange = ((startSoc - rechargeAt) / 100) * batteryKwh * efficiency;

    // --- STOP 0: DEPART ---
    rows += `
        <tr>
            <td style="padding: 10px; border: 1px solid var(--border);">0</td>
            <td style="padding: 10px; border: 1px solid var(--border);">Begin journey</td>
            <td style="padding: 10px; border: 1px solid var(--border);">0 miles</td>
            <td style="padding: 10px; border: 1px solid var(--border);">Depart with ${startSoc}% battery</td>
            <td style="padding: 10px; border: 1px solid var(--border);">–</td>
            <td style="padding: 10px; border: 1px solid var(--border);">–</td>
        </tr>
    `;

    // --- CASE 1: No public charging required ---
    if (journeyMiles <= preChargedRange) {
        const kwhUsed = journeyMiles / efficiency;
        const percentUsed = (kwhUsed / batteryKwh) * 100;
        let arrivalSoc = Math.max(rechargeAt, Math.min(100, startSoc - percentUsed));

        rows += `
            <tr>
                <td style="padding: 10px; border: 1px solid var(--border);">${stop}</td>
                <td style="padding: 10px; border: 1px solid var(--border);">Finish journey</td>
                <td style="padding: 10px; border: 1px solid var(--border);">${journeyMiles} miles</td>
                <td style="padding: 10px; border: 1px solid var(--border);">Arrive with ${arrivalSoc.toFixed(0)}% battery</td>
                <td style="padding: 10px; border: 1px solid var(--border);">–</td>
                <td style="padding: 10px; border: 1px solid var(--border);">–</td>
            </tr>
        `;
        return rows;
    }

    // --- CASE 2: Journey requires public charging ---
    while (true) {
        const rangeOnCurrentCharge = ((currentSoc - rechargeAt) / 100) * batteryKwh * efficiency;

        if (distanceDriven + rangeOnCurrentCharge >= journeyMiles) break;

        const mileMarkAtRecharge = distanceDriven + rangeOnCurrentCharge;
        const remainingMiles = journeyMiles - mileMarkAtRecharge;
        
        let chargeNeededKwh;
        let targetSoc;
        let eventLabel;

        if (remainingMiles <= maxRangeFromFullCharge) {
            chargeNeededKwh = (remainingMiles / efficiency);
            targetSoc = (rechargeAt + (chargeNeededKwh / batteryKwh) * 100).toFixed(0);
            eventLabel = "Final public charge";
        } else {
            chargeNeededKwh = kwhFullCharge;
            targetSoc = chargeToPercent;
            eventLabel = stop === 1 ? "First public charge" : "Public charge";
        }

        // Calculate durations for both speed columns
        const durationMax = formatDuration(Math.round((chargeNeededKwh / maxChargingSpeed) * 60));
        const durationMin = formatDuration(Math.round((chargeNeededKwh / minSpeed) * 60));

        rows += `
            <tr>
                <td style="padding: 10px; border: 1px solid var(--border);">${stop}</td>
                <td style="padding: 10px; border: 1px solid var(--border);">${eventLabel}</td>
                <td style="padding: 10px; border: 1px solid var(--border);">${Math.round(mileMarkAtRecharge)} miles</td>
                <td style="padding: 10px; border: 1px solid var(--border);">
                    Recharge ${rechargeAt}%→${targetSoc}%, ${chargeNeededKwh.toFixed(1)} kWh
                </td>
                <td style="padding: 10px; border: 1px solid var(--border);">${durationMax}</td>
                <td style="padding: 10px; border: 1px solid var(--border);">${durationMin}</td>
            </tr>
        `;

        if (remainingMiles <= maxRangeFromFullCharge) {
            stop++;
            break;
        }

        distanceDriven = mileMarkAtRecharge;
        currentSoc = chargeToPercent;
        stop++;
    }

    // --- FINAL ROW: DESTINATION ---
    rows += `
        <tr>
            <td style="padding: 10px; border: 1px solid var(--border);">${stop}</td>
            <td style="padding: 10px; border: 1px solid var(--border);">Finish journey</td>
            <td style="padding: 10px; border: 1px solid var(--border);">${journeyMiles} miles</td>
            <td style="padding: 10px; border: 1px solid var(--border);">Arrive with ${rechargeAt}% battery</td>
            <td style="padding: 10px; border: 1px solid var(--border);">–</td>
            <td style="padding: 10px; border: 1px solid var(--border);">–</td>
        </tr>
    `;

    return rows;
}
