function renderTripResults(inputs, context) {   
    const providerBoxes = document.querySelectorAll(".provider-box");

    // 1. Check if all required fields and providers are present
    if (!checkTripReadiness(inputs, context.uiPreText, context.uiResults, context.resultsHeader, context.uiShare, context.uiPdf, providerBoxes)) {
        return;
    }

    // 2. How far can we drive before we hit the recharge limit?
    const mainInitialRange = ((inputs.soc - inputs.rechargeAt) / 100) * inputs.batteryKwh * inputs.efficiency;

    // COST: How much did we pay to get from Pre-Charge to Departure level?
    // We fetch "prechargesoc" directly from the input ID you provided
    const preChargeSocValue = parseFloat(document.getElementById("prechargesoc").value) || 0;
    const preJourneyKwh = Math.max(0, (inputs.soc - preChargeSocValue) / 100) * inputs.batteryKwh;
    const preJourneyCost = preJourneyKwh * (inputs.startChargeRate / 100);

    // Update UI using a modified version of your helper
    const { totalAdhocCost, totalPreJourneyCost, publicKwh } = updatePaygSummaryUI(inputs, mainInitialRange, preJourneyCost, preChargeSocValue);
    
    // 3. Process the list of providers
    const providers = processProviderData(providerBoxes, inputs, totalAdhocCost, totalPreJourneyCost, mainInitialRange);

    // 4. Update the Provider Results Table
    document.getElementById("providerResults").innerHTML = generateProviderResultsHtml(providers, inputs);

    // 5. Re-bind scroll listeners for mobile tooltip handling
    document.querySelectorAll(".results-scroll").forEach(el => {
        if (!el._ftScrollBound) { 
            el._ftScrollBound = true; 
            el.addEventListener("scroll", () => { 
                if (typeof _ftActive !== 'undefined' && _ftActive) _ftHide(); 
            }, { passive: true }); 
        }
    });

    // 6. Update the final Conclusion and Itinerary
    if (providers.length > 0) {
        updateConclusionsAndItineraryUI(inputs, providers, publicKwh, totalAdhocCost, context.conclusionsBox);
    } else {
        context.conclusionsBox.innerHTML = "";
    }

    // 7. Save data to cookies and draw the graph
    updateOutputsAndStorage(inputs, providers);
    handleModeVisibility(context.isTripMode);
}

function getModeContext() {
    const activePill = document.querySelector('.calc-tab.active');
    const isTripMode = activePill && activePill.textContent.trim() === "Cost Reduction";
    
    return {
        isTripMode,
        uiResults: document.getElementById("results"),
        uiPreText: document.getElementById("preConclusionsText"),
        conclusionsBox: document.getElementById("conclusionsBox"),
        resultsHeader: document.getElementById("resultsHeader"),
        uiShare: document.getElementById("shareBtn"),
        uiPdf: document.getElementById("pdfBtn")
    };
}

function checkTripReadiness(inputs, uiPreText, uiResults, resultsHeader, uiShare, uiPdf, providerBoxes) {
    if (checkIncompleteTrip(inputs, uiPreText, uiResults, resultsHeader, uiShare, uiPdf)) {
        return false;
    }
    if (providerBoxes.length === 0) return false;

    return true;
}

function updateConclusionsAndItineraryUI(inputs, providers, publicKwh, totalAdhocCost, conclusionsBox) {
    const bestProvider = providers[0];
    const minSpeedSelect = document.getElementById("minSpeed");
    const minSpeedLabel = minSpeedSelect.options[minSpeedSelect.selectedIndex].text;
    
    const speedData = generateSpeedComparisonHtml(publicKwh, inputs.maxChargingSpeed, inputs);
    const formatChargingTime = speedData.formatChargingTime;
    const maxChargingTimeFormatted = formatChargingTime(inputs.maxChargingSpeed > 0 ? publicKwh / inputs.maxChargingSpeed : 0);

    const itineraryData = generateRealWorldItineraryHtml(inputs, publicKwh, formatChargingTime);
    
    let conclusionHTML = `<div id="payg-vs-subscription">`;
    const journeyCount = 1 + inputs.additionalJourneys.length;
    const totalMiles = inputs.journeyMiles + inputs.additionalJourneys.reduce((sum, j) => sum + j.miles, 0);
    let journeyIntro = (journeyCount === 1) ? `For a journey of <strong>${inputs.journeyMiles} miles</strong>` : `For ${journeyCount} journeys totalling <strong>${totalMiles} miles</strong>`;

    const extraNote = `<p style="font-size:0.85rem; margin:0; opacity:0.8; color:var(--neon-green) !important;">Note: Before purchasing a subscription, check that your chosen provider has charging stations in your planned area of travel — else your subscription will be wasted.</p>`;

    if (bestProvider.savings > 0) {
        conclusionHTML += `<p class="main-result">${journeyIntro}, a one-month subscription with <strong>${bestProvider.name}</strong> works out cheaper than PAYG based on the selected minimum charging rate of <strong>${minSpeedLabel}</strong>. The total journey cost will be <strong>£${bestProvider.totalJourneyCost.toFixed(2)}</strong>, which represents a saving of <strong>£${bestProvider.savings.toFixed(2)}</strong> over the average PAYG rate of ${inputs.adhoc}p/kWh.</p>${extraNote}`;
    } else {
        conclusionHTML += `<p class="main-result">${journeyIntro}, a <strong>${inputs.adhoc}p PAYG rate</strong> is cheaper than the cheapest subscription. The total journey cost based on PAYG will be <strong>£${totalAdhocCost.toFixed(2)}</strong>. Consider future journeys this month before deciding.</p>${extraNote}`;
    }
    conclusionHTML += `</div>`;
    
   // 2. Logic for Section 4 (Charging Durations)
    let chargingDurationsHTML = `<div id="charging-times-section">`;
    let durationIntro = (journeyCount === 1) ? `Your proposed <strong>${inputs.journeyMiles}-mile</strong> journey` : `Your ${journeyCount} proposed journeys totalling <strong>${totalMiles} miles</strong>`;
 
    if (inputs.maxChargingSpeed > 0) {
        chargingDurationsHTML += `<p class="main-result">${durationIntro} will require <strong>${publicKwh.toFixed(1)} kWh</strong> of public charging. At <strong>${inputs.maxChargingSpeed} kW</strong>, total duration will be approx <strong>${maxChargingTimeFormatted}</strong>.</p>`;
    } else {
        chargingDurationsHTML += `<p class="main-result">Enter your vehicle's <strong>Max. Charging Speed</strong> above to see estimated charging durations.</p>`;
    }
    chargingDurationsHTML += `${speedData.speedTableHtml}${itineraryData.locationDisclaimer}</div>`;

    // --- START OF NEW MAPPING ---
    // Update Section 3
    conclusionsBox.innerHTML = conclusionHTML;

    // Update Section 4
    const chargingDurationsBox = document.getElementById("chargingDurations");
    if (chargingDurationsBox) {
        chargingDurationsBox.innerHTML = chargingDurationsHTML;
    }

    // Update Section 5
    const realWorldAssessmentBox = document.getElementById("realWorldAssessment");
    if (realWorldAssessmentBox) {
        realWorldAssessmentBox.innerHTML = itineraryData.assessmentBoxHTML;
    }
    // --- END OF NEW MAPPING ---
}

