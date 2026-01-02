# GitAI SAST Configuration Guide

## Opengrep Configuration

To use your custom Opengrep installation and rules, configure the following settings in VS Code:

### Option 1: Using PATH (Recommended)

If Opengrep is in your PATH:
```json
{
  "gitai.sast.opengrepPath": "",
  "gitai.sast.opengrepRules": ""
}
```

### Option 2: Using Specific Binary Path

If Opengrep is not in PATH, specify the full path:
```json
{
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": ""
}
```

### Option 3: Using Custom Rules

To use custom rules instead of default `auto` config:
```json
{
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": "/path/to/your/rules"
}
```

The `opengrepRules` can be:
- A directory containing rule files
- A single YAML rule file
- Leave empty to use `--config=auto` (default)

## Semgrep Integration

GitAI SAST can automatically sync configuration with the Semgrep plugin:

### What Gets Synced

| GitAI SAST Setting | Semgrep Setting | Description |
|---------------------|-----------------|-------------|
| `gitai.sast.opengrepPath` | `semgrep.path` | Path to Opengrep binary |
| `gitai.sast.opengrepRules` | `semgrep.scan.configuration` | Rules configuration |

### Automatic Sync

When you change `gitai.sast.opengrepPath` or `gitai.sast.opengrepRules`, the configuration is automatically synced to Semgrep plugin.

**Note:** Automatic sync only works if Semgrep Bridge is enabled (you'll see a popup asking if you want to enable it).

### Manual Sync

You can manually sync configuration using:

**Command Palette (`Cmd+Shift+P`):**
- `GitAI SAST: Sync Config to Semgrep`
- `GitAI SAST: Restore Semgrep Config` (restore original Semgrep settings)

### Initial Setup

1. First time you activate GitAI SAST with Semgrep installed, you'll see a popup:
   ```
   GitAI 可复用 Semgrep 插件作为 Opengrep 的 LSP Client 来提供实时 Diagnostics（会写入工作区的 Semgrep 设置）。是否启用？
   ```
   - Click "启用" (Enable) to enable sync

2. GitAI SAST will:
   - Backup your original Semgrep settings
   - Write new settings based on GitAI SAST configuration
   - Restart Semgrep LSP Server

### Restoring Original Settings

If you want to restore your original Semgrep settings:

1. Run `GitAI SAST: Restore Semgrep Config`
2. Your original settings will be restored
3. Semgrep LSP Server will be restarted

## Recommended Configuration for Your Setup

Based on your Semgrep plugin configuration:

```json
{
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": "",
  "gitai.sast.severityThreshold": "medium"
}
```

### With Semgrep Sync Enabled

After enabling Semgrep Bridge, these settings will be synced to Semgrep plugin:

```json
{
  "semgrep.path": "/Users/huchen/.local/bin/opengrep",
  "semgrep.scan.configuration": ["auto"],
  "semgrep.metrics": false,
  "semgrep.useExperimentalLS": false,
  "semgrep.ignoreCliVersion": true
}
```

## Troubleshooting

### Option 1: Using PATH (Recommended)

If Opengrep is in your PATH:
```json
{
  "gitai.sast.opengrepPath": "",
  "gitai.sast.opengrepRules": ""
}
```

### Option 2: Using Specific Binary Path

If Opengrep is not in PATH, specify the full path:
```json
{
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": ""
}
```

### Option 3: Using Custom Rules

To use custom rules instead of default `auto` config:
```json
{
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": "/path/to/your/rules"
}
```

The `opengrepRules` can be:
- A directory containing rule files
- A single YAML rule file
- Leave empty to use `--config=auto` (default)

## Recommended Configuration for Your Setup

Based on your Semgrep plugin configuration:

```json
{
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": "",
  "gitai.sast.severityThreshold": "medium"
}
```

## Troubleshooting

### Problem: No vulnerabilities found

**Possible Causes:**

1. **Opengrep not found**: Check the path is correct
2. **Rules not loaded**: Check the rules path
3. **Severity threshold too high**: Try setting to `low` temporarily
4. **File not supported**: Opengrep may not support all file types

**Solution:**

1. Check MCP Server logs for detailed error messages
2. Test Opengrep manually:
   ```bash
   /Users/huchen/.local/bin/opengrep scan --json --severity=MEDIUM --config=auto /path/to/your/file
   ```

3. Enable debug logging in VS Code settings:
   ```json
   {
     "gitai.sast.ai.debugLogging": true
   }
   ```

### Problem: "Opengrep scan failed" error

**Check:**
- Opengrep executable is accessible
- Rules path is valid (if specified)
- File is not too large (>10MB)

### Problem: "Failed to parse opengrep output"

**Check:**
- Opengrep output format (should be JSON)
- Opengrep version compatibility

## Complete Example Configuration

```json
{
  // Opengrep Settings
  "gitai.sast.opengrepPath": "/Users/huchen/.local/bin/opengrep",
  "gitai.sast.opengrepRules": "",

  // Scan Settings
  "gitai.sast.severityThreshold": "medium",
  "gitai.sast.enableAutoScan": true,

  // AI Settings (Optional)
  "gitai.sast.ai.provider": "openaiCompatible",
  "gitai.sast.ai.apiUrl": "http://localhost:1234/v1/chat/completions",
  "gitai.sast.ai.modelName": "deepseek-coder",
  "gitai.sast.ai.temperature": 0.2,

  // Remote Scan (Optional - requires License)
  "gitai.sast.enableRemoteScan": false,
  "gitai.sast.remoteUrl": "https://oscap-poc1.out.secidea.com:40081",
  "gitai.sast.remoteUserId": "your-user-id",
  "gitai.sast.remoteCaCertPath": "/path/to/cert.pem",
  "gitai.sast.remoteAllowInsecureTls": false
}
```
