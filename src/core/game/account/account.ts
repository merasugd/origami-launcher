import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'crypto';
import keytar from 'keytar';
import { LauncherAccounts, LauncherAccount } from '../../../types/launcher';
import { minecraft_dir } from '../../utils/common';
import { Credentials, IAuthMetadata } from '../../../types/account';
import { logger } from '../launch/handler';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ORIGAMI_CLIENT_TOKEN } from '../../../config/defaults';
import { Separator } from '@inquirer/prompts';
import { getAuthProvider, getAuthProviders } from '.';

const SERVICE = 'OrigamiLauncher';
const ACCOUNT = os.userInfo().username;

const IV_LENGTH = 16;
const HMAC_ALGO = 'sha256';

const mcDir = minecraft_dir(true);
const launcherProfilesPath = path.join(mcDir, 'accounts.dat');

const old_launcherProfilesPath = path.join(minecraft_dir(), 'launcher_profiles.json');
const legacy_210_profiles = path.join(minecraft_dir(), 'origami_files', 'accounts.dat');

async function getOrGenerateKey(): Promise<Buffer> {
    const stored = await keytar.getPassword(SERVICE, ACCOUNT);

    if (stored) {
        return Buffer.from(stored, 'hex');
    }

    const fingerprint = `${os.hostname()}-${os.arch()}-${os.platform()}-${ORIGAMI_CLIENT_TOKEN}`;
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(fingerprint, salt, 100_000, 32, 'sha256');

    await keytar.setPassword(SERVICE, ACCOUNT, key.toString('hex'));
    return key;
}

function computeHMAC(data: string, key: Buffer): string {
    return crypto.createHmac(HMAC_ALGO, key).update(data).digest('base64');
}

function encryptWithKey(text: string, key: Buffer): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return iv.toString('base64') + ':' + encrypted;
}

