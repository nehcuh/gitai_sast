import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { exec } from 'child_process';

/**
 * Manages the installation of external dependencies:
 * 1. Opengrep Binary
 * 2. Semgrep Rules
 */
export class InstallationManager {
    private static readonly OPENGREP_REPO = 'opengrep/opengrep';
    private static readonly RULES_REPO = 'https://github.com/semgrep/semgrep-rules.git';

    /**
     * Checks if dependencies are configured and installed.
     * If not, prompts the user to auto-install.
     */
    static async checkAndInstallDependencies(context: vscode.ExtensionContext): Promise<void> {
        // Check current configuration
        const config = vscode.workspace.getConfiguration('gitai.sast');
        let opengrepPath = config.get<string>('opengrepPath');
        let opengrepRules = config.get<string>('opengrepRules');

        // Check availability
        const opengrepReady = await this.isOpengrepReady(opengrepPath);
        const rulesReady = await this.isRulesReady(opengrepRules);

        if (opengrepReady && rulesReady) {
            return; // All good
        }

        // Prompt user
        const missingItems = [];
        if (!opengrepReady) missingItems.push('Opengrep');
        if (!rulesReady) missingItems.push('Rules');

        const message = `GitAI SAST: Missing dependencies (${missingItems.join(', ')}). Would you like to configure them automatically?`;
        const selection = await vscode.window.showInformationMessage(message, 'Auto Install (Default)', 'Choose Path', 'Cancel');

        if (selection === 'Auto Install (Default)') {
            await this.performAutoInstall(context);
        } else if (selection === 'Choose Path') {
            await this.performManualConfig();
        }
    }

    private static async isOpengrepReady(pathStr: string | undefined): Promise<boolean> {
        if (!pathStr) return false;
        try {
            return fs.existsSync(pathStr);
        } catch {
            return false;
        }
    }

    private static async isRulesReady(pathStr: string | undefined): Promise<boolean> {
        if (!pathStr) return false;
        try {
            return fs.existsSync(pathStr);
        } catch {
            return false;
        }
    }

