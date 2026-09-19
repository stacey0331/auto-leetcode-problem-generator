# 🤖 Gemini LeetCode Coach for Google Sheets

An intelligent, automated LeetCode interview prep assistant built directly inside Google Sheets using Google Apps Script, the Google Gemini API, and your **real LeetCode problem history**.

Instead of guessing what to practice next, this AI coach connects directly to LeetCode, analyzes your actual solve and submission history, identifies gaps across standard algorithmic patterns, and appends targeted problem recommendations directly into your spreadsheet.

The coach prioritizes problems you have **never attempted**, while also resurfacing older problems you have not touched recently for spaced-repetition practice.

---

## ✨ Features

* 🧠 **Curriculum Gap Analysis:** Identifies under-practiced areas across 12 core algorithmic domains, including DP, Graphs, Trees, Heaps, Binary Search, and more.
* 🔌 **Real LeetCode History:** Authenticates to LeetCode and reads your actual per-problem status instead of relying only on what is recorded in your spreadsheet.
* 🎯 **Never-Attempted Priority:** Gives highest priority to problems you have never attempted on LeetCode.
* 🔄 **Spaced-Repetition Refresh:** Can recommend previously attempted/solved problems that have not been touched for 365+ days.
* 🚫 **Multi-Source Deduplication:** Checks both your Google Sheets history and your real LeetCode status to avoid recommending problems you have already worked on.
* 🔗 **Clickable Problem Links:** Automatically injects `=HYPERLINK(...)` formulas directly into Google Sheets linking to LeetCode problem pages.
* 🛡️ **Data Validation Friendly:** Normalizes difficulty casing (`easy`, `medium`, `hard`) so it matches spreadsheet dropdown validation without errors.
* ⚡ **Native Google Sheets Menu:** Adds an interactive `🤖 AI Coach` dropdown menu for one-click recommendations and connection testing.
* 🔒 **Secure Credential Storage:** Stores your Gemini API key and LeetCode authentication cookies in Google Apps Script `PropertiesService` rather than hardcoding them into the source code.
* 🧯 **Defensive Submission History:** If LeetCode's submission-history endpoint fails, the coach can still use the important **never-attempted** functionality.

---

## 📋 Sheet Structure

### 1. Active Tab

The active sheet is where new recommendations will be added.

| Column A                      | Column B                                  | Column C - G                            |
| :---------------------------- | :---------------------------------------- | :-------------------------------------- |
| **Title** (e.g. `1. Two Sum`) | **Difficulty** (`easy`, `medium`, `hard`) | *(Optional notes, status, topic, etc.)* |

The script appends recommended problems underneath your existing data.

### 2. Completed Tab — `passed`

Create a second tab named **`passed`** where you move or log problems you have already mastered.

| Column A  | Column B       |
| :-------- | :------------- |
| **Title** | **Difficulty** |

The `passed` tab is used as an additional exclusion list so previously logged problems are not recommended again.

> **Note:** Your `passed` sheet is no longer the only source of problem history. The coach now also checks your actual LeetCode history.

---

## 🧠 How Recommendations Work

The coach builds two candidate pools from your real LeetCode history.

### Priority 1 — Never Attempted

The highest-priority candidates are problems that:

* Are free problems
* Have no LeetCode status
* Have never been attempted according to your LeetCode account
* Are not already present in your Google Sheets history

These problems make up the majority of the recommendations whenever there are enough suitable candidates.

### Priority 2 — Stale Problems

If more coverage is needed, the coach can recommend problems that you have previously attempted or solved but have not submitted for **365+ days**.

These are treated as spaced-repetition opportunities rather than brand-new problems.

The script also tracks the number of days since the most recent submission and gives preference to problems that have been untouched the longest.

---

## 📊 Curriculum Gap Analysis

The coach groups LeetCode problems into 12 algorithmic domains:

1. Arrays & Hashing
2. Two Pointers / Sliding Window
3. Stack / Queue
4. Binary Search
5. Linked Lists
6. Trees & BST
7. Tries & Heaps / Priority Queues
8. Graphs & BFS/DFS/Union-Find
9. Backtracking
10. Dynamic Programming
11. Greedy
12. Bit Manipulation

Your solved LeetCode problems are analyzed against these domains.

Domains with fewer than 3 solved problems are considered **weak / under-practiced areas** and are prioritized when building the candidate pools.

Gemini then selects the final 10 recommendations from those candidate pools, with a preference for medium and hard problems.

---

## 🔐 LeetCode Authentication

The coach uses your LeetCode session cookies to make authenticated requests to LeetCode's GraphQL API.

You need to provide two LeetCode cookies:

* `LEETCODE_SESSION`
* `LEETCODE_CSRFTOKEN`

These allow the script to access your account-specific problem status and submission history.

### ⚠️ Security Warning

Your `LEETCODE_SESSION` cookie is effectively a temporary authentication credential for your LeetCode account.

**Do not share it, commit it to GitHub, or paste it into public code.**

Store it only in Google Apps Script's **Script Properties**.

The cookie will eventually expire. If the script starts returning a `401` or `403` error, you may need to obtain a fresh cookie value.

The script itself does **not** hardcode these credentials.

---

## 🚀 Quick Setup Guide

### Step 1: Get a Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create an API key.
3. Copy your API key.

### Step 2: Get Your LeetCode Cookies

