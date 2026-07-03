/* ==========================================================
   SQUIRRELED AWAY — game engine (tick loop, math, actions)
   ========================================================== */

let STATE = null;
let lastTick = null;

function initEngine() {
  STATE = loadGame() || newState();
  // A save that ended in death doesn't get reloaded into the ending screen --
  // reloading after dying just starts a fresh game instead.
  if (STATE.ended) {
    STATE = newState();
    saveGame(STATE);
  }
  lastTick = Date.now();
}

function displayNow() {
  return Date.now();
}

function chipmunkCost(s) {
  return CONFIG.chipmunkHireCost; // flat signing bonus, doesn't scale with headcount
}

function chipmunkSalaryPerMin(s) {
  return Math.min(CONFIG.chipmunkSalaryCap, CONFIG.chipmunkSalaryPerMin + s.chipmunkSalaryBonus);
}

function isPistachioPartyActive(s) {
  return Date.now() < s.pistachioPartyUntil;
}

function startPistachioParty() {
  const s = STATE;
  if (!s.flags.pistachioPartyUnlocked) return;
  if (isPistachioPartyActive(s)) return;
  if (s.chipmunks <= 0) return;
  const cost = s.chipmunks * CONFIG.pistachioPartyCostPerChipmunk;
  if (s.shells < cost) return;
  s.shells -= cost;
  s.pistachioPartyUntil = Date.now() + CONFIG.pistachioPartyDurationMs;
  log(s, "A pistachio party breaks out. Chipmunk output doubles for a minute.", "info");
  saveGame(s);
}

function chipmunkSalaryRateTotal(s) {
  return s.chipmunks * chipmunkSalaryPerMin(s); // shells/min, all chipmunks combined
}

function rigCost(s) {
  return CONFIG.rigBaseCost; // flat, doesn't scale with rig count
}

function upgradeCount(upg, s) {
  return s.upgradeCounts[upg.id] || 0;
}

function upgradeCost(upg, s) {
  if (upg.soldOut && upg.soldOut(s)) return null; // out of stock, not maxed -- may become available again later
  if (upg.customCost) return upg.customCost(s);
  if (!upg.repeatable) return s.flags[upg.id] ? null : upg.cost;
  const count = upgradeCount(upg, s);
  if (upg.maxCount && count >= upg.maxCount) return null;
  return upg.baseCost; // flat forever -- no exponential scaling; growing income is what makes it easier, not a rising price
}

// Permanently done, not just temporarily unaffordable/sold out: a repeatable
// upgrade that's hit its purchase cap, or a one-time upgrade already bought.
function isUpgradeCompleted(upg, s) {
  if (upg.repeatable) return !!(upg.maxCount && upgradeCount(upg, s) >= upg.maxCount);
  return !!s.flags[upg.id];
}

function canAffordUpgrade(upg, s) {
  const cost = upgradeCost(upg, s);
  if (cost === null) return false;
  const currency = upg.currency || "shells";
  if (s[currency] < cost) return false;
  if (upg.reputationCost && s.reputation < upg.reputationCost) return false;
  return true;
}

function buyUpgrade(id) {
  const upg = UPGRADES.find(u => u.id === id);
  if (!upg) return;
  if (!canAffordUpgrade(upg, STATE)) return;
  const cost = upgradeCost(upg, STATE);
  const currency = upg.currency || "shells";
  STATE[currency] -= cost;
  if (upg.reputationCost) STATE.reputation -= upg.reputationCost;
  if (upg.repeatable) {
    STATE.upgradeCounts[id] = (STATE.upgradeCounts[id] || 0) + 1;
  } else {
    STATE.flags[id] = true;
  }
  upg.effect(STATE);
  saveGame(STATE);
}

function canAffordLawCounter(law, s) {
  const counter = law.counter;
  if (!counter) return false;
  if (counter.requirement && !counter.requirement(s)) return false;
  const currency = counter.currency || "shells";
  if (s[currency] < counter.cost) return false;
  if (counter.reputationCost && s.reputation < counter.reputationCost) return false;
  return true;
}

