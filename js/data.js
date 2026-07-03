/* ==========================================================
   SQUIRRELED AWAY — game content & tuning data
   All numbers here are a rough first pass, meant to be
   rebalanced once the core loop feels right.
   ========================================================== */

// Tuned for a full arc (Burrow -> ending) in roughly two hours of play,
// not Paperclips' multi-hour scale.
const CONFIG = {
  tickMs: 100,
  startForestReserves: 50000, // forests never regrow -- once it's gone, it's gone (see the redistricting minigame)
  chipmunkHireCost: 50,       // flat one-time signing bonus, doesn't scale with headcount
  chipmunkBaseRate: 1,        // nuts/sec per chipmunk
  chipmunkSalaryPerMin: 10,   // base shells/min per chipmunk, before any union raises
  chipmunkSalaryCap: 200,     // union raises never push salary past this, however they're paced
  unionRaiseAmount: 5,        // salary rises this many flat shells/min at the bottom of every minute (while you have chipmunks)
  unionBustingRaiseAmount: 2, // reduced raise amount per minute once the union-busting counter is bought
  unionizeThreshold: 10,      // chipmunk headcount at which the union law kicks in
  unionBustingSalaryThreshold: 30, // salary/min per chipmunk at which union busting becomes available
  rentCapRaiseStep: 0.10,     // each "raise the rent cap" purchase adds this fraction of 100 (percentage points)
  raiseRentCapCost: 500,      // flat shells cost of each "raise the rent cap" purchase
  startPropertiesAvailable: 25, // rental properties on the market when Treealty unlocks
  crashMarketCost: 2500,      // flat shells cost to crash the market
  crashMarketReputationCost: 10, // reputation cost per crash
  crashMarketGain: 100,       // properties added to the market each time it's crashed
  crashMarketCooldownMs: 60000, // crashing the market is limited to once per minute -- also how long the price dip takes to recover
  rentalPropertyCost: 500,    // normal asking price for a rental property
  crashMarketDipCost: 300,    // price right after a crash, climbing back to the asking price over crashMarketCooldownMs
  propertiesCap: 3000,        // owned + available can never exceed this -- there are only so many burrows
  layoffReputationCost: 2,    // reputation lost each time a chipmunk is laid off and replaced with a Munkbot
  pistachioPartyCostPerChipmunk: 1, // shells per chipmunk to throw a Pistachio Party
  pistachioPartyDurationMs: 60000,  // 1 minute
  rigBaseCost: 800,
  rigBaseRate: 10,            // nuts/sec per Munkbot, no forest regen benefit
  harvesterBanThreshold: 100, // Munkbot count at which the Council bans further purchases
  rentBaseCapPerSec: 3,       // shells/sec at 100% rent severity, before Realty upgrades
  logCap: 10,                 // max entries kept in the news/business log
  councilBribeCost: 300,      // nuts cost to bribe away backpay debt, flat regardless of how deep it is
  backpayRecoveryBuffer: 25,  // shells must recover to this much above 0 before the backpay warning clears, so it doesn't flicker while hovering near zero
  landGrantReputationCost: 25, // reputation cost to bribe the Council for a forest -- the only way to claim one now
  councilTaxStep: 0.01,       // each land bribe adds this much permanent tax on nut-to-shell conversions
  smearCampaignGain: 10,      // reputation gained per smear campaign, capped at 100 -- free to run, no shell cost
  nutflixReputationGain: 5,   // reputation gained per minute once Nutflix is bought, capped at 100
  smearCampaignCooldownMs: 60000, // smear campaigns are limited to once per minute
  chiptoStartPrice: 100,      // shells per Chipto at launch
  chiptoMinPrice: 1,          // decay never pushes the price below this
  chiptoBurnCost: 1000000,    // flat nuts burned (not spent, gone) per Chipto purchase, regardless of size
  chiptoDecayPerSec: 0.003,   // Chipto price decays this fraction per second, always, hype or no hype
  chiptoHypeCost: 200,        // flat shells cost per hype click
  chiptoHypeMultiplier: 10,   // hyping multiplies the current price by this factor
  chiptoHypeCooldownMs: 60000, // hyping is limited to once per minute
  chiptoHypeBanThreshold: 10000, // cumulative shells earned selling Chipto before the Council bans hyping it
  insiderTradingFineThreshold: 10000, // proceeds a single stock sale needs to count as an "insider" trade
  insiderTradingFine: 1000,    // flat shells fine per qualifying trade -- never scales, that's the point
  munkbotCleanupCostPerMin: 20, // nuts/min per Munkbot, drained continuously once the cleanup law is in effect
};