function updatePaygSummaryUI(inputs, mainInitialRange, customPreCost, customPreSoc) {
    const rangeData = calculateRangeHtml(inputs, mainInitialRange);
    const mainTopUpKwh = Math.max(0, ((inputs.soc - customPreSoc) / 100) * inputs.batteryKwh);
    const mainTopUpCost = customPreCost; // Use the calculated cost passed from renderTripResults

    // Update the summary generator to use the new "From %"
    const paygData = generatePaygSummaryHtml(inputs, mainInitialRange, mainTopUpKwh, mainTopUpCost, customPreSoc);
    document.getElementById("preChargeLine").innerHTML = `<div class="guide-section" id="payg-summary">${paygData.preChargeHtml}</div>`;

    const kwhData = generateKwhBreakoutHtml(inputs, paygData.journey1PublicMiles);
    const totalAdhocCost = paygData.totalPreJourneyCost + (kwhData.breakoutKwh * (inputs.adhoc / 100));

    document.getElementById("publicKwhLine").innerHTML = kwhData.breakoutHtml;
    document.getElementById("homeRangeLine").innerHTML = rangeData.rangeHtml;
    document.getElementById("publicMilesLine").innerHTML = paygData.publicMilesHtml;
    
    const paygJourneyCount = 1 + inputs.additionalJourneys.length;
    const paygTotalMiles = inputs.journeyMiles + inputs.additionalJourneys.reduce((sum, j) => sum + j.miles, 0);
    
    let paygIntro = (paygJourneyCount === 1) 
        ? `Total PAYG cost for a ${inputs.journeyMiles}-mile journey (pre-charge + public charging):`
        : `Total PAYG cost for ${paygJourneyCount} journeys totalling ${paygTotalMiles} miles (pre-charge + public charging):`;

    document.getElementById("adhocCostLine").innerHTML =
        `<p style="margin: 0px; font-size: 1.2rem">
            ${paygIntro} <strong>£${totalAdhocCost.toFixed(2)}</strong>
        </p>`;

    return { totalAdhocCost, totalPreJourneyCost: paygData.totalPreJourneyCost, publicKwh: kwhData.breakoutKwh };
}

function handleModeVisibility(isTripMode) {
    const sections = {
        results: document.getElementById("results"),
        subscriptions: document.getElementById("subscriptions"),
        graph: document.getElementById("graph"),
        uiPreText: document.getElementById("preConclusionsText"),
        summary: document.getElementById("summary"),
        conclusion: document.getElementById("conclusion"),
        durations: document.getElementById("durations"),
        real: document.getElementById("real"),
        breakEvenCard: document.getElementById("breakEvenCard"),
        tripCard: document.getElementById("tripCard"),
        providersContainer: document.getElementById("providersContainer"),
        resultsIntroText: document.getElementById("resultsIntroText")
    };

    if (isTripMode) {
        // --- COST REDUCTION MODE ---
        if (sections.breakEvenCard) sections.breakEvenCard.style.display = "none";
        if (sections.tripCard) sections.tripCard.style.display = "block";
        if (sections.providersContainer) sections.providersContainer.style.display = "block";
        if (sections.uiPreText) sections.uiPreText.style.display = "none";
        if (sections.resultsIntroText) sections.resultsIntroText.style.display = "none";
        // Trip results visibility is typically managed by renderTripResults()
    } else {
        // --- BREAK-EVEN MODE ---
        const elEff = document.getElementById("efficiencyBE");
        const elBat = document.getElementById("batteryBE");
        const elAdhoc = document.getElementById("adhocBE");

        // Check if elements exist and have valid numeric values
        const valEff = elEff ? elEff.value.trim() : "";
        const valBat = elBat ? elBat.value.trim() : "";
        const valAdhoc = elAdhoc ? elAdhoc.value.trim() : "";

        const isPopulated = valEff !== "" && valBat !== "" && valAdhoc !== "";

        if (isPopulated) {
            // 1. Reveal the hidden results containers
            if (sections.results) sections.results.style.display = "block";
            if (sections.subscriptions) sections.subscriptions.style.display = "block";
            if (sections.graph) sections.graph.style.display = "block";
            if (sections.resultsIntroText) sections.resultsIntroText.style.display = "block";
            if (sections.uiPreText) sections.uiPreText.style.display = "none";

            // 2. IMPORTANT: Force a calculation update now that fields are ready
            if (typeof calculate === "function") {
                calculate(); 
            }
        } else {
            // Hide everything if inputs are incomplete
            if (sections.results) sections.results.style.display = "none";
            if (sections.subscriptions) sections.subscriptions.style.display = "none";
            if (sections.graph) sections.graph.style.display = "none";
            if (sections.resultsIntroText) sections.resultsIntroText.style.display = "none";
            
            if (sections.uiPreText) {
                sections.uiPreText.style.display = "block";
                sections.uiPreText.innerHTML = "Please attend to all flashing green fields, or use the navigation tabs at the top to switch between BREAK EVEN and COST REDUCTION calculation types.";
            }
        }

        // Always hide Trip-only sections in BE mode
        [sections.summary, sections.conclusion, sections.durations, sections.real].forEach(s => {
            if (s) s.style.display = "none";
        });

        if (sections.breakEvenCard) sections.breakEvenCard.style.display = "block";
        if (sections.tripCard) sections.tripCard.style.display = "none";
        if (sections.providersContainer) sections.providersContainer.style.display = "none";
    }
}

