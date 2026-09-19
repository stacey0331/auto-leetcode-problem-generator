/**
 * LeetCode AI Coach — now reads your REAL LeetCode history (not just the sheet)
 *
 * SETUP (one-time):
 * 1. Go to Extensions -> Apps Script -> Project Settings -> Script Properties. Add:
 *      GEMINI_API_KEY        = your Gemini API key
 *      LEETCODE_SESSION      = value of the LEETCODE_SESSION cookie
 *      LEETCODE_CSRFTOKEN    = value of the csrftoken cookie
 *
 * HOW TO GET THE COOKIES:
 * 1. Log into leetcode.com in your browser.
 * 2. Open DevTools -> Application (Chrome) or Storage (Firefox) -> Cookies -> https://leetcode.com
 * 3. Copy the values of "LEETCODE_SESSION" and "csrftoken".
 * 4. Paste them into Script Properties as above.
 *
 * NOTE: LEETCODE_SESSION is like a temporary password for your account. Don't share it or
 * paste it anywhere public. It will eventually expire (weeks to months) — if the script
 * starts failing with a 401/403, just grab a fresh cookie value and update the property.
 *
 * LeetCode's GraphQL API is unofficial/undocumented and can change shape without notice.
 * The submission-history call (used for "staleness") is wrapped defensively — if it breaks,
 * the "never attempted" feature (the important one) keeps working regardless.
 */

const MODEL_ID = 'gemini-3.6-flash';
const LC_GRAPHQL_URL = 'https://leetcode.com/graphql/';
const PROBLEM_PAGE_SIZE = 100;
const SUBMISSION_PAGE_SIZE = 20;
const MAX_SUBMISSIONS_TO_SCAN = 5000; // safety cap; with 300-400 solved this will comfortably cover your full history
const STALE_DAYS_THRESHOLD = 365; // a solved/tried problem counts as "stale" if untouched for this many days
const MAX_CANDIDATES_PER_POOL = 120; // cap how many candidates we hand to Gemini

// Maps our human-readable domains to LeetCode topicTag slugs, for weak-area detection.
const DOMAIN_TAG_MAP = {
  "Arrays & Hashing": ["array", "hash-table"],
  "Two Pointers / Sliding Window": ["two-pointers", "sliding-window"],
  "Stack / Queue": ["stack", "queue", "monotonic-stack"],
  "Binary Search": ["binary-search"],
  "Linked Lists": ["linked-list"],
  "Trees & BST": ["tree", "binary-tree", "binary-search-tree"],
  "Tries & Heaps / Priority Queues": ["trie", "heap-priority-queue"],
  "Graphs & BFS/DFS/Union-Find": ["graph", "breadth-first-search", "depth-first-search", "union-find", "topological-sort"],
  "Backtracking": ["backtracking"],
  "Dynamic Programming": ["dynamic-programming"],
  "Greedy": ["greedy"],
  "Bit Manipulation": ["bit-manipulation"]
};

function getApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error("Missing GEMINI_API_KEY! Add it to Project Settings -> Script Properties.");
  return key;
}

function getLeetCodeCreds() {
  const props = PropertiesService.getScriptProperties();
  const session = props.getProperty('LEETCODE_SESSION');
  const csrftoken = props.getProperty('LEETCODE_CSRFTOKEN');
  if (!session || !csrftoken) {
    throw new Error("Missing LEETCODE_SESSION / LEETCODE_CSRFTOKEN. Add them in Project Settings -> Script Properties.");
  }
  return { session, csrftoken };
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 AI Coach')
    .addItem('+10 Recommended Problems', 'runAnalysis')
    .addItem('Test LeetCode Connection', 'testLeetCodeConnection')
    .addToUi();
}

function formatDifficulty(diff) {
  if (!diff) return "medium";
  const clean = diff.toString().trim().toLowerCase();
  if (clean.includes("easy")) return "easy";
  if (clean.includes("hard")) return "hard";
  return "medium";
}

