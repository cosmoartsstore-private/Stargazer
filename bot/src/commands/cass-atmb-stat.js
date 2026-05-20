import { SlashCommandBuilder } from 'discord.js';
import { openDb } from '../db.js';

export const data = new SlashCommandBuilder()
  .setName('cass-atmb-stat')
  .setDescription('現在の出席キャスト一覧を表示');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db = openDb(process.env.STARGAZER_BOT_DB_PATH);
  const rows = db
    .prepare(
      `SELECT c.name
         FROM casts c
         JOIN event_cast_present p ON p.cast_id = c.id
        WHERE p.is_present = 1
        ORDER BY c.name`,
    )
    .all();

  if (rows.length === 0) {
    await interaction.editReply('出席のキャストはいません。');
    return;
  }

  const lines = rows.map((r, i) => `${i + 1}. ${r.name}`);
  const body = lines.join('\n');
  const header = `**出席キャスト ${rows.length} 名**\n`;

  if (header.length + body.length <= 1900) {
    await interaction.editReply(header + body);
    return;
  }

  const buf = Buffer.from(header + body, 'utf8');
  await interaction.editReply({
    content: `**出席キャスト ${rows.length} 名**（多数のためファイル添付）`,
    files: [{ attachment: buf, name: 'attendance.txt' }],
  });
}
