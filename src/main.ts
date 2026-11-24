import {Plugin, Notice, TFile, TAbstractFile} from "obsidian";
import {PluginSettings, DEFAULT_SETTINGS, SyncStatus, ConflictFile} from "./types";
import {MultiSyncSettingsTab} from "./ui/settings-tab";
import {StatusBarItem} from "./ui/status-bar";
import {ConflictModal} from "./ui/conflict-modal";
import {GitSync} from "./sync/git-sync";
import {SyncQueue} from "./sync/queue";
import {repoExists} from "./github/api";
import {PLUGIN_TITLE} from "./constants";
import {PullBarItem} from "./ui/pull-bar";

export default class MultiSyncPlugin extends Plugin {
    settings!: PluginSettings;
    private statusBar!: StatusBarItem;
    private pullBar!: PullBarItem;
    private gitSync: GitSync | null = null;
    private syncQueue: SyncQueue | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();

        this.statusBar = new StatusBarItem(this);
        this.statusBar.onClick(() => this.triggerManualSync());

        // this.pullBar = new PullBarItem(this);
        // this.pullBar.onClick(() => this.triggerManualSync());

        this.addSettingTab(new MultiSyncSettingsTab(this.app, this));

        // Keyboard command
        this.addCommand({
            id: "sync-now",
            name: "Sync vault now",
            callback: () => this.triggerManualSync(),
        });

        // Boot sync engine if already connected
        if (
            this.settings.githubToken &&
            this.settings.githubUsername &&
            this.settings.repoName
        ) {
            await this.bootSyncEngine();
        }

        // Pull on open — wait for workspace to be ready
        this.app.workspace.onLayoutReady(async () => {
            if (this.gitSync) {
                this.setStatus("pulling");
                try {
                    await this.gitSync.pull();
                    this.setStatus("idle");
                } catch {
                    // Pull errors on open are non-fatal (e.g. offline) — just show error state
                    this.setStatus("error", "Pull failed on open");
                }
            }
        });

        // Watch file changes for auto-sync
        this.registerEvent(
            this.app.vault.on("modify", (file: TAbstractFile) => {
                if (!(file instanceof TFile)) return;
                if (!this.syncQueue || !this.settings.autoSync) return;
                if (this.isExcluded(file.path)) return;
                this.syncQueue.enqueue(file.path);
            })
        );

        this.registerEvent(
            this.app.vault.on("create", (file: TAbstractFile) => {
                if (!(file instanceof TFile)) return;
                if (!this.syncQueue || !this.settings.autoSync) return;
                if (this.isExcluded(file.path)) return;
                this.syncQueue.enqueue(file.path);
            })
        );

        this.registerEvent(
            this.app.vault.on("delete", (file: TAbstractFile) => {
                if (!(file instanceof TFile)) return;
                if (!this.syncQueue || !this.settings.autoSync) return;
                this.syncQueue.enqueue(file.path);
            })
        );