/** Low-level authenticated GraphQL call against LeetCode. */
function lcGraphQL(query, variables) {
  const creds = getLeetCodeCreds();
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Cookie': `LEETCODE_SESSION=${creds.session}; csrftoken=${creds.csrftoken}`,
      'x-csrftoken': creds.csrftoken,
      'Referer': 'https://leetcode.com',
      'Origin': 'https://leetcode.com'
    },
    payload: JSON.stringify({ query, variables }),
    muteHttpExceptions: true
  };
  const resp = UrlFetchApp.fetch(LC_GRAPHQL_URL, options);
  const code = resp.getResponseCode();
  const text = resp.getContentText();
  if (code !== 200) throw new Error(`LeetCode API HTTP ${code}: ${text}`);
  const json = JSON.parse(text);
  if (json.errors) throw new Error("LeetCode GraphQL errors: " + JSON.stringify(json.errors));
  return json.data;
}

/** Quick sanity check you can run from the menu to confirm your cookies work. */
function testLeetCodeConnection() {
  const ui = SpreadsheetApp.getUi();
  try {
    const data = lcGraphQL(
      `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
        problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
          total: totalNum
          questions: data { title status }
        }
      }`,
      { categorySlug: "", limit: 5, skip: 0, filters: {} }
    );
    const sample = data.problemsetQuestionList.questions.map(q => `${q.title} [${q.status || "not started"}]`).join("\n");
    ui.alert(`✅ Connected! Total problems visible: ${data.problemsetQuestionList.total}\n\nSample:\n${sample}`);
  } catch (e) {
    ui.alert("❌ Connection failed: " + e.toString());
  }
}

/** Paginates through the full LeetCode catalog, including YOUR per-problem status. */
function fetchAllQuestionsWithStatus() {
  const query = `
    query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
      problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
        total: totalNum
        questions: data {
          difficulty
          frontendQuestionId: questionFrontendId
          paidOnly: isPaidOnly
          status
          title
          titleSlug
          acRate
          topicTags { slug }
        }
      }
    }
  `;
  let skip = 0, all = [], total = Infinity;
  while (skip < total) {
    const data = lcGraphQL(query, { categorySlug: "", limit: PROBLEM_PAGE_SIZE, skip, filters: {} });
    const page = data.problemsetQuestionList;
    total = page.total;
    all = all.concat(page.questions);
    if (page.questions.length === 0) break;
    skip += PROBLEM_PAGE_SIZE;
    Utilities.sleep(150); // be polite to LeetCode's servers
  }
  return all;
}

/**
 * Paginates through your FULL submission history (not just a recent window) and returns
 * a map of titleSlug -> most recent submission timestamp (unix seconds).
 * Returns {} (empty map) on any failure — callers must treat that as "unknown, don't penalize".
 */
