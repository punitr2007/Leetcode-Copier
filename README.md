# LeetCode Problem Copier 📋

A Chrome extension that adds a floating **"Copy Problem"** button to every LeetCode problem page. One click copies the problem description (as comments) and the starter code to your clipboard — ready to paste into VS Code or any editor.

## Output Format

```python
# Two Sum
#
# Given an array of integers nums and an integer target, return indices of the
# two numbers such that they add up to target.
#
# Example 1:
# Input: nums = [2,7,11,15], target = 9
# Output: [0,1]
# Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
#
# Constraints:
#     2 <= nums.length <= 10^4
#     -10^9 <= nums[i] <= 10^9

class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
```

The comment prefix adapts to the selected language (`#` for Python, `//` for Java/C++/JS, etc.).

## Installation

### Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."**
3. Navigate into the `leetcode-copier` folder and select the **`manifest.json`** file
4. The extension is now active — go to any LeetCode problem page and you'll see the orange floating button!

> **Note:** Temporary add-ons are removed when you close Firefox. To make it permanent, you'd need to package and sign the extension via [addons.mozilla.org](https://addons.mozilla.org).

### Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select this `leetcode-copier` folder
5. Navigate to any LeetCode problem — you'll see the orange floating button in the bottom-right!

## How It Works

- **Floating Button**: Appears on every `/problems/*` page. Hover to expand, click to copy.
- **Smart Extraction**: Pulls the problem title, description, examples, and constraints from the page DOM.
- **Code Extraction**: Reads the starter code directly from LeetCode's Monaco editor.
- **Language Detection**: Detects the selected language and uses the correct comment syntax.
- **SPA-Aware**: Handles LeetCode's single-page-app navigation — button appears/disappears as you browse.

## Supported Languages

Python, Java, C++, C, C#, JavaScript, TypeScript, Go, Rust, Swift, Kotlin, Ruby, Scala, PHP, Dart, Racket, Erlang, Elixir.

## Files

```
leetcode-copier/
├── manifest.json    # Extension manifest (Manifest V3)
├── content.js       # Content script — extraction & copy logic
├── content.css      # Floating button & toast styles
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
