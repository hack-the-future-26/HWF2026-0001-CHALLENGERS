/**
 * severityEngine.js
 * ------------------
 * Lightweight, dependency-free "AI" severity classification engine.
 *
 * This uses weighted keyword/phrase scoring + vulnerability detection to
 * simulate an AI triage system, similar to how real disaster-response NLP
 * classifiers bootstrap before a full ML model is trained on labelled data.
 *
 * DROP-IN UPGRADE PATH:
 * If you have an ANTHROPIC_API_KEY, set USE_LLM=true in .env and the engine
 * will call Claude to classify severity + extract structured info instead
 * (see classifyWithLLM below). This keeps the app fully functional offline,
 * while giving you a one-line upgrade to real LLM reasoning for a demo.
 */

const CRITICAL_TERMS = [
  "cannot walk", "can't walk", "unconscious", "not breathing", "drowning",
  "trapped", "collapsed", "building collapse", "bleeding heavily",
  "heart attack", "no pulse", "fire spreading", "child missing",
  "buried", "electrocuted", "stuck under", "going into labour",
  "in labor", "severe injury", "life threatening"
];

const HIGH_TERMS = [
  "water entered", "water has entered", "water is entering", "flooding", "flood", "injured", "injury", "fire",
  "smoke", "gas leak", "landslide", "cyclone", "storm surge",
  "roof collapsed", "wall collapsed", "cut off", "stranded",
  "high fever", "chest pain", "difficulty breathing", "asthma attack",
  "snake bite", "electric wire", "power line down"
];

const MEDIUM_TERMS = [
  "no electricity", "no power", "no water supply", "road blocked",
  "tree fallen", "minor injury", "scared", "leaking", "waterlogged",
  "need supplies", "need food", "need water", "shelter needed",
  "signal weak", "network down"
];

const VULNERABLE_TERMS = [
  "grandmother", "grandfather", "elderly", "old age", "disabled",
  "wheelchair", "pregnant", "infant", "newborn", "baby", "child",
  "children", "kids", "blind", "deaf", "patient", "diabetic",
  "cannot walk", "can't walk", "bedridden"
];

const DISASTER_TYPES = {
  flood: ["flood", "water entered", "water has entered", "water is entering", "waterlogged", "drowning", "rising water", "water level"],
  fire: ["fire", "smoke", "burning", "flame"],
  earthquake: ["earthquake", "tremor", "building collapse", "collapsed", "shaking"],
  cyclone: ["cyclone", "storm", "wind", "storm surge", "hurricane"],
  medical: ["heart attack", "unconscious", "bleeding", "labour", "labor", "injury", "injured", "chest pain", "snake bite"],
  landslide: ["landslide", "mudslide", "slope collapse"],
  other: []
};

function countMatches(text, terms) {
  let count = 0;
  const found = [];
  for (const term of terms) {
    if (text.includes(term)) {
      count += 1;
      found.push(term);
    }
  }
  return { count, found };
}

function detectDisasterType(text) {
  // Extra heuristic: "water" + a verb like enter/rise/flood covers phrasing
  // the fixed phrase list might miss (e.g. "water has entered my house").
  if (text.includes("water") && /(enter|rising|risen|rise|flood|level)/.test(text)) {
    return "flood";
  }
  for (const [type, terms] of Object.entries(DISASTER_TYPES)) {
    if (terms.some((t) => text.includes(t))) return type;
  }
  return "general";
}

const VALID_EMERGENCY_TYPES = ["flood", "cyclone", "fire", "earthquake", "medical", "landslide", "other"];

/**
 * Rule-based classifier (default, works fully offline).
 * @param {string} rawText - the citizen's free-text description
 * @param {string} [emergencyTypeHint] - optional explicit type from the UI's
 *   quick-select chips (flood/cyclone/fire/earthquake/medical/landslide/other).
 *   When present, it overrides the guessed disasterType and adds a small
 *   confidence boost to the score, since an explicit selection is a stronger
 *   signal than free-text keyword matching alone.
 * Returns { score (0-10), level, disasterType, vulnerablePeople, matchedTerms }
 */
function classifyRuleBased(rawText, emergencyTypeHint) {
  const text = (rawText || "").toLowerCase();

  const critical = countMatches(text, CRITICAL_TERMS);
  const high = countMatches(text, HIGH_TERMS);
  const medium = countMatches(text, MEDIUM_TERMS);
  const vulnerable = countMatches(text, VULNERABLE_TERMS);

  let score = 0;
  score += critical.count * 4;
  score += high.count * 2;
  score += medium.count * 1;
  score += vulnerable.count * 1.5;

  const hasValidHint = VALID_EMERGENCY_TYPES.includes(emergencyTypeHint) && emergencyTypeHint !== "other";
  if (hasValidHint) {
    // An explicit selection is a confirmed signal, similar in strength to a
    // matched high-severity keyword - nudge the score up accordingly.
    score += 2;
  }

  // Base score so any report gets *some* triage weight
  if (score === 0 && text.trim().length > 0) score = 1;

  score = Math.min(10, Math.round(score * 10) / 10);

  let level = "Low";
  if (score >= 7) level = "Critical";
  else if (score >= 4.5) level = "High";
  else if (score >= 2) level = "Medium";

  return {
    score,
    level,
    disasterType: hasValidHint ? emergencyTypeHint : detectDisasterType(text),
    vulnerablePeople: vulnerable.found,
    matchedTerms: [...critical.found, ...high.found, ...medium.found],
  };
}

/**
 * Optional LLM-based classifier using the Anthropic API.
 * Only used if process.env.USE_LLM === 'true' and ANTHROPIC_API_KEY is set.
 */
async function classifyWithLLM(rawText, emergencyTypeHint) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return classifyRuleBased(rawText, emergencyTypeHint);

  try {
    const fetchFn = global.fetch || (await import("node-fetch")).default;
    const hintLine = emergencyTypeHint && emergencyTypeHint !== "other"
      ? `\nThe reporter explicitly tagged this as: ${emergencyTypeHint}. Trust this unless the text clearly contradicts it.`
      : "";
    const resp = await fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: `You are an emergency triage classifier. Given the following emergency report text, respond ONLY with strict JSON (no markdown, no prose) in this exact shape:
{"score": <0-10 number>, "level": "Low|Medium|High|Critical", "disasterType": "flood|fire|earthquake|cyclone|medical|landslide|general", "vulnerablePeople": [<short strings>], "matchedTerms": [<short strings>]}
${hintLine}
Report: """${rawText}"""`,
          },
        ],
      }),
    });
    const data = await resp.json();
    const text = data.content?.map((c) => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return parsed;
  } catch (err) {
    console.error("LLM classification failed, falling back to rule-based:", err.message);
    return classifyRuleBased(rawText, emergencyTypeHint);
  }
}

async function classifySeverity(rawText, emergencyTypeHint) {
  if (process.env.USE_LLM === "true") {
    return classifyWithLLM(rawText, emergencyTypeHint);
  }
  return classifyRuleBased(rawText, emergencyTypeHint);
}

module.exports = { classifySeverity, classifyRuleBased };
