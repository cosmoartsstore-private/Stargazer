import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import * as setupDb from './commands/setup-db.js';
import * as syncMembers from './commands/sync-members.js';
import * as checkin from './commands/checkin.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('DISCORD_TOKEN and CLIENT_ID are required in .env.');
  process.exit(1);
}

const body = [setupDb, syncMembers, checkin].map((m) => m.data.toJSON());
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

console.log(
  `Registering ${body.length} commands (${GUILD_ID ? 'guild' : 'global'})...`,
);
await rest.put(route, { body });
console.log('Done.');
