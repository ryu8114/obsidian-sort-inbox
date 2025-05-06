# Sort Inbox - Obsidian Plugin

Obsidianの「メモ/」フォルダ直下に作成された.mdファイルを、Gemini 2.0 Flashを使用して自動的に適切なフォルダに分類・移動するプラグインです。

[English](#english) | [日本語](#japanese)

<a id="japanese"></a>
## 機能

- `メモ/` フォルダ直下に作成された `.md` ファイルを、自動で分類対象フォルダに移動
- 分類は「タイトル＋本文」の内容を Gemini 2.0 Flash に送って判断
- 該当するフォルダがない場合は、移動・分類しない（スキップ）
- 分類対象のフォルダは、ユーザーがプラグインの設定画面から変更可能

## インストール方法

1. Obsidianの設定パネルを開く
2. サードパーティプラグイン > コミュニティプラグイン > 参照から「Sort Inbox」を検索
3. インストールして有効化

または、このリポジトリをクローンして、`.obsidian/plugins/sort-inbox/` に配置することもできます。

## 設定

プラグイン設定画面で以下の項目を設定できます：

- **Gemini API キー**: Google AI Studio で取得したAPIキー
- **監視対象フォルダ**: メモが保存されるフォルダ（デフォルト: `メモ/`）
- **分類対象フォルダ**: メモを振り分ける先のフォルダリスト

## 使い方

1. 設定画面でGemini API キーと分類対象フォルダを設定
2. 左サイドバーの「Sort Inbox」アイコンをクリック、またはコマンドパレットから「メモを自動分類する」を実行
3. `メモ/` フォルダ内のファイルが自動的に分類されます

## ライセンス

MIT

---

**注意**: このプラグインはGemini API（Google）を使用します。APIの使用には無料枠の制限があります。

<a id="english"></a>
# Sort Inbox - Obsidian Plugin

This plugin automatically categorizes and moves Markdown files from your "Notes/" folder to appropriate subfolders using Gemini 2.0 Flash AI.

## Features

- Automatically moves `.md` files from your designated inbox folder to appropriate target folders
- Classification is based on content analysis (title + body) using Gemini 2.0 Flash AI
- Files that don't match any target folder remain in place (skipped)
- Target folders can be customized through the plugin settings

## Installation

1. Open Obsidian Settings
2. Go to Third-party plugins > Community plugins > Browse
3. Search for "Sort Inbox" and install

Alternatively, you can clone this repository into your `.obsidian/plugins/sort-inbox/` directory.

## Configuration

In the plugin settings, you can configure:

- **Gemini API Key**: Get this from Google AI Studio
- **Watch Folder**: The inbox folder to monitor (default: `Notes/`)
- **Target Folders**: The list of folders to classify notes into

## Usage

1. Configure your Gemini API key and target folders in the settings
2. Click the "Sort Inbox" icon in the left sidebar, or run "Sort inbox files" from the command palette
3. Files in your inbox folder will be automatically classified and moved

## License

MIT

---

**Note**: This plugin uses the Gemini API (Google). API usage is subject to free tier limitations. 