// The world's remaining forests. Index 0 is the squirrel's home
// grove and is owned from the start. Expanding claims the next one.
// Only 5 total (not 7) and much cheaper than the original pass, so the
// endgame arrives well before this turns into a multi-hour grind. There's no
// shell cost anymore -- claiming a forest only costs Reputation, via
// bribeCouncilForLand() -- so no `cost` field here.
const FORESTS = [
  { name: "Old Oak Grove (home)", reserves: CONFIG.startForestReserves },
  { name: "Pinecrest Ridge",       reserves: 100000 },
  { name: "Maple Vale",            reserves: 250000 },
  { name: "Birchwood Commons",     reserves: 1000000 },
  { name: "The Elderwood",         reserves: 2500000 },
];

/* ----------------------------------------------------------
   The Stock Market: 3 stocks whose price re-rolls once a minute
   (same cadence as Council laws / chipmunk unionizing). Each stock
   tracks both its current price and its already-determined
   nextPrice, so the Insider Trading Tip upgrade can just reveal a
   value that's already been decided rather than needing to predict
   anything. Prices move by a flat +/- amount each roll (not a
   percentage), so cheap stocks are hit just as hard as expensive ones.
---------------------------------------------------------- */
const STOCKS = [
  { id: "hth",  name: "Hollow Tree Holdings",       ticker: "HTH",  startPrice: 50 },
  { id: "sqif", name: "Squirrel Index Fund",        ticker: "SQIF", startPrice: 100 },
  { id: "ffnf", name: "Feast or Famine Nut Futures", ticker: "FFNF", startPrice: 20 },
];

// Bulk-buy button tiers per stock. Index 0 (x1) is always available; each
// Trading Seat purchase unlocks the next tier as its own separate button,
// rather than augmenting a single button's quantity.
const STOCK_BUY_TIERS = [1, 10, 100, 1000];

function rollStockPrice(price) {
  const magnitude = 5 + Math.round(Math.random() * 95); // 5..100, same range for every stock
  const sign = Math.random() < 0.5 ? -1 : 1;
  return Math.max(1, price + sign * magnitude);
}

