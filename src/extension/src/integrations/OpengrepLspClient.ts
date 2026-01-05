import * as vscode from 'vscode';
import {
    LanguageClient,
    LanguageClientOptions,
    ServerOptions, // NodeModule is not exported by vscode-languageclient/node in all versions, checking usage
    TransportKind,
    Executable
} from 'vscode-languageclient/node';
import * as path from 'path';
import * as output from '../core/OutputLogger';

/**
 * Opengrep Native LSP Client
 * Manages the connection to the opengrep binary running in LSP mode.
 */
export class OpengrepLspClient implements vscode.Disposable {
    private client: LanguageClient | undefined;
    private readonly disposables: vscode.Disposable[] = [];
    private context: vscode.ExtensionContext;
    private statusItem: vscode.StatusBarItem;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusItem.text = '$(shield) GitAI LSP: Stopped';
        this.statusItem.command = 'gitai.sast.restartLsp';
        this.disposables.push(this.statusItem);
        this.context.subscriptions.push(this);
    }

    dispose(): void {
        this.stop().catch(err => output.error(`Failed to stop LSP client: ${err}`));
        for (const d of this.disposables) {
            d.dispose();
        }
    }

    /**
     * Start the LSP client
     */
    async start(): Promise<void> {
        if (this.client) {
            // Already started
            return;
        }

        const config = vscode.workspace.getConfiguration('gitai.sast');
        // Using opengrepPath or fallback to 'opengrep' from PATH
        const opengrepPath = config.get<string>('opengrepPath', '') || 'opengrep';
        const opengrepRules = config.get<string>('opengrepRules', '') || '';

        output.info(`[OpengrepLsp] Starting LSP client... Path: ${opengrepPath}, Rules: ${opengrepRules}`);

        // Command to start opengrep in LSP mode
        // Assuming 'opengrep lsp' is the command. Verification needed if it's 'scan --lsp' etc.
        // Based on Semgrep, it's usually 'semgrep lsp'. 
        const command = opengrepPath;
        const args: string[] = ['lsp'];

        if (opengrepRules) {
            // NOTE: 'opengrep lsp' does not accept --config in the same way 'scan' does via CLI args.
            // It might consume it via initializationOptions or workspace configuration.
            // For now, removing it to prevent the crash "unknown option --config".
            // We can pass it via initializationOptions if supported.
            // args.push('--config', opengrepRules);
        } else {
            // args.push('--config=auto');
        }

        // Add debug flag if enabled
        /*
        if (config.get<boolean>('ai.debugLogging', false)) {
            args.push('--debug');
        }
        */

        output.info(`[OpengrepLsp] Command: ${command} ${args.join(' ')}`);

        const serverOptions: ServerOptions = {
            run: { command, args },
            debug: { command, args }
        };

        const clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'python' },
                { scheme: 'file', language: 'javascript' },
                { scheme: 'file', language: 'typescript' },
                { scheme: 'file', language: 'javascriptreact' },
                { scheme: 'file', language: 'typescriptreact' },
                { scheme: 'file', language: 'java' },
                { scheme: 'file', language: 'csharp' },
                { scheme: 'file', language: 'go' },
                { scheme: 'file', language: 'ruby' },
                { scheme: 'file', language: 'rust' }
            ],
            synchronize: {
                // Notify the server about file changes to 'opengrep.yaml' or '.opengrepexclude' contained in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher('**/.{opengrep,semgrep}*')
            },
            initializationOptions: {
                // Pass initialization options. Opengrep/Semgrep requires 'scan' key.
                scan: {
                    config: opengrepRules || 'auto',
                    mode: config.get<string>('scanMode', 'currentFile')
                }
            }
        };

        try {
            this.client = new LanguageClient(
                'gitai-sast-lsp',
                'GitAI SAST Language Server',
                serverOptions,
                clientOptions
            );

            this.statusItem.text = '$(sync~spin) GitAI LSP: Starting...';
            this.statusItem.show();

            await this.client.start();

            output.info('[OpengrepLsp] LSP client started successfully.');
            this.statusItem.text = '$(check) GitAI LSP: Running';
            this.statusItem.tooltip = `Opengrep running on ${opengrepPath}`;

        } catch (error) {
            output.error(`[OpengrepLsp] Failed to start LSP client: ${error}`);
            this.statusItem.text = '$(error) GitAI LSP: Error';
            this.statusItem.tooltip = `Failed to start: ${error}`;
            vscode.window.showErrorMessage(`GitAI SAST: Failed to start Opengrep LSP. Check output for details.`);
            this.client = undefined;
        }
    }

    /**
     * Stop the LSP client
     */
    async stop(): Promise<void> {
        if (!this.client) {
            return;
        }

        output.info('[OpengrepLsp] Stopping LSP client...');
        this.statusItem.text = '$(stop) GitAI LSP: Stopping...';

        try {
            await this.client.stop();
            output.info('[OpengrepLsp] LSP client stopped.');
        } catch (error) {
            output.error(`[OpengrepLsp] Error stopping client: ${error}`);
        } finally {
            this.client = undefined;
            this.statusItem.text = '$(shield) GitAI LSP: Stopped';
        }
    }

    /**
     * Restart the LSP client
     */
    async restart(): Promise<void> {
        await this.stop();
        await this.start();
    }

    /**
     * Handle configuration changes
     */
    handleConfigChange(e: vscode.ConfigurationChangeEvent): void {
        if (
            e.affectsConfiguration('gitai.sast.opengrepPath') ||
            e.affectsConfiguration('gitai.sast.opengrepRules') ||
            e.affectsConfiguration('gitai.sast.scanMode')
        ) {
            output.info('[OpengrepLsp] Configuration changed, restarting LSP...');
            void this.restart();
        }
    }
}