function buyLawCounter(lawId) {
  const law = LAWS.find(l => l.id === lawId);
  if (!law || !law.counter) return;
  const s = STATE;
  if (!law.unlock(s) || law.countered(s)) return;
  if (!canAffordLawCounter(law, s)) return;
  const currency = law.counter.currency || "shells";
  s[currency] -= law.counter.cost;
  if (law.counter.reputationCost) s.reputation -= law.counter.reputationCost;
  law.counter.effect(s);
  saveGame(s);
}

// (1 + Claws level) * (1 + Cheek Pouches level), so each Cheek Pouches
// purchase multiplies the value of every Claws level already bought.
function nutsPerForage(s) {
  const claws = s.upgradeCounts.sharperClaws || 0;
  const cheek = s.upgradeCounts.cheekPouches || 0;
  return (1 + claws) * (1 + cheek);
}

function forage() {
  const s = STATE;
  const wanted = nutsPerForage(s) * s.harvestMultiplier;
  const actual = Math.max(0, Math.min(wanted, s.forestReserves));
  s.nuts += actual;
  s.forestReserves -= actual;
  if (actual < wanted && !s.flags._warnedNoForest) {
    s.flags._warnedNoForest = true;
    log(s, "You reach for a nut and find only bare dirt. There is nothing left to forage here.", "warn");
  }
}

// Only nut-to-shell conversions are taxed -- keeps the mechanic simple and
// legible instead of touching every shell-earning path in the game.
// The tariff rate stacks on top of the Council's permanent cut.
function afterCouncilTax(amount, s) {
  return amount * (1 - s.councilIncomeTaxRate) * (1 - s.tariffEffectiveRate);
}

// The tariff slider itself does nothing -- it only sets a pending value.
// The real damage lands once a minute, when the effective rate catches up
// to whatever the slider is set to.
function applyTariff(s) {
  if (!s.flags.tariffUnlocked) return;
  const newRate = s.tariffRate / 100;
  if (newRate === s.tariffEffectiveRate) return;
  s.tariffEffectiveRate = newRate;
  const netPct = Math.round((1 - newRate) * 100);
  log(s, `Tariffs take effect. The Nut is now worth ${netPct}% of its shell value on the open market.`, "news");
}

function applyNutflix(s) {
  if (!s.flags.nutflixUnlocked) return;
  s.reputation = Math.min(100, s.reputation + CONFIG.nutflixReputationGain);
}

function sellNuts(pct) {
  const s = STATE;
  const amount = s.nuts * (pct / 100);
  if (amount <= 0) return;
  s.nuts -= amount;
  s.shells += afterCouncilTax(amount, s); // 1:1 conversion, no demand/pricing, minus the Council's cut
  saveGame(s);
}

function hireChipmunk() {
  const s = STATE;
  const cost = chipmunkCost(s);
  if (s.shells < cost) return;
  s.shells -= cost;
  s.chipmunks += 1;
  saveGame(s);
}

function isHarvesterBanned(s) {
  const law = LAWS.find(l => l.id === "harvesterBan");
  return law.unlock(s) && !law.countered(s);
}

function isMunkbotCleanupActive(s) {
  const law = LAWS.find(l => l.id === "munkbotCleanupLaw");
  return law.unlock(s) && !law.countered(s);
}

function deployRigAction(qty) {
  const s = STATE;
  if (!s.flags.munkbotsUnlocked) return;
  if (isHarvesterBanned(s)) return;
  const cost = rigCost(s) * qty;
  if (s.shells < cost) return;
  s.shells -= cost;
  s.rigs += qty;
  saveGame(s);
}

function isChiptoHypeBanned(s) {
  const law = LAWS.find(l => l.id === "chiptoHypeBan");
  return law.unlock(s) && !law.countered(s);
}

function hypeChipto() {
  const s = STATE;
  if (!s.flags.chiptoLaunched) return;
  if (isChiptoHypeBanned(s)) return;
  if (Date.now() - s.lastHypeAt < CONFIG.chiptoHypeCooldownMs) return;
  if (s.shells < CONFIG.chiptoHypeCost) return;
  s.shells -= CONFIG.chiptoHypeCost;
  s.chiptoPrice *= CONFIG.chiptoHypeMultiplier;
  s.lastHypeAt = Date.now();
  saveGame(s);
}

