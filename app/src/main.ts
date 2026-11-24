import {Plugin, Notice, TFile, TAbstractFile, App, PluginManifest} from "obsidian";
import {TPluginSettingsData, DEFAULT_SETTINGS, ConflictFile} from "./types";
import {MultiSyncSettingsTab} from "./ui/settings-tab";
import {ConflictModal} from "./ui/conflict-modal";
import {GitSync} from "./sync/git-sync";
import {SyncQueue} from "./sync/queue";
import {PullBarItem} from "./ui/pull-bar";
import {Settings} from "./core";

export default class MultiSyncPlugin extends Plugin {
    settings: Settings;
    private pullBar!: PullBarItem;
    private gitSync: GitSync | null = null;
    private syncQueue: SyncQueue | null = null;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);

        this.settings = new Settings(this);
    }

    async onload(): Promise<void> {
        await this.settings.load();


        this.pullBar = new PullBarItem(this);
        // this.pullBar.onClick(() => this.triggerManualSync());

        this.addSettingTab(new MultiSyncSettingsTab(this.app, this));
    }



    private showConflictModal(conflicts: ConflictFile[]): void {
        new ConflictModal(
            this.app,
            conflicts,
            async (filepath, resolved) => {
                await this.gitSync!.resolveConflict(filepath, resolved);
                this.settings.data.lastSyncTime = Date.now();
                await this.settings.save();
            }
        ).open();
    }

    private isExcluded(filepath: string): boolean {
        return this.settings.data.excludePatterns.some((pattern) => {
            // Convert simple glob pattern (supports *) to regex
            const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
            const regexStr = escaped.replace(/\*/g, ".*");
            return new RegExp(`^${regexStr}$`).test(filepath);
        });
    }
}
