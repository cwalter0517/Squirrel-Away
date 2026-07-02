/* ==========================================================
   SQUIRRELED AWAY — game state
   ========================================================== */

const SAVE_KEY = "squirreledAway_save_v1";

function newState() {
  return {
    companyName: "a modest woodland enterprise",

    nuts: 0,
    shells: 0,
    harvestMultiplier: 1,

    forestReserves: CONFIG.startForestReserves,
    forestCap: CONFIG.startForestReserves,
    forestIndex: 1, // next forest available to claim in FORESTS array

    reputation: 100,
    health: 100, // never recovers -- each pre-redistricting hunger warning costs 10%, hitting 0 is fatal
    councilIncomeTaxRate: 0, // permanent cut of nut-to-shell conversions, +1% per Council land bribe
    tariffRate: 0,          // player's tariff slider setting (0-100), purely cosmetic until the next minute tick
    tariffEffectiveRate: 0, // the tariff fraction actually being applied to conversions right now

    chipmunks: 0,
    chipmunkMultiplier: 1,
    chipmunkSalaryBonus: 0,
    unionRaiseCount: 0,
    chipmunksLaidOff: 0,
    pistachioPartyUntil: 0,
    backpayDebt: 0, // salary owed but unpaid because there was nothing left to harvest
    rigs: 0,

    rentSeverity: 0,
    rentCapPerSec: CONFIG.rentBaseCapPerSec,
    rentSeverityCap: 100,
    realtyAgentInterval: 0, // index into REALTY_AGENT_INTERVALS, default "Never"
    realtyAgentLastPurchaseAt: 0,
    propertiesAvailable: CONFIG.startPropertiesAvailable,
    lastCrashMarketAt: 0,

    stocks: STOCKS.reduce((acc, st) => {
      acc[st.id] = { price: st.startPrice, nextPrice: rollStockPrice(st.startPrice), shares: 0 };
      return acc;
    }, {}),
    stockSellProceeds: 0,

    chiptoPrice: CONFIG.chiptoStartPrice,
    chiptoHoldings: 0,
    chiptoSellProceeds: 0,
    lastHypeAt: 0,
    hungerWarningUntil: 0, // shown pre-redistricting when there's no nut to eat at the top of the minute

    lastCollectionMinute: Math.floor(Date.now() / 60000),

    upgradeCounts: {},
    flags: {},
    unlockedTabs: { burrow: true, council: true, market: false, workforce: false, corp: false, finance: false, expansion: false, realty: false, chipto: false, media: false },

    ended: false,
    endingText: "",
    logSeq: 0,
    startedAt: Date.now(),
  };
}

function saveGame(s) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage unavailable, ignore */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const loaded = JSON.parse(raw);
    const base = newState();
    return Object.assign(base, loaded, {
      flags: Object.assign({}, loaded.flags),
      unlockedTabs: Object.assign({}, base.unlockedTabs, loaded.unlockedTabs),
      upgradeCounts: Object.assign({}, loaded.upgradeCounts),
    });
  } catch (e) {
    return null;
  }
}

function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  location.reload();
}

function log(s, text, cls) {
  s.logHistory = s.logHistory || [];
  s.logHistory.push({ id: ++s.logSeq, text, cls: cls || "info", t: Date.now() });
  while (s.logHistory.length > CONFIG.logCap) s.logHistory.shift();
  s._logDirty = true;
}
