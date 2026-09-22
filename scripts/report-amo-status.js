#!/usr/bin/env node

/**
 * report-amo-status.js
 * 
 * Diagnostic reporter for Firefox Add-ons (AMO) GitHub Action workflow.
 * Parses web-ext lint JSON reports, sign outputs, and Mozilla marketplace API errors.
 * Generates rich markdown summaries for $GITHUB_STEP_SUMMARY and sets GitHub error annotations.
 */

const fs = require('fs');
const path = require('path');

function findExistingPath(candidates) {
  for (const c of candidates) {
    const p = path.resolve(process.cwd(), c);
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), candidates[0]);
}

const LINT_REPORT_PATH = findExistingPath(['web-ext-artifacts/amo-lint-report.json', 'amo-lint-report.json']);
const SIGN_STDOUT_PATH = findExistingPath(['web-ext-artifacts/amo-sign-output.log', 'amo-sign-output.log']);
const SIGN_STDERR_PATH = findExistingPath(['web-ext-artifacts/amo-sign-error.log', 'amo-sign-error.log']);
const SUMMARY_FILE = process.env.GITHUB_STEP_SUMMARY;

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[WARN] Could not parse JSON from ${filePath}: ${err.message}`);
    return null;
  }
}

function readTextFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return '';
  }
}

function appendToSummary(markdown) {
  if (SUMMARY_FILE) {
    try {
      fs.appendFileSync(SUMMARY_FILE, markdown + '\n', 'utf8');
    } catch (err) {
      console.warn(`[WARN] Could not write to GITHUB_STEP_SUMMARY: ${err.message}`);
    }
  }
}

function printGitHubAnnotation(type, file, line, col, message) {
  // type: 'error' | 'warning' | 'notice'
  if (process.env.GITHUB_ACTIONS) {
    let loc = '';
    if (file) loc += `file=${file}`;
    if (line) loc += `${loc ? ',' : ''}line=${line}`;
    if (col) loc += `${loc ? ',' : ''}col=${col}`;
    console.log(`::${type} ${loc}::${message}`);
  }
}

function main() {
  console.log('='.repeat(70));
  console.log('🦊 Firefox Add-ons (AMO) Marketplace Diagnostic & Error Reporter');
  console.log('='.repeat(70));

  let hasErrors = false;
  let summaryMarkdown = `## 🦊 Mozilla Firefox Add-ons (AMO) Workflow Summary\n\n`;

  // 1. Parse Manifest Info
  const manifestPath = path.resolve(process.cwd(), 'manifest.json');
  let manifest = { name: 'LeetCode Problem Copier', version: 'Unknown' };
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (_) {}
  }

  summaryMarkdown += `| Property | Value |\n| :--- | :--- |\n`;
  summaryMarkdown += `| **Add-on Name** | \`${manifest.name}\` |\n`;
  summaryMarkdown += `| **Version** | \`${manifest.version}\` |\n`;
  summaryMarkdown += `| **Extension ID** | \`${manifest.browser_specific_settings?.gecko?.id || 'Not set'}\` |\n`;
  summaryMarkdown += `| **Manifest Version** | \`${manifest.manifest_version}\` |\n\n`;

  // 2. Parse Lint Report
  const lintData = readJsonFile(LINT_REPORT_PATH);
  if (lintData) {
    const errors = lintData.errors || [];
    const warnings = lintData.warnings || [];
    const notices = lintData.notices || [];

    console.log(`\n📋 Linter Results:`);
    console.log(`   - Errors:   ${errors.length}`);
    console.log(`   - Warnings: ${warnings.length}`);
    console.log(`   - Notices:  ${notices.length}`);

    summaryMarkdown += `### 🔍 Mozilla Validator & Linter Results\n\n`;
    summaryMarkdown += `- **Errors:** ${errors.length === 0 ? '✅ 0' : `❌ ${errors.length}`}\n`;
    summaryMarkdown += `- **Warnings:** ${warnings.length === 0 ? '✅ 0' : `⚠️ ${warnings.length}`}\n`;
    summaryMarkdown += `- **Notices:** ${notices.length}\n\n`;

    if (errors.length > 0 || warnings.length > 0 || notices.length > 0) {
      summaryMarkdown += `| Severity | Code | File : Line | Description |\n`;
      summaryMarkdown += `| :--- | :--- | :--- | :--- |\n`;

      errors.forEach((e) => {
        hasErrors = true;
        const fileLoc = e.file ? `\`${e.file}${e.line ? `:${e.line}` : ''}\`` : 'N/A';
        const msg = `${e.message || ''} ${e.description ? `- ${e.description}` : ''}`;
        console.error(`❌ [ERROR] ${e.code || 'LINT_ERROR'}: ${msg} (${fileLoc})`);
        printGitHubAnnotation('error', e.file, e.line, e.column, `[AMO Linter Error] ${e.code}: ${e.message}`);
        summaryMarkdown += `| ❌ Error | \`${e.code || 'ERROR'}\` | ${fileLoc} | ${e.message || e.description} |\n`;
      });

      warnings.forEach((w) => {
        const fileLoc = w.file ? `\`${w.file}${w.line ? `:${w.line}` : ''}\`` : 'N/A';
        const msg = `${w.message || ''} ${w.description ? `- ${w.description}` : ''}`;
        console.warn(`⚠️  [WARNING] ${w.code || 'LINT_WARNING'}: ${msg} (${fileLoc})`);
        printGitHubAnnotation('warning', w.file, w.line, w.column, `[AMO Linter Warning] ${w.code}: ${w.message}`);
        summaryMarkdown += `| ⚠️ Warning | \`${w.code || 'WARNING'}\` | ${fileLoc} | ${w.message || w.description} |\n`;
      });

      notices.forEach((n) => {
        const fileLoc = n.file ? `\`${n.file}${n.line ? `:${n.line}` : ''}\`` : 'N/A';
        summaryMarkdown += `| ℹ️ Notice | \`${n.code || 'NOTICE'}\` | ${fileLoc} | ${n.message || n.description} |\n`;
      });

      summaryMarkdown += `\n`;
    } else {
      console.log('✅ Extension passed all Mozilla linter and security checks with 0 errors and 0 warnings!');
      summaryMarkdown += `> 🎉 **Perfect Score**: Extension code fully complies with Mozilla Add-ons security requirements!\n\n`;
    }
  } else {
    console.log('ℹ️ No amo-lint-report.json file found.');
  }

  // 3. Parse Signing / Marketplace Logs
  const signStdout = readTextFile(SIGN_STDOUT_PATH);
  const signStderr = readTextFile(SIGN_STDERR_PATH);
  const combinedSignLogs = `${signStdout}\n${signStderr}`.trim();

  if (combinedSignLogs) {
    summaryMarkdown += `### 📦 Marketplace Publishing & Signing Status\n\n`;

    // Analyze common AMO error patterns
    const isSuccess = combinedSignLogs.includes('Your add-on has been submitted for review') ||
                      combinedSignLogs.includes('Your add-on has been signed') ||
                      combinedSignLogs.includes('Downloaded:') ||
                      combinedSignLogs.includes('Success');

    const isAuthError = combinedSignLogs.includes('401') ||
                        combinedSignLogs.includes('Unauthorized') ||
                        combinedSignLogs.includes('JWT') ||
                        combinedSignLogs.includes('Invalid API key') ||
                        combinedSignLogs.includes('authentication failed');

    const isVersionDuplicate = combinedSignLogs.includes('Version already exists') ||
                               combinedSignLogs.includes('version already exists') ||
                               combinedSignLogs.includes('DUPLICATE_VERSION');

    const isValidationError = combinedSignLogs.includes('Validation failed') ||
                              combinedSignLogs.includes('validation failed') ||
                              combinedSignLogs.includes('VALIDATION_FAILED');

    const isTimeout = combinedSignLogs.includes('timed out') ||
                      combinedSignLogs.includes('Timeout') ||
                      combinedSignLogs.includes('ETIMEDOUT');

    if (isSuccess) {
      console.log('🎉 Marketplace signing / submission was successful!');
      summaryMarkdown += `> ✅ **Success**: Add-on successfully submitted / signed on Mozilla Add-ons Marketplace!\n\n`;
    } else {
      console.error('\n🚨 Marketplace signing or submission encountered errors:');
      summaryMarkdown += `> ❌ **Marketplace Submission Issue Detected**\n\n`;

      if (isAuthError) {
        hasErrors = true;
        const reason = 'Invalid or expired Mozilla API Credentials (AMO_JWT_ISSUER / AMO_JWT_SECRET).';
        console.error(`- Error: ${reason}`);
        printGitHubAnnotation('error', '', '', '', `[AMO API Error] ${reason}`);
        summaryMarkdown += `> [!CAUTION]\n> **Authentication Error**: The \`AMO_JWT_ISSUER\` (API Key) or \`AMO_JWT_SECRET\` secret is missing, incorrect, or expired. Generate a new key at [addons.mozilla.org/developers/addon/api/key/](https://addons.mozilla.org/en-US/developers/addon/api/key/).\n\n`;
      }

      if (isVersionDuplicate) {
        hasErrors = true;
        const reason = `Version ${manifest.version} has already been uploaded or published to AMO.`;
        console.error(`- Error: ${reason}`);
        printGitHubAnnotation('error', 'manifest.json', 4, 1, `[AMO Version Conflict] ${reason}`);
        summaryMarkdown += `> [!WARNING]\n> **Duplicate Version**: Version \`${manifest.version}\` already exists on AMO. Bump the \`"version"\` in \`manifest.json\` (e.g. to \`1.2.1\`) before publishing a new release.\n\n`;
      }

      if (isValidationError) {
        hasErrors = true;
        const reason = 'Mozilla AMO automated validation rejected the package.';
        console.error(`- Error: ${reason}`);
        printGitHubAnnotation('error', '', '', '', `[AMO Validation Error] ${reason}`);
        summaryMarkdown += `> [!CAUTION]\n> **Validation Rejected**: AMO validation found security or manifest policy violations. Check the validation report table above.\n\n`;
      }

      if (isTimeout) {
        const reason = 'Network timeout while waiting for AMO signing / review confirmation.';
        console.warn(`- Warning: ${reason}`);
        printGitHubAnnotation('warning', '', '', '', `[AMO Timeout] ${reason}`);
        summaryMarkdown += `> [!NOTE]\n> **Signing Timeout**: Automated review did not finish within the wait period. Your submission was received and is processing asynchronously in the [AMO Developer Hub](https://addons.mozilla.org/developers/).\n\n`;
      }

      summaryMarkdown += `#### 📜 Raw Marketplace Logs\n\`\`\`text\n${combinedSignLogs.slice(-2000)}\n\`\`\`\n\n`;
    }
  }

  // 4. Write Summary to GITHUB_STEP_SUMMARY
  appendToSummary(summaryMarkdown);

  console.log('='.repeat(70));
  if (hasErrors) {
    console.error('❌ Diagnostics completed with errors. See summary and log details above.');
    process.exit(1);
  } else {
    console.log('✅ Diagnostics completed successfully without blocking errors.');
    process.exit(0);
  }
}

main();