function buyChipto(pct) {
  const s = STATE;
  if (!s.flags.chiptoLaunched) return;
  const spend = s.shells * (pct / 100);
  if (spend <= 0) return;
  if (s.nuts < CONFIG.chiptoBurnCost) return;
  const qty = spend / s.chiptoPrice;
  s.shells -= spend;
  s.nuts -= CONFIG.chiptoBurnCost;
  s.chiptoHoldings += qty;
  saveGame(s);
}

function sellChipto(pct) {
  const s = STATE;
  if (!s.flags.chiptoLaunched) return;
  const qty = s.chiptoHoldings * (pct / 100);
  if (qty <= 0) return;
  const proceeds = qty * s.chiptoPrice;
  s.chiptoHoldings -= qty;
  s.shells += proceeds;
  s.chiptoSellProceeds += proceeds;
  saveGame(s);
}

function layoffChipmunks(pct) {
  const s = STATE;
  const count = Math.floor(s.chipmunks * (pct / 100));
  if (count <= 0) return;
  s.chipmunks -= count;
  s.chipmunksLaidOff += count;
  s.reputation = Math.max(0, s.reputation - CONFIG.layoffReputationCost * count);
  log(s, `${count} chipmunk${count === 1 ? "" : "s"} let go.`, "info");
  saveGame(s);
}

function bribeCouncilForLand() {
  const s = STATE;
  if (s.forestIndex >= FORESTS.length) return;
  if (s.forestReserves > 0) return; // current forest must be fully cleared first
  if (s.reputation < CONFIG.landGrantReputationCost) return;
  const forest = FORESTS[s.forestIndex];
  s.reputation -= CONFIG.landGrantReputationCost;
  s.councilIncomeTaxRate += CONFIG.councilTaxStep;
  s.forestCap += forest.reserves;
  s.forestReserves += forest.reserves;
  s.forestIndex += 1;
  log(s, `The Council grants you ${forest.name} through a quiet act of "regional development." Their price: a permanent ${Math.round(s.councilIncomeTaxRate * 100)}% cut of every nut you sell from now on.`, "warn");
  saveGame(s);
}

function runSmearCampaign() {
  const s = STATE;
  if (!s.flags.mediaUnlocked) return;
  if (s.reputation >= 100) return;
  if (Date.now() - s.lastSmearAt < CONFIG.smearCampaignCooldownMs) return;
  s.reputation = Math.min(100, s.reputation + CONFIG.smearCampaignGain);
  s.lastSmearAt = Date.now();
  const blurb = SMEAR_BLURBS[Math.floor(Math.random() * SMEAR_BLURBS.length)];
  log(s, blurb, "warn");
  saveGame(s);
}

function buyStock(id, qty) {
  const s = STATE;
  const stock = s.stocks[id];
  if (!stock) return;
  const cost = stock.price * qty;
  if (s.shells < cost) return;
  s.shells -= cost;
  stock.shares += qty;
  saveGame(s);
}

function sellStock(id) {
  const s = STATE;
  const stock = s.stocks[id];
  if (!stock) return;
  const qty = stock.shares; // sells everything held, no partial-quantity tiers
  if (qty <= 0) return;
  const proceeds = stock.price * qty;
  stock.shares -= qty;
  s.shells += proceeds;
  s.stockSellProceeds += proceeds;

  // Insider Trading Restrictions Act: a flat fine, same size no matter how
  // much the trade actually made -- meaningless at this scale, real money
  // to anyone smaller.
  if (s.flags.insiderTrading && proceeds >= CONFIG.insiderTradingFineThreshold) {
    s.shells = Math.max(0, s.shells - CONFIG.insiderTradingFine);
    log(s, `Regulators fine you ${fmt(CONFIG.insiderTradingFine)} shells for insider trading.`, "warn");
  }

  saveGame(s);
}

function updateStockPrices(s) {
  STOCKS.forEach(st => {
    const stock = s.stocks[st.id];
    stock.price = stock.nextPrice;
    stock.nextPrice = rollStockPrice(stock.price);
  });
}

function bribeCouncilkin() {
  const s = STATE;
  if (s.shells >= 0 && s.backpayDebt <= 0) return; // no backpay debt to forgive
  if (s.nuts < CONFIG.councilBribeCost) return;
  s.nuts -= CONFIG.councilBribeCost;
  if (s.shells < 0) s.shells = 0;
  s.backpayDebt = 0;
  s.flags._inBackpayDebt = false;
  s.reputation = Math.max(0, s.reputation - 15);
  log(s, "A councilkin accepts a modest gift of nuts and agrees to lose the paperwork on your backpay debt.", "info");
  saveGame(s);
}

