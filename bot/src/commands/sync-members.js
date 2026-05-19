import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('sync-members')
  .setDescription('Guild メンバー（または指定ロール保持者）を DB に取り込む')
  .addRoleOption((opt) =>
    opt
      .setName('role')
      .setDescription('対象ロール（省略時は全メンバー）')
      .setRequired(false),
  );

export async function execute(interaction) {
  // TODO: Stargazer 側に discord_members テーブルが入ったら実装
  //   - interaction.guild.members.fetch()
  //   - role 指定時は role.members で絞り込み
  //   - INSERT OR REPLACE INTO discord_members (discord_user_id, username, ...)
  await interaction.reply({
    content: '未実装: Stargazer 側のスキーマ追加（discord_members テーブル）待ち。',
    ephemeral: true,
  });
}
