/* ==========================================================
   SQUIRRELED AWAY — "Redistrict the Forest" minigame
   A one-time gerrymandering puzzle, available only once forest
   reserves hit zero: divide a grid of trees into equal-size,
   contiguous districts. Solving it (regardless of how skewed
   District 1's take is) grants a huge one-time reserves windfall --
   this is the emergency fix for a resource crisis, not a bonus to
   optimize, and forests never regrow on their own otherwise.
   The best trees are innately clustered along one winding, irregular
   chain near the center of the grid -- the puzzle is deciding
   whether to carve District 1 around that chain, or build the other
   five districts around it instead.
   ========================================================== */

const GERRY_GRID_SIZE = 6;      // 6x6 grid
const GERRY_NUM_DISTRICTS = 6;  // must evenly divide GERRY_GRID_SIZE^2
const GERRY_DISTRICT_SIZE = (GERRY_GRID_SIZE * GERRY_GRID_SIZE) / GERRY_NUM_DISTRICTS;
const GERRY_RESERVE_GRANT = 20000000; // flat reserves windfall on completion, regardless of skew
const GERRY_DISTRICT_COLORS = ["#c1541c", "#4b6b2f", "#3f6b8c", "#8c3a6b", "#b8860b", "#5d4037"];
// Districts are drawn along species lines, not neutral numbers -- district 1
// (yours) is always Gray Squirrel territory, the other five are whichever
// species end up packed or cracked by however the grid gets carved.
const GERRY_SPECIES = ["Gray Squirrel", "Fox Squirrel", "Red Squirrel", "Flying Squirrel", "Ground Squirrel", "Chipmunks"];

let gerry = null; // { cells: [{value, tier, district}], activeBrush }

// A winding, irregular chain of exactly GERRY_DISTRICT_SIZE contiguous cells,
// starting near the center of the grid -- a randomized self-avoiding walk,
// backtracking on dead ends, rather than a clean rectangle.
function gerryCenterIndices() {
  const size = GERRY_GRID_SIZE;
  const target = GERRY_DISTRICT_SIZE;

  function neighborsOf(idx) {
    const row = Math.floor(idx / size), col = idx % size;
    const list = [];
    if (row > 0) list.push(idx - size);
    if (row < size - 1) list.push(idx + size);
    if (col > 0) list.push(idx - 1);
    if (col < size - 1) list.push(idx + 1);
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function walk(path, visited) {
    if (path.length === target) return path.slice();
    const last = path[path.length - 1];
    for (const n of neighborsOf(last)) {
      if (visited.has(n)) continue;
      visited.add(n);
      path.push(n);
      const result = walk(path, visited);
      if (result) return result;
      path.pop();
      visited.delete(n);
    }
    return null;
  }

  const midLow = Math.floor(size / 2) - 1, midHigh = Math.floor(size / 2);
  const centerStarts = [];
  for (const r of [midLow, midHigh]) for (const c of [midLow, midHigh]) centerStarts.push(r * size + c);
  const start = centerStarts[Math.floor(Math.random() * centerStarts.length)];

  return walk([start], new Set([start])) || [start];
}

function gerryGenerateCells() {
  const n = GERRY_GRID_SIZE * GERRY_GRID_SIZE;
  const cells = new Array(n);

  // Values are in millions of nuts -- scaled down from the old unitless
  // numbers so "15M" reads sensibly instead of implying a nonsense hoard.
  const centerIdxs = gerryCenterIndices();
  centerIdxs.forEach(i => {
    cells[i] = { value: 15 + Math.round(Math.random() * 5), tier: "Ancient Growth", district: null };
  });

  const centerSet = new Set(centerIdxs);
  const remainingIdxs = [];
  for (let i = 0; i < n; i++) if (!centerSet.has(i)) remainingIdxs.push(i);

  const matureCount = Math.round(remainingIdxs.length * 0.4);
  const pool = remainingIdxs.map((_, k) => k < matureCount
    ? { value: 6 + Math.round(Math.random() * 4), tier: "Mature Oak" }
    : { value: 1 + Math.round(Math.random() * 3), tier: "Sapling" });

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
  }

  remainingIdxs.forEach((idx, k) => {
    cells[idx] = { value: pool[k].value, tier: pool[k].tier, district: null };
  });

  return cells;
}

function gerryOpen() {
  gerry = { cells: gerryGenerateCells(), activeBrush: 1 };
  $("gerryScreen").classList.remove("hidden");
  gerryRenderBrushes();
  gerryRenderGrid();
  gerryRenderStatus();
}

function gerryClose() {
  $("gerryScreen").classList.add("hidden");
  gerry = null;
}

function gerrySetBrush(d) {
  gerry.activeBrush = d;
  gerryRenderBrushes();
}

function gerryPaint(idx) {
  gerry.cells[idx].district = gerry.activeBrush;
  gerryRenderGrid();
  gerryRenderStatus();
}

function gerryDistrictCells(d) {
  return gerry.cells.filter(c => c.district === d);
}

