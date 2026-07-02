/* ==========================================================
   SQUIRRELED AWAY — rendering / DOM
   ========================================================== */

let activeTab = "burrow";

function $(id) { return document.getElementById(id); }

// The Fair Share Act (and similar periodic hits) can knock a currency back
// below a cheap flat cost right after it crosses that line -- confirmed by
// simulation, e.g. nuts hitting exactly 50 (Bigger Cheek Pouches becomes
// affordable), then the Council's 50% cut lands a fraction of a second
// later and it's unaffordable again. Becoming affordable shows instantly
// (that's worth seeing right away); becoming unaffordable has to hold for a
// beat first, so a self-correcting dip doesn't visibly flash disabled.
function settleDisabled(el, key, rawDisabled, holdMs) {
  const store = el._hold || (el._hold = {});
  const rec = store[key] || (store[key] = { shown: rawDisabled, since: 0 });
  if (!rawDisabled) {
    rec.shown = false;
    rec.since = 0;
    return false;
  }
  if (!rec.since) rec.since = Date.now();
  if (Date.now() - rec.since >= (holdMs || 50)) {
    rec.shown = true;
  }
  return rec.shown;
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tabBtn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tabPanel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + tab));
}

// Cards are built once and reused; only their text/disabled state is patched
// on subsequent renders. The render loop runs 10x/second, and rebuilding (and
// thus re-attaching) buttons on every tick meant a click's mousedown/mouseup
// could straddle a rebuild and get silently dropped -- this is why upgrades
// used to need several clicks to register.
function buildUpgradeCard(upg) {
  const div = document.createElement("div");
  div.className = "upgradeCard";
  div.innerHTML = `
    <div class="info">
      <span class="name"></span>
      <span class="desc">${upg.desc}</span>
    </div>
    <button data-upg="${upg.id}"></button>
  `;
  div.querySelector("button").addEventListener("click", () => buyUpgrade(upg.id));
  return div;
}

function updateUpgradeCard(div, upg) {
  const s = STATE;
  const cost = upgradeCost(upg, s);
  const maxed = cost === null;
  const currency = upg.currency || "shells";
  const balance = s[currency];
  const repShort = upg.reputationCost && s.reputation < upg.reputationCost;
  const rawDisabled = maxed || cost === null || balance < cost || repShort;
  const disabled = settleDisabled(div, "disabled", rawDisabled);
  div.classList.toggle("disabled", disabled);
  div.classList.toggle("completed", isUpgradeCompleted(upg, s));
  const count = upgradeCount(upg, s);
  const countTag = upg.repeatable ? ` (x${count}${upg.maxCount ? "/" + upg.maxCount : ""})` : "";
  div.querySelector(".name").textContent = upg.name + countTag;
  const btn = div.querySelector("button");
  btn.disabled = disabled;
  const repTag = upg.reputationCost ? `, -${upg.reputationCost}% Reputation` : "";
  const soldOut = upg.soldOut && upg.soldOut(s);
  const doneLabel = soldOut ? (upg.soldOutLabel || "Sold Out") : (upg.repeatable ? "Maxed" : "Purchased");
  btn.textContent = maxed ? doneLabel : (upg.actionLabel || (cost === 0 ? "Do It" : `Buy (${fmt(cost)} ${currency}${repTag})`));
}

const upgradeCardCache = {}; // tab -> { id -> div }
const upgradeDividerCache = {}; // tab -> div