function decryptWithKey(text: string, key: Buffer): string {
    const [ivBase64, encrypted] = text.split(':');
    const iv = Buffer.from(ivBase64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

async function migrateLegacyFormat(filePath: string, currentKey: Buffer): Promise<LauncherAccounts | null> {
    try {
        const old = fs.existsSync(old_launcherProfilesPath) ? fs.readFileSync(old_launcherProfilesPath, 'utf-8') : '{}';

        // Case 1: Plain JSON file (unencrypted)
        try {
            const parsed = JSON.parse(old);
            if (parsed.accounts) {
                logger.warn('⚠️ Detected old launcher_profiles accounts. Migrating to encrypted format...');
                const newData = parsed as LauncherAccounts;

                const plaintext = JSON.stringify(newData);
                const encrypted = encryptWithKey(plaintext, currentKey);
                const hmac = computeHMAC(encrypted, currentKey);

                const wrapped = { encrypted, hmac };
                fs.writeFileSync(filePath, JSON.stringify(wrapped, null, 2));

                if(fs.existsSync(old_launcherProfilesPath)) {
                    delete parsed.accounts;
                    fs.writeFileSync(old_launcherProfilesPath, JSON.stringify(parsed, null, 2));
                };

                return newData;
            }
        } catch (_) {
            // Not valid JSON, fall through to next check
        }

        const raw = fs.readFileSync(filePath, 'utf-8');

        // Case 1: Plain JSON file (unencrypted)
        try {
            const parsed = JSON.parse(raw);
            if (parsed.accounts) {
                logger.warn('⚠️ Detected unencrypted accounts.dat. Migrating to encrypted format...');
                const newData = parsed as LauncherAccounts;

                const plaintext = JSON.stringify(newData);
                const encrypted = encryptWithKey(plaintext, currentKey);
                const hmac = computeHMAC(encrypted, currentKey);

                const wrapped = { encrypted, hmac };
                fs.writeFileSync(filePath, JSON.stringify(wrapped, null, 2));
                return newData;
            }
        } catch (_) {
            // Not valid JSON, fall through to next check
        }

        // Case 2: Legacy encrypted format (AES-256-CBC with static ORIGAMI_CLIENT_TOKEN)
        try {
            const legacyKey = crypto.createHash('sha256').update(ORIGAMI_CLIENT_TOKEN).digest();
            const decrypted = decryptWithKey(raw, legacyKey);
            const parsed = JSON.parse(decrypted);

            if (parsed.accounts) {
                logger.warn('⚠️ Detected legacy-encrypted accounts.dat. Migrating to encrypted format...');
                const newData = parsed as LauncherAccounts;

                const plaintext = JSON.stringify(newData);
                const encrypted = encryptWithKey(plaintext, currentKey);
                const hmac = computeHMAC(encrypted, currentKey);

                const wrapped = { encrypted, hmac };
                fs.writeFileSync(filePath, JSON.stringify(wrapped, null, 2));
                return newData;
            }
        } catch (_) {
            // Not decryptable with legacy key
        }

        return null;
    } catch (err) {
        logger.error('❌ Failed to read or migrate legacy accounts.dat:', (err as Error).message);
        return null;
    }
}

export class LauncherAccountManager {
    private filePath: string;
    private data: LauncherAccounts;
    private key: Buffer | null = null;

    constructor(filePath: string = launcherProfilesPath) {
        this.filePath = filePath;

        if(fs.existsSync(legacy_210_profiles)) {
            fs.writeFileSync(filePath, fs.readFileSync(legacy_210_profiles));
            
            setTimeout(() => fs.unlinkSync(legacy_210_profiles), 500);
        }
        
        this.data = { accounts: {} };
        this.load();
    }

    private async ensureKey() {
        if (!this.key) {
            this.key = await getOrGenerateKey();
        }
    }

    async load() {
        await this.ensureKey();

        if (fs.existsSync(this.filePath)) {
            try {
                const rawContent = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(rawContent);

                if (!parsed.encrypted || !parsed.hmac) {
                    throw new Error("Not new format");
                }

                const { encrypted, hmac } = parsed;
                const computedHmac = computeHMAC(encrypted, this.key!);

                if (computedHmac !== hmac) {
                    throw new Error('HMAC validation failed.');
                }

                const decrypted = decryptWithKey(encrypted, this.key!);
                const json = JSON.parse(decrypted);

                if (json.selectedAccount) {
                    this.data.selectedAccount = json.selectedAccount;
                }

                if (json.accounts) {
                    this.data.accounts = json.accounts;
                } else {
                    throw new Error("Decrypted JSON does not contain accounts.");
                }
            } catch (err) {
                logger.warn('⚠️ Encrypted load failed. Attempting migration...');
                const migrated = await migrateLegacyFormat(this.filePath, this.key!);

                if (migrated) {
                    this.data = migrated;
                } else {
                    logger.error('❌ Could not migrate legacy accounts.dat. Starting fresh.');
                    this.data = { accounts: {} };
                }
            }
        } else {
            await this.save();
        }
    }

    async save() {
        await this.ensureKey();

        const plaintext = JSON.stringify({ accounts: this.data.accounts, selectedAccount: this.data.selectedAccount });
        const encrypted = encryptWithKey(plaintext, this.key!);
        const hmac = computeHMAC(encrypted, this.key!);

        const final = { encrypted, hmac };
        fs.writeFileSync(this.filePath, JSON.stringify(final, null, 2));
    }

    reset() {
        if (fs.existsSync(this.filePath)) {
            fs.unlinkSync(this.filePath);
        }
    }

    async addAccount(account: LauncherAccount) {
        await this.load();

        this.data.accounts[account.id] = account;
        await this.save();
    }

    async deleteAccount(id: string) {
        await this.load();
        
        if (this.data.accounts[id]) {
            delete this.data.accounts[id];
            if (this.data.selectedAccount === id) this.data.selectedAccount = undefined;
            await this.save();
            return true;
        }
        return false;
    }

    async hasAccount(cred: Credentials, provider: string): Promise<boolean> {
        await this.load();

        return Object.values(this.data.accounts).some(acc => acc.auth.name === provider.toLowerCase() && acc.credentials === cred);
    }

    async getAccount(id: string): Promise<LauncherAccount | null> {
        await this.load();

        const acc = this.data.accounts[id];
        if (!acc) {
            logger.error(`Account "${id}" does not exist.`);
            return null;
        }
        return acc;
    }

    async selectAccount(id: string): Promise<LauncherAccount | null> {
        const acc = await this.getAccount(id);
        if (!acc) return null;

        this.data.selectedAccount = acc.id;
        await this.save();
        return acc;
    }

    async listAccounts(): Promise<LauncherAccount[]> {
        await this.load();

        return Object.values(this.data.accounts);
    }

    async getSelectedAccount(): Promise<LauncherAccount | null> {
        await this.load();

        return this.getAccount(this.data.selectedAccount || 'no-id');
    }

    async chooseAccount(): Promise<LauncherAccount | null> {
        const accounts = await this.listAccounts();
        if (accounts.length === 0) {
            console.log(chalk.red("❌ No accounts found."));
            return null;
        }

        const allProviders = await getAuthProviders();
        const providerMeta = new Map<string, IAuthMetadata>();

        for (const [key, ctor] of allProviders.entries()) {
            try {
                const meta = new ctor('', '').metadata;
                providerMeta.set(meta.name, meta);
            } catch {
                providerMeta.set(key, { name: key, base: "Other" });
            }
        }

        const other = "! Other, Disabled or Non-Working Accounts !";
        const groupedByBase: Record<string, LauncherAccount[]> = {};
        for (const acc of accounts) {
            const authKey = acc.auth;
            const meta = providerMeta.get(authKey.name);
            const base = meta?.base ?? other;

            if (!groupedByBase[base]) groupedByBase[base] = [];
            groupedByBase[base].push(acc);
        }

        const sortedBases = Object.keys(groupedByBase).sort();
        const choices: Array<Separator | { name: string; value: string }> = [];

        for (const base of sortedBases) {
            choices.push(new inquirer.Separator(base === other ? chalk.bold.yellowBright(`⚠️  ${other}`) : chalk.bold.cyan(`🔑 ${base.toUpperCase()}`)));

            const providerAccounts = groupedByBase[base].sort((a, b) => (a.name || 'other').localeCompare(b.name || 'other'));

            for (const acc of providerAccounts) {
                const line = `${chalk.hex('#4ade80')(acc.name)} ${chalk.gray(`(${acc.uuid?.slice(0, 8)}...)`)} - ${chalk.hex('#facc15')(acc.auth.name || 'No info')}`;
                choices.push({ name: line, value: acc.id });
            }
        }

        const { selectedId } = await inquirer.prompt([
            {
                type: "list",
                name: "selectedId",
                message: chalk.hex("#60a5fa")("🎭 Choose an account to use:"),
                choices,
                loop: false
            }
        ]);

        const selectedAccount = await this.selectAccount(selectedId);
        if (selectedAccount) {
            console.log(chalk.green(`✅ Selected account: ${selectedAccount.name}`));
        }

        return selectedAccount;
    }
}

export default LauncherAccountManager;