function calculateMainJourneyBasics(inputs) {
    const mainInitialRange = (inputs.soc / 100) * inputs.batteryKwh * inputs.efficiency;
    const mainTopUpKwh = Math.max(0, ((inputs.soc - inputs.prechargesoc) / 100) * inputs.batteryKwh);
    const mainTopUpCost = mainTopUpKwh * (inputs.startChargeRate / 100);
    return { mainInitialRange, mainTopUpKwh, mainTopUpCost };
}

function updateOutputsAndStorage(inputs, providers) {
    drawGraph(inputs, providers);
    const dataToSave = getInputs();
    setCookie("ev_trip_values", dataToSave);
    saveProvidersToCookie();
}

function generateRealWorldItineraryHtml(inputs, publicKwh, formatChargingTime) {
    const chargeSpeed = inputs.maxChargingSpeed || 101;
    const rechargethreshold = inputs.rechargeAt;
    const chargeToPercent = 80; 
    const kwhPerPublicCharge = ((chargeToPercent - rechargethreshold) / 100) * inputs.batteryKwh;
    
    // Build unified journey list
    const allJourneys = [
        {
            miles: inputs.journeyMiles,
            soc: inputs.soc,
            rate: inputs.startChargeRate
        },
        ...inputs.additionalJourneys
    ];

    // Build itinerary rows for each journey using the existing buildStopsRowsForJourney
    const itineraryRowsArray = allJourneys.map((j) => {
        return buildStopsRowsForJourney(
            j.miles, 
            j.soc, 
            inputs.rechargeAt, 
            inputs.efficiency, 
            inputs.batteryKwh,
            inputs.maxChargingSpeed, // Added 6th argument
            inputs.minSpeed          // Added 7th argument
        );
    });
    
    // Build tabbed itinerary using the existing buildTabbedItinerary
    let assessmentBoxHTML = buildTabbedItinerary(allJourneys, itineraryRowsArray, inputs.rechargeAt);
    
    const locationDisclaimer = `<p style="font-size:0.85rem; margin-top:12px; opacity:0.8;">Note: Charging durations exclude the initial ramp-up phase. Since you should only charge above 80% in exceptional circumstances, the 80-to-100% charging slowdown is disregarded here. Read the section on <a href="mastery.html#sec-slow" style="color: var(--accent); text-decoration: underline;">Slow Charging</a> to find out more.</p>`;

    return { assessmentBoxHTML, locationDisclaimer };
}

