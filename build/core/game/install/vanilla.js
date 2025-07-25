"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installVanillaViaExecutor = installVanillaViaExecutor;
exports.isMinecraftVersionInstalled = isMinecraftVersionInstalled;
exports.installVanillaHelper = installVanillaHelper;
const axios_1 = __importDefault(require("axios"));
const ora_1 = __importDefault(require("ora"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const minecraft_versions_1 = require("../../utils/minecraft_versions");
const download_1 = require("../../utils/download");
const common_1 = require("../../utils/common");
const launcher_1 = __importDefault(require("../../tools/launcher"));
const handler_1 = require("../launch/handler");
const metadata = {
    name: 'Vanilla',
    description: 'Pure, unmodded Minecraft client.',
    author: 'Mojang'
};
async function installVanillaViaExecutor(version) {
    const spinner = (0, ora_1.default)('🌱 Preparing Vanilla installation...').start();
    try {
        const manifest = await (0, minecraft_versions_1.fetchMinecraftVersionManifest)();
        const latestMC = manifest.latest.release;
        spinner.stop();
        const minecraftVersion = version ?? await (0, minecraft_versions_1.askForVersion)(manifest.versions, latestMC);
        const versionMeta = manifest.versions.find(v => v.id === minecraftVersion);
        if (!versionMeta)
            throw new Error('Version metadata not found.');
        spinner.start('🔍 Fetching version metadata...');
        const res = await axios_1.default.get(versionMeta.url);
        const versionData = res.data;
        let versionFolder = path_1.default.join((0, common_1.minecraft_dir)(), 'versions', minecraftVersion);
        (0, common_1.cleanDir)(versionFolder);
        (0, common_1.ensureDir)(versionFolder);
        const jarUrl = versionData.downloads.client.url;
        const jarPath = path_1.default.join(versionFolder, `${minecraftVersion}.jar`);
        const jsonPath = path_1.default.join(versionFolder, `${minecraftVersion}.json`);
        spinner.text = '📥 Downloading client JAR...';
        spinner.stop();
        await (0, download_1.downloader)(jarUrl, jarPath);
        spinner.text = '📥 Downloading version JSON...';
        const versionJson = JSON.stringify(versionData, null, 2);
        fs_1.default.writeFileSync(jsonPath, versionJson);
        spinner.text = '🧩 Creating launcher profile...';
        const profileManager = new launcher_1.default();
        const name = path_1.default.basename(versionFolder);
        profileManager.addProfile(name, minecraftVersion, name, metadata, name, 'Grass');
        spinner.succeed(`🎉 Vanilla ${minecraftVersion} installed successfully!`);
        return {
            name: metadata.name,
            version: minecraftVersion,
            url: jarUrl,
            client: {
                dir: versionFolder,
                jar: `${minecraftVersion}.jar`
            }
        };
    }
    catch (err) {
        spinner.fail('❌ Failed to install Vanilla.');
        handler_1.logger.error(err.message || err);
        return null;
    }
}
function isMinecraftVersionInstalled(version) {
    const profileManager = new launcher_1.default();
    return profileManager.getProfile(version) ? true : false;
}
async function installVanillaHelper(version) {
    return await installVanillaViaExecutor(version);
}
// Run if invoked directly
if (require.main === module) {
    installVanillaViaExecutor();
}
exports.default = {
    metadata,
    get: installVanillaViaExecutor,
};
//# sourceMappingURL=vanilla.js.map