// Completed upgrades (maxed repeatables, or one-time purchases already made)
// bypass their own visible() gate -- once done, they always render, just
// pushed below a "Completed" divider and grayed out, instead of vanishing.
function renderUpgradeList(tab) {
  const container = $("upgrades-" + tab);
  if (!container) return;
  const cache = upgradeCardCache[tab] || (upgradeCardCache[tab] = {});
  const all = UPGRADES.filter(u => u.tab === tab);
  const active = [];
  const completed = [];
  all.forEach(u => {
    if (isUpgradeCompleted(u, STATE)) completed.push(u);
    else if (u.visible(STATE)) active.push(u);
  });
  const wantedIds = new Set(active.concat(completed).map(u => u.id));

  // Drop cards for upgrades no longer visible (e.g. a temporarily sold-out one).
  for (const id of Object.keys(cache)) {
    if (!wantedIds.has(id)) {
      if (cache[id].parentNode) cache[id].parentNode.removeChild(cache[id]);
      delete cache[id];
    }
  }

  let idx = 0;
  active.forEach(upg => {
    let card = cache[upg.id];
    if (!card) {
      card = buildUpgradeCard(upg);
      cache[upg.id] = card;
    }
    // Ensure correct order without detaching cards that are already in place.
    if (container.children[idx] !== card) container.insertBefore(card, container.children[idx] || null);
    updateUpgradeCard(card, upg);
    idx++;
  });

  const divider = upgradeDividerCache[tab] || (upgradeDividerCache[tab] = (() => {
    const d = document.createElement("div");
    d.className = "upgradeDivider";
    d.textContent = "Completed";
    return d;
  })());
  if (completed.length) {
    if (container.children[idx] !== divider) container.insertBefore(divider, container.children[idx] || null);
    idx++;
  } else if (divider.parentNode) {
    divider.parentNode.removeChild(divider);
  }

  completed.forEach(upg => {
    let card = cache[upg.id];
    if (!card) {
      card = buildUpgradeCard(upg);
      cache[upg.id] = card;
    }
    if (container.children[idx] !== card) container.insertBefore(card, container.children[idx] || null);
    updateUpgradeCard(card, upg);
    idx++;
  });
}

// Same build-once-then-patch approach as upgrade cards, for the same reason:
// stock cards have buttons too, and rebuilding them every tick would risk
// dropping clicks.
const stockCardCache = {};

function buildStockCard(st) {
  const div = document.createElement("div");
  div.className = "upgradeCard";
  const buyButtonsHtml = STOCK_BUY_TIERS.map((_, i) => `<button class="stockBuyBtn" data-tier="${i}"></button>`).join("");
  div.innerHTML = `
    <div class="info">
      <span class="name"></span>
      <span class="desc"></span>
    </div>
    <div class="stockActions">
      ${buyButtonsHtml}
      <button class="stockSellBtn danger"></button>
    </div>
  `;
  div.querySelectorAll(".stockBuyBtn").forEach((btn, i) => {
    btn.addEventListener("click", () => buyStock(st.id, STOCK_BUY_TIERS[i]));
  });
  div.querySelector(".stockSellBtn").addEventListener("click", () => sellStock(st.id));
  return div;
}

function updateStockCard(div, st) {
  const s = STATE;
  const stock = s.stocks[st.id];
  const unlockedTiers = 1 + (s.upgradeCounts.tradingSeat || 0); // x1 always unlocked, +1 per Trading Seat purchase
  const nextText = s.flags.insiderTrading ? ` Next minute: ${fmt(stock.nextPrice)} shells.` : "";
  div.querySelector(".name").textContent = `${st.name} (${st.ticker}) — ${fmt(stock.price)} shells/share`;
  div.querySelector(".desc").textContent = `Shares held: ${fmt(stock.shares)}.${nextText}`;

  div.querySelectorAll(".stockBuyBtn").forEach((btn, i) => {
    const unlocked = i < unlockedTiers;
    btn.classList.toggle("hidden", !unlocked);
    if (!unlocked) return;
    const qty = STOCK_BUY_TIERS[i];
    const cost = stock.price * qty;
    btn.textContent = `x${fmt(qty)}`;
    btn.disabled = s.shells < cost;
  });

  const sellBtn = div.querySelector(".stockSellBtn");
  sellBtn.textContent = "Sell All";
  sellBtn.disabled = stock.shares <= 0;
}

function renderStocks() {
  const container = $("stockList");
  if (!container) return;
  STOCKS.forEach((st, i) => {
    let card = stockCardCache[st.id];
    if (!card) {
      card = buildStockCard(st);
      stockCardCache[st.id] = card;
    }
    if (container.children[i] !== card) container.insertBefore(card, container.children[i] || null);
    updateStockCard(card, st);
  });
}