function checkUnlocks() {
  const s = STATE;
  if (s.flags.openMarket) s.unlockedTabs.market = true;
  if (s.flags.unlockWorkforce) s.unlockedTabs.workforce = true;
  if (s.flags.unlockRealty) s.unlockedTabs.realty = true;
  if (s.flags.unlockCorp) s.unlockedTabs.corp = true;
  if (s.flags.wentPublic) s.unlockedTabs.finance = true;
  if (s.flags.chiptoLaunched) s.unlockedTabs.chipto = true;
  // Forests never regrow, so if reserves hit zero the redistricting minigame
  // (in Expansion) needs to be reachable immediately, even before Going
  // Public -- otherwise running dry early would be an unrecoverable dead end.
  if (s.flags.wentPublic || (s.forestReserves <= 0 && !s.flags.redistricted)) {
    s.unlockedTabs.expansion = true;
  }
}

function tick() {
  const now = Date.now();
  const dt = Math.min(2, (now - lastTick) / 1000); // clamp huge gaps (tab backgrounding)
  lastTick = now;
  const s = STATE;
  if (s.ended) return;

  const partyMultiplier = isPistachioPartyActive(s) ? 2 : 1;
  const chipRate = s.chipmunks * CONFIG.chipmunkBaseRate * s.chipmunkMultiplier * partyMultiplier;
  const rigRate = s.rigs * CONFIG.rigBaseRate;
  const autoRate = (chipRate + rigRate) * s.harvestMultiplier;
  const wanted = autoRate * dt;
  const actual = Math.max(0, Math.min(wanted, s.forestReserves));
  s.nuts += actual;
  s.forestReserves = Math.max(0, s.forestReserves - actual); // forests never regrow

  if (s.chipmunks > 0) {
    const salary = s.chipmunks * (chipmunkSalaryPerMin(s) / 60) * dt;
    if (s.forestReserves > 0) {
      s.shells -= salary; // the Council permits backpay debt -- shells can go negative here
    } else {
      s.backpayDebt += salary; // nothing left to harvest -- unpaid, owed as backpay instead
    }
  }

  if (s.unlockedTabs.realty) {
    s.shells += s.rentCapPerSec * (s.rentSeverity / 100) * dt;
  }

  if (s.flags.chiptoLaunched) {
    s.chiptoPrice = Math.max(CONFIG.chiptoMinPrice, s.chiptoPrice * (1 - CONFIG.chiptoDecayPerSec * dt));
  }

  checkRealtyAgent(s, now);

  applyCouncilLaws(s, dt, now);
  checkBackpayDebt(s);

  checkUnlocks();
}

// Shells hover near 0 constantly whenever rent income and salary drain are
// close to balanced, so the backpay warning can't key off the live balance
// directly (>= 0) or it pops the whole row in and out of the DOM several
// times a second. Latch it on entry, and only clear once shells recover past
// a small buffer above zero.
function checkBackpayDebt(s) {
  if (s.shells < 0 || s.backpayDebt > 0) {
    s.flags._inBackpayDebt = true;
  } else if (s.shells >= CONFIG.backpayRecoveryBuffer) {
    s.flags._inBackpayDebt = false;
  }
}

function checkRealtyAgent(s, now) {
  if (!s.flags.realtyAgentUnlocked) return;
  const interval = REALTY_AGENT_INTERVALS[s.realtyAgentInterval];
  if (!interval || interval.ms === null) return; // "Never"
  if (now - s.realtyAgentLastPurchaseAt >= interval.ms) {
    s.realtyAgentLastPurchaseAt = now;
    buyUpgrade("acquireRentalProperty"); // no-op if none are currently available
  }
}

// Owned + available can never exceed CONFIG.propertiesCap -- there are only
// so many burrows in reach, no matter how many times the market gets crashed.
function allPropertiesOwned(s) {
  return (s.upgradeCounts.acquireRentalProperty || 0) >= CONFIG.propertiesCap;
}

