import {DEFAULT_SETTINGS, TPluginSettingsData} from "../types";
import {Plugin} from "obsidian";

export class Settings {

    data!: TPluginSettingsData;

    constructor(protected readonly plugin: Plugin) {
    }

    async load(): Promise<void> {
        this.data = Object.assign({}, DEFAULT_SETTINGS, await this.plugin.loadData());
    }

    async save(): Promise<void> {
        await this.plugin.saveData(this.data);
    }
}