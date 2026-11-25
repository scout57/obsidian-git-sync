import {Plugin, Notice, TFile, TAbstractFile, App, PluginManifest} from "obsidian";
import {UI} from "./ui";
import {Settings, GitHubApi, AppFiles} from "./core";
import {SyncService} from "./sync/service";
import {GitSdk} from "./sync/git-sdk";

export default class MultiSyncPlugin extends Plugin {
    settings: Settings;
    ui: UI;
    files: AppFiles;
    github: GitHubApi;
    sync: SyncService;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);

        this.settings = new Settings(this);
        this.github = new GitHubApi(this.settings);
        this.ui = new UI(this);
        this.files = new AppFiles(this);

        const git = new GitSdk(this);
        this.sync = new SyncService(git);
    }

    async onload(): Promise<void> {
        await this.settings.load();

        // this.ui.clone.onClick(() => new Notice('clone !'));
        this.ui.pull.onClick(async () => await this.sync.onStartup());
        this.ui.push.onClick(async () => await this.sync.push());

        this.addSettingTab(this.ui.settings);

        this.app.workspace.onLayoutReady(async () => {
            await this.sync.onStartup()
        });
    }

}
