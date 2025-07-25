"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installQuiltViaExecutor = installQuiltViaExecutor;
const axios_1 = __importDefault(require("axios"));
const inquirer_1 = __importDefault(require("inquirer"));
const ora_1 = __importDefault(require("ora"));
const path_1 = __importDefault(require("path"));
const minecraft_versions_1 = require("../../../utils/minecraft_versions");
const download_1 = require("../../../utils/download");
const common_1 = require("../../../utils/common");
const executor_1 = require("../../../tools/executor");
const launcher_1 = __importDefault(require("../../../tools/launcher"));
const handler_1 = require("../../launch/handler");
const vanilla_1 = require("../vanilla");
const fs_extra_1 = require("fs-extra");
const metadata = {
    name: 'Quilt',
    description: 'A modular, community-driven mod loader for Minecraft.',
    author: 'QuiltMC',
};
const INSTALLER_BASE = 'https://maven.quiltmc.org/repository/release';
const INSTALLER_DIR = path_1.default.join((0, common_1.localpath)(true), 'quilt-client');
async function getLatestInstallerVersion() {
    const res = await axios_1.default.get(`${INSTALLER_BASE}/org/quiltmc/quilt-installer/maven-metadata.xml`);
    const match = res.data.match(/<latest>(.+?)<\/latest>/);
    if (!match)
        throw new Error('Failed to parse latest Quilt installer version');
    return match[1];
}
async function getAllLoaderVersions() {
    const url = `${INSTALLER_BASE}/org/quiltmc/quilt-loader/maven-metadata.xml`;
    const res = await axios_1.default.get(url);
    const versionsMatch = res.data.match(/<versions>([\s\S]*?)<\/versions>/);
    if (!versionsMatch)
        throw new Error('Failed to locate versions element');
    const versionTags = versionsMatch[1].match(/<version>(.+?)<\/version>/g) || [];
    return versionTags.map((v) => v.replace(/<\/?version>/g, '').trim());
}
function getInstallerJarUrl(version) {
    return `${INSTALLER_BASE}/org/quiltmc/quilt-installer/${version}/quilt-installer-${version}.jar`;
}
async function installQuiltViaExecutor(version, loader_ver) {
    const spinner = (0, ora_1.default)('🧵 Preparing Quilt installation...').start();
    try {
        const manifest = await (0, minecraft_versions_1.fetchMinecraftVersionManifest)();
        const latestMC = manifest.latest.release;
        spinner.stop();
        const minecraftVersion = version || await (0, minecraft_versions_1.askForVersion)(manifest.versions, latestMC);
        spinner.stop();
        const isVanillaInstalled = (0, vanilla_1.isMinecraftVersionInstalled)(minecraftVersion);
        if (!isVanillaInstalled) {
            await (0, vanilla_1.installVanillaHelper)(minecraftVersion);
        }
        const installerVersion = await getLatestInstallerVersion();
        const loaderVersions = await getAllLoaderVersions();
        const { loaderVersion } = loader_ver ? { loaderVersion: loader_ver } : await inquirer_1.default.prompt([
            {
                type: 'list',
                name: 'loaderVersion',
                message: '🧷 Select Quilt Loader version:',
                choices: loaderVersions.reverse(),
            }
        ]);
        const jarUrl = getInstallerJarUrl(installerVersion);
        const jarName = `quilt-installer-${installerVersion}.jar`;
        const jarPath = path_1.default.join(INSTALLER_DIR, jarName);
        (0, common_1.cleanDir)(INSTALLER_DIR);
        (0, common_1.ensureDir)(INSTALLER_DIR);
        spinner.text = '📦 Downloading Quilt installer...';
        spinner.stop();
        await (0, download_1.downloader)(jarUrl, jarPath);
        (0, common_1.waitForFolder)(metadata, minecraftVersion).then(async (versionFolder) => {
            const profileManager = new launcher_1.default();
            const versionId = path_1.default.basename(versionFolder);
            const quiltJar = path_1.default.join(versionFolder, `${versionId}.jar`);
            if (await (0, fs_extra_1.pathExists)(quiltJar))
                (0, fs_extra_1.unlinkSync)(quiltJar);
            profileManager.addProfile(versionId, minecraftVersion, versionId, metadata, versionId, metadata.name);
        });
        spinner.text = '🚀 Executing Quilt installer...';
        spinner.stop();
        await (0, executor_1.run)(jarPath, [
            'install', 'client', minecraftVersion, loaderVersion,
            `--install-dir=${(0, common_1.minecraft_dir)()}`
        ]);
        spinner.text = 'Cleaning caches';
        await (0, common_1.cleanAfterInstall)(INSTALLER_DIR);
        spinner.succeed('🎉 Quilt installed successfully!');
        return {
            name: metadata.name,
            version: minecraftVersion,
            url: jarUrl,
            client: { dir: INSTALLER_DIR, jar: jarName }
        };
    }
    catch (err) {
        spinner.fail('❌ Failed to install Quilt.');
        handler_1.logger.error(err.message || err);
        return null;
    }
}
// Run if invoked directly
if (require.main === module) {
    installQuiltViaExecutor();
}
exports.default = {
    metadata,
    get: installQuiltViaExecutor,
};
//# sourceMappingURL=quilt.js.map