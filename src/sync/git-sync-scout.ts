import * as git from "isomorphic-git";
import {requestUrl, DataAdapter, Notice} from "obsidian";
import {createFsAdapter} from "./fs-adapter";
import {
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    PLUGIN_TITLE, translatePath,
} from "../constants";
import {ConflictFile, SyncResult} from "../types";

// Custom HTTP client that uses Obsidian's requestUrl (mobile-safe, bypasses CORS)
const gitHttp = {
    async request({url, method, headers, body}: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body?: AsyncIterableIterator<Uint8Array>;
    }) {
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
    },
};

export class GitSyncScout {
    private fs: ReturnType<typeof createFsAdapter>;
    private dir: string;
    private branch: string;
    private token: string;
    private username: string;
    private remoteUrl: string;

    constructor(
        adapter: DataAdapter,
        dir: string,
        branch: string,
        token: string,
        username: string,
        repoName: string,
        remoteUrl: string,
    ) {
        this.fs = createFsAdapter(adapter, dir);
        this.dir = dir;
        this.branch = branch;
        this.token = token;
        this.username = username;
        this.remoteUrl = `${remoteUrl}/${username}/${repoName}.git`;
    }

    /** Base options shared by ALL git operations (local and network) */
    private gitOpts() {
        return {
            fs: this.fs,
            http: gitHttp,
            dir: this.dir,
            author: {name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL},
        };
    }

    /**
     * Extra options for NETWORK operations (push / fetch / clone).
     *
     * isomorphic-git strips credentials from remote URLs before sending requests.
     * We must supply them via `onAuth` so every push/fetch is authenticated.
     * We also pass `url` directly so the library does not have to read `.git/config`.
     */
    private netOpts() {
        const token = this.token;
        const username = this.username;
        return {
            ...this.gitOpts(),
            url: this.remoteUrl,
            onAuth: () => ({username, password: token}),
            onAuthFailure: () => {
                throw new Error(`GitHub authentication failed. Please reconnect your account in ${PLUGIN_TITLE} settings.`);
            },
        };
    }


    // *****************************************************************************************************
    // *** MAIN METHODS
    // *****************************************************************************************************
    async pull(): Promise<void> {
        if (!(await this.hasLocalBranch())) return;

        const fetchHead = await this.safeFetch();
        if (!fetchHead) return;

        const localHead = await git.resolveRef({
            fs: this.fs,
            dir: this.dir,
            ref: this.branch,
        });

        if (fetchHead !== localHead) {
            await git.merge({
                fs: this.fs,
                dir: this.dir,
                ours: this.branch,
                theirs: fetchHead,
                author: {name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL},
                message: "scout-sync: merge remote changes",
                fastForwardOnly: false,
            });
        }
    }


    // *****************************************************************************************************
    // *** SUPPORT METHODS
    // *****************************************************************************************************
    private async hasLocalBranch(): Promise<boolean> {
        try {
            await git.resolveRef({fs: this.fs, dir: this.dir, ref: this.branch});
            return true;
        } catch (e) {
            new Notice('error hasLocal: ' + e.message);
            return false;
        }
    }
    private async safeFetch(): Promise<string | null> {
        try {
            const r = await git.fetch({
                ...this.netOpts(),
                ref: this.branch,
                singleBranch: true,
            });
            return r.fetchHead;
        } catch (e) {
            new Notice('error safeFetch: ' + e.message);
            return null;
        }
    }
}
