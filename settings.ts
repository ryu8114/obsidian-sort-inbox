import { App, PluginSettingTab, Setting, Notice, setIcon, ButtonComponent } from 'obsidian';
import SortInboxPlugin from './main';
import { ClassificationOptions } from './types';
import { testGeminiAPI } from './classify';

export interface SortInboxSettings {
	// Gemini APIキー
	geminiApiKey: string;
	
	// 分類対象フォルダリスト
	targetFolders: string[];
	
	// メモが保存されるルートフォルダ
	inboxFolder: string;
	
	// 分類処理の頻度（分単位、0は手動のみ）
	autoClassifyInterval: number;
	
	// 自動分類が有効かどうか
	autoClassifyEnabled: boolean;
	
	// 詳細な分類オプション
	classificationOptions: ClassificationOptions;
}

export const DEFAULT_SETTINGS: SortInboxSettings = {
	geminiApiKey: '',
	targetFolders: ['技術メモ', '日記', '思考ログ'],
	inboxFolder: 'メモ',
	autoClassifyInterval: 0, // デフォルトでは手動実行のみ
	autoClassifyEnabled: false,
	classificationOptions: {
		maxContentLength: 1000, // 最初の1000文字だけ使用
		timeoutMs: 10000, // 10秒タイムアウト
		logResults: true,
		skipUnclassified: true,
		highAccuracyMode: false // デフォルトでは効率優先モード
	}
}

export class SortInboxSettingTab extends PluginSettingTab {
	plugin: SortInboxPlugin;
	folderInputEl: HTMLInputElement;
	private apiTestInProgress = false;

	constructor(app: App, plugin: SortInboxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();
		containerEl.addClass('sort-inbox-settings');

		// スタイルを設定
		this.addCustomStyles();

		// タイトルとプラグイン説明
		const headerEl = containerEl.createEl('div', { cls: 'sort-inbox-header' });
		headerEl.createEl('h2', {text: 'Sort Inbox - メモ自動分類'});
		headerEl.createEl('p', {text: 'Gemini 2.0 Flash AIを使用して、メモフォルダのファイルを内容に基づいて自動分類します。'});

		// API設定セクション
		this.createSectionTitle(containerEl, 'API設定', 'key');
		
		new Setting(containerEl)
			.setName('Gemini API キー')
			.setDesc('Google AI Studio で取得したGemini APIキーを入力してください')
			.addText(text => text
				.setPlaceholder('API キーを入力')
				.setValue(this.plugin.settings.geminiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.geminiApiKey = value;
					await this.plugin.saveSettings();
				}));

		// APIキーの検証ボタンとステータス表示
		const apiTestSetting = new Setting(containerEl)
			.setName('APIキーのテスト')
			.setDesc('入力したAPIキーが有効かテストします');
			
		// API検証ステータス表示用のdiv
		const apiStatusEl = containerEl.createEl('div', {
			cls: 'api-status',
			text: '未検証'
		});

		// 検証ボタン
		apiTestSetting.addButton(button => button
			.setButtonText('テスト実行')
			.setCta()
			.onClick(async () => {
				// 処理中の場合は何もしない
				if (this.apiTestInProgress) {
					return;
				}
				
				// APIキーが空の場合
				if (!this.plugin.settings.geminiApiKey) {
					new Notice('APIキーが入力されていません');
					apiStatusEl.textContent = '未入力';
					apiStatusEl.className = 'api-status api-status-error';
					return;
				}
				
				this.apiTestInProgress = true;
				apiStatusEl.textContent = '検証中...';
				apiStatusEl.className = 'api-status api-status-pending';
				
				try {
					// API検証を実行
					const isValid = await testGeminiAPI(this.plugin.settings.geminiApiKey);
					
					if (isValid) {
						apiStatusEl.textContent = '有効 ✓';
						apiStatusEl.className = 'api-status api-status-valid';
						new Notice('APIキーは有効です！');
					} else {
						apiStatusEl.textContent = '無効 ✗';
						apiStatusEl.className = 'api-status api-status-error';
						new Notice('APIキーが無効です。正しいキーを入力してください。');
					}
				} catch (error) {
					console.error('API検証エラー:', error);
					apiStatusEl.textContent = 'エラー ✗';
					apiStatusEl.className = 'api-status api-status-error';
					new Notice(`APIテストエラー: ${error instanceof Error ? error.message : String(error)}`);
				} finally {
					this.apiTestInProgress = false;
				}
			}));

