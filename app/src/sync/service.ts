import {GitSdk, TAddStatus} from "./git-sdk";
import {Log, Notify} from "../constants";

export class SyncService {
    constructor(protected readonly git: GitSdk) {
    }

    async push() {
        try { // попытаться наложить свои изменения на remote
            const hasStage = await this.git.addAll();
            if (!hasStage) {
                return;
            }
            await this.git.commit();
            await this.git.pushOrFail();
            Notify('push: success')
        } catch (error) {
            Notify(error.message);
            await this.git.removeAll();
            throw error;
        }
    }

    async onStartup() {

        // Гарантировать локальный репозиторий
        if (!await this.git.hasGit()) {
            await this.git.cloneOrFail();
        } else {
            // Гарантировать правильный remote
            await this.git.refreshOriginOrFail();

            // Гарантировать актуальность удаленных веток
            await this.git.pullOrFail();
        }


        // Гарантировать текущую ветку
        if (!await this.git.hasRemoteBranch()) { // нет даже удаленно
            await this.git.createTargetBranchOrFail();
        } else {
            await this.git.checkoutOrFail();
        }


        Log('onStartup: success');
    }
}