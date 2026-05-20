import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import * as cassH from './commands/cass-h.js';
import * as cassInsmb from './commands/cass-insmb.js';
import * as cassAtmb from './commands/cass-atmb.js';
import * as cassAtmbStat from './commands/cass-atmb-stat.js';
import { closeDb } from './db.js';

const token = process.env.STARGAZER_BOT_TOKEN;
const dbPath = process.env.STARGAZER_BOT_DB_PATH;

if (!token || !dbPath) {
  console.error(
    'Required env vars missing: STARGAZER_BOT_TOKEN, STARGAZER_BOT_DB_PATH',
  );
  process.exit(1);
}

const commands = new Collection();
for (const mod of [cassH, cassInsmb, cassAtmb, cassAtmbStat]) {
  commands.set(mod.data.name, mod);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, (c) => {
  console.log(`READY ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    const reply = { content: `エラー: ${err.message}`, ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

async function shutdown(signal) {
  console.log(`SHUTDOWN ${signal}`);
  try {
    closeDb();
    await client.destroy();
  } finally {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

client.login(token);
