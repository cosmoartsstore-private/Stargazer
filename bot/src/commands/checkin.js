import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('checkin')
  .setDescription('指定投稿にリアクションしたメンバーを出席として記録')
  .addStringOption((opt) =>
    opt
      .setName('message-url')
      .setDescription('対象メッセージのリンク')
      .setRequired(true),
  )
  .addIntegerOption((opt) =>
    opt
      .setName('event-id')
      .setDescription('Stargazer の event_id')
      .setRequired(true),
  )
  .addStringOption((opt) =>
    opt
      .setName('reaction')
      .setDescription('絵文字（省略時は全リアクションのユニーク合算）')
      .setRequired(false),
  );

export async function execute(interaction) {
  // TODO: 実装計画
  //   1. message-url を guildId/channelId/messageId に分解
  //   2. channel.messages.fetch(messageId) → message.reactions
  //   3. reaction 指定があればフィルタ
  //   4. users.fetch() でユニオン
  //   5. discord_members 経由で applicant_id を解決
  //   6. INSERT INTO attendance (event_id, applicant_id, ...) ON CONFLICT DO NOTHING
  await interaction.reply({
    content: '未実装: discord_members → applicants 紐付けスキーマ待ち。',
    ephemeral: true,
  });
}