function generateSpeedComparisonHtml(publicKwh, maxChargingSpeed, inputs) {
    const formatChargingTime = (timeHours) => {
        if (timeHours < 1) {
            const minutes = Math.round(timeHours * 60);
            return `${minutes} mins`;
        } else {
            const hours = Math.floor(timeHours);
            const minutes = Math.round((timeHours - hours) * 60);
            if (minutes === 0) {
                return `${hours} hour${hours > 1 ? 's' : ''}`;
            }
            return `${hours}h ${minutes}m`;
        }
    };

    const chargingSpeeds = [
        { speed: 7, type: 'AC', descriptor: 'Standard' },
        { speed: 11, type: 'AC', descriptor: 'Standard Plus' },
        { speed: 22, type: 'AC', descriptor: 'Fast' },
        { speed: 50, type: 'DC', descriptor: 'Rapid' },
        { speed: 60, type: 'DC', descriptor: 'Rapid' },
        { speed: 75, type: 'DC', descriptor: 'Rapid Plus' },
        { speed: 90, type: 'DC', descriptor: 'Rapid Plus' },
        { speed: 100, type: 'DC', descriptor: 'Rapid Plus' },
        { speed: 120, type: 'DC', descriptor: 'Ultra-Rapid' },
        { speed: 150, type: 'DC', descriptor: 'Ultra-Rapid' },
        { speed: 175, type: 'DC', descriptor: 'Ultra-Rapid' },
        { speed: 250, type: 'DC', descriptor: 'Ultra-Rapid' },
        { speed: 300, type: 'DC', descriptor: 'Hyper-Rapid' },
        { speed: 350, type: 'DC', descriptor: 'Hyper-Rapid' },
        { speed: 360, type: 'DC', descriptor: 'Hyper-Rapid' }
    ];

    let speedsToDisplay = [...chargingSpeeds];
    if (maxChargingSpeed > 0 && !speedsToDisplay.some(s => Math.abs(s.speed - maxChargingSpeed) < 0.01)) {
        speedsToDisplay.push({ speed: maxChargingSpeed, type: 'Custom', descriptor: 'Vehicle Max' });
        speedsToDisplay.sort((a, b) => a.speed - b.speed);
    }

    let tableRows = '';
    speedsToDisplay.forEach(speedObj => {
        const timeHours = publicKwh / speedObj.speed;
        const timeFormatted = formatChargingTime(timeHours);
        const isMaxSpeed = Math.abs(maxChargingSpeed - speedObj.speed) < 0.01;
        const highlightStyle = isMaxSpeed ? 'font-weight:bold; color:#4A9EFF;' : '';
        tableRows += `<tr style="${highlightStyle}"><td>${speedObj.speed}kW</td><td>${speedObj.type}</td><td>${speedObj.descriptor}</td><td>${timeFormatted}</td></tr>`;
    });

    const speedTableHtml = `
        <div class="speed-comparison-container" style="width: fit-content; max-width: 100%; margin: 0;">
            <p style="font-size: 0.85rem; margin-bottom: 10px;">
                <span class="tooltip-container">
                    <span class="info-icon" onclick="toggleTooltip(this)">💡<span class="tooltip-box">A comparison of estimated total journey charge durations...</span></span>
                </span>
                <strong>Estimated Total Public Charging Duration Required</strong>
            </p>
            <table class="mini-table">
                <thead><tr><th>Charging Speed</th><th>Type</th><th>Descriptor</th><th>Journey Charging Duration</th></tr></thead>
                <tbody>${tableRows}</tbody>
            </table>
        </div>`;

    return { speedTableHtml, formatChargingTime };
}

function generateProviderResultsHtml(providers, inputs) {
    let html = `<div class="mobile-only-text" style="font-size: 0.8em; text-align: center; color: var(--neon-green)">Slide table left to view hidden columns.</div><div class="results-scroll"><table><thead><tr>
        <th>Provider (click hyperlink to view subscription info)</th>
        <th><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the provider's subscription fee, which gives you access to their discounted charge rate for ONE MONTH.</span></span></span>Sub. Fee</th>
        <th><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the provider's discounted charge rate (per kWh) that is available after subscribing for an entire month. Note: Some providers have variable charge rates depending on location and time of day. The rate listed here may be an average. Click the provider's link to confirm pricing.</span></span></span>Disc. Rate</th>
        <th><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the expected <strong>total charging cost</strong> of your journey using this provider and including your stated battery pre-charge. If the value is displayed in green, it is cheaper than the equivalent journey using PAYG charging at the rate you entered above (${inputs.adhoc}p/kWh).</span></span></span>Journey Cost</th>
        <th><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the amount by which the discounted charge rate will either be cheaper or more expensive than your average PAYG rate for the same distance. Green means cheaper; red means more expensive. Bear in mind that you can continue to use a provider's subscription for an entire month.</span></span></span>vs. PAYG</th>
        <th><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the number of miles you must drive on the provider's discounted charge rate to pay off the subscription fee. <strong>Important! This is not the total miles of your journey</strong> — it is the number of miles you must drive from your first charge with this provider. Remember, a subscription lasts for an entire month.</span></span></span>Break-Even Miles</th>
        <th><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the break-even miles PLUS the initial number of miles your vehicle can drive based on its pre-charged state. The number of journeys has no impact on this value.</span></span></span>Break Even + Battery</th>
        </tr></thead><tbody>`;
    
    providers.forEach(p => {
        const rowClass = p.savings > 0 ? "good" : (p.savings < 0 ? "bad" : "");
        const providerLink = p.url 
            ? `<a href="${p.url}" target="_blank" style="color:inherit; text-decoration:underline;">${p.name}</a>` 
            : p.name;
        const breakEvenText = p.rate < inputs.adhoc 
            ? `${p.breakEvenMiles.toFixed(0)} miles` 
            : "Never";
        const totalMilesText = p.rate < inputs.adhoc 
            ? `${p.totalWithBattery.toFixed(0)} miles` 
            : "N/A";
        html += `<tr class="${rowClass}">
            <td>
                <span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">${p.comments}</span>
                </span></span> ${providerLink}
            </td>
            <td>£${p.subCost.toFixed(2)}</td>
            <td>${p.rate.toFixed(1)}p</td>
            <td><strong>£${p.totalJourneyCost.toFixed(2)}</strong></td>
            <td>${p.savings > 0 ? 'Save £' : 'Cost £'}${Math.abs(p.savings).toFixed(2)}</td>
            <td><strong>${breakEvenText}</strong></td>
            <td><strong>${totalMilesText}</strong></td>
        </tr>`;
    });
    
    return html + `</tbody></table></div>`;
}

