"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const inquirer_1 = __importDefault(require("inquirer"));
const ora_1 = __importDefault(require("ora"));
const path_1 = __importDefault(require("path"));
const download_1 = require("../../../utils/download");
const common_1 = require("../../../utils/common");
const executor_1 = require("../../../tools/executor");
const launcher_1 = __importDefault(require("../../../tools/launcher"));
const handler_1 = require("../../launch/handler");
const vanilla_1 = require("../vanilla");
const metadata = {
    name: 'NeoForge',
    description: 'A modern fork of Minecraft Forge, designed to provide a faster, cleaner, and more community-friendly modding experience',
    author: 'NeoForged Project',
};
const MAVEN_BASE = 'https://maven.neoforged.net/releases/net/neoforged';
const METADATA_URL = `${MAVEN_BASE}/neoforge/maven-metadata.xml`;
function getInstallerJarUrl(version) {
    return `${MAVEN_BASE}/neoforge/${version}/neoforge-${version}-installer.jar`;
}
function extractMCVersionFromNeoForge(neoforgeVersion) {
    const match = neoforgeVersion.match(/^(\d+)\.(\d+)\.\d+(?:-.+)?$/);
    if (!match)
        return null;
    const [_, major, minor] = match;
    return `1.${major}.${minor}`;
}
async function fetchNeoForgeVersions() {
    const res = await axios_1.default.get(METADATA_URL);
    const xml = res.data;
    const versions = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map(m => m[1]);
    return versions;
}
async function mapMCtoNeoForge() {
    const neoForgeVersions = await fetchNeoForgeVersions();
    const map = {};
    for (const version of neoForgeVersions) {
        const mcVersion = extractMCVersionFromNeoForge(version);
        if (!mcVersion)
            continue;
        if (!map[mcVersion])
            map[mcVersion] = [];
        map[mcVersion].push(version);
    }
    for (const mcVersion in map) {
        map[mcVersion].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }
    return map;
}
const INSTALL_DIR = path_1.default.join((0, common_1.localpath)(true), 'neoforge-client');
async function installNeoForgeViaExecutor(version, loader_ver) {
    const spinner = (0, ora_1.default)('🛠️ Preparing NeoForge installation...').start();
    try {
        const allVersions = await fetchNeoForgeVersions();
        if (allVersions.length === 0)
            throw new Error('No NeoForge versions found');
        const mcMap = await mapMCtoNeoForge();
        const mcVersions = Object.keys(mcMap).sort();
        spinner.stop();
        const { mcVersion } = version ? { mcVersion: version } : await inquirer_1.default.prompt({
            type: 'list',
            name: 'mcVersion',
            message: '🎮 Select Minecraft version:',
            choices: mcVersions,
            default: mcVersions[mcVersions.length - 1]
        });
        spinner.stop();
        const isVanillaInstalled = (0, vanilla_1.isMinecraftVersionInstalled)(mcVersion);
        if (!isVanillaInstalled) {
            await (0, vanilla_1.installVanillaHelper)(mcVersion);
        }
        const neoChoices = mcMap[mcVersion];
        const defaultNeo = neoChoices[neoChoices.length - 1];
        const { neoVersion } = loader_ver ? { neoVersion: loader_ver } : await inquirer_1.default.prompt({
            type: 'list',
            name: 'neoVersion',
            message: `🧱 Select NeoForge version for MC ${mcVersion}:`,
            choices: neoChoices,
            default: defaultNeo
        });
        const jarUrl = getInstallerJarUrl(neoVersion);
        const jarName = `neoforge-${neoVersion}-installer.jar`;
        const jarPath = path_1.default.join(INSTALL_DIR, jarName);
        (0, common_1.cleanDir)(INSTALL_DIR);
        (0, common_1.ensureDir)(INSTALL_DIR);
        spinner.start('📥 Downloading NeoForge installer...');
        spinner.stop();
        await (0, download_1.downloader)(jarUrl, jarPath);
        (0, common_1.waitForFolder)(metadata, neoVersion).then(versionFolder => {
            const profileManager = new launcher_1.default();
            const versionId = path_1.default.basename(versionFolder);
            profileManager.addProfile(versionId, mcVersion, versionId, metadata, versionId, metadata.name);
        });
        spinner.text = '🚀 Running NeoForge installer...';
        spinner.stop();
        await (0, executor_1.run)(jarPath, ['--installClient']);
        spinner.text = 'Cleaning caches';
        await (0, common_1.cleanAfterInstall)(INSTALL_DIR);
        spinner.succeed('✅ NeoForge installed successfully!');
        return {
            name: metadata.name,
            version: `neoforge-${neoVersion}`,
            url: jarUrl,
            client: {
                dir: INSTALL_DIR,
                jar: jarName
            }
        };
    }
    catch (err) {
        spinner.fail('❌ Installation failed.');
        handler_1.logger.error(err.message || err);
        return null;
    }
}
// Run if invoked directly
if (require.main === module) {
    installNeoForgeViaExecutor();
}
exports.default = {
    metadata,
    get: installNeoForgeViaExecutor,
};
//# sourceMappingURL=neo_forge.js.map