function renderStatsBar() {
  const s = STATE;
  $("statNuts").textContent = fmt(s.nuts);
  $("statNutsEaten").textContent = "1/min"; // always 1 -- you never need more than this to survive
  $("statHealth").textContent = Math.round(s.health) + "%";
  $("statShells").textContent = fmt(s.shells);
  $("statSalaryWrap").classList.toggle("hidden", s.chipmunks <= 0);
  $("statSalary").textContent = "-" + fmt(chipmunkSalaryRateTotal(s)) + "/min";
  $("statForest").textContent = fmt(s.forestReserves) + " / " + fmt(s.forestCap);
  $("statForestWrap").classList.toggle("blink", s.forestReserves <= 0);
  $("statRep").textContent = Math.round(s.reputation) + "%";

  const nextBoundaryMs = (s.lastCollectionMinute + 1) * 60000;
  const remainingSec = Math.max(0, Math.ceil((nextBoundaryMs - displayNow()) / 1000));
  const mm = Math.floor(remainingSec / 60);
  const ss = String(remainingSec % 60).padStart(2, "0");
  $("statTimer").textContent = `${mm}:${ss}`;
}

function renderTabs() {
  const s = STATE;
  document.querySelectorAll(".tabBtn").forEach(b => {
    const tab = b.dataset.tab;
    b.classList.toggle("hidden", !s.unlockedTabs[tab]);
    if (tab === "expansion") {
      const needsAttention = s.unlockedTabs.expansion && s.forestReserves <= 0 && activeTab !== "expansion";
      b.classList.toggle("blink", needsAttention);
    }
  });
  document.querySelectorAll(".tabPanel").forEach(p => {
    const tab = p.id.replace("tab-", "");
    if (!s.unlockedTabs[tab] && tab !== "burrow") p.classList.add("hidden");
  });
}

function renderBurrow() {
  renderUpgradeList("burrow");
}

function renderMarket() {
  const s = STATE;
  const rate = (1 - s.councilIncomeTaxRate) * (1 - s.tariffEffectiveRate);
  const rateEl = $("nutConversionRate");
  rateEl.textContent = rate >= 1 ? "1:1" : `${rate.toFixed(2)}:1`;
  rateEl.style.color = rate >= 1 ? "var(--good)" : "var(--bad)";
  renderUpgradeList("market");
}

function renderWorkforce() {
  const s = STATE;
  const partyActive = isPistachioPartyActive(s);
  const chipRatePerMin = CONFIG.chipmunkBaseRate * s.chipmunkMultiplier * (partyActive ? 2 : 1) * 60;
  const chipSalary = chipmunkSalaryPerMin(s);
  $("chipmunkCount").textContent = fmt(s.chipmunks);
  $("chipmunkRateEach").textContent = fmt(chipRatePerMin);
  $("chipmunkRateTotal").textContent = fmt(chipRatePerMin * s.chipmunks);
  $("chipmunkSalaryEach").textContent = fmt(chipSalary);
  $("chipmunkSalaryTotal").textContent = fmt(chipSalary * s.chipmunks);
  const cost = chipmunkCost(s);
  $("hireCost").textContent = fmt(cost);
  const hireBtn = $("hireBtn");
  hireBtn.disabled = s.shells < cost;
  const layoffBtn = $("layoffBtn");
  layoffBtn.disabled = s.chipmunks <= 0;

  const partyBtn = $("pistachioBtn");
  if (partyActive) {
    const remainingSec = Math.max(0, Math.ceil((s.pistachioPartyUntil - displayNow()) / 1000));
    partyBtn.textContent = `Party in Progress (${remainingSec}s left)`;
    partyBtn.disabled = true;
  } else {
    const partyCost = s.chipmunks * CONFIG.pistachioPartyCostPerChipmunk;
    partyBtn.textContent = `Pistachio Party (${fmt(partyCost)} shells)`;
    partyBtn.disabled = s.chipmunks <= 0 || s.shells < partyCost;
  }

  $("rigRow").classList.toggle("hidden", !s.flags.munkbotsUnlocked);
  if (s.flags.munkbotsUnlocked) {
    $("rigCount").textContent = fmt(s.rigs);
    $("rigRateEach").textContent = fmt(CONFIG.rigBaseRate * 60);
    $("rigRateTotal").textContent = fmt(CONFIG.rigBaseRate * 60 * s.rigs);
    $("rigSalary").textContent = isMunkbotCleanupActive(s)
      ? `none, but ${fmt(CONFIG.munkbotCleanupCostPerMin)} nuts/min per bot in mandatory cleanup`
      : "none";
    const rCost = rigCost(s);
    const banned = isHarvesterBanned(s);
    const deployBtn = $("deployRigBtn");
    const deployBtn10 = $("deployRigBtn10");
    const deployBtn100 = $("deployRigBtn100");
    deployBtn.textContent = banned ? "Banned by the Council" : "Deploy x1";
    deployBtn.disabled = banned || s.shells < rCost;
    deployBtn10.textContent = banned ? "Banned by the Council" : "Deploy x10";
    deployBtn10.disabled = banned || s.shells < rCost * 10;
    deployBtn100.textContent = banned ? "Banned by the Council" : "Deploy x100";
    deployBtn100.disabled = banned || s.shells < rCost * 100;
    $("rigPrices").textContent = banned ? "" : `x1: ${fmt(rCost)} shells   x10: ${fmt(rCost * 10)} shells   x100: ${fmt(rCost * 100)} shells`;
  }

  renderUpgradeList("workforce");
}

