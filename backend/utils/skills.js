// Helpers for the skills / learning arrays. The User model stores sub-documents
// ({ name, proficiency, ... }) but several parts of the UI and API historically
// passed plain strings, which is what broke profile editing and skill search.

const PROFICIENCY = ['Beginner', 'Intermediate', 'Advanced'];
const PRIORITY = ['Low', 'Medium', 'High'];
const MAX_ITEMS = 50;

const ALIASES = {
  js: 'javascript', 'java script': 'javascript', ts: 'typescript',
  reactjs: 'react', 'react.js': 'react', 'react js': 'react',
  nodejs: 'node.js', node: 'node.js', 'node js': 'node.js', expressjs: 'express', 'express.js': 'express',
  vuejs: 'vue', 'vue.js': 'vue', nextjs: 'next.js', 'next js': 'next.js',
  py: 'python', cpp: 'c++', 'c plus plus': 'c++', csharp: 'c#',
  ml: 'machine learning', ai: 'artificial intelligence', dl: 'deep learning',
  dsa: 'data structures and algorithms', 'data structures': 'data structures and algorithms',
  algorithms: 'data structures and algorithms', algo: 'data structures and algorithms',
  k8s: 'kubernetes', postgres: 'postgresql', mongo: 'mongodb', 'mongo db': 'mongodb',
  ui: 'ui design', ux: 'ux design', 'ui/ux': 'ui ux design', css3: 'css', html5: 'html',
  tailwindcss: 'tailwind', 'tailwind css': 'tailwind', cv: 'computer vision', nlp: 'natural language processing',
};

const skillName = (item) => (typeof item === 'string' ? item : item && item.name ? String(item.name) : '');

// Canonical key used for matching / de-duplication.
const normalizeName = (value) => {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[cleaned] || cleaned;
};

const toInputArray = (input) => {
  if (input == null || input === '') return [];
  if (Array.isArray(input)) return input;
  if (typeof input === 'string') return input.split(',');
  return [];
};

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

// Accepts strings, objects, or a comma-separated string and returns valid sub-documents,
// re-using the existing entry's details (proficiency, years…) when the name is unchanged.
const normalizeSkills = (input, existing = []) => {
  const byKey = new Map((existing || []).map((s) => [normalizeName(skillName(s)), s]));
  const seen = new Set();
  const out = [];
  for (const raw of toInputArray(input)) {
    const name = skillName(raw).trim().slice(0, 60);
    const key = normalizeName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const prev = byKey.get(key);
    const prevObj = prev && typeof prev.toObject === 'function' ? prev.toObject() : prev || {};
    const src = typeof raw === 'object' && raw ? raw : {};
    out.push({
      name,
      proficiency: pick(src.proficiency || prevObj.proficiency, PROFICIENCY, 'Intermediate'),
      yearsOfExperience: Math.max(0, Number(src.yearsOfExperience ?? prevObj.yearsOfExperience) || 0),
      category: String(src.category || prevObj.category || 'Other').slice(0, 40),
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
};

const normalizeLearning = (input, existing = []) => {
  const byKey = new Map((existing || []).map((s) => [normalizeName(skillName(s)), s]));
  const seen = new Set();
  const out = [];
  for (const raw of toInputArray(input)) {
    const name = skillName(raw).trim().slice(0, 60);
    const key = normalizeName(name);
    if (!name || seen.has(key)) continue;
    seen.add(key);
    const prev = byKey.get(key);
    const prevObj = prev && typeof prev.toObject === 'function' ? prev.toObject() : prev || {};
    const src = typeof raw === 'object' && raw ? raw : {};
    out.push({
      name,
      targetProficiency: pick(src.targetProficiency || prevObj.targetProficiency, PROFICIENCY, 'Intermediate'),
      priority: pick(src.priority || prevObj.priority, PRIORITY, 'Medium'),
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  PROFICIENCY, PRIORITY, skillName, normalizeName, normalizeSkills, normalizeLearning, escapeRegex,
};