/* ----------------------------------------------------------
   The Squirrel Council: laws that actively work against you, shown
   in their own always-visible Council tab from the start of the
   game. Each law that can be dodged carries its own `counter`: a
   button rendered right on the law's card in the Council tab (not a
   separate upgrade elsewhere), which only appears once the law is
   actually in effect. Laws are never "purchased" -- they just start
   applying once `unlock` is true, and stop applying once `countered`
   is true.
   kind: "minute"     -> applyMinute(s) runs once at the top of every
                         real-world minute (or onCountered(s) instead,
                         if provided, once evaded)
   kind: "continuous" -> applyContinuous(s, dt) runs every tick while
                         active and not countered
   announceText -- logged once, the moment unlock(s) first becomes
                   true, so every new law gets a news update.
   counter: { label, cost, currency, reputationCost, requirement(s),
              effect(s) } -- optional. requirement(s) is an extra gate
              beyond the law being active (e.g. a headcount minimum)
              that must ALSO be true before the button appears.
---------------------------------------------------------- */
const LAWS = [
  {
    id: "fairShareAct",
    name: "The Fair Share Act",
    desc: "At the top of every minute, the Council collects 50% of your current nut hoard for less fortunate squirrels.",
    kind: "minute",
    unlock: s => true, // in effect from the very start of the game
    announceText: "The Squirrel Council enacts the Fair Share Act: half your nut hoard, collected at the top of every minute.",
    countered: s => s.flags.shellCorp,
    applyMinute: s => {
      if (s.nuts <= 0) return;
      const taken = s.nuts * 0.5;
      s.nuts -= taken;
      log(s, `The Council collects its Fair Share: ${fmt(taken)} nuts redistributed to less fortunate squirrels.`, "warn");
    },
    onCountered: s => {
      if (s.nuts <= 0) return;
      const before = s.nuts;
      sellNuts(100);
      log(s, `Just before the collectors arrive, ${fmt(before)} nuts are quietly converted to shells. Nothing left to collect.`, "info");
    },
    counter: {
      label: "Open a Shell Corporation",
      cost: 1500, currency: "shells",
      effect: s => { s.flags.shellCorp = true;
        log(s, "Hollow Tree Holdings quietly opens a subsidiary in a hollow stump. Nuts go in, nothing comes out empty-handed.", "milestone"); }
    }
  },
  {
    id: "oneBurrowLaw",
    name: "One Burrow Per Critter Act",
    desc: "No critter may own more than one burrow.",
    kind: "block", // no periodic effect -- the Treealty tab simply never unlocks until countered
    unlock: s => true, // in effect from the very start of the game
    announceText: "The Squirrel Council enacts the One Burrow Per Critter Act: no critter may own more than one burrow.",
    countered: s => s.flags.unlockRealty,
    counter: {
      label: "Establish Corporate Housing",
      cost: 25000, currency: "shells",
      requirement: s => s.flags.unlockCorp,
      effect: s => { s.flags.unlockRealty = true; s.unlockedTabs.realty = true;
        log(s, "The corporation owns the properties now, not you personally. Loophole located. Landlording begins.", "milestone"); }
    }
  },
  {
    id: "windfallTax",
    name: "Windfall Nut Tax",
    desc: "At the top of every minute, the Council taxes 20% of shells above 2,000.",
    kind: "minute",
    unlock: s => s.flags.openMarket,
    announceText: "The Squirrel Council enacts the Windfall Nut Tax: 20% of shells above 2,000, collected at the top of every minute.",
    countered: s => s.flags.offshoreReincorp,
    applyMinute: s => {
      const excess = Math.max(0, s.shells - 2000);
      if (excess <= 0) return;
      const taken = excess * 0.2;
      s.shells -= taken;
      log(s, `The Council levies a Windfall Nut Tax: ${fmt(taken)} shells collected.`, "warn");
    },
    counter: {
      label: "Reincorporate Offshore",
      cost: 3000, currency: "shells", reputationCost: 10,
      effect: s => { s.flags.offshoreReincorp = true;
        log(s, "Hollow Tree Holdings is now, on paper, a shell nested inside a shell inside a hollow stump offshore.", "warn"); }
    }
  },
  {
    id: "harvesterBan",
    name: "Munkbot Ban Act",
    desc: `Once ${CONFIG.harvesterBanThreshold} Munkbots are deployed, the Council bans purchasing any more.`,
    kind: "block", // no periodic effect -- deployRigAction() checks this directly
    unlock: s => s.rigs >= CONFIG.harvesterBanThreshold,
    announceText: "The Council passes the Munkbot Ban Act. No further Munkbots may be purchased.",
    countered: s => s.flags.harvesterBanRepealed,
    counter: {
      label: "Repeal the Munkbot Ban",
      cost: 40000, currency: "shells", reputationCost: 10,
      effect: s => { s.flags.harvesterBanRepealed = true;
        log(s, "The Munkbot Ban Act is quietly walked back in a late-session amendment nobody reads.", "warn"); }
    }
  },
  {
    id: "chiptoHypeBan",
    name: "Chipto Hype Ban Act",
    desc: "Companies are banned from pushing Chipto.",
    kind: "block", // no periodic effect -- hypeChipto() checks this directly
    unlock: s => s.chiptoSellProceeds >= CONFIG.chiptoHypeBanThreshold,
    announceText: "The Council passes the Chipto Hype Ban Act. Hyping Chipto is now prohibited.",
    countered: s => s.flags.chiptoInfluencersHired,
    counter: {
      label: "Hire Influencers to Hype Chipto",
      cost: 8000, currency: "shells", reputationCost: 15,
      effect: s => { s.flags.chiptoInfluencersHired = true;
        log(s, "A dozen squirrels with large followings post suspiciously similar captions about Chipto.", "warn"); }
    }
  },
  {
    id: "insiderTradingLaw",
    name: "Insider Trading Restrictions Act",
    desc: `You will be fined ${fmt(CONFIG.insiderTradingFine)} shells if caught insider trading.`,
    kind: "event", // no periodic effect -- sellStock() applies the fine directly when it's earned
    unlock: s => s.unlockedTabs.finance,
    announceText: "The Council passes the Insider Trading Restrictions Act. Trades on the Insider Trading Tip now carry a flat fine, once they're big enough to matter.",
    countered: s => false, // never evadable, by design
  },
  {
    id: "munkbotCleanupLaw",
    name: "Munkbot Byproduct Cleanup Act",
    desc: "Munkbot owners are required to clean up harmful byproducts they excrete.",
    kind: "continuous",
    unlock: s => s.flags.munkbotsUnlocked,
    announceText: "The Council passes the Munkbot Byproduct Cleanup Act. Every Munkbot now costs nuts per minute in mandatory cleanup.",
    countered: s => s.flags.munkbotCleanupBribed,
    applyContinuous: (s, dt) => {
      if (s.rigs <= 0) return;
      const cost = CONFIG.munkbotCleanupCostPerMin / 60 * s.rigs * dt;
      s.nuts = Math.max(0, s.nuts - cost);
    },
    counter: {
      label: "Bribe the Council to Ignore Munkbot Waste",
      cost: 3500, currency: "shells", reputationCost: 10,
      effect: s => { s.flags.munkbotCleanupBribed = true;
        log(s, "A councilkin is paid to stop noticing the Munkbot waste. Nobody asks where it goes now.", "warn"); }
    }
  },
  {
    id: "chipmunkUnionLaw",
    name: "Chipmunk Workers Alliance Recognition Act",
    desc: "Once recognized, the union negotiates a raise for all chipmunks at the top of every minute.",
    kind: "minute",
    unlock: s => s.chipmunks >= CONFIG.unionizeThreshold,
    announceText: "The Squirrel Council recognizes the Chipmunk Workers Alliance. Salaries now rise every minute, whether you like it or not.",
    countered: s => s.flags.unionBusted,
    applyMinute: s => {
      if (chipmunkSalaryPerMin(s) >= CONFIG.chipmunkSalaryCap) return;
      s.chipmunkSalaryBonus += CONFIG.unionRaiseAmount;
      s.unionRaiseCount++;
      log(s, `The chipmunks negotiate another raise. Salary is now ${fmt(chipmunkSalaryPerMin(s))} shells/min per chipmunk.`, "warn");
    },
    onCountered: s => {
      if (chipmunkSalaryPerMin(s) >= CONFIG.chipmunkSalaryCap) return;
      s.chipmunkSalaryBonus += CONFIG.unionBustingRaiseAmount;
      s.unionRaiseCount++;
      log(s, `The union pushes for another raise, but the busting campaign holds it down. Salary is now ${fmt(chipmunkSalaryPerMin(s))} shells/min per chipmunk.`, "warn");
    },
    counter: {
      label: "Hire a Union-Busting Consultant",
      cost: 2500, currency: "shells", reputationCost: 15,
      requirement: s => chipmunkSalaryPerMin(s) >= CONFIG.unionBustingSalaryThreshold,
      effect: s => { s.flags.unionBusted = true;
        log(s, "A consultant arrives with a clipboard and a smile. Future raises get considerably smaller.", "warn"); }
    }
  },
];

