import esbuild from "esbuild";
import process from "process";
import {builtinModules} from "module";
import {copyFileSync, mkdirSync} from "fs";

const prod = process.argv[2] === "production";

const copyPlugin = {
    name: "copy-files",
    setup(build) {
        build.onEnd((result) => {
            if (result.errors.length > 0) return; // не копируем, если сборка упала

            mkdirSync("dist", {recursive: true});
            copyFileSync("static/manifest.json", "dist/manifest.json");
            copyFileSync("static/versions.json", "dist/versions.json");
        });
    },
};

const buildOptions = {
    banner: {js: "/* obsidian-scout-git-sync */"},
    entryPoints: ["src/main.ts"],
    bundle: true,
    external: [
        "obsidian",
        "electron",
        "@codemirror/autocomplete",
        "@codemirror/collab",
        "@codemirror/commands",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/search",
        "@codemirror/state",
        "@codemirror/view",
        "@lezer/common",
        "@lezer/highlight",
        "@lezer/lr",
        ...builtinModules,
    ],
    format: "cjs",
    target: "es2018",
    logLevel: "info",
    sourcemap: prod ? false : "inline",
    treeShaking: true,
    outdir: "dist",
    minify: prod,
    plugins: [copyPlugin]
};

if (process.argv.includes('--watch')) {
    // Режим наблюдения
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
} else {
    // Обычная однократная сборка
    await esbuild.build(buildOptions);
}