function renderRealty() {
  const s = STATE;
  const slider = $("rentSlider");
  slider.max = s.rentSeverityCap;
  slider.value = s.rentSeverity; // reflect the loaded/saved value, not just its default position
  $("rentPct").textContent = s.rentSeverity + "%";
  $("rentCapDisplay").textContent = s.rentSeverityCap + "%";
  const income = s.rentCapPerSec * (s.rentSeverity / 100);
  $("rentIncome").textContent = fmt(income);
  $("rentCap").textContent = fmt(s.rentCapPerSec);

  $("propertiesAvailable").textContent = fmt(s.propertiesAvailable);
  const owned = s.upgradeCounts.acquireRentalProperty || 0;
  const marketExhausted = owned + s.propertiesAvailable >= CONFIG.propertiesCap;
  const crashBtn = $("crashMarketBtn");
  const crashCooldownRemaining = Math.max(0, Math.ceil((s.lastCrashMarketAt + CONFIG.crashMarketCooldownMs - displayNow()) / 1000));
  if (marketExhausted) {
    crashBtn.textContent = "No Properties Available";
    crashBtn.disabled = true;
  } else if (crashCooldownRemaining > 0) {
    crashBtn.textContent = `On Cooldown (${crashCooldownRemaining}s)`;
    crashBtn.disabled = true;
  } else {
    crashBtn.textContent = `Crash the Market (${fmt(CONFIG.crashMarketCost)} shells)`;
    crashBtn.disabled = s.shells < CONFIG.crashMarketCost;
  }

  $("realtyAgentRow").classList.toggle("hidden", !s.flags.realtyAgentUnlocked);
  if (s.flags.realtyAgentUnlocked) {
    // Old saves may still reference the removed "Whenever Affordable" index -- clamp it back in range.
    if (s.realtyAgentInterval >= REALTY_AGENT_INTERVALS.length) s.realtyAgentInterval = REALTY_AGENT_INTERVALS.length - 1;
    const agentSlider = $("realtyAgentSlider");
    agentSlider.value = s.realtyAgentInterval;
    $("realtyAgentLabel").textContent = REALTY_AGENT_INTERVALS[s.realtyAgentInterval].label;
  }

  $("fireAgentRow").classList.toggle("hidden", !(allPropertiesOwned(s) && s.flags.realtyAgentUnlocked));

  renderUpgradeList("realty");
}

function renderCorp() {
  const s = STATE;
  $("backpayRow").classList.toggle("hidden", !s.flags._inBackpayDebt);
  if (s.flags._inBackpayDebt) {
    $("backpayAmt").textContent = fmt(Math.max(0, -s.shells) + s.backpayDebt);
    const bribeBtn = $("bribeBtn");
    bribeBtn.disabled = s.nuts < CONFIG.councilBribeCost;
  }

  $("tariffRow").classList.toggle("hidden", !s.flags.tariffUnlocked);
  if (s.flags.tariffUnlocked) {
    const tariffSlider = $("tariffSlider");
    tariffSlider.value = s.tariffRate;
    $("tariffPct").textContent = s.tariffRate + "%";
    $("tariffApplied").textContent = Math.round(s.tariffEffectiveRate * 100) + "%";
  }

  renderUpgradeList("corp");
}

