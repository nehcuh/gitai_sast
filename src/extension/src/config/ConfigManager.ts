import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Configuration Manager
 * Handles loading configuration from VS Code settings and optionally local config files.
 */
export class ConfigManager {
    private static readonly CONFIG_SECTION = 'gitai.sast';
    private static readonly CUSTOM_CONFIG_FILE = 'sast.settings.json';

    /**
     * Get a configuration value
     * Priority: 
     * 1. .vscode/sast.settings.json (if exists)
     * 2. VS Code Workspace Settings
     * 3. VS Code User Settings
     * 4. Default value
     */
    static get<T>(key: string, defaultValue?: T): T {
        // 1. Try to read from local config file
        const localValue = this.getFromLocalConfig<T>(key);
        if (localValue !== undefined) {
            return localValue;
        }

        // 2. Fallback to VS Code configuration
        return vscode.workspace.getConfiguration(this.CONFIG_SECTION).get<T>(key, defaultValue as T);
    }

    /**
     * Read from .vscode/sast.settings.json
     */
    private static getFromLocalConfig<T>(key: string): T | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return undefined;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        const configPath = path.join(rootPath, '.vscode', this.CUSTOM_CONFIG_FILE);

        if (fs.existsSync(configPath)) {
            try {
                const content = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(content);

                // Attempt to find the key in the JSON object
                // We assume the JSON structure matches the key name (flat)
                // e.g. { "opengrepPath": "..." }
                if (config && Object.prototype.hasOwnProperty.call(config, key)) {
                    return config[key];
                }
            } catch (error) {
                console.warn(`[ConfigManager] Failed to parse ${this.CUSTOM_CONFIG_FILE}:`, error);
            }
        }

        return undefined;
    }
}