/* ----------------------------------------------------------
   Upgrades. Each has:
   id, tab, name, desc, repeatable, baseCost (if repeatable, this is
   also the cost every subsequent time -- no exponential scaling;
   growing income is what makes repeat purchases easier, not a
   rising price), cost (flat, if not repeatable),
   visible(state) -> bool   (should it even show up)
   afford(state) -> number  (current cost, for repeatables)
   effect(state)            (mutates state on purchase)
   maxCount (optional)
---------------------------------------------------------- */
const UPGRADES = [

  // ---------------- BURROW ----------------
  {
    id: "sharperClaws", tab: "burrow", name: "Sharper Claws",
    desc: "+1 nut per forage.",
    repeatable: true, baseCost: 10, maxCount: 9, currency: "nuts",
    visible: s => true,
    effect: s => {}
  },
  {
    id: "cheekPouches", tab: "burrow", name: "Bigger Cheek Pouches",
    desc: "Increases the value of each Sharper Claws upgrade.",
    repeatable: true, baseCost: 50, maxCount: 9, currency: "nuts",
    visible: s => true,
    effect: s => {}
  },
  {
    id: "openMarket", tab: "burrow", name: "Open The Market",
    desc: "Discover that other squirrels will trade for your surplus nuts. Unlocks The Market.",
    repeatable: false, cost: 10000, currency: "nuts",
    visible: s => !s.flags.openMarket,
    effect: s => { s.flags.openMarket = true; s.unlockedTabs.market = true;
      log(s, "Word spreads that you're sitting on more nuts than you can eat. A market forms.", "milestone"); }
  },

  // ---------------- MARKET ----------------
  {
    id: "unlockWorkforce", tab: "market", name: "Hire Some Help",
    desc: "You can't gather every nut yourself. Pay them under the stump. Unlocks the Workforce tab.",
    repeatable: false, cost: 5000,
    visible: s => s.flags.openMarket && !s.flags.unlockWorkforce,
    effect: s => { s.flags.unlockWorkforce = true; s.unlockedTabs.workforce = true;
      log(s, "You put out word that you're hiring. A line of chipmunks forms outside your burrow.", "milestone"); }
  },

  // ---------------- WORKFORCE ----------------
  {
    id: "efficiencyTraining", tab: "workforce", name: "Raise Quotas",
    desc: "Chipmunk output +25%. Chipmunks must forage 25% more nuts or be fired.",
    repeatable: true, baseCost: 350, maxCount: 5,
    visible: s => s.flags.unlockWorkforce,
    effect: s => { s.chipmunkMultiplier *= 1.25; }
  },
  {
    id: "pistachioPartyUnlock", tab: "workforce", name: "Host Pistachio Parties",
    desc: "Unlocks the ability to throw a Pistachio Party, doubling chipmunk output for a minute.",
    repeatable: false, cost: 15000,
    visible: s => s.flags.unlockWorkforce && !s.flags.pistachioPartyUnlocked,
    effect: s => { s.flags.pistachioPartyUnlocked = true;
      log(s, "Somebody brings pistachios to the break room. Morale, briefly, is real.", "milestone"); }
  },
  {
    id: "foremanOwl", tab: "workforce", name: "Hire a Foreman Owl",
    desc: "An owl who watches the chipmunks and hoots disapprovingly. Chipmunk output +50%.",
    repeatable: false, cost: 1800,
    visible: s => s.flags.unlockWorkforce && !s.flags.foremanOwl,
    effect: s => { s.flags.foremanOwl = true; s.chipmunkMultiplier *= 1.5;
      log(s, "The Foreman Owl arrives. Productivity improves. Morale, unmeasured.", "info"); }
  },
  {
    id: "unlockMunkbots", tab: "workforce", name: "Unlock Munkbots",
    desc: "Commission the first line of automated harvesting units. Unlocks Munkbot deployment.",
    repeatable: false, cost: 6000,
    visible: s => chipmunkSalaryPerMin(s) >= 50 && !s.flags.munkbotsUnlocked,
    effect: s => { s.flags.munkbotsUnlocked = true;
      log(s, "The first Munkbot rolls off the line. It does not blink.", "milestone"); }
  },
  {
    id: "unlockCorp", tab: "workforce", name: "Incorporate",
    desc: "File the paperwork. Become Hollow Tree Holdings, LLC. Unlocks the Corporation tab.",
    repeatable: false, cost: 4000,
    visible: s => s.flags.unlockWorkforce && !s.flags.unlockCorp,
    effect: s => {
      s.flags.unlockCorp = true; s.unlockedTabs.corp = true;
      s.companyName = "Hollow Tree Holdings, LLC";
      log(s, "You are no longer a squirrel with a burrow. You are a Limited Liability Corporation.", "milestone");
    }
  },

  // ---------------- CORPORATION ----------------
  {
    id: "unlockMedia", tab: "corp", name: "Open a Press Office",
    desc: "Start managing your public image directly. Unlocks the Media tab.",
    repeatable: false, cost: 0,
    visible: s => s.flags.unlockCorp && s.reputation < 100 && !s.flags.mediaUnlocked,
    effect: s => { s.flags.mediaUnlocked = true; s.unlockedTabs.media = true;
      log(s, "A single desk, a single phone, and a squirrel whose entire job is 'perception.'", "milestone"); }
  },
  {
    id: "tariffProgram", tab: "corp", name: "Impose a Nut Tariff",
    desc: "Set a tariff on nut-to-shell conversions. Unlocks a Tariff slider in this tab.",
    repeatable: false, cost: 8647,
    visible: s => s.flags.unlockCorp && s.forestIndex >= 3 && !s.flags.tariffUnlocked,
    effect: s => { s.flags.tariffUnlocked = true;
      log(s, "A Tariff Authority is established. A dial appears on your desk. It seems important.", "milestone"); }
  },
  {
    id: "wentPublic", tab: "corp", name: "Go Public",
    desc: "File the paperwork to take Hollow Tree Holdings public. Unlocks the Stock Market.",
    repeatable: false, cost: 75000, reputationCost: 20,
    visible: s => s.flags.unlockCorp && s.forestIndex >= 4 && !s.flags.wentPublic,
    effect: s => {
      s.flags.wentPublic = true; s.unlockedTabs.finance = true; s.unlockedTabs.expansion = true;
      log(s, "Hollow Tree Holdings rings the opening bell. Shares are now available to any squirrel with shells to spare.", "info");
    }
  },

  // ---------------- MEDIA ----------------
  {
    id: "buyNutflix", tab: "media", name: "Buy Nutflix",
    desc: "Constant propaganda for the forest critters. Reputation +5/min.",
    repeatable: false, cost: 1000000,
    visible: s => s.flags.mediaUnlocked && !s.flags.nutflixUnlocked,
    effect: s => { s.flags.nutflixUnlocked = true;
      log(s, "Hollow Tree Holdings acquires Nutflix. The forest never stops watching now.", "milestone"); }
  },

  // ---------------- FINANCE ----------------
  {
    id: "launchChipto", tab: "finance", name: "Launch Chipto",
    desc: "Create your very own currency, backed by nothing but confidence. Unlocks the Chipto tab.",
    repeatable: false, cost: 5000,
    visible: s => s.stockSellProceeds >= 100000000 && !s.flags.chiptoLaunched,
    effect: s => { s.flags.chiptoLaunched = true; s.unlockedTabs.chipto = true;
      log(s, "Chipto goes live. Whitepaper pending.", "milestone"); }
  },
  {
    id: "payOffCouncil", tab: "finance", name: "Pay Off the Council",
    desc: "A generous 'consulting fee' to the right committee members. Opens doors.",
    repeatable: false, cost: 8000,
    visible: s => !s.flags.councilPaidOff,
    effect: s => { s.flags.councilPaidOff = true;
      log(s, "A briefcase changes hands outside a Council session. Nobody saw anything.", "warn"); }
  },
  {
    id: "insiderTrading", tab: "finance", name: "Insider Trading Tip",
    desc: "A councilkin with a cousin on every board slips you next minute's closing prices.",
    repeatable: false, cost: 5000, reputationCost: 15,
    visible: s => s.flags.councilPaidOff && !s.flags.insiderTrading,
    effect: s => { s.flags.insiderTrading = true;
      log(s, "A folder of suspiciously specific numbers appears on your desk. You did not ask for it.", "warn"); }
  },
  {
    id: "tradingSeat", tab: "finance", name: "Open a Trading Seat",
    desc: "Unlocks the next bulk-buy button on every stock: x10, then x100, then x1000 shares per order.",
    repeatable: true, baseCost: 5000, maxCount: 3,
    visible: s => true,
    effect: s => {}
  },

  // ---------------- REALTY ----------------
  {
    id: "acquireRentalProperty", tab: "realty", name: "Acquire Rental Property",
    desc: "Buy another burrow to rent out. Raises your maximum rent income by 2 shells/sec.",
    repeatable: true,
    // Crashing the market knocks the price down to a temporary discount, which
    // climbs back to the normal asking price over the same window the crash
    // cooldown runs on. Outside of that window (or if the market's never been
    // crashed), it's just the flat asking price.
    customCost: s => {
      const elapsed = Date.now() - s.lastCrashMarketAt;
      if (elapsed >= CONFIG.crashMarketCooldownMs) return CONFIG.rentalPropertyCost;
      const t = elapsed / CONFIG.crashMarketCooldownMs;
      return Math.round(CONFIG.crashMarketDipCost + (CONFIG.rentalPropertyCost - CONFIG.crashMarketDipCost) * t);
    },
    visible: s => s.unlockedTabs.realty,
    soldOut: s => s.propertiesAvailable <= 0,
    soldOutLabel: "No Properties Available",
    effect: s => { s.rentCapPerSec += 2; s.propertiesAvailable = Math.max(0, s.propertiesAvailable - 1); }
  },
  {
    id: "raiseRentCap", tab: "realty", name: "Squeeze the Renters Harder",
    desc: `Raise the maximum rent severity by ${Math.round(CONFIG.rentCapRaiseStep * 100)} percentage points, past what should be possible.`,
    repeatable: true, baseCost: CONFIG.raiseRentCapCost,
    visible: s => (s.upgradeCounts.raiseRentCap || 0) < s.unionRaiseCount,
    effect: s => { s.rentSeverityCap += CONFIG.rentCapRaiseStep * 100; }
  },
  {
    id: "realtyAgent", tab: "realty", name: "Hire a Tree Estate Agent",
    desc: "An agent who automatically buys up rental property on your behalf, at whatever pace you set.",
    repeatable: false, cost: 4000,
    visible: s => !s.flags.realtyAgentUnlocked && !s.flags.realtyAgentFired,
    effect: s => { s.flags.realtyAgentUnlocked = true;
      log(s, "A tree estate agent moves into the corner office. Business cards printed same day.", "milestone"); }
  },
];

