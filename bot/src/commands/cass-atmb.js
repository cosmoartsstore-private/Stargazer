import { SlashCommandBuilder } from 'discord.js';
import { openDb } from '../db.js';
import { parseMentionIds, parseMessageUrl } from '../parsers.js';

export const data = new SlashCommandBuilder()
  .setName('cass-atmb')
  .setDescription('投稿リアクション + 指定メンバーを出席、それ以外を欠席として一括上書き')
  .addStringOption((opt) =>
    opt
      .setName('message')
      .setDescription('対象メッセージのリンク')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('include')
      .setDescription('追加で出席扱いにするメンバー（@メンション、複数可）')
      .setRequired(false),
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const url = interaction.options.getString('message', true);
  const parsed = parseMessageUrl(url);
  if (!parsed) {
    await interaction.editReply('メッセージリンクの形式が不正です。');
    return;
  }
  if (parsed.guildId !== interaction.guildId) {
    await interaction.editReply('別のサーバーのメッセージは指定できません。');
    return;
  }

  const channel = await interaction.client.channels.fetch(parsed.channelId);
  if (!channel?.isTextBased()) {
    await interaction.editReply('指定チャンネルにアクセスできません。');
    return;
  }
  const message = await channel.messages.fetch(parsed.messageId);

  const presentIds = new Set(
    parseMentionIds(interaction.options.getString('include')),
  );
  for (const reaction of message.reactions.cache.values()) {
    const users = await reaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot) presentIds.add(user.id);
    }
  }

  const db = openDb(process.env.STARGAZER_BOT_DB_PATH);
  const ensureRow = db.prepare(
    'INSERT OR IGNORE INTO event_cast_present (cast_id, is_present) SELECT id, 0 FROM casts',
  );
  const resetAll = db.prepare(
    'UPDATE event_cast_present SET is_present = 0',
  );
  const markPresent = db.prepare(
    'UPDATE event_cast_present SET is_present = 1 WHERE cast_id IN (SELECT id FROM casts WHERE discord_user_id = ?)',
  );
  const countPresent = db.prepare(
    'SELECT COUNT(*) AS n FROM event_cast_present WHERE is_present = 1',
  );
  const countTotal = db.prepare('SELECT COUNT(*) AS n FROM casts');

  const tx = db.transaction(() => {
    ensureRow.run();
    resetAll.run();
    for (const id of presentIds) markPresent.run(id);
  });
  tx();

  const present = countPresent.get().n;
  const total = countTotal.get().n;
  const absent = total - present;

  await interaction.editReply(
    [
      `**出席フラグを一括上書きしました**`,
      `出席: ${present} 名`,
      `欠席: ${absent} 名`,
      `合計キャスト: ${total} 名`,
    ].join('\n'),
  );
}
