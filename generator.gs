const MODEL_ID = 'gemini-3.6-flash';

// Helper to get API key from Script Properties (or paste directly for testing)
function getApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY! Add it to Project Settings -> Script Properties.");
  }
  return key;
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('🤖 AI Coach')
    .addItem('+10 Recommended Problems', 'runAnalysis')
    .addToUi();
}

/**
 * Helper to guarantee all-lowercase: "easy", "medium", "hard"
 */
function formatDifficulty(diff) {
  if (!diff) return "medium";
  const clean = diff.toString().trim().toLowerCase();
  if (clean.includes("easy")) return "easy";
  if (clean.includes("hard")) return "hard";
  return "medium";
}

/**
 * BUTTON: Get Recommendations (Appends directly under existing data)
 */
function runAnalysis() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const activeSheet = ss.getActiveSheet();
  const passedSheet = ss.getSheetByName("passed");

  // 1. Read Active Sheet problems
  const activeData = activeSheet.getDataRange().getValues();
  const activeHistory = [];
  const existingSet = new Set();

  for (let i = 1; i < activeData.length; i++) {
    const title = activeData[i][0] ? activeData[i][0].toString().trim() : "";
    const diff = activeData[i][1] ? activeData[i][1].toString().trim() : "";
    if (title) {
      activeHistory.push(`${title} (${diff})`);
      existingSet.add(title.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
  }

  // 2. Read Passed Sheet problems (if sheet exists)
  const passedHistory = [];
  if (passedSheet) {
    const passedData = passedSheet.getDataRange().getValues();
    for (let i = 1; i < passedData.length; i++) {
      const title = passedData[i][0] ? passedData[i][0].toString().trim() : "";
      const diff = passedData[i][1] ? passedData[i][1].toString().trim() : "";
      if (title) {
        passedHistory.push(`${title} (${diff})`);
        existingSet.add(title.toLowerCase().replace(/[^a-z0-9]/g, ''));
      }
    }
  }

  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;

  // UPGRADED: Forces Blind-Spot & Gap Analysis across all LeetCode domains
  const prompt = `
You are an expert LeetCode coach. Perform a comprehensive CURRICULUM GAP ANALYSIS on this student.

CORE LEETCODE DOMAINS TO EVALUATE:
1. Arrays & Hashing
2. Two Pointers / Sliding Window
3. Stack / Queue
4. Binary Search
5. Linked Lists
6. Trees & Binary Search Trees
7. Tries & Heaps / Priority Queues
8. Graphs & BFS/DFS / Union-Find
9. Backtracking
10. 1-D & 2-D Dynamic Programming
11. Greedy & Intervals
12. Bit Manipulation

=== PASSED / COMPLETED PROBLEMS ===
${passedHistory.length > 0 ? passedHistory.join("\n") : "None recorded yet."}

=== CURRENTLY ACTIVE / IN-PROGRESS PROBLEMS ===
${activeHistory.length > 0 ? activeHistory.join("\n") : "None recorded yet."}

INSTRUCTIONS FOR RECOMMENDATIONS:
1. IDENTIFY MISSING TOPICS FIRST: Look at the Core Domains list above. Find which domains have ZERO or VERY FEW problems in the user's history (blind spots).
2. PRIORITIZE BLIND SPOTS: The majority of your 10 recommendations MUST introduce essential, high-yield canonical problems from those MISSING or weak domains (e.g. Blind 75 / NeetCode 150 essentials).
3. NEVER repeat any problem that is already in sheets "passed" or "active".
4. Title MUST include the official LeetCode problem number (e.g., "1. Two Sum", "206. Reverse Linked List", "15. 3Sum").
5. Difficulty MUST be all-lowercase: "easy", "medium", or "hard".
6. Include the direct LeetCode URL for each problem.
7. In "weak_areas_summary", explicitly state which major topic domains are missing/unpracticed in their history and why these problems fill those gaps.
8. Deprioritize easy problems. I want mainly mediums and some hards. 

Return JSON format:
{
  "weak_areas_summary": "Identified blind spots: [Missing Topics]. Recommending high-yield problems to establish baseline competency across these domains.",
  "problems": [
    { "title": "1. Two Sum", "difficulty": "easy", "url": "https://leetcode.com/problems/two-sum/" }
  ]
}
`;

  const payload = {
    "contents": [{
      "parts": [{ "text": prompt }]
    }],
    "generationConfig": {
      "responseMimeType": "application/json"
    }
  };

  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
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

      // Prepare rows to insert (Col A: Hyperlinked Title, Col B: Difficulty, Col C-G: Empty)
      const rowsToAdd = [];
      problems.forEach(p => {
        if (p.title) {
          const key = p.title.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (!existingSet.has(key)) {
            existingSet.add(key);
            const difficulty = formatDifficulty(p.difficulty);

            // Create fallback URL slug if model does not provide one
            const fallbackSlug = p.title.replace(/^\d+\.\s*/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            const targetUrl = p.url || `https://leetcode.com/problems/${fallbackSlug}/`;
            
            // Hyperlink formula on title
            const hyperlinkedTitle = `=HYPERLINK("${targetUrl}", "${p.title.replace(/"/g, '""')}")`;

            rowsToAdd.push([hyperlinkedTitle, difficulty, "", "", "", "", ""]);
          }
        }
      });

      if (rowsToAdd.length > 0) {
        // Find the TRUE last row with content in Column A
        const colA = activeSheet.getRange("A:A").getValues();
        let lastFilledRow = 0;
        for (let i = colA.length - 1; i >= 0; i--) {
          if (colA[i][0] !== "") {
            lastFilledRow = i + 1;
            break;
          }
        }

        // Insert directly below the last row
        activeSheet.getRange(lastFilledRow + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
        ui.alert(`🚀 Added ${rowsToAdd.length} problems starting at row ${lastFilledRow + 1}!\n\n🧠 Curriculum Gap Analysis:\n${weakPointsSummary}`);
      } else {
        ui.alert("⚠️ No new unique problems could be added.");
      }
    } else {
      ui.alert("❌ Error (" + response.getResponseCode() + "):\n" + resText);
    }
  } catch (e) {
    ui.alert("Script Error: " + e.toString());
  }
}