/* Options for the Tree Estate Agent's auto-purchase slider. Index into this
   array is stored in state as realtyAgentInterval. ms: null means never buy. */
const REALTY_AGENT_INTERVALS = [
  { label: "Never", ms: null },
  { label: "Every 60s", ms: 60000 },
  { label: "Every 45s", ms: 45000 },
  { label: "Every 30s", ms: 30000 },
  { label: "Every 15s", ms: 15000 },
  { label: "Every 10s", ms: 10000 },
  { label: "Every 5s", ms: 5000 },
  { label: "Every 1s", ms: 1000 },
];

/* Logged when a smear campaign is run, one picked at random each time. */
const SMEAR_BLURBS = [
  "A rival squirrel's name is dragged through three separate op-eds you definitely did not write.",
  "An anonymous source 'reveals' a rival hoarded acorns during the great frost. The source is you.",
  "A op-ed titled 'Can We Really Trust That Squirrel?' runs in three different papers, word for word.",
  "A rival's decade-old nut-trading scandal resurfaces, right on schedule.",
  "Grainy footage surfaces of a rival 'stealing' nuts that were, legally speaking, already yours.",
  "A think tank funded by nobody in particular questions a rival's 'commitment to the forest.'",
  "A rival squirrel is quoted 'admitting' something they never said, in an interview that never happened.",
  "Local paper runs a flattering profile of you, right next to an unflattering one of everybody else.",
  "A hashtag trends briefly among squirrels who may or may not exist.",
  "A rival's charity drive is quietly recast as a 'PR stunt' by three op-eds sharing a suspiciously similar font.",
];

