import fs from 'node:fs';
import { SlashCommandBuilder } from 'discord.js';
import {
  resolveDbPath,
  saveDbPathOverride,
  clearDbPathOverride,
} from '../config.js';

export const data = new SlashCommandBuilder()
  .setName('setup-db')
  .setDescription('Stargazer の SQLite DB パスを確認 / 上書きする')
  .addStringOption((opt) =>
    opt
      .setName('path')
      .setDescription('DB ファイルの絶対パス（省略時は自動検出のみ）')
      .setRequired(false),
  )
  .addBooleanOption((opt) =>
    opt
      .setName('reset')
      .setDescription('保存済みの上書きをクリアして自動検出に戻す')
      .setRequired(false),
  );

export async function execute(interaction) {
  const override = interaction.options.getString('path');
  const reset = interaction.options.getBoolean('reset');

  if (reset) {
    clearDbPathOverride();
  } else if (override) {
    if (!fs.existsSync(override)) {
      return interaction.reply({
        content: `指定パスにファイルがありません: \`${override}\``,
        ephemeral: true,
      });
    }
    saveDbPathOverride(override);
  }

  const { path: dbPath, source } = await resolveDbPath();
  const exists = fs.existsSync(dbPath);
  await interaction.reply({
    content: [
      `**DB パス**: \`${dbPath}\``,
      `**解決元**: \`${source}\``,
      `**存在**: ${exists ? 'OK' : '見つかりません'}`,
    ].join('\n'),
    ephemeral: true,
  });
}