function fetchLastSubmissionTimestamps(maxToScan) {
  const query = `
    query submissionList($offset: Int!, $limit: Int!, $lastKey: String) {
      submissionList(offset: $offset, limit: $limit, lastKey: $lastKey) {
        lastKey
        hasNext
        submissions { title url timestamp statusDisplay }
      }
    }
  `;
  const lastSeen = {}; // slug -> latest unix timestamp (seconds)
  let offset = 0, lastKey = null, scanned = 0;
  try {
    while (scanned < maxToScan) {
      const data = lcGraphQL(query, { offset, limit: SUBMISSION_PAGE_SIZE, lastKey });
      const block = data.submissionList;
      if (!block || !block.submissions || block.submissions.length === 0) break;
      block.submissions.forEach(s => {
        const m = (s.url || "").match(/\/problems\/([^\/]+)\//);
        if (!m) return;
        const slug = m[1];
        const ts = Number(s.timestamp) || 0;
        // Submissions typically come back newest-first, but take the max just in case.
        if (!lastSeen[slug] || ts > lastSeen[slug]) lastSeen[slug] = ts;
      });
      scanned += block.submissions.length;
      offset += SUBMISSION_PAGE_SIZE;
      lastKey = block.lastKey;
      if (!block.hasNext) break;
      Utilities.sleep(150);
    }
  } catch (e) {
    Logger.log("Submission history fetch failed, skipping staleness ranking: " + e);
    return {};
  }
  return lastSeen;
}

function domainForTags(tagSlugs) {
  for (const domain in DOMAIN_TAG_MAP) {
    if (DOMAIN_TAG_MAP[domain].some(slug => tagSlugs.includes(slug))) return domain;
  }
  return null;
}

/**
 * BUTTON: Get Recommendations (Appends directly under existing data)
 */
function runAnalysis() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  const passedSheet = ss.getSheetByName("passed");

  // 1. Read sheet history, purely to build the "never recommend this again" exclusion set.
  const existingSet = new Set();
  const activeData = activeSheet.getDataRange().getValues();
  for (let i = 1; i < activeData.length; i++) {
    const title = activeData[i][0] ? activeData[i][0].toString().trim() : "";
    if (title) existingSet.add(title.toLowerCase().replace(/[^a-z0-9]/g, ''));
  }
  if (passedSheet) {
    const passedData = passedSheet.getDataRange().getValues();
    for (let i = 1; i < passedData.length; i++) {
      const title = passedData[i][0] ? passedData[i][0].toString().trim() : "";
      if (title) existingSet.add(title.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  }

  // 2. Pull REAL LeetCode history.
  let allQuestions;
  try {
    allQuestions = fetchAllQuestionsWithStatus();
  } catch (e) {
    ui.alert("❌ Couldn't reach LeetCode. Check your LEETCODE_SESSION / LEETCODE_CSRFTOKEN Script Properties.\n\n" + e.toString());
    return;
  }
  const lastSubmissionTs = fetchLastSubmissionTimestamps(MAX_SUBMISSIONS_TO_SCAN); // {} if it failed
  const nowSec = Math.floor(Date.now() / 1000);
  const daysSince = slug => lastSubmissionTs[slug] ? (nowSec - lastSubmissionTs[slug]) / 86400 : null;

  const norm = t => t.toLowerCase().replace(/[^a-z0-9]/g, '');
  const notExcluded = q => !existingSet.has(norm(q.title));

  const neverAttempted = allQuestions.filter(q => !q.paidOnly && !q.status && notExcluded(q));
  const attempted = allQuestions.filter(q => !q.paidOnly && (q.status === "AC" || q.status === "TRIED") && notExcluded(q));
  // "Stale" = untouched for STALE_DAYS_THRESHOLD+ days. If we couldn't fetch history at all
  // (daysSince returns null for everything), fall back to treating all attempted as candidates
  // rather than silently recommending nothing from this pool.
  const historyAvailable = Object.keys(lastSubmissionTs).length > 0;
  const staleAttempted = attempted.filter(q => {
    const d = daysSince(q.titleSlug);
    if (d === null) return !historyAvailable; // unknown timestamp: only include if we have no history at all to go on
    return d >= STALE_DAYS_THRESHOLD;
  });

  // 3. Weak-domain detection from what you've actually solved.
  const domainCounts = {};
  Object.keys(DOMAIN_TAG_MAP).forEach(d => domainCounts[d] = 0);
  allQuestions.filter(q => q.status === "AC").forEach(q => {
    const tagSlugs = (q.topicTags || []).map(t => t.slug);
    const d = domainForTags(tagSlugs);
    if (d) domainCounts[d]++;
  });
  const weakDomains = Object.keys(domainCounts).filter(d => domainCounts[d] < 3);

  // 4. Build candidate pools, biased toward weak domains, capped for prompt size.
  function buildPool(list, cap, includeStaleness) {
    const weakMatches = list.filter(q => weakDomains.includes(domainForTags((q.topicTags || []).map(t => t.slug))));
    const rest = list.filter(q => !weakMatches.includes(q));
    // Prefer medium/hard, prefer weak-domain matches first.
    const sortPref = arr => arr.sort((a, b) => (a.difficulty === "Easy" ? 1 : 0) - (b.difficulty === "Easy" ? 1 : 0));
    let pool = sortPref(weakMatches).concat(sortPref(rest));
    if (includeStaleness) {
      // Within the capped selection, surface the most-stale (longest untouched) first.
      pool = pool.sort((a, b) => (daysSince(b.titleSlug) || 0) - (daysSince(a.titleSlug) || 0));
    }
    return pool.slice(0, cap).map(q => {
      const entry = { title: `${q.frontendQuestionId}. ${q.title}`, difficulty: q.difficulty.toLowerCase(), tags: (q.topicTags || []).map(t => t.slug), url: `https://leetcode.com/problems/${q.titleSlug}/` };
      if (includeStaleness) {
        const d = daysSince(q.titleSlug);
        entry.days_since_last_submission = d !== null ? Math.round(d) : "unknown";
      }
      return entry;
    });
  }
  const priority1Pool = buildPool(neverAttempted, MAX_CANDIDATES_PER_POOL, false);
  const priority2Pool = buildPool(staleAttempted, Math.floor(MAX_CANDIDATES_PER_POOL / 2), true);

  if (priority1Pool.length === 0 && priority2Pool.length === 0) {
    ui.alert("Couldn't find any candidate problems (unexpected). Try 'Test LeetCode Connection' from the menu.");
    return;
  }

  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;

  const prompt = `
You are an expert LeetCode coach. Recommend exactly 10 problems for this student.

STRICT PRIORITY ORDER:
1. HIGHEST PRIORITY: pick from PRIORITY_1_POOL (problems the student has NEVER attempted on LeetCode, verified via API). Use the majority of your 10 picks from here.
2. SECOND PRIORITY: only if PRIORITY_1_POOL doesn't give you enough good coverage of the student's weak domains, fill remaining slots from PRIORITY_2_POOL (problems attempted/solved but with NO submission in over ${STALE_DAYS_THRESHOLD} days — good for spaced-repetition refresh). Each entry has "days_since_last_submission"; when choosing among them, prefer the ones untouched longest.
3. Never invent a problem that isn't in one of these two pools.
4. Never repeat a problem already used in a prior pick within this response.

The student's weak/under-practiced domains (based on real solve history): ${weakDomains.length > 0 ? weakDomains.join(", ") : "none detected — well-rounded, pick broadly important mediums/hards"}.

Deprioritize easy problems; aim mainly for mediums, with some hards.

PRIORITY_1_POOL (never attempted):
${JSON.stringify(priority1Pool)}

PRIORITY_2_POOL (stale — attempted/solved but not touched recently):
${JSON.stringify(priority2Pool)}

Return JSON format:
{
  "weak_areas_summary": "explain which domains are weak and why these specific picks fill the gaps, and note whether picks came from never-attempted vs stale-refresh",
  "problems": [
    { "title": "1. Two Sum", "difficulty": "easy", "url": "https://leetcode.com/problems/two-sum/" }
  ]
}
`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const resText = response.getContentText();

    if (response.getResponseCode() === 200) {
      const result = JSON.parse(resText);
      const rawJson = result.candidates[0].content.parts[0].text;
      const parsedData = JSON.parse(rawJson);

      const problems = parsedData.problems || [];
      const weakPointsSummary = parsedData.weak_areas_summary || "Targeted recommendations based on missing patterns.";

      const rowsToAdd = [];
      const seen = new Set(existingSet);
      problems.forEach(p => {
        if (!p.title) return;
        const key = norm(p.title);
        if (seen.has(key)) return;
        seen.add(key);
        const difficulty = formatDifficulty(p.difficulty);
        const fallbackSlug = p.title.replace(/^\d+\.\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const targetUrl = p.url || `https://leetcode.com/problems/${fallbackSlug}/`;
        const hyperlinkedTitle = `=HYPERLINK("${targetUrl}", "${p.title.replace(/"/g, '""')}")`;
        rowsToAdd.push([hyperlinkedTitle, difficulty, "", "", "", "", ""]);
      });

      if (rowsToAdd.length > 0) {
        const colA = activeSheet.getRange("A:A").getValues();
        let lastFilledRow = 0;
        for (let i = colA.length - 1; i >= 0; i--) {
          if (colA[i][0] !== "") { lastFilledRow = i + 1; break; }
        }
        activeSheet.getRange(lastFilledRow + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
        ui.alert(`🚀 Added ${rowsToAdd.length} problems starting at row ${lastFilledRow + 1}!\n\n📊 Never-attempted candidates: ${priority1Pool.length} | Stale (${STALE_DAYS_THRESHOLD}+ days untouched) candidates: ${priority2Pool.length}\n\n🧠 Curriculum Gap Analysis:\n${weakPointsSummary}`);
      } else {
        ui.alert("⚠️ No new unique problems could be added.");
      }
    } else {
      ui.alert("❌ Gemini error (" + response.getResponseCode() + "):\n" + resText);
    }
  } catch (e) {
    ui.alert("Script Error: " + e.toString());
  }
}