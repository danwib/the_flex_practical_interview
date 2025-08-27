// scripts/generate-mock.js
// Generate realistic Hostaway-like reviews JSON → data/mock-reviews.json
// Deterministic (seeded) so you can regenerate identical data.

const fs = require('fs');
const path = require('path');

// --- deterministic RNG ---
let seed = 42;
function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function randint(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }

// --- config ---
const listings = [
  "2B N1 A - 29 Shoreditch Heights",
  "1BR Deluxe - Waterloo Arch 191",
  "Studio - Canary Wharf Dockside",
  "2BR - King’s Cross St Pancras",
  "Penthouse - Southbank Riverside"
];

const guests = [
  "Shane Finkelstein","Amara Singh","Lucas Nguyen","Emma Johnson","Mateo Rossi","Sofia Chen",
  "Oliver Brown","Ava Thompson","Noah Wilson","Mia Garcia","Leo Dupont","Isla Murphy"
];

const phrasesPos = [
  "Wonderful stay, would definitely return.",
  "Spotlessly clean and great communication.",
  "Excellent location and easy check-in.",
  "Exactly as described; highly recommend.",
  "Comfortable and quiet, perfect for work."
];
const phrasesNeu = [
  "Overall good, a couple of minor issues.",
  "As expected for the price.",
  "Decent place, could improve instructions.",
  "Fine for a short stay."
];
const phrasesNeg = [
  "Had some issues with noise at night.",
  "Check-in was confusing, took longer than expected.",
  "Cleanliness could be improved.",
  "Not as quiet as advertised."
];

const categories = [
  "cleanliness","communication","respect_house_rules","check_in","accuracy","location","value"
];

// Recent 18 months
function randomDate() {
  const now = new Date();
  const monthsBack = randint(0, 17);
  const d = new Date(now);
  d.setMonth(d.getMonth() - monthsBack);
  d.setDate(randint(1, 28));
  d.setHours(randint(8, 22), randint(0, 59), randint(0, 59));
  // hostaway-ish "YYYY-MM-DD HH:mm:ss"
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function reviewText(score) {
  if (score >= 9) return pick(phrasesPos);
  if (score >= 7) return pick(phrasesNeu);
  return pick(phrasesNeg);
}

function makeReview(id) {
  const listingName = pick(listings);
  const guestName = pick(guests);
  // Generate category ratings out of 10 (integers, with some nulls)
  const reviewCategory = categories.map(cat => {
    // 10% chance null to simulate missing
    const r = rnd() < 0.10 ? null : randint(6, 10);
    return { category: cat, rating: r };
  });

  // Optional overall rating: null 30% of time
  const presentRatings = reviewCategory.map(c => c.rating).filter(r => r !== null);
  const avg = presentRatings.length ? Math.round(presentRatings.reduce((a,b)=>a+b,0)/presentRatings.length) : null;
  const rating = rnd() < 0.30 ? null : avg;

  const text = reviewText(avg ?? 7);

  return {
    id,
    type: rnd() < 0.85 ? "guest-to-host" : "host-to-guest",
    status: "published",
    rating,
    publicReview: text,
    reviewCategory,
    submittedAt: randomDate(),
    guestName,
    listingName
  };
}

function generate(n = 60) {
  const result = Array.from({ length: n }, (_, i) => makeReview(7000 + i));
  const payload = { status: "success", result };
  const outPath = path.join(process.cwd(), 'data', 'mock-reviews.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
  console.log(`Wrote ${result.length} reviews → ${outPath}`);
}

generate(60);
