/* ==========================================================
   SQUIRRELED AWAY — bootstrap
   ========================================================== */

document.addEventListener("DOMContentLoaded", () => {
  initEngine();

  document.querySelectorAll(".tabBtn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  $("forageBtn").addEventListener("click", forage);

  $("sellBtn").addEventListener("click", () => sellNuts(100));

  $("hireBtn").addEventListener("click", hireChipmunk);
  $("deployRigBtn").addEventListener("click", () => deployRigAction(1));
  $("deployRigBtn10").addEventListener("click", () => deployRigAction(10));
  $("deployRigBtn100").addEventListener("click", () => deployRigAction(100));

  const layoffSlider = $("layoffSlider");
  layoffSlider.addEventListener("input", () => { $("layoffPct").textContent = layoffSlider.value + "%"; });
  $("layoffBtn").addEventListener("click", () => layoffChipmunks(Number(layoffSlider.value)));
  $("pistachioBtn").addEventListener("click", startPistachioParty);

  const rentSlider = $("rentSlider");
  rentSlider.addEventListener("input", () => {
    STATE.rentSeverity = Number(rentSlider.value);
    renderRealty();
    saveGame(STATE);
  });

  const realtyAgentSlider = $("realtyAgentSlider");
  realtyAgentSlider.addEventListener("input", () => {
    STATE.realtyAgentInterval = Number(realtyAgentSlider.value);
    $("realtyAgentLabel").textContent = REALTY_AGENT_INTERVALS[STATE.realtyAgentInterval].label;
    saveGame(STATE);
  });
  $("crashMarketBtn").addEventListener("click", crashMarket);
  $("fireAgentBtn").addEventListener("click", fireRealtyAgent);
  $("bribeBtn").addEventListener("click", bribeCouncilkin);
  $("bribeCouncilBtn").addEventListener("click", bribeCouncilForLand);
  $("smearBtn").addEventListener("click", runSmearCampaign);

  const tariffSlider = $("tariffSlider");
  tariffSlider.addEventListener("input", () => {
    // Only sets the pending value -- it does nothing until the next minute tick.
    STATE.tariffRate = Number(tariffSlider.value);
    $("tariffPct").textContent = STATE.tariffRate + "%";
    saveGame(STATE);
  });

  $("hypeBtn").addEventListener("click", hypeChipto);
  const chiptoSlider = $("chiptoSlider");
  chiptoSlider.addEventListener("input", () => { $("chiptoPct").textContent = chiptoSlider.value + "%"; });
  $("buyChiptoBtn").addEventListener("click", () => buyChipto(Number(chiptoSlider.value)));
  $("sellChiptoBtn").addEventListener("click", () => sellChipto(Number(chiptoSlider.value)));

  $("gerryOpenBtn").addEventListener("click", gerryOpen);
  $("gerryCancelBtn").addEventListener("click", gerryClose);
  $("gerryFinalizeBtn").addEventListener("click", gerryFinalize);

  $("devResetBtn").addEventListener("click", () => {
    if (confirm("Reset all progress? This wipes your save and reloads the page.")) resetGame();
  });

  renderAll();
  startEngineLoop();
});
