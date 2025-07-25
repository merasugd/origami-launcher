"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Runtime = void 0;
// runtime.ts
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
const figlet_1 = __importDefault(require("figlet"));
const gradient = __importStar(require("gradient-string"));
const handler_1 = require("./handler");
const fs_1 = require("fs");
const data_manager = __importStar(require("../../tools/data_manager"));
const path_1 = __importDefault(require("path"));
const readline_1 = __importDefault(require("readline"));
const common_1 = require("../../utils/common");
const fs_extra_1 = require("fs-extra");
const origami_1 = require("../../../cli/origami");
const java_1 = __importDefault(require("../../../java"));
const mod_1 = require("../install/packs/mod");
const manager_1 = __importDefault(require("../install/packs/manager"));
const account_1 = require("../account");
const create_1 = require("../account/auth_types/create");
const prompts_1 = require("@inquirer/prompts");
const modpack_1 = require("../install/packs/modpack");
if (!process.stdin.isTTY) {
    handler_1.logger.error(`Umm... is this terminal asleep? I can't reach it (no TTY 😢)`);
    process.exit(1);
}
class Runtime {
    handler = new handler_1.Handler();
    version;
    constructor() {
        this.version = this.getVersion();
    }
    async start() {
        console.clear();
        await this.showLicenseAgreement();
        console.clear();
        await this.showHeader();
        await this.mainMenu();
    }
    async showLicenseAgreement() {
        if (this.hasAgreedToLicense())
            return;
        const license = this.getLicense();
        const lines = license.licenseText.split('\n');
        const delay = 100; // ms per line
        let skipped = false;
        let skipResolver;
        const rl = readline_1.default.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        // Listen for key to skip
        const skipPromise = new Promise((resolve) => {
            skipResolver = resolve;
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', () => {
                skipped = true;
                process.stdin.setRawMode(false);
                resolve();
            });
        });
        const animateText = async () => {
            const total = lines.length;
            for (let i = 0; i < total; i++) {
                if (skipped)
                    break;
                const line = lines[i];
                const faded = gradient.teen(line);
                console.log(faded);
                await new Promise(res => setTimeout(res, delay));
            }
            skipped = true;
            process.stdin.setRawMode(false);
            skipResolver();
            console.log();
        };
        console.clear();
        console.log(chalk_1.default.bold(`📜 License: ${license.name}\n`));
        console.log(chalk_1.default.dim('(Press any key to skip license animation...)\n'));
        await Promise.race([animateText(), skipPromise]);
        rl.close();
        if (skipped) {
            console.clear();
            console.log(chalk_1.default.bold(`📜 License: ${license.name}\n`));
            console.log(gradient.morning(license.licenseText));
            console.log();
            process.stdin.setRawMode(false);
            process.stdin.pause();
            while (process.stdin.read() !== null) { }
            readline_1.default.emitKeypressEvents(process.stdin);
            process.stdin.setRawMode(false);
            process.stdin.resume();
        }
        const { agree, remember } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'agree',
                message: chalk_1.default.hex('#4ADE80')('Do you agree to the license terms?'),
                default: false
            },
            {
                type: 'confirm',
                name: 'remember',
                message: 'Only show this once?',
                default: true,
                when: (answers) => answers.agree
            }
        ]);
        if (agree) {
            if (remember) {
                data_manager.set("license:agreed", true);
            }
        }
        else {
            console.log(chalk_1.default.redBright('\n❌ You must agree to the license terms to use Origami.'));
            process.exit(1);
        }
    }
    getVersion() {
        try {
            const pkgPath = path_1.default.resolve(__dirname, '../../../../package.json');
            const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
            return pkg.version || 'unknown';
        }
        catch (_) {
            return 'unknown';
        }
    }
    getAllLicense() {
        try {
            const lcnPath = path_1.default.join(__dirname, '../../../../licences.json');
            const lcn = JSON.parse((0, fs_1.readFileSync)(lcnPath, 'utf-8'));
            return lcn;
        }
        catch (_) {
            return {};
        }
    }
    getLicense() {
        try {
            const pkgPath = path_1.default.join(__dirname, '../../../../package.json');
            const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
            const lcn = pkg.license || 'GPL-3.0-only';
            const license = this.getAllLicense()[lcn];
            return license || { name: 'MIT', licenseText: "" };
        }
        catch (_) {
            return { name: 'MIT', licenseText: "" };
        }
    }
    hasAgreedToLicense() {
        return data_manager.get("license:agreed") ? true : false;
    }
    async showHeader() {
        await (0, origami_1.checkForLatestVersion)(this.version);
        const fonts = figlet_1.default.fontsSync();
        const randomFont = fonts[Math.floor(Math.random() * fonts.length)];
        const logo = figlet_1.default.textSync('Origami', { font: randomFont });
        const profile = this.handler.profiles.getSelectedProfile();
        const profileName = profile ? chalk_1.default.cyan(`🎮 Current Selected Profile: ${chalk_1.default.green(profile.name)}`) : chalk_1.default.gray('🎮 No profile selected');
        const account = await this.handler.accounts.getSelectedAccount();
        const accountName = account ? chalk_1.default.cyan(`🔐 Current Selected Account: ${chalk_1.default.green(account.name || 'user')} - ${chalk_1.default.yellow(account.auth.name) + chalk_1.default.blueBright(` (${account.auth.base})`)}`) : chalk_1.default.gray('🔐 No account selected');
        const java = data_manager.get('use:temurin') || null;
        const javaName = java ? chalk_1.default.cyan(`☕ Selected Java Binary: ${chalk_1.default.green(java.version || 'Unknown')} ${chalk_1.default.gray(`from ${chalk_1.default.yellow(java.provider || 'Unknown')}, ${java.path}`)}`) : chalk_1.default.cyan(`☕ No Selected Java Binary`);
        console.log(gradient.retro(logo));
        console.log(chalk_1.default.gray(` ✨ Lightweight Minecraft CLI Launcher — Version ${this.version}`));
        console.log();
        console.log(profileName);
        console.log(accountName);
        console.log(javaName);
        console.log();
    }
    async authenticatorMenu() {
        while (true) {
            const { choice } = await inquirer_1.default.prompt([
                {
                    type: 'list',
                    name: 'choice',
                    message: chalk_1.default.hex('#60a5fa')('🔐 Authenticator Menu'),
                    choices: [
                        { name: '👤 Choose Account', value: 'choose' },
                        { name: '➕ Login', value: 'login' },
                        { name: '❌ Remove Account', value: 'remove' },
                        new inquirer_1.default.Separator(),
                        { name: '🌐 Add a Custom Yggdrasil Server', value: 'create_provider' },
                        { name: '🌐 Delete a Custom Yggdrasil Server', value: 'delete_provider' },
                        new inquirer_1.default.Separator(),
                        { name: '🔙 Back to Main Menu', value: 'back' }
                    ],
                    loop: false
                }
            ]);
            console.clear();
            switch (choice) {
                case 'choose':
                    await this.handler.choose_account();
                    break;
                case 'create_provider':
                    await (0, create_1.createProvider)();
                    break;
                case 'delete_provider':
                    await (0, create_1.deleteProvider)();
                    break;
                case 'login':
                    const all_providers = await (0, account_1.getAuthProviders)();
                    const grouped = {};
                    for (const [prov, providerCtor] of all_providers.entries()) {
                        const metadata = new providerCtor('', '').metadata;
                        if (!grouped[metadata.base]) {
                            grouped[metadata.base] = [];
                        }
                        grouped[metadata.base].push({
                            name: metadata.name,
                            value: prov
                        });
                    }
                    const sortedBases = Object.keys(grouped).sort();
                    const choices = [];
                    for (const base of sortedBases) {
                        choices.push(new prompts_1.Separator(chalk_1.default.bold.cyan(`🔑 ${base}`)));
                        const providers = grouped[base].sort((a, b) => a.name.localeCompare(b.name));
                        choices.push(...providers);
                    }
                    const { provider } = await inquirer_1.default.prompt({
                        type: 'list',
                        name: 'provider',
                        message: 'Auth Provider:',
                        choices,
                        loop: false,
                    });
                    const credentials = provider === "MSA" || provider === 'microsoft' ? { email: "", password: "" } : await inquirer_1.default.prompt([
                        {
                            type: 'input',
                            name: 'email',
                            message: 'Email or Username:',
                        },
                        {
                            type: 'password',
                            name: 'password',
                            message: 'Password:' + (provider === chalk_1.default.bold.redBright('Offline') ? ' (This is not required as youre gonna use an OFFLINE ACCOUNT) ' : ''),
                            mask: '*'
                        },
                    ]);
                    const result = await this.handler.login(credentials, provider);
                    if (result) {
                        console.log(chalk_1.default.green(`✅ Logged in as ${result.name}`));
                    }
                    else {
                        console.log(chalk_1.default.redBright('❌ Login failed.'));
                    }
                    await new Promise(res => setTimeout(res, 2000));
                    await this.showHeader();
                    break;
                case 'remove':
                    await this.handler.remove_account();
                    break;
                case 'back':
                    return;
            }
            console.clear();
        }
    }
    async mainMenu() {
        while (true) {
            const { choice } = await inquirer_1.default.prompt([
                {
                    type: 'list',
                    name: 'choice',
                    message: chalk_1.default.hex('#c084fc')('🌸 What do you want to do?'),
                    choices: [
                        { name: '🎮 Launch Minecraft', value: 'launch' },
                        new inquirer_1.default.Separator(),
                        { name: '🔐 Authenticator', value: 'authenticator' },
                        { name: '🛠  Configure Settings', value: 'configure_settings' },
                        new inquirer_1.default.Separator(),
                        { name: '📂 All Profiles', value: 'choose_profile' },
                        { name: '⬇️  Install Minecraft Version', value: 'install_version' },
                        { name: '⬇️  Install Modpack', value: 'install_modpack' },
                        { name: '🗑️  Delete Profile/Instance', value: 'delete_profile' },
                        new inquirer_1.default.Separator(),
                        { name: '🧩 Install Mods / Resources / Shaders', value: 'install_content' },
                        { name: '🧰 Manage Installations', value: 'manage_installations' },
                        new inquirer_1.default.Separator(),
                        { name: '☕ Install Java', value: 'install_java' },
                        { name: '📌 Select Java', value: 'select_java' },
                        { name: '🗑️  Delete Java', value: 'delete_java' },
                        new inquirer_1.default.Separator(),
                        { name: '🧹 Reset Minecraft', value: 'reset_minecraft' },
                        { name: '🧹 Reset Origami', value: 'reset_origami' },
                        new inquirer_1.default.Separator(),
                        { name: '🚪 Exit', value: 'exit' }
                    ],
                    loop: false,
                }
            ]);
            switch (choice) {
                case 'launch':
                    await this.launch();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'choose_profile':
                    await this.handler.choose_profile();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'delete_profile':
                    await this.handler.delete_profile();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'authenticator':
                    await this.authenticatorMenu();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'configure_settings':
                    await this.handler.configure_settings();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'install_version':
                    await this.handler.install_version();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'install_modpack':
                    const mpack_installer = new modpack_1.ModpackInstaller(handler_1.logger);
                    await mpack_installer.install_modrinth_content();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'install_content':
                    const installer = new mod_1.ModInstaller(handler_1.logger);
                    const profile = this.handler.profiles.getSelectedProfile();
                    if (profile)
                        await installer.install_modrinth_content(profile);
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'manage_installations':
                    const _profile = this.handler.profiles.getSelectedProfile();
                    if (_profile)
                        await this.manageInstallationsMenu(_profile);
                    await this.showHeader();
                    break;
                case 'install_java':
                    await java_1.default.download();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'select_java':
                    await java_1.default.select(true);
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'delete_java':
                    await java_1.default.delete();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'reset_minecraft':
                    await this.resetMinecraft();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'reset_origami':
                    await this.resetOrigami();
                    console.log('\n\n\n');
                    await this.showHeader();
                    break;
                case 'exit':
                    this.exit();
                    return;
            }
        }
    }
    async resetMinecraft() {
        const mcDir = (0, common_1.minecraft_dir)();
        const { confirm } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: chalk_1.default.redBright(`⚠️  This will delete everything in: ${mcDir}\nAre you sure?`),
                default: false,
            }
        ]);
        if (!confirm)
            return;
        try {
            (0, fs_extra_1.removeSync)(mcDir);
            console.log(chalk_1.default.green('🧹 Minecraft directory reset successfully.'));
        }
        catch (err) {
            console.log(chalk_1.default.red('❌ Failed to reset Minecraft directory.'));
            console.error(err);
        }
        await new Promise(res => setTimeout(res, 2000));
    }
    async resetOrigami() {
        const cache = (0, common_1.localpath)(true);
        const origami = (0, common_1.minecraft_dir)(true);
        const data = (0, common_1.localpath)();
        const { confirm } = await inquirer_1.default.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: chalk_1.default.redBright(`⚠️  This will delete everything in: ${data} and corresponding Origami settings, accounts and profiles\nAre you sure?`),
                default: false,
            }
        ]);
        if (!confirm)
            return;
        try {
            (0, fs_extra_1.removeSync)(origami);
            (0, fs_extra_1.removeSync)(data);
            (0, fs_extra_1.removeSync)(cache);
            console.log(chalk_1.default.green('🧹 Origami reset successfully.'));
        }
        catch (err) {
            console.log(chalk_1.default.red('❌ Failed to reset Origami'));
            console.error(err);
        }
        await new Promise(res => setTimeout(res, 2000));
    }
    async launch() {
        const code = await this.handler.run_minecraft();
        if (code) {
            console.log(chalk_1.default.green(`✅ Minecraft exited with code ${code}`));
        }
        else {
            console.log(chalk_1.default.red('❌ Failed to launch Minecraft.'));
        }
    }
    exit() {
        console.log(chalk_1.default.gray('\n👋 Thanks for using Origami! Happy crafting!'));
        process.exit(0);
    }
    async manageInstallationsMenu(profile) {
        const manager = new manager_1.default(profile);
        while (true) {
            const list = manager.getList();
            const choices = [];
            const addGroup = (title, items, type) => {
                if (items.length > 0) {
                    choices.push(new inquirer_1.default.Separator(`📁 ${title}`));
                    for (const item of items) {
                        const isDisabled = type === 'mod' && manager.isModDisabled(item);
                        choices.push({
                            name: `${item}${isDisabled ? chalk_1.default.gray(' (disabled)') : ''}`,
                            value: { name: item, type }
                        });
                    }
                }
            };
            addGroup('Mods', list.mods, 'mod');
            addGroup('Shaders', list.shaders, 'shader');
            addGroup('Resource Packs', list.resourcepacks, 'resourcepack');
            choices.push(new inquirer_1.default.Separator());
            choices.push({ name: '🔙 Back', value: '__back' });
            const { selected } = await inquirer_1.default.prompt({
                type: 'list',
                name: 'selected',
                message: 'Select an installed item to manage:',
                choices,
                pageSize: 20
            });
            if (selected === '__back')
                break;
            await this.manageInstalledItem(manager, selected.name, selected.type);
        }
    }
    async manageInstalledItem(manager, name, type) {
        const isDisabled = type === 'mod' ? manager.isModDisabled(name) : false;
        const actions = [
            { name: '🗑 Delete', value: 'delete' }
        ];
        if (type === 'mod') {
            actions.push({
                name: isDisabled ? '✅ Enable' : '🚫 Disable',
                value: isDisabled ? 'enable' : 'disable'
            });
        }
        actions.push({ name: '🔙 Back', value: 'back' });
        const { action } = await inquirer_1.default.prompt({
            type: 'list',
            name: 'action',
            message: `What do you want to do with "${name}"?`,
            choices: actions
        });
        switch (action) {
            case 'delete':
                manager.deleteFromType(name, type);
                console.log(chalk_1.default.redBright(`🗑 Deleted ${name} from ${type}s.`));
                break;
            case 'disable':
                manager.disableMod(name);
                console.log(chalk_1.default.yellow(`🚫 Disabled ${name}.`));
                break;
            case 'enable':
                manager.enableMod(name);
                console.log(chalk_1.default.green(`✅ Enabled ${name}.`));
                break;
            case 'back':
            default:
                return;
        }
        await new Promise(res => setTimeout(res, 1500));
    }
}
exports.Runtime = Runtime;
// Run directly if executed standalone
if (require.main === module) {
    const runtime = new Runtime();
    runtime.start();
}
//# sourceMappingURL=runtime.js.map