1. Log into [LeetCode](https://leetcode.com/) in your browser.
2. Open your browser's Developer Tools.
3. Navigate to:

   * **Chrome:** `Application` → `Cookies` → `https://leetcode.com`
   * **Firefox:** `Storage` → `Cookies` → `https://leetcode.com`
4. Find and copy:

   * `LEETCODE_SESSION`
   * `csrftoken`

### Step 3: Add the Script to Google Sheets

1. Open your Google Sheet.
2. Go to **Extensions → Apps Script**.
3. Replace the default `Code.gs` contents with the code from [`Code.gs`](./Code.gs).

### Step 4: Add Script Properties

In the Apps Script editor:

1. Open **Project Settings** ⚙️.
2. Find **Script Properties**.
3. Add the following properties:

| Property             | Value                          |
| :------------------- | :----------------------------- |
| `GEMINI_API_KEY`     | Your Gemini API key            |
| `LEETCODE_SESSION`   | Your `LEETCODE_SESSION` cookie |
| `LEETCODE_CSRFTOKEN` | Your `csrftoken` cookie        |

Do **not** put these values directly into `Code.gs`.

### Step 5: Run & Authorize

1. Refresh your Google Spreadsheet.

2. Look for the new menu:

   **`🤖 AI Coach`**

3. Select **`Test LeetCode Connection`** first.

4. If the connection succeeds, select **`+10 Recommended Problems`**.

5. Grant the requested Google Sheets authorization permissions on the first run.

---

## ⚡ AI Coach Menu

The script adds two options to your Google Sheets menu:

### `+10 Recommended Problems`

Runs the complete recommendation pipeline:

```text
Google Sheets History
        │
        ├──────────────┐
        │              │
        ▼              ▼
Active Sheet       "passed" Sheet
        │              │
        └──────┬───────┘
               ▼
        Exclusion Set
               │
               ▼
      LeetCode GraphQL API
               │
       ┌───────┴────────┐
       ▼                ▼
Never Attempted    Stale Problems
       │                │
       └───────┬────────┘
               ▼
       Weak-Domain Analysis
               │
               ▼
          Gemini API
               │
               ▼
        10 Recommendations
               │
               ▼
      Deduplication Check
               │
               ▼
   Hyperlinked Sheet Rows
```

### `Test LeetCode Connection`

Performs a quick authenticated request to LeetCode and displays a sample of problems visible through your account.

Use this if you are troubleshooting authentication or want to verify that your cookies are working.

---

## 🛠️ How It Works Under the Hood

### 1. Read Spreadsheet History

The script reads the active sheet and, if present, the `passed` sheet to create a set of problems that should never be recommended again.

### 2. Fetch LeetCode Problem Catalog

The script retrieves LeetCode's problem catalog, including:

* Problem title
* Difficulty
* Problem number
* Paid/free status
* Your problem status
* Topic tags
* Problem URL

This allows recommendations to be based on your actual LeetCode account rather than only your spreadsheet.

### 3. Fetch Submission History

The script also attempts to retrieve your submission history and records the most recent submission timestamp for each problem.

This is used to identify problems that have become stale.

The submission-history request is handled defensively: if it fails, the script logs the failure and continues without using stale-problem ranking.

### 4. Identify Weak Domains

Solved problems are mapped to the coach's 12 algorithmic domains.

Domains with fewer than 3 solved problems are considered under-practiced and receive additional priority.

### 5. Build Candidate Pools

Two candidate pools are created:

```text
PRIORITY_1_POOL
└── Never attempted

PRIORITY_2_POOL
└── Attempted/solved
    └── No submission for 365+ days
```

Candidates are biased toward weak domains and medium/hard problems.

### 6. Ask Gemini to Select 10 Problems

Gemini receives only the candidate pools generated from your LeetCode data.

It is instructed to:

* Prioritize never-attempted problems
* Use stale problems only when needed
* Focus on weak domains
* Prefer medium/hard problems
* Never invent a problem outside the provided pools
* Return exactly 10 recommendations in JSON

### 7. Write Recommendations to Google Sheets

The selected problems are deduplicated one final time and appended to the active sheet as:

```text
[Clickable LeetCode Problem] | difficulty | | | | |
```

The problem title is inserted as a Google Sheets `HYPERLINK` formula.

---

## ⚙️ Configuration

Several constants near the top of `Code.gs` control recommendation behavior:

```javascript
const PROBLEM_PAGE_SIZE = 100;
const SUBMISSION_PAGE_SIZE = 20;
const MAX_SUBMISSIONS_TO_SCAN = 5000;
const STALE_DAYS_THRESHOLD = 365;
const MAX_CANDIDATES_PER_POOL = 120;
```

### `STALE_DAYS_THRESHOLD`

Controls how long a problem must go untouched before becoming a stale-refresh candidate.

Default:

```text
365 days
```

### `MAX_SUBMISSIONS_TO_SCAN`

Limits how much submission history is scanned to avoid excessively large requests.

The default of 5,000 submissions should comfortably cover a typical history of several hundred solved problems.

### `MAX_CANDIDATES_PER_POOL`

Limits how many candidate problems are passed to Gemini, helping keep the recommendation prompt manageable.

---

## ⚠️ API Notes

The script uses LeetCode's **unofficial/undocumented GraphQL API**.

Because this API is not a stable public API, LeetCode could change its schema or authentication behavior at any time.

In particular:

* Your session cookies can expire.
* LeetCode may change its GraphQL endpoints or response format.
* The submission-history endpoint may fail independently of the main problem-status endpoint.

The script is designed so that a submission-history failure does not completely break the **never-attempted** recommendation feature.