function renderMedia() {
  const s = STATE;
  $("mediaRep").textContent = Math.round(s.reputation);
  const smearBtn = $("smearBtn");
  if (s.reputation >= 100) {
    smearBtn.textContent = "Reputation Already Maxed";
    smearBtn.disabled = true;
  } else {
    smearBtn.textContent = "Run a Smear Campaign";
    smearBtn.disabled = false;
  }
}

// Same build-once-then-patch approach as upgrade/stock cards: law cards now
// carry a live counter button, and rebuilding it every tick would risk
// dropping clicks the same way it used to for upgrades.
const lawCardCache = {};

function buildLawCard(law) {
  const div = document.createElement("div");
  div.className = "upgradeCard";
  div.innerHTML = `
    <div class="info">
      <span class="name"></span>
      <span class="desc">${law.desc}</span>
    </div>
    <button class="lawCounterBtn"></button>
  `;
  if (law.counter) {
    div.querySelector(".lawCounterBtn").addEventListener("click", () => buyLawCounter(law.id));
  }
  return div;
}

function updateLawCard(div, law) {
  const s = STATE;
  const countered = law.countered(s);
  const status = countered
    ? `<span style="color:#4b6b2f">EVADED</span>`
    : `<span style="color:#8c1f1f">IN EFFECT</span>`;
  div.querySelector(".name").innerHTML = `${law.name} — ${status}`;

  const btn = div.querySelector(".lawCounterBtn");
  const counter = law.counter;
  const showButton = counter && !countered && (!counter.requirement || counter.requirement(s));
  btn.classList.toggle("hidden", !showButton);
  if (showButton) {
    const currency = counter.currency || "shells";
    const repTag = counter.reputationCost ? `, -${counter.reputationCost}% Reputation` : "";
    btn.textContent = `${counter.label} (${fmt(counter.cost)} ${currency}${repTag})`;
    btn.disabled = !canAffordLawCounter(law, s);
  }
}

function renderCouncil() {
  const s = STATE;
  const container = $("councilList");
  if (!container) return;
  const active = LAWS.filter(l => l.unlock(s));

  if (!active.length) {
    container.innerHTML = `<div class="upgradeCard"><div class="info"><span class="desc">No laws yet. Keep growing — the Council is watching.</span></div></div>`;
    return;
  }

  const wantedIds = new Set(active.map(l => l.id));
  for (const id of Object.keys(lawCardCache)) {
    if (!wantedIds.has(id)) {
      if (lawCardCache[id].parentNode) lawCardCache[id].parentNode.removeChild(lawCardCache[id]);
      delete lawCardCache[id];
    }
  }

  active.forEach((law, i) => {
    let card = lawCardCache[law.id];
    if (!card) {
      card = buildLawCard(law);
      lawCardCache[law.id] = card;
    }
    if (container.children[i] !== card) container.insertBefore(card, container.children[i] || null);
    updateLawCard(card, law);
  });
}

function renderFinance() {
  renderStocks();
  renderUpgradeList("finance");
}

function renderChipto() {
  const s = STATE;
  $("chiptoPrice").textContent = fmt(s.chiptoPrice);
  $("chiptoHoldings").textContent = fmt(s.chiptoHoldings);
  $("chiptoSellProceeds").textContent = fmt(s.chiptoSellProceeds);

  const banned = isChiptoHypeBanned(s);
  const cooldownRemaining = Math.max(0, Math.ceil((s.lastHypeAt + CONFIG.chiptoHypeCooldownMs - displayNow()) / 1000));
  const hypeBtn = $("hypeBtn");
  if (banned) {
    hypeBtn.textContent = "Banned by the Council";
    hypeBtn.disabled = true;
  } else if (cooldownRemaining > 0) {
    hypeBtn.textContent = `On Cooldown (${cooldownRemaining}s)`;
    hypeBtn.disabled = true;
  } else {
    hypeBtn.textContent = `Hype It Up (${fmt(CONFIG.chiptoHypeCost)} shells)`;
    hypeBtn.disabled = s.shells < CONFIG.chiptoHypeCost;
  }

  const pct = Number($("chiptoSlider").value);
  $("chiptoPct").textContent = pct + "%";
  const spend = s.shells * (pct / 100);
  const buyBtn = $("buyChiptoBtn");
  buyBtn.textContent = `Buy Chipto with ${pct}% of shells (${fmt(spend)}) (Burn ${fmt(CONFIG.chiptoBurnCost)} Nuts)`;
  buyBtn.disabled = spend <= 0 || s.nuts < CONFIG.chiptoBurnCost;

  const sellQty = s.chiptoHoldings * (pct / 100);
  const sellProceeds = sellQty * s.chiptoPrice;
  const sellBtn = $("sellChiptoBtn");
  sellBtn.textContent = `Sell ${pct}% of Chipto (${fmt(sellProceeds)} shells)`;
  sellBtn.disabled = sellQty <= 0;
}