        this.registerEvent(
            this.app.vault.on("rename", (_file: TAbstractFile, oldPath: string) => {
                if (!this.syncQueue || !this.settings.autoSync) return;
                this.syncQueue.enqueue(oldPath);
            })
        );
    }

    async onunload(): Promise<void> {
        // Flush pending changes on close
        if (this.syncQueue) {
            await this.syncQueue.flushNow();
        }
    }

    async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
    }

    setStatus(status: SyncStatus, detail?: string): void {
        this.statusBar.set(status, detail);
    }

    private getVaultDir(): string {
        const adapter = this.app.vault.adapter;
        return (adapter as any).basePath ?? "";
    }

    private getRootDir(): string {
        return this.getVaultDir().replace(this.app.vault.getName(), '').slice(0, -1);
    }

    private getAllFiles(): string[] {
        return this.app.vault
            .getFiles()
            .map((f) => f.path)
            .filter((p) => !this.isExcluded(p));
    }

    async test(): Promise<void> {

        let i = 0;
        for (const x of this.app.vault.getFiles()) {
            new Notice(`t${i}: ${x.path}`)
            new Notice(`t${i}: ${x.basename}`)
            new Notice(`t${i}: ${x.name}`)

            i++;
            break;
        }
    }

    async initRepo(): Promise<void> {
        this.setStatus("connecting");
        const repoFullName = `${this.settings.githubUsername}/${this.settings.repoName}`;

        const adapter = this.app.vault.adapter;
        // Obsidian exposes basePath on FileSystemAdapter (desktop). On mobile the vault
        // root is the adapter itself, so we fall back to an empty string which causes
        // isomorphic-git to use relative paths from the adapter root.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sync = new GitSync(
            adapter,
            this.getVaultDir(),
            this.app.vault.getName(),
            this.settings.githubToken,
            this.settings.githubUsername,
            this.settings.repoName,
            this.settings.repoHubHost
        );
        const remoteExists = await repoExists(this.settings.repoApiHost, this.settings.githubToken, this.settings.githubUsername, this.settings.repoName);
        if (!remoteExists) {
            throw new Error(`Repository "${repoFullName}" doesn't exist!`);
        }


        const alreadyInit = await sync.isInitialized();

        if (!alreadyInit) {
            await sync.clone();
            new Notice(`Cloned repo: ${repoFullName}`);
        } else {
            // Already initialized locally — ensure remote URL is current, then reconnect.
            // Also handles the case where a previous push was interrupted (local branch
            // exists but remote is empty): ensureLocalBranch will push on next sync.
            new Notice(`Reconnected to: ${repoFullName}`);
        }

        this.settings.lastSyncTime = Date.now();

        await this.saveSettings();
        // await this.bootSyncEngine();
        this.setStatus("idle");
    }

    /**
     * Called after the user connects their GitHub account.
     * Determines whether to clone (existing repo) or init+push (new repo).
     */
    async bootSyncEngine(): Promise<void> {
        const {githubToken, githubUsername, repoName} = this.settings;
        if (!githubToken || !githubUsername || !repoName) {
            new Notice('skip sync engine')
            return;
        }

        this.gitSync = new GitSync(
            this.app.vault.adapter,
            this.getVaultDir(),
            this.app.vault.getName(),
            githubToken,
            githubUsername,
            repoName,
            this.settings.repoHubHost,
        );

        this.syncQueue = new SyncQueue(this.gitSync, (status, detail) => {
            this.setStatus(status, detail);
            if (status === "idle") {
                this.settings.lastSyncTime = Date.now();
                this.saveSettings();
            }
        });
    }

    async triggerManualSync(): Promise<void> {
        if (!this.gitSync) {
            new Notice(
                `${PLUGIN_TITLE}: not connected. Please connect your GitHub account in settings.`
            );
            return;
        }

        this.setStatus("pulling");
        try {
            const allFiles = this.app.vault
                .getFiles()
                .map((f) => f.path)
                .filter((p) => !this.isExcluded(p));

            const result = await this.gitSync.sync(allFiles);

            if (result.conflictFiles.length > 0) {
                this.setStatus("conflict");
                this.showConflictModal(result.conflictFiles);
            } else if (result.success) {
                this.settings.lastSyncTime = Date.now();
                await this.saveSettings();
                this.setStatus("idle");
                new Notice("Vault synced successfully.");
            } else {
                this.setStatus("error", result.error);
                new Notice(`Sync error: ${result.error}`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.setStatus("error", msg);
            new Notice(`Sync failed: ${msg}`);
        }
    }

    private showConflictModal(conflicts: ConflictFile[]): void {
        new ConflictModal(
            this.app,
            conflicts,
            async (filepath, resolved) => {
                await this.gitSync!.resolveConflict(filepath, resolved);
                this.settings.lastSyncTime = Date.now();
                await this.saveSettings();
                this.setStatus("idle");
            }
        ).open();
    }

    private isExcluded(filepath: string): boolean {
        return this.settings.excludePatterns.some((pattern) => {
            // Convert simple glob pattern (supports *) to regex
            const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
            const regexStr = escaped.replace(/\*/g, ".*");
            return new RegExp(`^${regexStr}$`).test(filepath);
        });
    }
}