function processProviderData(providerBoxes, inputs, totalAdhocCost, totalPreJourneyCost, mainInitialRange) {
    const providers = [];
    const simulateTripWithProvider = (providerRate, batteryKwh, rechargethreshold, efficiency, journeyMiles, initialSoc) => {
        const chargeToPercent = 80; 
        const kwhPerCharge = ((chargeToPercent - rechargethreshold) / 100) * batteryKwh; 
        let distanceDriven = 0;
        let publicChargeCost = 0;
        let chargeCount = 0;
        let currentSoc = initialSoc;
        
        while (distanceDriven < journeyMiles) {
            const rangeOnCurrentCharge = ((currentSoc - rechargethreshold) / 100) * batteryKwh * efficiency;
            if (distanceDriven + rangeOnCurrentCharge >= journeyMiles) break;
            
            distanceDriven += rangeOnCurrentCharge;
            chargeCount++;
            const remainingDistance = journeyMiles - distanceDriven;
            const kwhNeededForFinal = (remainingDistance / efficiency);
            
            if (kwhNeededForFinal <= kwhPerCharge) {
                publicChargeCost += kwhNeededForFinal * (providerRate / 100);
                break;
            } else {
                publicChargeCost += kwhPerCharge * (providerRate / 100);
                currentSoc = chargeToPercent;
            }
        }
        return publicChargeCost;
    };

    providerBoxes.forEach(box => {
        const id = box.dataset.id;
        const name = document.getElementById(`name${id}`).value || "Unnamed";
        const subCost = parseFloat(document.getElementById(`subCost${id}`).value) || 0;
        const rate = parseFloat(document.getElementById(`rate${id}`).value) || 0;
       
        const savingPerKwh = (inputs.adhoc - rate) / 100;
        let breakEvenMiles = 0;
        if (savingPerKwh > 0) {
            const kwhNeeded = subCost / savingPerKwh;
            breakEvenMiles = kwhNeeded * inputs.efficiency;
        }
        
        let publicChargingCost = 0;

        // Journey 1
        publicChargingCost += simulateTripWithProvider(
            rate,
            inputs.batteryKwh,
            inputs.rechargeAt,
            inputs.efficiency,
            inputs.journeyMiles,
            inputs.soc
        );
        
        // Additional journeys
        inputs.additionalJourneys.forEach(j => {
            publicChargingCost += simulateTripWithProvider(
                rate,
                inputs.batteryKwh,
                inputs.rechargeAt,
                inputs.efficiency,
                j.miles,
                j.soc
            );
        });
        
        const totalJourneyCost = subCost + totalPreJourneyCost + publicChargingCost;
        const pData = PRESETS.find(p => p.name === document.getElementById(`preset${id}`).value);

        providers.push({ 
            name, subCost, rate, totalJourneyCost, 
            breakEvenMiles,
            totalWithBattery: breakEvenMiles + mainInitialRange,
            savings: totalAdhocCost - totalJourneyCost,
            url: pData?.subscription?.url,
            comments: pData?.subscription?.comments || ""
        });
    });

    const sortType = document.getElementById("sortResults")?.value || "cheapest";
    providers.sort((a, b) => {
        if (sortType === "cheapest") return a.totalJourneyCost - b.totalJourneyCost;
        if (sortType === "be_low") return a.breakEvenMiles - b.breakEvenMiles;
        if (sortType === "az") return a.name.localeCompare(b.name);
        if (sortType === "za") return b.name.localeCompare(a.name);
        return 0;
    });

    return providers;
}

function generateKwhBreakoutHtml(inputs, journey1PublicMiles) {
    let breakoutKwh = 0;
    let breakoutHtml = "";
    
    // Journey 1
    const j1Kwh = journey1PublicMiles / inputs.efficiency;
    breakoutKwh += j1Kwh;

    if (inputs.additionalJourneys.length > 0) {
        breakoutHtml = `<p style="opacity: 0.5; font-size: 0.8rem; margin: 0px"><strong>PAYG mileage costs:</strong></p>`;
        breakoutHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">Journey 1 PAYG kWh: ${j1Kwh.toFixed(1)} kWh</div>`;

        inputs.additionalJourneys.forEach((j, index) => {
            const extraRange = Math.max(0, ((j.soc - inputs.rechargeAt) / 100) * inputs.batteryKwh * inputs.efficiency);
            const extraKwh = Math.max(0, j.miles - extraRange) / inputs.efficiency;
            breakoutKwh += extraKwh;
            breakoutHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">Journey ${index + 2} PAYG kWh: ${extraKwh.toFixed(1)} kWh</div>`;
        });

        const totalPaygKwhCost = breakoutKwh * (inputs.adhoc / 100);

        breakoutHtml += `
            <p style="border-bottom: 1px solid rgba(255,255,255,0.2); margin:0; padding-bottom: 10px;">
                <span class="tooltip-container">
                    <span class="info-icon" style="font-size:0.8rem" onclick="toggleTooltip(this)">💡
                        <span class="tooltip-box">
                            This is the total cost of energy needed from PAYG chargers across all journeys.
                        </span>
                    </span>
                </span>
                Total PAYG mileage cost (${breakoutKwh.toFixed(1)} kWh x ${inputs.adhoc}p): 
                <strong>£${totalPaygKwhCost.toFixed(2)}</strong>
            </p>
        `;
     } else {
        breakoutHtml = `<p style="margin: 0px;"><span class="tooltip-container"><span class="info-icon" style="font-size:0.8rem" onclick="toggleTooltip(this)">💡<span class="tooltip-box">This is the cost of energy needed from PAYG charging to complete this journey.</span></span></span>PAYG battery charge (${j1Kwh.toFixed(1)} kWh x ${inputs.adhoc}p): <strong>£${(j1Kwh * (inputs.adhoc / 100)).toFixed(2)}</strong></p>`;
    }

    return { breakoutHtml, breakoutKwh };
}