/* Random news ticker lines, chosen based on current state. */
const NEWS_POOL = [
  { text: "Local squirrel spotted burying a suspicious quantity of acorns.", cond: s => s.nuts > 20 },
  { text: "Meteorologists note this winter looks 'about the same as every other winter.'", cond: s => true },
  { text: "\"Just a hobby,\" says squirrel with 40 hired chipmunks.", cond: s => s.chipmunks > 20 },
  { text: "Chipmunk Workers Alliance requests dental coverage. Request 'under review.'", cond: s => s.chipmunks > 10 },
  { text: "Forest Council Approval Rating slips to " + "record lows.", cond: s => s.reputation < 60 },
  { text: "Economists warn infinite nuts on a finite forest is 'mathematically concerning.' Markets shrug.", cond: s => s.forestReserves < s.forestCap * 0.3 },
  { text: "Munkbots report 100% satisfaction. Munkbots cannot report dissatisfaction.", cond: s => s.rigs > 5 },
  { text: "Debate club of owls debates whether a squirrel can, in fact, own a forest.", cond: s => s.forestIndex > 1 },
  { text: "Analysts project the hoard will reach 'more nuts than physically exist' by next spring.", cond: s => s.nuts > 1e6 },
  { text: "Squirrel-run news outlet (owned by Hollow Tree Holdings) declares squirrel 'Business Squirrel of the Year.'", cond: s => s.flags.unlockCorp },
  { text: "Renters Association files a strongly-worded, ultimately toothless complaint about rent hikes.", cond: s => s.rentSeverity >= 50 },
  { text: "Squirrel Renters United stages a small, symbolic protest outside a Hollow Tree Holdings property.", cond: s => s.rentSeverity >= 80 },
  { text: "Local editorial asks: 'Is 100% rent severity technically legal? Our lawyers say yes.'", cond: s => s.rentSeverity >= 100 },
  { text: "Several chipmunks are seen studying a Munkbot with quiet unease.", cond: s => s.flags.munkbotsUnlocked && s.rigs === 0 },
  { text: "Chipmunk Workers Alliance membership mysteriously shrinks as Munkbots move in.", cond: s => s.rigs > 10 },
  { text: "Local paper reports Hollow Tree Holdings hasn't made payroll in weeks. Sources say the chipmunks 'understand.'", cond: s => s.shells < 0 },
  { text: "The old chipmunk break room has been converted into Munkbot storage.", cond: s => s.chipmunksLaidOff >= 5 },
  { text: "Chipmunk Workers Alliance wins a historic wage increase. Management calls it 'regrettable.'", cond: s => s.unionRaiseCount > 0 },
  { text: "Regulators note an unusual pattern of well-timed trades from a single squirrel account. Case closed, insufficient evidence.", cond: s => s.flags.insiderTrading },
  { text: "Financial columnist admits she has 'no idea' why Feast or Famine Nut Futures moves the way it does.", cond: s => (s.stocks.ffnf && s.stocks.ffnf.shares > 0) },
  { text: "Squirrel Business Journal calls the new Munkbot Ban Act either 'long overdue' or 'a job-killing overreach,' depending which paper you read.", cond: s => s.rigs >= CONFIG.harvesterBanThreshold },
  { text: "Rumor has it a very large campaign contribution preceded the sudden repeal of the Munkbot Ban.", cond: s => s.flags.harvesterBanRepealed },
  { text: "Chipto whitepaper cites 'blockchain' four times and 'nuts' zero times.", cond: s => s.flags.chiptoLaunched },
  { text: "Financial advisors unanimously agree Chipto is either the future of currency or a total scam. Consensus proves elusive.", cond: s => s.flags.chiptoLaunched },
  { text: "Council passes the Chipto Hype Ban Act, citing 'a small number' of squirrels who lost their winter stash.", cond: s => s.chiptoSellProceeds >= CONFIG.chiptoHypeBanThreshold },
  { text: "Sponsored post: 'I don't usually talk about currency, but Chipto changed my life.' — an influencer, hyping Chipto.", cond: s => s.flags.chiptoInfluencersHired },
  { text: "Local news declares squirrel 'an inspiration to us all.' Local news is, incidentally, squirrel-run.", cond: s => s.flags.mediaUnlocked },
  { text: "Op-ed: 'Have We Been Too Hard On Hollow Tree Holdings?' Author bio omits their consulting fee.", cond: s => s.flags.mediaUnlocked },
  { text: "Poll finds 8 out of 10 squirrels agree you're doing 'great, probably.' The other 2 were unavailable for comment.", cond: s => s.flags.mediaUnlocked },
  { text: "Squirrel named 'Woodland Businessperson of the Century' by an award show squirrel personally funds.", cond: s => s.flags.mediaUnlocked },
  { text: "A glowing profile runs in three papers simultaneously, word for word.", cond: s => s.flags.mediaUnlocked },
];

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return "0";
  const abs = Math.abs(n);
  if (abs < 1e6) return Math.round(n).toLocaleString(); // full whole number up through the hundred-thousands
  const units = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp"];
  let u = 0, v = n;
  while (Math.abs(v) >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  return v.toFixed(2) + units[u]; // once abbreviated, keep 2 decimals so it's not misleadingly vague
}
