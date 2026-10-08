// Content-based mentor recommender.
//
// For the current user it scores every other user on:
//   coverage    (70%)  how well their skills cover what I want to learn
//                      (fuzzy name match x their proficiency x my goal priority)
//   reciprocity (20%)  do they want to learn something I can teach? (a true skill *exchange*)
//   reputation  (10%)  Bayesian-smoothed review rating, so one 5-star review can't beat 40 good ones
// and returns human-readable reasons so the UI can explain every match.
//
// Pure functions only (no DB access) so it is easy to unit test; the route does the querying.
const { skillName, normalizeName } = require('../utils/skills');

const PRIORITY_WEIGHT = { High: 1, Medium: 0.7, Low: 0.4 };
const PROFICIENCY_FACTOR = { Beginner: 0.6, Intermediate: 0.85, Advanced: 1 };
const LEVEL_RANK = { Beginner: 1, Intermediate: 2, Advanced: 3 };

const tokens = (s) => new Set(normalizeName(s).split(/[\s/-]+/).filter(Boolean));

const bigrams = (s) => {
  const t = normalizeName(s).replace(/\s+/g, '');
  const out = new Map();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) || 0) + 1);
  }
  return out;
};

const dice = (a, b) => {
  const A = bigrams(a); const B = bigrams(b);
  let inter = 0; let total = 0;
  A.forEach((c) => { total += c; });
  B.forEach((c) => { total += c; });
  A.forEach((c, g) => { if (B.has(g)) inter += Math.min(c, B.get(g)); });
  return total ? (2 * inter) / total : 0;
};

// 0..1 similarity between two skill names ("React" ~ "reactjs" = 1, "React" ~ "React Native" ~ 0.7)
const nameSimilarity = (a, b) => {
  const na = normalizeName(a); const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = tokens(a); const tb = tokens(b);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const jaccard = inter / new Set([...ta, ...tb]).size;
  const contained = inter > 0 && (inter === ta.size || inter === tb.size) ? 0.7 : 0;
  const typo = dice(a, b);
  return Math.max(jaccard, contained, typo >= 0.8 ? typo * 0.9 : 0);
};

const MATCH_THRESHOLD = 0.6;

const asObj = (item) => (typeof item === 'string' ? { name: item } : item || {});

const bayesianRating = (avg = 0, n = 0) => ((avg * n) + 3.5 * 3) / (n + 3) / 5;

const scoreCandidate = (me, other) => {
  const myGoals = (me.learning || []).map(asObj).filter((g) => skillName(g));
  const theirSkills = (other.skills || []).map(asObj).filter((s) => skillName(s));
  const reasons = [];
  const matchedSkills = [];

  // --- coverage -----------------------------------------------------------
  let weightSum = 0; let covered = 0;
  for (const goal of myGoals) {
    const w = PRIORITY_WEIGHT[goal.priority] ?? 0.7;
    weightSum += w;
    let best = null;
    for (const skill of theirSkills) {
      const sim = nameSimilarity(goal.name, skill.name);
      if (sim >= MATCH_THRESHOLD && (!best || sim > best.sim)) best = { sim, skill };
    }
    if (!best) continue;
    const prof = PROFICIENCY_FACTOR[best.skill.proficiency] ?? 0.85;
    const years = Math.min(Number(best.skill.yearsOfExperience) || 0, 5) / 5 * 0.1;
    let quality = Math.min(1, prof + years);
    // wanting "Advanced" from a "Beginner" is a weak match
    if ((LEVEL_RANK[goal.targetProficiency] || 2) > (LEVEL_RANK[best.skill.proficiency] || 2) + 1) quality *= 0.8;
    covered += w * best.sim * quality;
    matchedSkills.push({ wantToLearn: goal.name, teaches: best.skill.name, proficiency: best.skill.proficiency || 'Intermediate', similarity: Number(best.sim.toFixed(2)) });
  }
  const coverage = weightSum ? covered / weightSum : 0;
  matchedSkills.forEach((m) => reasons.push(`Teaches ${m.teaches} (${m.proficiency}) — you want to learn ${m.wantToLearn}`));

  // --- reciprocity --------------------------------------------------------
  const mySkills = (me.skills || []).map(asObj).filter((s) => skillName(s));
  const theirGoals = (other.learning || []).map(asObj).filter((g) => skillName(g));
  const reciprocal = [];
  for (const goal of theirGoals) {
    const hit = mySkills.find((s) => nameSimilarity(goal.name, s.name) >= MATCH_THRESHOLD);
    if (hit) reciprocal.push({ theyWant: goal.name, youTeach: hit.name });
  }
  const reciprocity = theirGoals.length ? Math.min(1, reciprocal.length / Math.min(theirGoals.length, 3)) : 0;
  reciprocal.forEach((r) => reasons.push(`Wants to learn ${r.theyWant} — you can teach ${r.youTeach}`));

  // --- reputation ---------------------------------------------------------
  const reputation = bayesianRating(other.average_rating, other.total_reviews);
  if ((other.total_reviews || 0) > 0) reasons.push(`Rated ${Number(other.average_rating).toFixed(1)}/5 from ${other.total_reviews} review${other.total_reviews === 1 ? '' : 's'}`);

  const relevant = coverage > 0 || reciprocity > 0;
  const score = relevant ? Math.min(0.99, 0.7 * coverage + 0.2 * reciprocity + 0.1 * reputation) : 0;
  return { score: Math.round(score * 100), matchedSkills, reciprocal, reasons, reputation };
};

const publicShape = (other, result, extra = {}) => {
  const matchedNames = new Set(result.matchedSkills.map((m) => normalizeName(m.teaches)));
  const names = (other.skills || []).map(skillName).filter(Boolean);
  names.sort((a, b) => Number(matchedNames.has(normalizeName(b))) - Number(matchedNames.has(normalizeName(a))));
  return {
    _id: String(other._id),
    username: other.username,
    avatar: other.profilePicture || null,
    bio: other.bio || '',
    department: other.department,
    experience_level: other.experience_level,
    average_rating: other.average_rating || 0,
    total_reviews: other.total_reviews || 0,
    skills: names,
    matchScore: result.score,
    matchedSkills: result.matchedSkills,
    reciprocal: result.reciprocal,
    reasons: result.reasons,
    ...extra,
  };
};

// candidates: users other than `me`. Returns { coldStart, recommendations }.
const recommend = (me, candidates, { limit = 6 } = {}) => {
  const hasGoals = (me.learning || []).some((g) => skillName(g));
  const scored = candidates.map((c) => ({ c, r: scoreCandidate(me, c) }));

  let ranked = scored.filter((x) => x.r.score > 0).sort((a, b) => b.r.score - a.r.score || b.r.reputation - a.r.reputation);
  let coldStart = false;
  if (ranked.length === 0) {
    // Nothing matches (or the user hasn't set learning goals yet): fall back to top-rated teachers.
    coldStart = true;
    ranked = scored
      .filter((x) => (x.c.skills || []).length > 0)
      .map((x) => ({ ...x, r: { ...x.r, reasons: x.r.reasons.length ? x.r.reasons : ['Popular mentor on the platform'] } }))
      .sort((a, b) => b.r.reputation - a.r.reputation);
  }
  return {
    coldStart,
    hasGoals,
    recommendations: ranked.slice(0, limit).map((x) => publicShape(x.c, x.r)),
  };
};

module.exports = { recommend, scoreCandidate, nameSimilarity };