function renderExpansion() {
  const s = STATE;
  $("forestsCleared").textContent = s.forestIndex;
  $("forestsTotal").textContent = FORESTS.length;
  const totalReserves = FORESTS.reduce((a, f) => a + f.reserves, 0);
  const remainingPct = s.forestReserves / totalReserves * 100;
  $("deforestIndex").textContent = Math.round(100 - Math.min(100, remainingPct)) + "%";

  $("councilTaxRate").textContent = Math.round(s.councilIncomeTaxRate * 100) + "%";

  const bribeBtn = $("bribeCouncilBtn");
  if (s.forestIndex < FORESTS.length) {
    const forest = FORESTS[s.forestIndex];
    $("claimForestInfo").textContent = `Claim ${forest.name} — adds ${fmt(forest.reserves)} forest reserves. Costs -${CONFIG.landGrantReputationCost}% Reputation and adds another ${Math.round(CONFIG.councilTaxStep * 100)}% permanent tax on nut-to-shell conversions.`;
    bribeBtn.textContent = `Bribe the Council (-${CONFIG.landGrantReputationCost}% Reputation)`;
    bribeBtn.disabled = s.reputation < CONFIG.landGrantReputationCost;
  } else {
    $("claimForestInfo").textContent = "No forests remain — every reachable forest has been claimed.";
    bribeBtn.textContent = "N/A";
    bribeBtn.disabled = true;
  }

  const canGerry = s.forestReserves <= 0 && s.forestIndex >= FORESTS.length && !s.flags.redistricted;
  $("gerryTriggerRow").classList.toggle("hidden", !canGerry);
  $("gerryDoneMsg").classList.toggle("hidden", !s.flags.redistricted);
}

function renderLog() {
  const s = STATE;
  if (!s._logDirty) return;
  s._logDirty = false;
  const list = $("logList");
  list.innerHTML = "";
  (s.logHistory || []).forEach(entry => {
    const div = document.createElement("div");
    div.className = "logEntry " + entry.cls;
    div.innerHTML = `${entry.text}`;
    list.appendChild(div);
  });
}

let lastNewsAt = 0;
function maybePostNews() {
  const s = STATE;
  if (s.ended) return;
  const candidates = NEWS_POOL.filter(n => n.cond(s));
  if (!candidates.length) return;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  log(s, pick.text, "news");
}

function renderAll() {
  if (!STATE) return;
  renderStatsBar();
  renderTabs();
  $("subtitle").textContent = STATE.companyName;
  if (activeTab === "burrow") renderBurrow();
  else if (activeTab === "council") renderCouncil();
  else if (activeTab === "market") renderMarket();
  else if (activeTab === "workforce") renderWorkforce();
  else if (activeTab === "corp") renderCorp();
  else if (activeTab === "media") renderMedia();
  else if (activeTab === "realty") renderRealty();
  else if (activeTab === "finance") renderFinance();
  else if (activeTab === "chipto") renderChipto();
  else if (activeTab === "expansion") renderExpansion();
  renderLog();
  $("hungerWarning").classList.toggle("hidden", displayNow() >= STATE.hungerWarningUntil);
}

function onGameEnded(s) {
  $("endingText").textContent = s.endingText || "You starved to death.";
  $("endingScreen").classList.remove("hidden");
}