		this.addSeparator(containerEl);

		// フォルダ設定セクション
		this.createSectionTitle(containerEl, 'フォルダ設定', 'folder');
		
		new Setting(containerEl)
			.setName('メモを保存するフォルダ')
			.setDesc('新規メモが保存される監視対象のフォルダ名（例：メモ/）')
			.addText(text => text
				.setPlaceholder('メモ')
				.setValue(this.plugin.settings.inboxFolder)
				.onChange(async (value) => {
					this.plugin.settings.inboxFolder = value;
					await this.plugin.saveSettings();
				}));

		this.addSeparator(containerEl);

		// 自動実行設定セクション
		this.createSectionTitle(containerEl, '自動実行設定', 'clock');
		
		const autoSetting = new Setting(containerEl)
			.setName('自動分類を有効にする')
			.setDesc('ONにすると設定した間隔で自動的にメモを分類します')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoClassifyEnabled)
				.onChange(async (value) => {
					this.plugin.settings.autoClassifyEnabled = value;
					await this.plugin.saveSettings();
					
					// 有効/無効に応じてスライダー設定を表示切替
					intervalSetting.settingEl.style.display = value ? 'flex' : 'none';
					
					// 有効/無効に応じてラベルテキストを更新
					if (!value) {
						intervalLabel.textContent = '手動実行のみ';
					} else {
						intervalLabel.textContent = this.plugin.settings.autoClassifyInterval === 0 
							? '手動実行のみ' 
							: `${this.plugin.settings.autoClassifyInterval}分ごとに実行`;
					}
				}));
				
		const intervalSetting = new Setting(containerEl)
			.setName('自動実行の間隔（分）')
			.setDesc('0の場合は手動実行のみになります')
			.setClass('interval-setting')
			.addSlider(slider => slider
				.setLimits(0, 60, 5)
				.setValue(this.plugin.settings.autoClassifyInterval)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.autoClassifyInterval = value;
					await this.plugin.saveSettings();
					
					// 値に応じてラベルを更新
					intervalLabel.textContent = value === 0 
						? '手動実行のみ' 
						: `${value}分ごとに実行`;
				}));
		
		// インターバル設定の表示/非表示（自動分類が無効なら隠す）
		if (!this.plugin.settings.autoClassifyEnabled) {
			intervalSetting.settingEl.style.display = 'none';
		}
		
		// インターバルの値をラベルで表示
		const intervalLabel = containerEl.createEl('div', {
			cls: 'interval-label',
			text: this.plugin.settings.autoClassifyEnabled ? 
				(this.plugin.settings.autoClassifyInterval === 0 ? '手動実行のみ' : `${this.plugin.settings.autoClassifyInterval}分ごとに実行`) : 
				'手動実行のみ'
		});

		this.addSeparator(containerEl);

		// 分類先フォルダリストの表示
		this.createSectionTitle(containerEl, '分類対象フォルダ', 'folder-open');
		
		containerEl.createEl('p', {
			cls: 'setting-description',
			text: 'メモの内容から適切なフォルダを判断し、自動的に移動します。以下のフォルダリストから選択されます。'
		});
		
		const folderListContainer = containerEl.createDiv('folder-list-container');
		
		// 既存のフォルダを表示
		this.refreshFolderList(folderListContainer);
		
		// フォルダ追加の入力欄とボタン
		const folderAddContainer = containerEl.createDiv('folder-add-container');
		
		const folderInputEl = folderAddContainer.createEl('input', {
			type: 'text',
			placeholder: '新しいフォルダ名を入力',
			cls: 'folder-input'
		});
		this.folderInputEl = folderInputEl;
		
		const addButton = new ButtonComponent(folderAddContainer)
			.setButtonText('追加')
			.setCta()
			.onClick(async () => {
				if (folderInputEl.value) {
					// 重複チェック
					if (this.plugin.settings.targetFolders.includes(folderInputEl.value)) {
						new Notice('このフォルダは既に追加されています');
						return;
					}
					
					this.plugin.settings.targetFolders.push(folderInputEl.value);
					await this.plugin.saveSettings();
					this.refreshFolderList(folderListContainer);
					folderInputEl.value = '';
				}
			});
		
		// エンターキーで追加できるようにする
		folderInputEl.addEventListener('keypress', async (e) => {
			if (e.key === 'Enter' && folderInputEl.value) {
				// 重複チェック
				if (this.plugin.settings.targetFolders.includes(folderInputEl.value)) {
					new Notice('このフォルダは既に追加されています');
					return;
				}
				
				this.plugin.settings.targetFolders.push(folderInputEl.value);
				await this.plugin.saveSettings();
				this.refreshFolderList(folderListContainer);
				folderInputEl.value = '';
			}
		});

		this.addSeparator(containerEl);
				
		// 詳細オプションセクション
		this.createSectionTitle(containerEl, '詳細設定', 'settings');
		
		new Setting(containerEl)
			.setName('抽出する最大文字数')
			.setDesc('メモからGemini APIに送信する最大文字数（長いと処理時間とトークン消費が増えます）')
			.addSlider(slider => slider
				.setLimits(100, 3000, 100)
				.setValue(this.plugin.settings.classificationOptions.maxContentLength || 1000)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.classificationOptions.maxContentLength = value;
					await this.plugin.saveSettings();
				}));
				
		new Setting(containerEl)
			.setName('APIタイムアウト（ミリ秒）')
			.setDesc('API呼び出しのタイムアウト時間（ミリ秒）')
			.addText(text => text
				.setValue(String(this.plugin.settings.classificationOptions.timeoutMs || 10000))
				.onChange(async (value) => {
					const numValue = parseInt(value);
					if (!isNaN(numValue) && numValue > 0) {
						this.plugin.settings.classificationOptions.timeoutMs = numValue;
						await this.plugin.saveSettings();
					}
				}));
				
		new Setting(containerEl)
			.setName('分類できなかったメモをスキップ')
			.setDesc('ONにすると、分類先が特定できなかったメモを移動しません')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.classificationOptions.skipUnclassified || true)
				.onChange(async (value) => {
					this.plugin.settings.classificationOptions.skipUnclassified = value;
					await this.plugin.saveSettings();
				}));
				
		// ログ表示設定
		new Setting(containerEl)
			.setName('詳細ログの表示')
			.setDesc('分類処理の詳細なログを表示します')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.classificationOptions.logResults || true)
				.onChange(async (value) => {
					this.plugin.settings.classificationOptions.logResults = value;
					await this.plugin.saveSettings();
				}));
				
		// フッター情報
		const footerEl = containerEl.createEl('div', { cls: 'sort-inbox-footer' });
		footerEl.createEl('p', {
			text: 'Gemini 2.0 Flash API を使用しています。API使用量や制限についてはGoogle AI Studioをご確認ください。'
		});
	}

	// フォルダリストを再描画する
	refreshFolderList(containerEl: HTMLElement): void {
		containerEl.empty();
		
		if (this.plugin.settings.targetFolders.length === 0) {
			containerEl.createEl('div', {
				cls: 'empty-folder-list',
				text: 'フォルダリストが空です。フォルダを追加してください。'
			});
			return;
		}
		
		const folderListEl = containerEl.createEl('div', { cls: 'folders-list' });
		
		this.plugin.settings.targetFolders.forEach((folder: string, index: number) => {
			const folderItemEl = folderListEl.createEl('div', { cls: 'folder-item' });
			
			// フォルダアイコンを表示
			const iconEl = folderItemEl.createEl('span', { cls: 'folder-icon' });
			setIcon(iconEl, 'folder');
			
			// フォルダ名を表示
			folderItemEl.createEl('span', { 
				cls: 'folder-name',
				text: folder
			});
			
			// 削除ボタン
			const deleteButtonEl = folderItemEl.createEl('button', { cls: 'folder-delete-btn' });
			setIcon(deleteButtonEl, 'trash');
			
			// 削除ボタンのクリックイベント
			deleteButtonEl.addEventListener('click', async () => {
				this.plugin.settings.targetFolders.splice(index, 1);
				await this.plugin.saveSettings();
				this.refreshFolderList(containerEl);
			});
		});
	}
	
	// ドラッグ&ドロップでの並べ替え機能（将来実装予定）
	setupDragAndDrop(container: HTMLElement): void {
		// ここに将来的にドラッグ&ドロップの実装を追加
	}
	
	// セクションのタイトルを作成（アイコン付き）
	createSectionTitle(containerEl: HTMLElement, title: string, iconId: string): void {
		const titleEl = containerEl.createEl('div', { cls: 'section-title' });
		const iconEl = titleEl.createEl('span', { cls: 'section-icon' });
		setIcon(iconEl, iconId);
		titleEl.createEl('h3', { text: title });
	}
	
	// セパレーター（区切り線）を追加
	addSeparator(containerEl: HTMLElement): void {
		containerEl.createEl('hr', { cls: 'settings-separator' });
	}
	
	// スタイルを追加
	addCustomStyles(): void {
		// 設定画面全体のスタイリング
		document.body.classList.add('sort-inbox-plugin-settings');
		
		// スタイル要素があったら削除（重複防止）
		const existingStyle = document.getElementById('sort-inbox-styles');
		if (existingStyle) {
			existingStyle.remove();
		}
		
		// CSSスタイルを追加
		const styleEl = document.createElement('style');
		styleEl.id = 'sort-inbox-styles';
		styleEl.textContent = `
			.sort-inbox-header {
				margin-bottom: 20px;
				padding-bottom: 10px;
				border-bottom: 1px solid var(--background-modifier-border);
			}
			
			.sort-inbox-header p {
				color: var(--text-muted);
				margin-top: 0;
			}
			
			.section-title {
				display: flex;
				align-items: center;
				margin: 15px 0 5px;
			}
			
			.section-icon {
				margin-right: 8px;
				color: var(--text-accent);
			}
			
			.settings-separator {
				margin: 20px 0;
				border: none;
				border-top: 1px dashed var(--background-modifier-border);
			}
			
			.setting-description {
				color: var(--text-muted);
				font-size: 0.9em;
				margin: 5px 0 15px;
			}
			
			.folder-list-container {
				margin: 10px 0;
				border: 1px solid var(--background-modifier-border);
				border-radius: 5px;
				padding: 10px;
				max-height: 200px;
				overflow-y: auto;
			}
			
			.empty-folder-list {
				color: var(--text-muted);
				font-style: italic;
				padding: 10px;
				text-align: center;
			}
			
			.folders-list {
				display: flex;
				flex-direction: column;
				gap: 5px;
			}
			
			.folder-item {
				display: flex;
				align-items: center;
				padding: 5px 10px;
				background-color: var(--background-secondary);
				border-radius: 3px;
				transition: background-color 0.2s;
			}
			
			.folder-item:hover {
				background-color: var(--background-secondary-alt);
			}
			
			.folder-icon {
				color: var(--text-accent);
				margin-right: 8px;
			}
			
			.folder-name {
				flex-grow: 1;
			}
			
			.folder-delete-btn {
				background: none;
				border: none;
				color: var(--text-muted);
				cursor: pointer;
				padding: 2px;
				border-radius: 3px;
			}
			
			.folder-delete-btn:hover {
				color: var(--text-error);
				background-color: var(--background-modifier-error);
			}
			
			.folder-add-container {
				display: flex;
				margin: 10px 0;
				gap: 10px;
			}
			
			.folder-input {
				flex-grow: 1;
				padding: 6px 10px;
				border-radius: 4px;
				border: 1px solid var(--background-modifier-border);
				background-color: var(--background-primary);
			}
			
			.interval-label {
				text-align: center;
				font-size: 0.9em;
				color: var(--text-accent);
				margin-top: 5px;
				font-weight: bold;
			}
			
			.api-status {
				display: inline-block;
				margin-left: 10px;
				padding: 3px 8px;
				border-radius: 4px;
				font-size: 0.85em;
				font-weight: bold;
			}
			
			.api-status-valid {
				background-color: var(--background-modifier-success);
				color: var(--text-on-accent);
			}
			
			.api-status-error {
				background-color: var(--background-modifier-error);
				color: var(--text-error);
			}
			
			.api-status-pending {
				background-color: var(--background-modifier-border);
				color: var(--text-muted);
			}
			
			.sort-inbox-footer {
				margin-top: 30px;
				padding-top: 10px;
				border-top: 1px solid var(--background-modifier-border);
				font-size: 0.85em;
				color: var(--text-muted);
			}
		`;
		
		document.head.appendChild(styleEl);
	}
} 