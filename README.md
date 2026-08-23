# 🤖 Gemini LeetCode Coach for Google Sheets

An intelligent, automated LeetCode interview prep assistant built directly inside Google Sheets using Google Apps Script and the Google Gemini API.

Instead of guessing what to practice next, this AI coach analyzes your completed problems against active ones, performs a **curriculum gap analysis** across standard algorithmic patterns (DP, Graphs, Trees, Heaps, etc.), and appends hyperlinked, targeted problem recommendations directly into your spreadsheet.

---

## ✨ Features

- 🧠 **Curriculum Gap Analysis:** Identifies topic blind spots (0% coverage areas) across 12 core algorithmic domains and prioritizes missing foundational patterns.
- 🚫 **Multi-Tab Deduplication:** Scans both your current sheet and your `"passed"` sheet to guarantee you never get recommended a duplicate problem.
- 🔗 **Clickable Problem Links:** Automatically injects `=HYPERLINK(...)` formulas directly into Google Sheets linking straight to LeetCode problem pages.
- 🛡️ **Data Validation Friendly:** Normalizes difficulty casing (`easy`, `medium`, `hard`) so it matches your spreadsheet dropdown validation without errors.
- ⚡ **Native Google Sheets Menu:** Adds an interactive `🤖 AI Coach` dropdown menu to your spreadsheet for one-click analysis.
- 🔒 **Secure API Key Storage:** Uses Google Apps Script's `PropertiesService` so your API key is never exposed or hardcoded in public code.

---

## 📋 Sheet Structure

For best results, set up your spreadsheet with the following layout:

### 1. Active Tab (Any name, or active sheet)
| Column A | Column B | Column C - G |
| :--- | :--- | :--- |
| **Title** (e.g., `1. Two Sum`) | **Difficulty** (`easy`, `medium`, `hard`) | *(Optional notes, status, topic, etc.)* |

### 2. Completed Tab (Named `passed`)
- Create a second tab named **`passed`** where you move or log problems you have already mastered.
- Column A: Title
- Column B: Difficulty

---

## 🚀 Quick Setup Guide

### Step 1: Get a Free Gemini API Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **Create API key** > **Create API key in new project** (completely free, no credit card required).
3. Copy your API key.

### Step 2: Add Script to Google Sheets
1. Open your Google Sheet.
2. In the top menu, go to **Extensions** > **Apps Script**.
3. Delete any default code in `Code.gs` and paste the code from [`Code.gs`](./Code.gs).

### Step 3: Add API Key Securely
1. In the Apps Script editor, click **Project Settings** ⚙️ on the left sidebar.
2. Scroll down to **Script Properties** and click **Add script property**.
   - **Property:** `GEMINI_API_KEY`
   - **Value:** `YOUR_ACTUAL_GEMINI_API_KEY`
3. Click **Save script properties**.

### Step 4: Run & Authorize
1. Refresh your Google Spreadsheet.
2. Look for the new menu at the top: **`🤖 AI Coach`**.
3. Click **`+10 Recommended Problems`**.
4. Grant standard Google Sheets authorization permissions on the first run.

---

## 🛠️ How It Works

```text
[ "passed" Sheet ] ──┐
                     ├──► [ Gap Analysis Prompt ] ──► [ Gemini API ]
[ "active" Sheet ] ──┘                                      │
                                                           ▼
                                               [ Strict JSON Response ]
                                                           │
                                               [ Deduplication Check ]
                                                           │
                                               [ Append Hyperlinks & Difficulty ]
