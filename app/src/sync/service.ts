import {GitSdk} from "./git-sdk";
import {Log, Notify} from "../constants";

export class SyncService {
    constructor(protected readonly git: GitSdk) {
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
        } else if (await this.git.hasConflicts()) { // есть конфликты
            Notify('Есть конфликты: фикс руками')
        } else { // есть удаленно, нет конфликтов
            await this.git.checkoutOrFail();
        }


        Log('onStartup: ready');
    }
}