function crashMarket() {
  const s = STATE;
  if (!s.unlockedTabs.realty) return;
  const owned = s.upgradeCounts.acquireRentalProperty || 0;
  const room = CONFIG.propertiesCap - owned - s.propertiesAvailable;
  if (room <= 0) {
    log(s, "There are no more available properties. Every rentable burrow in reach has already changed hands.", "warn");
    return;
  }
  if (Date.now() - s.lastCrashMarketAt < CONFIG.crashMarketCooldownMs) return;
  if (s.shells < CONFIG.crashMarketCost) return;
  if (s.reputation < CONFIG.crashMarketReputationCost) return;
  s.shells -= CONFIG.crashMarketCost;
  s.reputation -= CONFIG.crashMarketReputationCost;
  const gain = Math.min(CONFIG.crashMarketGain, room);
  s.propertiesAvailable += gain;
  s.lastCrashMarketAt = Date.now();
  log(s, `You quietly crash the rental market. ${fmt(gain)} more properties suddenly become "available."`, "warn");
  saveGame(s);
}

function fireRealtyAgent() {
  const s = STATE;
  if (!s.flags.realtyAgentUnlocked) return;
  if (!allPropertiesOwned(s)) return;
  s.flags.realtyAgentUnlocked = false;
  s.flags.realtyAgentFired = true; // permanent -- "Hire a Tree Estate Agent" should never reappear after this
  s.realtyAgentInterval = 0; // "Never" -- there's no agent left to set a pace for
  s.propertiesAvailable += 1; // one last burrow turns up now that nobody's watching the market
  log(s, "The Tree Estate Agent is thanked for their service and let go. Funnily enough, one last property turns up on the market the very next day.", "milestone");
  saveGame(s);
}

// Logged once, the moment each law's unlock(s) first turns true, so every
// new law -- present or future -- gets a news update without needing its
// own one-off announce flag and check function.
function checkLawAnnouncements(s) {
  LAWS.forEach(l => {
    const flag = "_lawAnnounced_" + l.id;
    if (l.unlock(s) && !s.flags[flag]) {
      s.flags[flag] = true;
      if (l.announceText) log(s, l.announceText, "warn");
    }
  });
}

function endGame(s, text) {
  s.ended = true;
  s.endingText = text;
  saveGame(s);
  onGameEnded(s);
}

// You eat 1 nut a minute, every minute, from the very start of the game --
// no matter how the rest of the economy is arranged. It has to happen before
// Fair Share Act's Shell Corp workaround (which converts whatever's left
// straight to shells), or there'd be nothing left to eat once evasion kicks
// in. Before redistricting, coming up short only costs Health (it never
// recovers) -- the forest still has more to give, but going hungry too many
// times kills you anyway. After redistricting, there's nothing left to fall
// back on at all, and coming up short ends the game outright.
function eatNut(s) {
  if (s.nuts < 1) {
    if (s.flags.redistricted) {
      endGame(s, "You starved to death.");
    } else {
      s.hungerWarningUntil = Date.now() + 4000;
      s.health = Math.max(0, s.health - 10);
      if (s.health <= 0) {
        endGame(s, "You really should have eaten something.");
      }
    }
    return;
  }
  s.nuts -= 1;
}

function applyCouncilLaws(s, dt, now) {
  checkLawAnnouncements(s);

  LAWS.filter(l => l.kind === "continuous" && l.unlock(s) && !l.countered(s))
    .forEach(l => l.applyContinuous(s, dt));

  const nowMinute = Math.floor(now / 60000);
  if (nowMinute === s.lastCollectionMinute) return;
  s.lastCollectionMinute = nowMinute;
  eatNut(s);
  LAWS.filter(l => l.kind === "minute" && l.unlock(s)).forEach(l => {
    if (l.countered(s)) { if (l.onCountered) l.onCountered(s); }
    else if (l.applyMinute) l.applyMinute(s);
  });
  applyTariff(s);
  applyNutflix(s);
  updateStockPrices(s);
}

function startEngineLoop() {
  setInterval(() => {
    tick();
    renderAll();
  }, CONFIG.tickMs);
  setInterval(() => saveGame(STATE), 10000);
  setInterval(() => maybePostNews(), 45000); // flavor news, ~80% slower than before
}
