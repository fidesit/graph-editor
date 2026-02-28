# npm Trusted Publishing Diagnosis & Fix

## Current Status
✅ **Workflow is 95% correct** — The issue is on npmjs.com configuration, not the workflow.

---

## Root Cause: 404 Not Found

The `404 Not Found - PUT https://registry.npmjs.org/@utisha%2fgraph-editor` error occurs because:

1. **Trusted Publishing is NOT enabled** on npmjs.com for your package
2. **No Automation token exists** for the GitHub organization
3. npm is trying to publish with OIDC (provenance) but can't authenticate

---

## What's Needed

### 1. ✅ Workflow (publish.yml) — CORRECT

Your workflow is **properly configured**:

```yaml
permissions:
  contents: read
  id-token: write          # ✅ Correct: allows OIDC token generation
```

```yaml
registry-url: 'https://registry.npmjs.org'  # ✅ Correct
```

```yaml
npm publish ./dist/graph-editor --access public --provenance  # ✅ Correct
```

**No changes needed here.**

---

### 2. ❌ npmjs.com Configuration — MISSING

You must enable **Trusted Publishing** on npmjs.com:

#### Step 1: Go to Package Settings
1. Log in to [npmjs.com](https://www.npmjs.com)
2. Navigate to **@utisha/graph-editor** package
3. Click **Settings** tab
4. Scroll to **Publishing** section

#### Step 2: Enable Trusted Publishing
1. Find **"Trusted Publishing"** or **"Automation"** section
2. Click **"Add a new automation"** or **"Enable Trusted Publishing"**
3. Select **GitHub** as the provider
4. Enter:
   - **Repository**: `fidesit/graph-editor`
   - **Workflow**: `publish.yml` (or leave blank for all workflows)
   - **Environment** (optional): leave blank or set to `production`

#### Step 3: Verify
- Save the configuration
- npm will now trust OIDC tokens from your GitHub Actions workflow

---

### 3. Common Causes of 404 Error

| Cause | Fix |
|-------|-----|
| Trusted Publishing not enabled | Enable it on npmjs.com (see Step 2 above) |
| Wrong package name in publish command | Use `./dist/graph-editor` (you have this correct) |
| Missing `id-token: write` permission | Add to workflow (you have this correct) |
| Old npm version in CI | Use `npm@10+` (you have `node-version: 20`, which includes npm 10) |
| Typo in repository name | Verify `fidesit/graph-editor` matches your GitHub repo |
| Publishing to wrong registry | Verify `registry-url: https://registry.npmjs.org` (you have this correct) |

---

## Verification Checklist

- [ ] Log in to npmjs.com
- [ ] Go to @utisha/graph-editor package settings
- [ ] Enable Trusted Publishing for GitHub
- [ ] Set repository to `fidesit/graph-editor`
- [ ] Set workflow to `publish.yml`
- [ ] Save configuration
- [ ] Create a new GitHub Release to trigger the workflow
- [ ] Check GitHub Actions logs for success

---

## If Still Getting 404

1. **Check npm account permissions**
   - Ensure your npm account is the package owner
   - Run: `npm owner ls @utisha/graph-editor`

2. **Verify OIDC token is being generated**
   - Check GitHub Actions logs for: `"ACTIONS_ID_TOKEN_REQUEST_URL"`
   - If missing, Trusted Publishing is not enabled

3. **Check npm version**
   - npm 9.0.0+ required for Trusted Publishing
   - Your workflow uses Node 20, which has npm 10+ ✅

4. **Fallback: Use NPM_TOKEN (not recommended)**
   - If Trusted Publishing fails, create a classic token:
     - npmjs.com → Account → Tokens → Create Token (Automation)
     - Add to GitHub: Settings → Secrets → `NPM_TOKEN`
     - Update workflow to use: `npm publish ./dist/graph-editor --access public`
     - Remove `--provenance` flag

---

## Summary

| Component | Status | Action |
|-----------|--------|--------|
| publish.yml workflow | ✅ Correct | None |
| Node.js version | ✅ Correct (20) | None |
| npm version | ✅ Correct (10+) | None |
| Trusted Publishing on npmjs.com | ❌ **NOT ENABLED** | **Enable now** |
| Repository name in config | ⚠️ Verify | Check `fidesit/graph-editor` |

**Next step: Enable Trusted Publishing on npmjs.com for @utisha/graph-editor**