function gerryIsContiguous(d) {
  const size = GERRY_GRID_SIZE;
  const idxs = [];
  gerry.cells.forEach((c, i) => { if (c.district === d) idxs.push(i); });
  if (idxs.length === 0) return true;
  const set = new Set(idxs);
  const seen = new Set([idxs[0]]);
  const stack = [idxs[0]];
  while (stack.length) {
    const i = stack.pop();
    const row = Math.floor(i / size), col = i % size;
    const neighbors = [];
    if (row > 0) neighbors.push(i - size);
    if (row < size - 1) neighbors.push(i + size);
    if (col > 0) neighbors.push(i - 1);
    if (col < size - 1) neighbors.push(i + 1);
    neighbors.forEach(n => { if (set.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } });
  }
  return seen.size === idxs.length;
}

function gerryValidity() {
  const counts = {};
  for (let d = 1; d <= GERRY_NUM_DISTRICTS; d++) counts[d] = 0;
  let unassigned = 0;
  gerry.cells.forEach(c => { if (c.district) counts[c.district]++; else unassigned++; });
  const perDistrict = {};
  for (let d = 1; d <= GERRY_NUM_DISTRICTS; d++) {
    perDistrict[d] = counts[d] === GERRY_DISTRICT_SIZE && gerryIsContiguous(d);
  }
  const allValid = unassigned === 0 && Object.keys(perDistrict).every(d => perDistrict[d]);
  return { counts, perDistrict, unassigned, allValid };
}

function gerryRenderBrushes() {
  const wrap = $("gerryBrushes");
  wrap.innerHTML = "";
  for (let d = 1; d <= GERRY_NUM_DISTRICTS; d++) {
    const btn = document.createElement("button");
    btn.textContent = d === 1 ? `${GERRY_SPECIES[0]} (Yours)` : GERRY_SPECIES[d - 1];
    btn.style.background = GERRY_DISTRICT_COLORS[d - 1];
    btn.className = "gerryBrushBtn" + (gerry.activeBrush === d ? " active" : "");
    btn.addEventListener("click", () => gerrySetBrush(d));
    wrap.appendChild(btn);
  }
}

function gerryRenderGrid() {
  const grid = $("gerryGrid");
  grid.innerHTML = "";
  gerry.cells.forEach((c, i) => {
    const cell = document.createElement("div");
    cell.className = "gerryCell";
    if (c.district) {
      cell.style.borderColor = GERRY_DISTRICT_COLORS[c.district - 1];
      cell.style.background = GERRY_DISTRICT_COLORS[c.district - 1] + "33";
    }
    cell.innerHTML = `<div class="gerryTier">${c.tier}</div><div class="gerryValue">${c.value}M nuts</div>`;
    cell.addEventListener("click", () => gerryPaint(i));
    grid.appendChild(cell);
  });
}

function gerryRenderStatus() {
  const v = gerryValidity();
  const status = $("gerryStatusList");
  status.innerHTML = "";
  for (let d = 1; d <= GERRY_NUM_DISTRICTS; d++) {
    const ok = v.perDistrict[d];
    const div = document.createElement("div");
    const label = ok ? " ✓" : (v.counts[d] === GERRY_DISTRICT_SIZE ? " (not contiguous)" : "");
    div.textContent = `${GERRY_SPECIES[d - 1]}: ${v.counts[d]}/${GERRY_DISTRICT_SIZE} cells${label}`;
    div.style.color = ok ? "#4b6b2f" : "#8c1f1f";
    status.appendChild(div);
  }
  const yourValue = gerryDistrictCells(1).reduce((a, c) => a + c.value, 0);
  $("gerryYourValue").textContent = fmt(yourValue) + "M nuts";
  $("gerryFinalizeBtn").disabled = !v.allValid;
}

function gerryFinalize() {
  const v = gerryValidity();
  if (!v.allValid) return;
  const yourValue = gerryDistrictCells(1).reduce((a, c) => a + c.value, 0);
  const avgValue = gerry.cells.reduce((a, c) => a + c.value, 0) / GERRY_NUM_DISTRICTS;
  const gain = GERRY_RESERVE_GRANT;
  STATE.forestReserves += gain;
  STATE.forestCap += gain;
  STATE.flags.redistricted = true;
  const skew = yourValue / avgValue;
  const comment = skew > 1.4
    ? "Gray Squirrel territory's borders bear a striking resemblance to a salamander. The Council calls it 'compact enough.' Nobody asks who got packed into what's left."
    : "The districting is, the Council notes, \"basically fine, probably,\" and certainly not a question of which species ended up where.";
  log(STATE, `Redistricting finalized along species lines. Gray Squirrel territory captured ${fmt(yourValue)}M nuts in trees. In the chaos of the new district lines, ${fmt(gain)} forest reserves turn out to be newly "discoverable." ${comment}`, "milestone");
  saveGame(STATE);
  gerryClose();
  renderAll();
}
