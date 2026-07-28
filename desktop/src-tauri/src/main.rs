// Windowsのrelease buildで追加consoleを開かないために必要。削除しないこと。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktop_lib::run()
}