function generatePaygSummaryHtml(inputs, mainInitialRange, mainTopUpKwh, mainTopUpCost, customPreSoc) {
    let totalPreJourneyCost = mainTopUpCost;
    let preChargeHtml = "";

    if (inputs.additionalJourneys.length > 0) {
        preChargeHtml = `<p style="opacity: 0.5; font-size: 0.8rem; margin: 0px"><strong>Pre-charge battery costs:</strong></p>`;
        preChargeHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">
            Journey 1 pre-charge cost (${inputs.prechargesoc}%→${inputs.soc}%, ${mainTopUpKwh.toFixed(1)} kWh x  ${inputs.startChargeRate}p): £${mainTopUpCost.toFixed(2)}
        </div>`;

        inputs.additionalJourneys.forEach((j, index) => {
            const extraKwh = Math.max(0, ((j.soc - j.prechargesoc) / 100) * inputs.batteryKwh);
            const extraCost = extraKwh * (j.rate / 100);
            totalPreJourneyCost += extraCost;
            preChargeHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">
                Journey ${index + 2} pre-charge cost (${j.prechargesoc}%→${j.soc}%, ${extraKwh.toFixed(1)} kWh x ${j.rate}p): £${extraCost.toFixed(2)}
            </div>`;
        });

        preChargeHtml += `<p style="margin: 0px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 10px;">
            <span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the combined cost for pre-charging your battery before each journey defined above.</span></span></span>Total battery pre-charge cost for all journeys: £${totalPreJourneyCost.toFixed(2)}</p>`;
    } else {
        preChargeHtml = `<p style="margin: 0px;"><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the cost of pre-charging your battery at your start/departure location before your journey.</span></span></span>Pre-journey battery charge (${customPreSoc}%→${inputs.soc}%, ${mainTopUpKwh.toFixed(1)} kWh x ${inputs.startChargeRate}p): 
            <strong>£${mainTopUpCost.toFixed(2)}</strong></p>`;
    }

    let totalPublicMiles = 0;
    let publicMilesHtml = "";
    const journey1PublicMiles = Math.max(0, inputs.journeyMiles - mainInitialRange);
    totalPublicMiles += journey1PublicMiles;

    if (inputs.additionalJourneys.length > 0) {
        publicMilesHtml = `<p style="opacity: 0.5; font-size: 0.8rem; margin: 0px"><strong>PAYG miles:</strong></p>`;
        publicMilesHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">
            Journey 1 PAYG miles: ${journey1PublicMiles.toFixed(0)} miles
        </div>`;

        inputs.additionalJourneys.forEach((j, index) => {
            const extraRange = Math.max(0, ((j.soc - inputs.rechargeAt) / 100) * inputs.batteryKwh * inputs.efficiency);
            const extraPublicMiles = Math.max(0, j.miles - extraRange);
            totalPublicMiles += extraPublicMiles;
            publicMilesHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">
                Journey ${index + 2} PAYG miles: ${extraPublicMiles.toFixed(0)} miles
            </div>`;
        });

        publicMilesHtml += `<p style="border-bottom: 1px solid rgba(255,255,255,0.2); margin:0; padding-bottom: 10px;">
            <span class="tooltip-container"><span class="info-icon" style="font-size:0.8rem" onclick="toggleTooltip(this)">💡<span class="tooltip-box">This is the total number of miles of your combined journey distance that will need to be paid for with PAYG charging. It takes into account the range expected from pre-charging before each journey and your recharge threshold of ${inputs.rechargeAt}%.</span></span></span>Total PAYG charging miles required: ${totalPublicMiles.toFixed(0)} miles</p>`;
    } else {
        publicMilesHtml = `<p style="margin: 0px;"><span class="tooltip-container"><span class="info-icon" style="font-size:0.8rem" onclick="toggleTooltip(this)">💡<span class="tooltip-box">This is how many miles of your journey will need to be paid for with PAYG charging. It takes into account the range expected from pre-charging before the journey and your recharge threshold of ${inputs.rechargeAt}%.</span></span></span>PAYG charging miles needed: <strong>${journey1PublicMiles.toFixed(0)} miles</strong></p>`;
    }

    return { preChargeHtml, publicMilesHtml, totalPreJourneyCost, totalPublicMiles, journey1PublicMiles };
}

