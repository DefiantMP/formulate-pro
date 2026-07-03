// Exact port of the prototype's calc() logic, unmodified, run against
// the three hardcoded presets to produce golden reference outputs.

function calcFresh({ pot, tMg, tWt, tabs, mags, pvpp }) {
  pot = pot / 100;
  mags = mags / 100;
  pvpp = pvpp / 100;
  const emdex = Math.max(0, 1 - pot - mags - pvpp);
  let res = null;
  if (pot > 0 && tMg > 0 && tWt > 0 && tabs > 0) {
    const blend = tabs * tWt;
    res = {
      mode: 'fresh', pot, tMg, tWt, tabs, blend,
      activeG: blend * pot, emdexG: blend * emdex, pvppG: blend * pvpp, magsG: blend * mags,
      emdexPct: emdex * 100
    };
  }
  return res;
}

function calcRegrindOptA({ aPot, pwd, tMg, tWt }) {
  const effPot = aPot / 100;
  return calcRegrindCore({ effPot, pwd, tMg, tWt });
}

function calcRegrindOptB({ bMg, bWt, pwd, tMg, tWt }) {
  let effPot = 0;
  if (bMg > 0 && bWt > 0) effPot = bMg / (bWt * 1000);
  return calcRegrindCore({ effPot, pwd, tMg, tWt });
}

function calcRegrindCore({ effPot, pwd, tMg, tWt }) {
  let res = null;
  if (effPot > 0 && pwd > 0 && tMg > 0 && tWt > 0) {
    const tabs = Math.floor(pwd * effPot * 1000 / tMg);
    const rgPerTab = tMg / (effPot * 1000);
    const emdexPerTab = tWt - rgPerTab;
    const emdexAdd = Math.max(0, tabs * emdexPerTab);
    const actInOld = pwd * effPot;
    const freshAct = Math.max(0, tabs * tMg / 1000 - actInOld);
    const blend = pwd + freshAct + emdexAdd;
    const actualMg = tabs > 0 ? (actInOld + freshAct) * 1000 / tabs : 0;
    res = { mode: 'regrind', effPot, pwd, tMg, tWt, tabs, blend, freshAct, emdexAdd, actInOld, actualMg };
  }
  return res;
}

function varianceTable(res) {
  const rows = [];
  for (let i = -3; i <= 3; i++) {
    const wt = res.tWt + i * 0.005;
    const mg = res.tWt > 0 ? (wt / res.tWt) * res.tMg : 0;
    rows.push({ weight: +wt.toFixed(3), step: i, potencyMg: +mg.toFixed(3) });
  }
  return rows;
}

const presets = {
  preset0_regrindOptB: calcRegrindOptB({ bMg: 20.1, bWt: 0.270, pwd: 14500, tMg: 35, tWt: 0.800 }),
  preset1_fresh: calcFresh({ pot: 55.5, tMg: 35, tWt: 0.69, tabs: 133623, mags: 2, pvpp: 5 }),
  preset2_regrindOptA: calcRegrindOptA({ aPot: 55.5, pwd: 8000, tMg: 60, tWt: 1.15 }),
};

const output = {};
for (const [name, res] of Object.entries(presets)) {
  output[name] = { ...res, variance: varianceTable(res) };
}

console.log(JSON.stringify(output, null, 2));
