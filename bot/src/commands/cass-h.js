import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('cass-h')
  .setDescription('Stargazer Discord 連携の使い方を表示');

export async function execute(interaction) {
  const help = [
    '**Stargazer Discord 連携 — コマンド一覧**',
    '',
    '`/cass-insmb [exclude:<@除外メンバー>]`',
    '└ サーバーの全メンバー（除外を除く）をキャスト名簿に新規登録します。既に登録済みのメンバーはスキップ。',
    '',
    '`/cass-atmb message:<投稿リンク> [include:<@追加メンバー>]`',
    '└ 指定投稿にリアクションしたメンバー + include 指定メンバーを「出席」、それ以外を「欠席」として一括上書きします。',
    '',
    '`/cass-atmb-stat`',
    '└ 現在出席フラグが立っているキャストを一覧表示します。',
    '',
    '`/cass-h`',
    '└ このヘルプを表示します。',
    '',
    '※ 受信中のイベントの DB に書き込みます。イベントを切り替えるときは一度 Stargazer 側で「切断」してください。',
  ].join('\n');
  await interaction.reply({ content: help, ephemeral: true });
}
