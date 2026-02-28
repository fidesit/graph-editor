# Quick Setup: npm Trusted Publishing with GitHub Actions

## The Problem
```
Error: 404 Not Found - PUT https://registry.npmjs.org/@utisha%2fgraph-editor
Error: Access token expired or revoked
```

**Cause**: Trusted Publishing is not enabled on npmjs.com

---

## The Solution (5 minutes)

### 1. Go to npmjs.com Package Settings
```
https://www.npmjs.com/package/@utisha/graph-editor/settings
```

### 2. Find "Publishing" or "Automation" Section
Look for:
- "Trusted Publishing"
- "Automation"
- "GitHub Actions"

### 3. Click "Add Automation" or "Enable Trusted Publishing"

### 4. Fill in the Form
```
Provider:     GitHub
Repository:   fidesit/graph-editor
Workflow:     publish.yml
Environment:  (leave blank or set to "production")
```

### 5. Save

### 6. Test
Create a GitHub Release with tag `v1.0.1` to trigger the workflow.

---

## Your Workflow is Already Correct ✅

```yaml
permissions:
  contents: read
  id-token: write              # ✅ Allows OIDC token generation

steps:
  - uses: actions/setup-node@v4
    with:
      registry-url: 'https://registry.npmjs.org'  # ✅ Correct registry
      
  - run: npm publish ./dist/graph-editor --access public --provenance  # ✅ Correct
```

**No changes needed to your workflow.**

---

## Why This Works

1. **GitHub Actions** generates an OIDC token (JWT) signed by GitHub
2. **npm registry** verifies the token signature
3. **npmjs.com** trusts the token because you enabled Trusted Publishing
4. **No secrets needed** — no `NPM_TOKEN` to leak

---

## Troubleshooting

### Still getting 404?
1. Verify you're logged in as the package owner
2. Check that Trusted Publishing is actually saved (refresh the page)
3. Verify repository name is exactly `fidesit/graph-editor`
4. Check GitHub Actions logs for `ACTIONS_ID_TOKEN_REQUEST_URL`

### Getting "Access token expired"?
- This means Trusted Publishing is not enabled
- Follow steps 1-5 above

### Want to verify it's working?
Run this command locally:
```bash
npm owner ls @utisha/graph-editor
```

If you see your account, you're the owner and can enable Trusted Publishing.

---

## Reference

- [npm Trusted Publishing Docs](https://docs.npmjs.com/creating-and-viewing-access-tokens#trusted-publishing)
- [GitHub OIDC in Actions](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
