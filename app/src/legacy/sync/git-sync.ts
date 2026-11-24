import * as git from "isomorphic-git";
import {requestUrl, DataAdapter, Notice} from "obsidian";
import {createFsAdapter} from "./fs-adapter";
import {
    GIT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL,
    PLUGIN_TITLE, translatePath,
} from "../../constants";
import {ConflictFile, SyncResult} from "../../types";

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

export class GitSync {
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

    /** Returns true if .git exists and HEAD resolves (repo is initialised) */
    async isInitialized(): Promise<boolean> {
        try {
            await git.resolveRef({fs: this.fs, dir: this.dir, ref: 'HEAD'});
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Returns true if refs/heads/main exists (at least one commit has been made).
     * Returns false on a fresh git.init with no commits (unborn branch).
     */
    async hasLocalBranch(): Promise<boolean> {
        try {
            await git.resolveRef({fs: this.fs, dir: this.dir, ref: this.branch});
            return true;
        } catch (e) {
            new Notice('error hasLocal: ' + e.message);
            return false;
        }
    }

    /**
     * Fetch from origin. Returns the FETCH_HEAD oid when remote has commits,
     * or null when the remote is empty or unreachable.
     */
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

    async clone(): Promise<void> {
        await git.clone({
            ...this.netOpts(),
            // singleBranch: true,
            // ref: this.branch,
            depth: 1,
        });

        try {
            await git.fetch({
                ...this.netOpts(),
                fs: this.fs,
                dir: this.dir,
                ref: this.branch,
                remoteRef: this.branch,
                depth: 1
            })
            await git.checkout({fs: this.fs, dir: this.dir, ref: this.branch})
            return;
        } catch (error) { /**/
        }

        await git.branch({fs: this.fs, dir: this.dir, ref: this.branch, checkout: true})

        // Set up remote (delete+re-add to ensure correct fetch refspec)
        try {
            await git.deleteRemote({fs: this.fs, dir: this.dir, remote: "origin"});
        } catch { /* didn't exist yet */
        }
        await git.addRemote({
            fs: this.fs,
            dir: this.dir,
            remote: "origin",
            url: this.remoteUrl,
        });

        await git.push({
            ...this.netOpts(),
            ref: this.branch,
            remoteRef: this.branch,
            force: false,
        });
    }

    /**
     * First-time setup: init locally (if needed), commit everything, push.
     * Safe to call on a partially-initialized repo (retry after failure).
     */
    async checkoutAndPush(vaultFiles: string[]): Promise<void> {
        if (await this.hasLocalBranch()) {
            await git.checkout({fs: this.fs, dir: this.dir, ref: this.branch})

            // Stage all vault files (skip any that fail)
            for (const file of vaultFiles) {
                try {
                    await git.add({fs: this.fs, dir: this.dir, filepath: file});
                } catch {
                    // Skip un-stageable files (binary, permission issues, etc.)
                }
            }

            const status = await git.statusMatrix({fs: this.fs, dir: this.dir});
            const dirty = status.some(([, h, w, s]) => h !== 1 || w !== 1 || s !== 1);
            if (dirty) {
                await git.commit({
                    ...this.gitOpts(),
                    message: "scout-sync: initial vault snapshot",
                });
            }
        } else {
            await git.branch({fs: this.fs, dir: this.dir, ref: this.branch, checkout: true})
            await git.commit({
                ...this.gitOpts(),
                message: "sync: initial vault snapshot",
            });
            new Notice('suka 3')
        }


        // Set up remote (delete+re-add to ensure correct fetch refspec)
        try {
            await git.deleteRemote({fs: this.fs, dir: this.dir, remote: "origin"});
        } catch { /* didn't exist yet */
        }
        await git.addRemote({
            fs: this.fs,
            dir: this.dir,
            remote: "origin",
            url: this.remoteUrl,
        });

        await git.push({
            ...this.netOpts(),
            ref: this.branch,
            force: false,
        });
    }

    async merge(fetchHead: string, conflicts: ConflictFile[]): Promise<boolean> {
        // Истории разошлись — настоящий merge
        try {
            await git.merge({
                fs: this.fs,
                dir: this.dir,
                ours: this.branch,
                theirs: fetchHead,
                author: {name: GIT_AUTHOR_NAME, email: GIT_AUTHOR_EMAIL},
                message: "scout-sync: merge remote changes",
                fastForwardOnly: false,
                abortOnConflict: false,
            });
            new Notice('suka 2 - MERGE DONE!')
        } catch (err: any) {
            // isomorphic-git при конфликте бросает MergeConflictError
            if (err.code === 'MergeConflictError' || err.name === 'MergeConflictError') {
                new Notice('suka 3')

                // Читаем конфликтные файлы из рабочей копии
                // (в них уже вставлены маркеры <<<<<<< ======= >>>>>>>)
                const matrix = await git.statusMatrix({fs: this.fs, dir: this.dir});
                for (const [filepath, head, workdir, stage] of matrix) {
                    if (workdir !== 1) {
                        const ours = await this.readFileContent(filepath);
                        const theirs = await this.readRemoteFileContent(filepath);
                        // Считаем конфликтом только если реально есть маркеры
                        if (ours?.includes('<<<<<<<') || theirs?.includes('<<<<<<<')) {
                            conflicts.push({path: filepath, ours, theirs});
                        }
                    }
                }

                return true; // mergeHadConficts
            } else {
                new Notice('suka 3 =' + err.message);
                throw err; // прочие ошибки merge пробрасываем дальше
            }
        }
        return false; // mergeHadConficts
    }



    async sync(changedFiles: string[]): Promise<SyncResult> {
        const conflicts: ConflictFile[] = [];

        try {
            // ── 1. Stage ─────────────────────────────────────────────────────────────
            for (const file of changedFiles) {
                try {
                    await git.add({fs: this.fs, dir: this.dir, filepath: file});
                } catch {
                    try {
                        await git.remove({fs: this.fs, dir: this.dir, filepath: file});
                    } catch { /* пропускаем */
                    }
                }
            }

            // ── 2. Коммит, если есть изменения ───────────────────────────────────────
            try {
                const matrix = await git.statusMatrix({fs: this.fs, dir: this.dir});
                const hasDirty = matrix.some(([, h, w, s]) => h !== 1 || w !== 1 || s !== 1);

                const now = new Date().toISOString().replace("T", " ").slice(0, 19);
                await git.commit({
                    ...this.gitOpts(),
                    message: `scout-sync: ${now}`,
                });
            } catch (e) {
                new Notice('suka 0 = ' + e.message)
            }

            // ── 3. Fetch ─────────────────────────────────────────────────────────────
            const fetchHead = await this.safeFetch();

            // ── 4. Merge (ключевое исправление: abortOnConflict: false) ──────────────
            let mergeHadConflicts = false;
            if (fetchHead && (await this.hasLocalBranch())) {
                new Notice('suka 1')
                const localHead = await git.resolveRef({
                    fs: this.fs,
                    dir: this.dir,
                    ref: this.branch,
                });

                if (fetchHead !== localHead) {
                    try {
                        const result = await git.pull({
                            ...this.netOpts(),
                            ref: this.branch,
                            singleBranch: true,
                            fastForwardOnly: true,
                        });
                        await git.checkout({
                            fs: this.fs,
                            dir: this.dir,
                            ref: this.branch,
                            force: true,  // принудительно перезаписать файлы рабочей директории
                        });
                        for (const file of changedFiles) {
                            try {
                                await git.resetIndex({
                                    fs: this.fs,
                                    dir: this.dir,
                                    filepath: file,
                                    ref: 'HEAD', // сбросить в соответствии с новым HEAD (коммит 2)
                                });
                            } catch { /* файл может отсутствовать в новом HEAD, пропускаем */ }
                        }
                        new Notice('suka 2 - FF DONE')
                        // успешный fast-forward
                    } catch (err: any) {
                        if (err.code === 'FastForwardError' || err.name === 'FastForwardError') {
                            mergeHadConflicts = await this.merge(fetchHead, conflicts)
                        } else {
                            throw err;
                        }
                    }
                }
            }

            // ── 5. Push (только если нет конфликтов) ─────────────────────────────────
            if (conflicts.length === 0 && !mergeHadConflicts && (await this.hasLocalBranch())) {
                try {
                    await git.push({
                        ...this.netOpts(),
                        ref: this.branch,
                    });
                } catch (err: any) {
                    new Notice('suka 4 =' + err.message);
                    // Гонка при push: кто-то обновил ветку между fetch и push
                    if (err.code === 'PushRejectedNonFastForward') {
                        return {
                            success: false,
                            conflictFiles: [],
                            error: 'Удалённая ветка изменилась во время синхронизации. Повторите попытку.'
                        };
                    }
                    throw err;
                }
            }

            return {success: conflicts.length === 0, conflictFiles: conflicts};
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            return {success: false, conflictFiles: [], error: msg};
        }
    }

    /** Resolve a conflict by writing resolved content, committing, and pushing */
    async resolveConflict(filepath: string, resolvedContent: string): Promise<void> {
        const fullPath = `${this.dir}/${filepath}`;
        await this.fs.promises.writeFile(fullPath, resolvedContent);
        await git.add({fs: this.fs, dir: this.dir, filepath: filepath});
        await git.commit({
            ...this.gitOpts(),
            message: `scout-sync: resolve conflict in ${filepath}`,
        });
        await git.push({
            ...this.netOpts(),
            ref: this.branch,
        });
    }

    /**
     * Pull-only — used on vault open to get latest without pushing.
     * Uses explicit fetch + merge (not git.pull) for consistent error handling.
     */
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

    private async readFileContent(filepath: string): Promise<string> {
        try {
            const buf = await this.fs.promises.readFile(
                `${this.dir}/${filepath}`,
                {encoding: "utf8"}
            );
            return buf as string;
        } catch {
            return "";
        }
    }

    private async readRemoteFileContent(filepath: string): Promise<string> {
        try {
            const remoteCommit = await git.resolveRef({
                fs: this.fs,
                dir: this.dir,
                ref: `refs/remotes/origin/${this.branch}`,
            });
            const {blob} = await git.readBlob({
                fs: this.fs,
                dir: this.dir,
                oid: remoteCommit,
                filepath,
            });
            return new TextDecoder().decode(blob);
        } catch {
            return "";
        }
    }


}
