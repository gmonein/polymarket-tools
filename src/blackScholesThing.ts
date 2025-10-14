#!/usr/bin/env ts-node
/*
  Polymarket Digital Options Toolkit (TypeScript)
  ------------------------------------------------
  What this CLI does:
  1) Reads a CSV of Polymarket-style binary markets on BTC thresholds ("BTC >= K by expiry").
     CSV columns: strike, yes_price (0..1). Header names are flexible: strike/Strike, yes/Yes/yes_price.
  2) Reconstructs the implied terminal price distribution across listed strikes.
  3) Prices each market as a Black–Scholes digital call and compares with market prices.
  4) Solves implied volatility per strike via bisection from the digital price.
  5) Writes an optional CSV of the results and prints a console table.

  Example CSV (markets.csv):
    strike,yes_price
    60000,0.85
    65000,0.50
    70000,0.20
    75000,0.07

  Usage:
    ts-node polymarket_digital.ts \
      --csv markets.csv \
      --spot 65000 \
      --expiry 2025-10-12T00:00:00Z \
      --now 2025-10-10T12:00:00Z \
      --rate 0.0 \
      --vol 0.60 \
      --out analysis.csv

  Notes:
  - Digital call price under BS: exp(-rT) * N(d2), d2 = [ln(S/K) + (r - 0.5 σ^2)T] / (σ √T)
  - If r ≈ 0, price ≈ risk-neutral probability of finishing ≥ K.
*/

import * as fs from 'fs';
import * as path from 'path';

// ---------------- Types ----------------

type Row = { strike: number; yes: number };

type Options = {
  csvPath: string;
  spot: number;
  expiryISO: string;
  nowISO?: string;
  rate?: number;
  flatVol?: number; // for model comparison
  outCsv?: string;
};

// ---------------- Utilities ----------------

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  const out: Partial<Options> = {};

  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    const val = args[i + 1];
    switch (key) {
      case '--csv':
        out.csvPath = val; i++; break;
      case '--spot':
        out.spot = parseFloat(val); i++; break;
      case '--expiry':
        out.expiryISO = val; i++; break;
      case '--now':
        out.nowISO = val; i++; break;
      case '--rate':
        out.rate = parseFloat(val); i++; break;
      case '--vol':
        out.flatVol = parseFloat(val); i++; break;
      case '--out':
        out.outCsv = val; i++; break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      default:
        // ignore unknowns to be tolerant
        break;
    }
  }

  const missing: string[] = [];
  if (!out.csvPath) missing.push('--csv');
  if (out.spot == null || Number.isNaN(out.spot)) missing.push('--spot');
  if (!out.expiryISO) missing.push('--expiry');
  if (missing.length) {
    console.error(`Missing required options: ${missing.join(', ')}`);
    printHelp();
    process.exit(1);
  }

  return {
    csvPath: out.csvPath!,
    spot: out.spot!,
    expiryISO: out.expiryISO!,
    nowISO: out.nowISO,
    rate: out.rate ?? 0,
    flatVol: out.flatVol,
    outCsv: out.outCsv,
  };
};

const printHelp = () => {
  console.log(`\nUsage: ts-node polymarket_digital.ts --csv markets.csv --spot 65000 --expiry 2025-10-12T00:00:00Z [options]\n\nOptions:\n  --csv PATH        Input CSV with columns: strike,yes_price\n  --spot N          Current BTC spot price (e.g., 65000)\n  --expiry ISO8601  Expiry timestamp (UTC), e.g., 2025-10-12T00:00:00Z\n  --now ISO8601     Valuation time (default: now UTC)\n  --rate R          Risk-free annual rate (e.g., 0.02 for 2%)\n  --vol V           Flat vol guess (e.g., 0.60) for model comparison\n  --out PATH        Optional output CSV for results\n  -h, --help        Show help\n`);
};

const parseCSV = (filePath: string): Row[] => {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) throw new Error('CSV is empty');

  const header = lines[0].split(',').map((h) => h.trim());
  const idxStrike = header.findIndex((h) => /^(strike)$/i.test(h));
  const idxYes = header.findIndex((h) => /^(yes_price|yes)$/i.test(h));
  if (idxStrike === -1 || idxYes === -1) {
    throw new Error('Expected headers: strike, yes_price');
  }

  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < Math.max(idxStrike, idxYes) + 1) continue;
    const strike = parseFloat(cols[idxStrike]);
    const yes = parseFloat(cols[idxYes]);
    if (!Number.isFinite(strike) || !Number.isFinite(yes)) continue;
    rows.push({ strike, yes });
  }
  if (!rows.length) throw new Error('No valid data rows found.');
  return rows;
};