function calculateRangeHtml(inputs, mainInitialRange) {
    let totalInitialRange = mainInitialRange;
    let rangeHtml = "";
    const paygSubtitle = document.getElementById("paygSummarySubtitle");

    if (inputs.additionalJourneys.length > 0) {
        if (paygSubtitle) paygSubtitle.textContent = `Here is the key information for your journeys if you choose PAYG. Allow +/- 1 minute, mile, and/or penny for rounding.`;
        rangeHtml = `<p style="opacity: 0.5; margin: 0px; font-size: 0.8rem"><strong>Pre-charged battery range:</strong></p>`;
        rangeHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">
            Journey 1 range: ${mainInitialRange.toFixed(0)} miles
        </div>`;

        inputs.additionalJourneys.forEach((j, index) => {
            const extraRange = Math.max(0, ((j.soc - inputs.rechargeAt) / 100) * inputs.batteryKwh * inputs.efficiency);
            totalInitialRange += extraRange;
            rangeHtml += `<div style="font-size: 0.8rem; opacity: 0.5; margin-bottom: 2px; margin-left: 10px;">
                Journey ${index + 2} range: ${extraRange.toFixed(0)} miles
            </div>`;
        });

        rangeHtml += `<p style="border-bottom: 1px solid rgba(255,255,255,0.2); margin: 0; padding-bottom: 10px;">
            <span class="tooltip-container"><span class="info-icon" style="font-size:0.8rem" onclick="toggleTooltip(this)">💡<span class="tooltip-box">This is the range you <i>should</i> expect from pre-charging at your start/departure location(s) from your recharge threshold of ${inputs.rechargeAt}% to your specified departure SOC for each journey. It forms part of the calculation for how many miles of PAYG charging will be needed across all journeys.</span></span></span>Total pre-charged battery range for all journeys: ${totalInitialRange.toFixed(0)} miles</p>`;
    } else {
        if (paygSubtitle) paygSubtitle.textContent = `Here is the key information for your journey if you choose PAYG. Allow +/- 1 minute, mile, and/or penny for rounding.`;
        rangeHtml = `<p style="margin: 0px"><span class="tooltip-container"><span class="info-icon" style="font-size:0.8rem" onclick="toggleTooltip(this)">💡<span class="tooltip-box">This is the initial range you should expect for each journey based on pre-charging at your start/departure location from your recharge threshold of ${inputs.rechargeAt}% to your specified departure SOC of ${inputs.soc}%). It forms part of the calculation for how many miles of PAYG charging will be needed to complete this journey.</span></span></span>Pre-charged battery range: <strong>${mainInitialRange.toFixed(0)} miles</strong></p>`;
    }
    return { rangeHtml, totalInitialRange };
}

function checkIncompleteTrip(inputs, uiPreText, uiResults, resultsHeader, uiShare, uiPdf) {
    const tripIncomplete = 
        inputs.journeyMiles <= 0 || 
        inputs.batteryKwh <= 0 || 
        inputs.soc <= 0 ||
        inputs.efficiency <= 0 || 
        inputs.adhoc <= 0 ||
        !document.getElementById("rechargeAt").value ||
        inputs.maxChargingSpeed <= 0 ||
        inputs.startChargeRate <= 0;

    if (tripIncomplete) {
        uiPreText.innerHTML = "Please attend to all puslsing green fields, or use the navigation tabs at the top to switch between BREAK EVEN and COST REDUCTION calcuation types.";
        /*uiPreText.style.display = "block";
        uiResults.style.display = "none";*/
        /*if (resultsHeader) resultsHeader.style.display = "none";
        if (uiShare) uiShare.style.display = "none";
        if (uiPdf) uiPdf.style.display = "none";
        const toc = document.getElementById("toc");
        if (toc) toc.style.display = "none";*/
        return true; 
    }
    return false;
}

function updatePaygTitle(adhoc) {
    const paygTitle = document.getElementById("paygSummaryTitle");
    if (paygTitle) {
        if (adhoc > 0) {
            paygTitle.textContent = `1. PAYG Summary (Based on ${adhoc}p/kWh)`;
        } else {
            paygTitle.textContent = `1. PAYG Summary`;
        }
    }
}

function applyPulsing() {
    const fieldIds = [
        "journeyMiles", "batteryKwh", "soc", "efficiency", 
        "adhoc", "startChargeRate", "maxChargingSpeed", "efficiencyBE", "adhocBE", "rechargeAt", "prechargesoc"
    ];

    fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const val = parseFloat(el.value);
            if (!el.value || isNaN(val) || val <= 0) {
                el.classList.add('empty-pulse');
            } else {
                el.classList.remove('empty-pulse');
            }
        }
    });

    const addJourneyBtn = document.querySelector('button[onclick="addAdditionalJourney()"]');
    const extraJourneys = document.querySelectorAll(".extra-journey-miles");
    
    if (addJourneyBtn) {
        if (extraJourneys.length > 0) {
            addJourneyBtn.classList.remove("empty-pulse");
        } else {
            addJourneyBtn.classList.add("empty-pulse");
        }
    }

    const extraFields = document.querySelectorAll(".extra-journey-miles, .extra-journey-soc, .extra-journey-prechargesoc, .extra-journey-rate");
    extraFields.forEach(input => {
        const val = parseFloat(input.value);
        if (!input.value || isNaN(val) || val <= 0) {
            input.classList.add('empty-pulse');
        } else {
            input.classList.remove('empty-pulse');
        }
    });

    // This is the section we are keeping here and removing from calculate()
    document.querySelectorAll(".provider-box input[type='number'], .provider-box input[type='text']").forEach(input => {
        if (!input.value || input.value === "0") {
            input.classList.add('empty-pulse');
        } else {
            input.classList.remove('empty-pulse');
        }
    });
}

function handleBreakEvenMode(uiPreText, uiResults) {
    const inputs = getInputs();
    
    // Safety check: Don't render if the three fields are empty/zero
    if (inputs.efficiency <= 0 || inputs.batteryKwh <= 0 || inputs.adhoc <= 0) {
        uiResults.innerHTML = "";
        return;
    }

    const providerBoxes = document.querySelectorAll(".provider-box");
    const contentsBox = document.getElementById("contentsBox");
    if (contentsBox) {
        /*contentsBox.style.display = "none";
        contentsBox.innerHTML = "";*/
    }
    const efficiency = parseFloat(document.getElementById("efficiencyBE").value);
    const adhocRate = parseFloat(document.getElementById("adhocBE").value) || 0;
    const minSpeedSelection = parseFloat(document.getElementById("minSpeedBE").value) || 0;

    if (isNaN(efficiency) || efficiency <= 0 || isNaN(adhocRate) || adhocRate <= 0) {
        uiPreText.innerHTML = "Please attend to all pulsing green fields, or use the navigation tabs at the top to switch between BREAK EVEN and COST REDUCTION calcuation types.";
        /*uiPreText.style.display = "block";
        uiResults.style.display = "none";*/
        return;
    }

    let beData = [];

    PRESETS.forEach(p => {
        const subCost = p.subscription.subCost;
        const rates = p.rates;
        const speedKeys = Object.keys(rates);
        
        speedKeys.forEach(speed => {
            const numericSpeed = speed === 'default' ? 0 : parseFloat(speed);
            if (speed !== 'default' && numericSpeed < minSpeedSelection) {
                return; 
            }

            const rate = rates[speed];
            const speedDisplay = speed === 'default' ? "Max. available" : `${speed}kW`;
            
            let breakEvenMiles = null; 
            let displayMiles = "";

            if (rate < adhocRate) {
                const savingPerKwh = (adhocRate - rate) / 100;
                const kwhNeeded = subCost / savingPerKwh;
                breakEvenMiles = Math.round(kwhNeeded * efficiency);
                displayMiles = breakEvenMiles + " miles";
            } else if (subCost > 0) {
                displayMiles = "Never (Rate ≥ PAYG)";
            } else {
                breakEvenMiles = 0;
                displayMiles = "0 (Free/No Sub)";
            }

            beData.push({
                name: p.name,
                url: p.subscription?.url,
                comments: p.subscription?.comments || "",
                speedDisplay: speedDisplay,
                subCost: subCost,
                rate: rate,
                miles: breakEvenMiles,
                displayText: displayMiles
            });
        });
    });

    beData.sort((a, b) => {
        if (a.miles !== null && b.miles !== null) return a.miles - b.miles;
        if (a.miles !== null) return -1;
        if (b.miles !== null) return 1;
        return a.name.localeCompare(b.name);
    });

const fakeInputsForBE = { adhoc: adhocRate }; 
    const providerResultsHtml = generateBreakEvenResultsHtml(beData);
    document.getElementById("providerResults").innerHTML = providerResultsHtml;

    document.querySelectorAll(".results-scroll").forEach(el => {
        if (!el._ftScrollBound) { 
            el._ftScrollBound = true; 
            el.addEventListener("scroll", () => { if (typeof _ftActive !== 'undefined' && _ftActive) _ftHide(); }, { passive: true }); 
        }
    });

    if (!beReminderShown) {
        setTimeout(() => {
            const activePill = document.querySelector('.calc-tab.active');
            const currentIsTripMode = activePill && activePill.textContent.trim() === "Cost Reduction";
            if (!currentIsTripMode) {
                showBeReminder();
                beReminderShown = true; 
            }
        }, 5000);
    }
}

function calculate() {
    const context = getModeContext();
    
    handleModeVisibility(context.isTripMode); 
    applyPulsing(); 

    if (!context.isTripMode) {
        /*if (context.conclusionsBox) context.conclusionsBox.style.display = "none";*/
        handleBreakEvenMode(context.uiPreText, context.uiResults);
        return; 
    }

    // Trip Mode Logic
    /*if (context.uiPreText) context.uiPreText.style.display = "block";
    if (context.uiResults) context.uiResults.style.display = "block";*/

    const inputs = getInputs();
    updatePaygTitle(inputs.adhoc);
    
    // Call the new helper to handle the heavy lifting
    // Call the new helper to handle the heavy lifting
    renderTripResults(inputs, context);
}

function generateBreakEvenResultsHtml(beData) {
    let html = `
    <h3 style="margin: 20px 0 0 10px; padding-bottom: 0px">Providers & Subscriptions</h3>
    <div class="mobile-only-text" style="font-size: 0.8em; text-align: center; color: var(--neon-green); margin-bottom: 0px;">
        Slide table left to view hidden columns.
    </div>
    <div class="results-scroll">
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background: rgba(255,255,255,0.05);">
                    <th style="padding: 10px; border: 1px solid var(--border); text-align: left;">Provider (click hyperlink to view subscription info)</th>
                    <th style="padding: 10px; border: 1px solid var(--border); text-align: left;"><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the provider's subscription fee, which gives you access to their discounted charge rate for ONE MONTH.</span></span></span>Sub. Fee</th>
                    <th style="padding: 10px; border: 1px solid var(--border); text-align: left;"><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the provider's discounted charge rate (per kWh) that is available after subscribing for an entire month. Note: Some providers have variable charge rates depending on location and time of day. The rate listed here may be an average. Click the provider's link to confirm pricing.</span></span></span>Disc. Rate</th>
                    <th style="padding: 10px; border: 1px solid var(--border); text-align: left;"><span class="tooltip-container"><span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡<span class="tooltip-box">This is the number of miles you must drive on the provider's discounted charge rate to pay off the subscription fee. <strong>Important! This is not the total miles of your journey</strong> — it is the number of miles you must drive from your first charge with this provider. Remember, a subscription lasts for an entire month.</span></span></span>Break-Even Miles</th>
                </tr>
            </thead>
            <tbody>`;

    beData.forEach(p => {
        const providerLink = p.url 
            ? `<a href="${p.url}" target="_blank" style="color:inherit; text-decoration:underline;">${p.name}</a>` 
            : p.name;

        html += `
            <tr>
                <td style="padding: 10px; border: 1px solid var(--border);">
                    <span class="tooltip-container">
                        <span class="info-icon" onclick="toggleTooltip(this)" style="font-size: 0.8rem;">💡
                            <span class="tooltip-box">${p.comments}</span>
                        </span>
                    </span> ${providerLink}
                </td>
                <td style="padding: 10px; border: 1px solid var(--border);">£${p.subCost.toFixed(2)}</td>
                <td style="padding: 10px; border: 1px solid var(--border);">${p.rate.toFixed(1)}p</td>
                <td style="padding: 10px; border: 1px solid var(--border); color: var(--neon-green);"><strong>${p.displayText}</strong></td>
            </tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
}
