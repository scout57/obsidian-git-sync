import {Plugin, Notice, TFile, TAbstractFile, App, PluginManifest} from "obsidian";
import {Settings} from "./core";
import {UI} from "./ui/ui";
import {GitHubApi} from "./github/api";

export default class MultiSyncPlugin extends Plugin {
    settings: Settings;
    ui: UI;
    github: GitHubApi;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);

        this.settings = new Settings(this);
        this.github = new GitHubApi(this.settings);
        this.ui = new UI(app, this);
    }

    async onload(): Promise<void> {
        await this.settings.load();

        this.ui.pull.onClick(() => new Notice('pull!'));
        this.ui.push.onClick(() => new Notice('push!'));

        this.addSettingTab(this.ui.settings);
    }
}
