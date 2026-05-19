// Required env vars (place in bot/.env):
//   DISCORD_TOKEN       Bot token
//   CLIENT_ID           Application ID (deploy-commands.js only)
//   GUILD_ID            Target guild for command registration (optional, recommended for dev)
// Optional:
//   STARGAZER_DB_PATH   Override DB path; otherwise resolved via registry / bot-config.json
import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Events } from 'discord.js';
import * as setupDb from './commands/setup-db.js';
import * as syncMembers from './commands/sync-members.js';
import * as checkin from './commands/checkin.js';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('DISCORD_TOKEN is not set in bot/.env');
  process.exit(1);
}

const commands = new Collection();
for (const mod of [setupDb, syncMembers, checkin]) {
  commands.set(mod.data.name, mod);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}`);
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
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.login(token);
