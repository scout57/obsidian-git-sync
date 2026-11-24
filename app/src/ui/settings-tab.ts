import {App, PluginSettingTab, Setting, Notice, ButtonComponent} from "obsidian";
import type MultiSyncPlugin from "../main";
import {PLUGIN_TITLE} from "../constants";

export class MultiSyncSettingsTab extends PluginSettingTab {
    plugin: MultiSyncPlugin;

    constructor(app: App, plugin: MultiSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;
        containerEl.empty();
        containerEl.createEl("h2", {text: `${PLUGIN_TITLE} Settings`});

        const settings = this.plugin.settings.data;

        // ── Account section ──────────────────────────────────────────────────────
        containerEl.createEl("h3", {text: "Git Auth"});

        new Setting(containerEl)
            .setName("Domain API")
            .setDesc("For API usage check (GET /user)")
            .addText((text) =>
                text
                    .setValue(settings.repoApiHost)
                    .setPlaceholder('https://api.github.com')
                    .onChange(async (val) => {
                        settings.repoApiHost = val;
                        await this.plugin.settings.save();
                    })
            );

        new Setting(containerEl)
            .setName("Domain HUB")
            .setDesc("Repository usage.")
            .addText((text) =>
                text
                    .setValue(settings.repoHubHost)
                    .setPlaceholder('https://github.com')
                    .onChange(async (val) => {
                        settings.repoHubHost = val;
                        await this.plugin.settings.save();
                    })
            );

        new Setting(containerEl)
            .setName("Repository name")
            .setDesc("Repository slug.")
            .addText((text) =>
                text
                    .setValue(settings.repoName)
                    .setPlaceholder('obsidian-storage')
                    .onChange(async (val) => {
                        settings.repoName = val;
                        await this.plugin.settings.save();
                    })
            );

        new Setting(containerEl)
            .setName("Username")
            .setDesc("Login.")
            .addText((text) =>
                text
                    .setValue(settings.githubUsername)
                    .setPlaceholder('scout57')
                    .onChange(async (val) => {
                        settings.githubUsername = val;
                        await this.plugin.settings.save();
                    })
            );


        new Setting(containerEl)
            .setName("Token")
            .setDesc("Settings > PAT.")
            .addText((text) =>
                text
                    .setValue(settings.githubToken)
                    .setPlaceholder('XXXXXXXXXXXXXX')
                    .onChange(async (val) => {
                        settings.githubToken = val;
                        await this.plugin.settings.save();
                    })
            );

        new Setting(containerEl)
            .setName("Status")
            .setDesc("Live check token.")
            .addButton((btn) =>
                btn
                    .setButtonText('Connect GitHub')
                    .onClick(async () => {
                        await this.startAuthCheck(btn)
                    })
            );


        // ── Sync options ──────────────────────────────────────────────────────────
        containerEl.createEl("h3", {text: "Sync Options"});

        new Setting(containerEl)
            .setName("Auto-sync")
            .setDesc("Automatically sync when files are modified.")
            .addToggle((toggle) =>
                toggle.setValue(settings.autoSync).onChange(async (val) => {
                    settings.autoSync = val;
                    await this.plugin.settings.save();
                })
            );

        new Setting(containerEl)
            .setName("Sync debounce (ms)")
            .setDesc("Wait this many milliseconds after the last edit before syncing.")
            .addSlider((slider) =>
                slider
                    .setLimits(1000, 10000, 500)
                    .setValue(settings.syncIntervalMs)
                    .setDynamicTooltip()
                    .onChange(async (val) => {
                        settings.syncIntervalMs = val;
                        await this.plugin.settings.save();
                    })
            );

        new Setting(containerEl)
            .setName("Excluded patterns")
            .setDesc("One pattern per line. These files will never be synced.")
            .addTextArea((ta) =>
                ta
                    .setValue(settings.excludePatterns.join("\n"))
                    .onChange(async (val) => {
                        settings.excludePatterns = val
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean);
                        await this.plugin.settings.save();
                    })
            );

        // ── Manual sync ───────────────────────────────────────────────────────────
        containerEl.createEl("h3", {text: "Manual Sync"});

        new Setting(containerEl)
            .setName("Sync now")
            .setDesc("Immediately push all local changes and pull remote changes.")
            .addButton((btn) =>
                btn.setButtonText("Sync Now").onClick(async () => {
                    // await this.plugin.triggerManualSync();
                })
            );

        // ── Last sync time ────────────────────────────────────────────────────────
        if (settings.lastSyncTime > 0) {
            const lastSync = new Date(settings.lastSyncTime).toLocaleString();
            containerEl.createEl("p", {
                text: `Last synced: ${lastSync}`,
                cls: "setting-item-description",
            });
        }
    }

    private async startAuthCheck(btn: ButtonComponent): Promise<void> {
        btn.setButtonText("Connecting…").setDisabled(true);

        try {
            const user = await this.plugin.github.getAuthenticatedUser();

            // await this.plugin.initRepo();


            new Notice(`Success! You are @${user.login}.`);
            btn.setButtonText("Connected!").setDisabled(false);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Remove the code panel if it's still visible
            new Notice(`Connection failed: ${msg}`);
        } finally {
            btn.setButtonText("Connect GitHub").setDisabled(false);
        }

    }
}