// Time to expiry (ACT/365), clamp to tiny positive
const timeToExpiryYears = (expiryISO: string, nowISO?: string): number => {
  const expiry = new Date(expiryISO).getTime();
  if (Number.isNaN(expiry)) throw new Error('Invalid --expiry timestamp');
  const now = nowISO ? new Date(nowISO).getTime() : Date.now();
  const dtSec = Math.max((expiry - now) / 1000, 0);
  const dtDays = dtSec / 86400;
  return Math.max(dtDays / 365, 1e-8);
};

// Standard normal CDF using erf approximation
const normCdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

// Numerical approximation of erf
const erf = (x: number): number => {
  // Abramowitz-Stegun approximation
  const sign = Math.sign(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * Math.abs(x));
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
};

const d2 = (S: number, K: number, T: number, sigma: number, r: number): number => {
  if (sigma <= 0) return -Infinity;
  const num = Math.log(S / K) + (r - 0.5 * sigma * sigma) * T;
  const den = sigma * Math.sqrt(T);
  return num / den;
};

const digitalCallBS = (S: number, K: number, T: number, sigma: number, r: number): number => {
  return Math.exp(-r * T) * normCdf(d2(S, K, T, sigma, r));
};

// Invert digital price to implied vol via bisection
const impliedVolFromDigital = (
  price: number,
  S: number,
  K: number,
  T: number,
  r: number,
  tol = 1e-7,
  maxIter = 100
): number | null => {
  const upperBound = Math.exp(-r * T);
  if (price <= 0) return 0;
  if (price >= upperBound - 1e-12) return null; // invalid under BS bounds

  let low = 1e-4;
  let high = 5.0; // 500% vol

  const f = (vol: number) => digitalCallBS(S, K, T, vol, r) - price;
  let fLow = f(low);
  let fHigh = f(high);

  // Try expand upper bound
  let expand = 0;
  while (fLow * fHigh > 0 && expand < 50) {
    high *= 2;
    fHigh = f(high);
    expand++;
  }
  if (fLow * fHigh > 0) return null; // no bracket

  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (low + high);
    const fMid = f(mid);
    if (Math.abs(fMid) < tol) return mid;
    if (fLow * fMid < 0) {
      high = mid; fHigh = fMid;
    } else {
      low = mid; fLow = fMid;
    }
  }
  return 0.5 * (low + high);
};

// Reconstruct implied distribution bins from cumulative probs P(S_T ≥ K)
const reconstructBins = (rows: Row[]) => {
  const sorted = [...rows].sort((a, b) => a.strike - b.strike);
  const bins: { range: string; prob: number }[] = [];

  const p0 = sorted[0].yes;
  bins.push({ range: `(-∞, ${sorted[0].strike})`, prob: Math.max(1 - p0, 0) });

  for (let i = 0; i < sorted.length - 1; i++) {
    const pGeI = sorted[i].yes;
    const pGeNext = sorted[i + 1].yes;
    const binProb = Math.max(pGeI - pGeNext, 0);
    bins.push({ range: `[${sorted[i].strike}, ${sorted[i + 1].strike})`, prob: binProb });
  }

  const plast = sorted[sorted.length - 1].yes;
  bins.push({ range: `[${sorted[sorted.length - 1].strike}, ∞)`, prob: Math.max(plast, 0) });

  // Normalize to sum exactly 1
  const total = bins.reduce((s, b) => s + b.prob, 0);
  if (total > 0) bins.forEach((b) => (b.prob = b.prob / total));
  return bins;
};

// Write results CSV
const writeResultsCSV = (
  filePath: string,
  rows: {
    strike: number;
    yes: number;
    binToNext: number;
    modelPrice?: number;
    diff?: number | null;
    impliedVol: number | null;
  }[]
) => {
  const header = ['strike', 'yes_price', 'bin_prob_to_next', 'model_price(flat_vol)', 'diff(yes-model)', 'implied_vol'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      r.strike,
      r.yes.toFixed(6),
      r.binToNext.toFixed(6),
      r.modelPrice == null ? '' : r.modelPrice.toFixed(6),
      r.diff == null ? '' : (r.diff >= 0 ? `+${r.diff.toFixed(6)}` : r.diff.toFixed(6)),
      r.impliedVol == null ? '' : r.impliedVol.toFixed(6),
    ].join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'));
};

