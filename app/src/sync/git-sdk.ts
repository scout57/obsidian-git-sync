import {createFsAdapter} from "../legacy/sync/fs-adapter";
import {App, DataAdapter, Notice, requestUrl} from "obsidian";
import {GIT_AUTHOR_EMAIL, GIT_AUTHOR_NAME, Log, PLUGIN_TITLE} from "../constants";
import MultiSyncPlugin from "../main";
import * as git from "isomorphic-git";


type TRequestOptions = {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: AsyncIterableIterator<Uint8Array>;
}

export class GitSdk {
    private fs: ReturnType<typeof createFsAdapter>;
    private plugin: MultiSyncPlugin;

    constructor(plugin: MultiSyncPlugin) {
        this.plugin = plugin;
        this.fs = plugin.files.createFsAdapter();
    }

    /***************************************
     * CONFIG
     ***************************************/

    private getTargetBranch(): string {
        return this.plugin.app.vault.getName();
    }

    /***************************************
     * NETWORK
     ***************************************/
    private async request({url, method, headers, body}: TRequestOptions) {
        let bodyBuffer: ArrayBuffer | undefined;
        if (body) {
            const chunks: Uint8Array[] = [];
            for await (const chunk of body) chunks.push(chunk);
            const total = chunks.reduce((n, c) => n + c.length, 0);
            const merged = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
                merged.set(chunk, offset);
                offset += chunk.length;
            }
            bodyBuffer = merged.buffer;
        }

        const response = await requestUrl({
            url,
            method,
            headers,
            body: bodyBuffer,
            throw: false,
        });

        const arrayBuffer = response.arrayBuffer;

        async function* responseBody() {
            yield new Uint8Array(arrayBuffer);
        }

        return {
            url,
            method,
            statusCode: response.status,
            statusMessage: "OK",
            body: responseBody(),
            headers: response.headers as Record<string, string>,
        };
    }

    private gitOpts() {
        return {
            fs: this.fs,
            http: {request: this.request,},
            dir: this.plugin.files.getVaultPath(),
            author: {name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL},
        };
    }

    private netOpts() {
        const token = this.plugin.settings.data.githubToken;
        const username = this.plugin.settings.data.githubUsername;
        const repoName = this.plugin.settings.data.repoName;
        const url = `${this.plugin.settings.data.repoHubHost}/${username}/${repoName}.git`;

        return {
            ...this.gitOpts(),
            url: url,
            onAuth: () => ({username, password: token}),
            onAuthFailure: () => {
                throw new Error(`GitHub authentication failed. Please reconnect your account in ${PLUGIN_TITLE} settings.`);
            },
        };
    }


    /***************************************
     * COMMANDS
     ***************************************/
    async hasGit(): Promise<boolean> {
        try {
            await git.resolveRef({...this.gitOpts(), ref: 'HEAD'});
            return true;
        } catch {
            return false;
        }
    }

    async refreshOriginOrFail(): Promise<void> {
        try {
            await git.deleteRemote({...this.gitOpts(), remote: "origin"});
        } catch {
        }
        await git.addRemote({...this.netOpts(), remote: "origin"});
    }

    async getCurrentBranch(): Promise<string | undefined> {
        return await git.currentBranch({...this.gitOpts(), fullname: false, test: true}) as string | undefined;
    }

    async hasRemoteBranch(): Promise<boolean> {
        try {
            const branches = await git.listBranches({...this.gitOpts(), remote: 'origin'});
            return branches.includes(this.getTargetBranch());
        } catch (e) {
            return false;
        }
    }

    async hasLocalBranch(): Promise<boolean> {
        try {
            await git.resolveRef({...this.gitOpts(), ref: this.getTargetBranch()});
            return true;
        } catch (e) {
            return false;
        }
    }

    async hasConflicts(): Promise<boolean> {
        const matrix = await git.statusMatrix({
            ...this.gitOpts(),
            ref: 'origin/' + this.getTargetBranch(),
            filter: f => !f.startsWith('.obsidian')
        });

        for (const [filename, h, w, s] of matrix) {
            if (h !== 1 || w !== 1 || s !== 1) {
                const ours = await this.readFileContent(filename);
                const theirs = await this.readRemoteFileContent(filename);

                if (ours !== theirs) {
                    console.log('------------')
                    console.log(ours)
                    console.log('==== vs')
                    console.log(theirs)
                    console.log('------------')
                    return true
                }
            }
        }

        return false
    }

    async createTargetBranchOrFail(): Promise<void> {
        Log('create branch...');
        const branch = await this.getCurrentBranch();

        await git.branch({...this.gitOpts(), ref: branch, checkout: true})

        await git.push({
            ...this.netOpts(),
            ref: branch,
            remoteRef: branch,
            force: false,
        });
    }

    async checkoutOrFail(): Promise<void> {
        Log('checkout...');
        await git.checkout({...this.gitOpts(), ref: this.getTargetBranch(), force: false});
    }

    async fetchOrNothing(): Promise<string | null> {
        try {
            const r = await git.fetch({
                ...this.netOpts(),
                ref: this.getTargetBranch(),
                singleBranch: true,
            });
            return r.fetchHead;
        } catch (e) {
            return null;
        }
    }

    async cloneOrFail(): Promise<void> {
        Log('cloning...');
        await git.clone({
            ...this.netOpts(),
            depth: 1,
        });
    }


    async pullOrFail(): Promise<void> {
        Log('pulling...');
        await git.pull({
            ...this.netOpts(),
        });
    }


    private async readFileContent(filepath: string): Promise<string> {
        try {
            const dir = this.plugin.files.getVaultPath()
            const buf = await this.fs.promises.readFile(
                `${dir}/${filepath}`,
                {encoding: "utf8"}
            );
            return buf as string;
        } catch {
            return "";
        }
    }

    private async readRemoteFileContent(filepath: string): Promise<string> {
        try {
            const dir = this.plugin.files.getVaultPath()
            const remoteCommit = await git.resolveRef({
                fs: this.fs,
                dir: dir,
                ref: `refs/remotes/origin/${this.getTargetBranch()}`,
            });
            const {blob} = await git.readBlob({
                fs: this.fs,
                dir: dir,
                oid: remoteCommit,
                filepath,
            });
            return new TextDecoder().decode(blob);
        } catch {
            return "";
        }
    }
}