import { SlashCommandBuilder } from 'discord.js';
import { openDb } from '../db.js';
import { parseMentionIds } from '../parsers.js';

export const data = new SlashCommandBuilder()
  .setName('cass-insmb')
  .setDescription('サーバーメンバーをキャスト名簿に新規登録（既存はスキップ）')
  .addStringOption((opt) =>
    opt
      .setName('exclude')
      .setDescription('除外するメンバー（@メンション、複数可）')
      .setRequired(false),
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const excludeIds = new Set(
    parseMentionIds(interaction.options.getString('exclude')),
  );
  const guild = interaction.guild;
  if (!guild) {
    await interaction.editReply('このコマンドはサーバー内でのみ使えます。');
    return;
  }

  const members = await guild.members.fetch();
  const targets = members.filter(
    (m) => !m.user.bot && !excludeIds.has(m.user.id),
  );

  const db = openDb(process.env.STARGAZER_BOT_DB_PATH);
  const exists = db.prepare(
    'SELECT 1 FROM casts WHERE discord_user_id = ?',
  );
  const insert = db.prepare(
    'INSERT INTO casts (name, discord_user_id) VALUES (?, ?)',
  );

  let added = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const m of targets.values()) {
      const displayName = m.displayName ?? m.user.username;
      if (exists.get(m.user.id)) {
        skipped++;
      } else {
        insert.run(displayName, m.user.id);
        added++;
      }
    }
  });
  tx();

  await interaction.editReply(
    [
      `**キャスト名簿に登録しました**`,
      `新規追加: ${added} 名`,
      `既存スキップ: ${skipped} 名`,
      excludeIds.size > 0 ? `除外: ${excludeIds.size} 名` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}