// Pretty console print
const printTable = (rows: {
  strike: number; yes: number; binToNext: number; modelPrice?: number; diff?: number | null; impliedVol: number | null;
}[]) => {
  const header = ['Strike', 'Yes(Mkt)', 'Bin→Next', 'Model(Vol)', 'Diff', 'Implied σ'];
  const widths = [10, 10, 10, 12, 10, 10];
  const fmt = (s: string, w: number) => (s + ' '.repeat(w)).slice(0, w);

  console.log('\nPer-strike comparison (market vs BS digital):');
  console.log(header.map((h, i) => fmt(h, widths[i])).join(' | '));
  console.log('-'.repeat(widths.reduce((a, b) => a + b + 3, -3)));

  for (const r of rows) {
    const mp = r.modelPrice == null ? '—' : r.modelPrice.toFixed(4);
    const diff = r.diff == null ? '—' : (r.diff >= 0 ? `+${r.diff.toFixed(4)}` : r.diff.toFixed(4));
    const iv = r.impliedVol == null ? 'n/a' : r.impliedVol.toFixed(4);
    const line = [
      r.strike.toFixed(0),
      r.yes.toFixed(4),
      r.binToNext.toFixed(4),
      mp,
      diff,
      iv,
    ].map((s, i) => fmt(s, widths[i])).join(' | ');
    console.log(line);
  }
};

// ---------------- Main ----------------

(async () => {
  try {
    const opts = parseArgs();
    const rows = parseCSV(path.resolve(opts.csvPath));
    const T = timeToExpiryYears(opts.expiryISO, opts.nowISO);
    const S = opts.spot;
    const r = opts.rate ?? 0;

    console.log('\nInputs:');
    console.log(`  Spot (S):           ${S}`);
    console.log(`  Expiry:             ${new Date(opts.expiryISO).toISOString()}`);
    console.log(`  Now:                ${(opts.nowISO ? new Date(opts.nowISO) : new Date()).toISOString()}`);
    console.log(`  Time to expiry (y): ${T.toFixed(6)}`);
    console.log(`  Risk-free rate:     ${r}`);
    console.log(`  Flat vol guess:     ${opts.flatVol ?? '(none)'}\n`);

    // Implied distribution bins
    const bins = reconstructBins(rows);
    console.log('Reconstructed implied distribution bins:');
    for (const b of bins) {
      console.log(`  ${b.range.padEnd(18)}  prob = ${(b.prob * 100).toFixed(2)}%`);
    }
    const totalProb = bins.reduce((s, b) => s + b.prob, 0);
    console.log(`  Total: ${(totalProb * 100).toFixed(4)}%\n`);

    // Per-strike metrics
    const sorted = [...rows].sort((a, b) => a.strike - b.strike);
    const perRow = sorted.map((row, i) => {
      const binToNext = i < sorted.length - 1 ? row.yes - sorted[i + 1].yes : row.yes;
      const modelPrice = opts.flatVol != null ? digitalCallBS(S, row.strike, T, opts.flatVol, r) : undefined;
      const impliedVol = impliedVolFromDigital(row.yes, S, row.strike, T, r);
      const diff = modelPrice == null ? undefined : row.yes - modelPrice;
      return { strike: row.strike, yes: row.yes, binToNext, modelPrice, diff, impliedVol };
    });

    printTable(perRow);

    if (opts.outCsv) {
      writeResultsCSV(path.resolve(opts.outCsv), perRow);
      console.log(`\nSaved detailed results to ${opts.outCsv}`);
    }

    if (opts.flatVol != null) {
      const rich = perRow.filter((r) => r.modelPrice != null && r.yes > (r.modelPrice! + 1e-6)).map((r) => r.strike);
      const cheap = perRow.filter((r) => r.modelPrice != null && r.yes < (r.modelPrice! - 1e-6)).map((r) => r.strike);
      console.log(`\nSignals vs flat vol ${opts.flatVol}:`);
      console.log(`  Rich (consider selling NO or hedging): ${rich.join(', ') || '—'}`);
      console.log(`  Cheap (consider buying YES):           ${cheap.join(', ') || '—'}`);
    }
  } catch (err: any) {
    console.error('Error:', err?.message || err);
    process.exit(1);
  }
})();