    private static async performAutoInstall(context: vscode.ExtensionContext): Promise<void> {
        const rootPath = vscode.workspace.rootPath;
        if (!rootPath) {
            vscode.window.showErrorMessage('Auto-install requires an open workspace.');
            return;
        }

        const binDir = path.join(rootPath, 'bin');
        const rulesDir = path.join(rootPath, 'rules');

        // Ensure directories exist
        if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
        if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Installing GitAI Dependencies',
            cancellable: false
        }, async (progress) => {
            try {
                // 1. Install Opengrep
                progress.report({ message: 'Downloading Opengrep...' });
                const opengrepPath = await this.downloadOpengrep(binDir);

                // 2. Install Rules
                progress.report({ message: 'Cloning Rules...' });
                await this.downloadRules(rulesDir);

                // 3. Update Settings
                progress.report({ message: 'Updating Settings...' });
                const target = vscode.ConfigurationTarget.Workspace;
                await vscode.workspace.getConfiguration('gitai.sast').update('opengrepPath', opengrepPath, target);
                // Correct key: opengrepRules
                await vscode.workspace.getConfiguration('gitai.sast').update('opengrepRules', rulesDir, target);

                vscode.window.showInformationMessage(`Successfully installed dependencies to ${binDir} and ${rulesDir}`);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Installation failed: ${msg}`);
            }
        });
    }

    private static async performManualConfig(): Promise<void> {
        vscode.commands.executeCommand('workbench.action.openSettings', 'gitai.sast');
    }

    private static async downloadOpengrep(targetDir: string): Promise<string> {
        const platform = os.platform(); // 'darwin', 'linux', 'win32'
        const arch = os.arch(); // 'x64', 'arm64'

        // Map node platform/arch to Opengrep asset naming
        let osStr = '';
        if (platform === 'darwin') osStr = 'osx';
        else if (platform === 'linux') osStr = 'linux';
        else if (platform === 'win32') osStr = 'windows';
        else throw new Error(`Unsupported platform: ${platform}`);

        let archStr = '';
        if (arch === 'x64') archStr = 'x86_64';
        else if (arch === 'arm64') archStr = 'aarch64';
        else throw new Error(`Unsupported architecture: ${arch}`);

        const releaseApiUrl = `https://api.github.com/repos/${this.OPENGREP_REPO}/releases/latest`;
        const headers = { 'User-Agent': 'GitAI-SAST-Extension' };

        const releaseInfo = await this.fetchJson(releaseApiUrl, headers);
        if (!releaseInfo || !releaseInfo.assets) {
            throw new Error("Failed to fetch release info from GitHub.");
        }

        const assets = releaseInfo.assets as any[];
        // Find matching asset
        // Pattern: opengrep-core_<os>_<arch>.tar.gz/zip or similar
        const asset = assets.find(a => {
            const name = a.name.toLowerCase();
            return name.includes(osStr) && (name.includes(archStr) || (archStr === 'x86_64' && name.includes('x86')));
        });

        if (!asset) {
            throw new Error(`No compatible Opengrep binary found for ${osStr} ${archStr}`);
        }

        const downloadUrl = asset.browser_download_url;
        const archivePath = path.join(targetDir, asset.name);

        // Download
        await this.downloadFile(downloadUrl, archivePath);

        // Extract
        await this.extractArchive(archivePath, targetDir);

        // Find the executable in usage
        // It might be 'opengrep-core' inside. Rename/Symlink to 'opengrep'
        const files = fs.readdirSync(targetDir);
        const coreBin = files.find(f => f.startsWith('opengrep-core') || f.startsWith('opengrep'));

        if (!coreBin) {
            throw new Error("Extracted archive does not contain expected binary.");
        }

        const finalExecutableName = platform === 'win32' ? 'opengrep.exe' : 'opengrep';
        const finalBinPath = path.join(targetDir, finalExecutableName);

        if (platform !== 'win32') {
            // Rename to opengrep
            // If extracted file is different name, rename it
            const extractedBinPath = path.join(targetDir, coreBin);
            if (extractedBinPath !== finalBinPath) {
                if (fs.existsSync(finalBinPath)) fs.unlinkSync(finalBinPath); // remove old if exists
                fs.renameSync(extractedBinPath, finalBinPath);
            }
            fs.chmodSync(finalBinPath, 0o755);
        } else {
            // Windows logic: might need renaming if name is complex
            // Assuming user handles or we rename to opengrep.exe
        }

        return finalBinPath;
    }

    private static fetchJson(url: string, headers: any): Promise<any> {
        return new Promise((resolve, reject) => {
            https.get(url, { headers }, (res) => {
                if (res.statusCode !== 200) {
                    res.resume();
                    reject(new Error(`Request failed with status code ${res.statusCode}`));
                    return;
                }
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(e);
                    }
                });
            }).on('error', reject);
        });
    }

    private static downloadFile(url: string, dest: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(dest);
            https.get(url, { headers: { 'User-Agent': 'GitAI-SAST-Extension' } }, (res) => {
                if (res.statusCode === 302 || res.statusCode === 301) {
                    // Handle redirect
                    if (!res.headers.location) {
                        reject(new Error("Redirect location missing"));
                        return;
                    }
                    this.downloadFile(res.headers.location, dest).then(resolve).catch(reject);
                    return;
                }
                if (res.statusCode !== 200) {
                    reject(new Error(`Download failed: ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => { });
                reject(err);
            });
        });
    }

    private static extractArchive(archivePath: string, targetDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const ext = path.extname(archivePath);
            let cmd = '';
            if (ext === '.zip') {
                cmd = `unzip -o "${archivePath}" -d "${targetDir}"`;
            } else if (ext === '.gz' || ext === '.tgz') {
                cmd = `tar -xzf "${archivePath}" -C "${targetDir}"`;
            } else {
                reject(new Error(`Unsupported archive format: ${ext}`));
                return;
            }

            exec(cmd, (err) => {
                if (err) reject(err);
                else {
                    // Cleanup
                    try {
                        if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
                    } catch (e) {
                        console.warn("Failed to delete archive:", e);
                    }
                    resolve();
                }
            });
        });
    }

    private static async downloadRules(targetDir: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Use git clone if available
            // Check if git is available first?
            exec(`git clone --depth 1 ${this.RULES_REPO} "${targetDir}"`, (err, stdout, stderr) => {
                if (err) {
                    // If git fails or folder exists (and not empty), maybe it's fine or failed.
                    if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
                        resolve();
                    } else {
                        reject(new Error(`Git clone failed: ${err.message}`));
                    }
                } else {
                    resolve();
                }
            });
        });
    }
}
