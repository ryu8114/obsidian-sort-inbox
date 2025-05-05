import { Plugin, TFile, Notice, normalizePath } from 'obsidian';
import { SortInboxSettings, DEFAULT_SETTINGS } from './settings';
import { SortInboxSettingTab } from './settings';
import { classifyFile, ClassificationResult, ClassificationBatch } from './classify';
import { ClassificationStatus, ClassificationSummary } from './types';

export default class SortInboxPlugin extends Plugin {
	settings: SortInboxSettings;
	private autoClassifyIntervalId: number | null = null;
	private currentBatch: ClassificationBatch | null = null; 

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('folder', 'Sort Inbox', (evt: MouseEvent) => {
			// ここでメモの分類実行をする
			this.sortInbox();
		});
		
		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Sort Inbox');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'run-sort-inbox',
			name: 'メモを自動分類する',
			callback: () => {
				this.sortInbox();
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SortInboxSettingTab(this.app, this));

		// 自動実行が有効な場合は、インターバルをセットアップ
		this.setupAutoClassify();

		// ファイル作成イベントを監視
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				// ファイルが作成されたときに発火
				this.handleFileCreated(file);
			})
		);
	}

	onunload() {
		// 自動分類タイマーをクリア
		if (this.autoClassifyIntervalId !== null) {
			window.clearInterval(this.autoClassifyIntervalId);
			this.autoClassifyIntervalId = null;
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// 設定が変更されたら自動分類の設定を更新
		this.setupAutoClassify();
	}

	// 自動分類のセットアップ
	setupAutoClassify() {
		// 既存のインターバルをクリア
		if (this.autoClassifyIntervalId !== null) {
			window.clearInterval(this.autoClassifyIntervalId);
			this.autoClassifyIntervalId = null;
		}

		// 自動分類が有効で、インターバルが正の値ならタイマーをセット
		if (
			this.settings.autoClassifyEnabled &&
			this.settings.autoClassifyInterval > 0
		) {
			// 分をミリ秒に変換
			const intervalMs = this.settings.autoClassifyInterval * 60 * 1000;
			
			this.autoClassifyIntervalId = window.setInterval(() => {
				this.sortInbox();
			}, intervalMs);
			
			console.log(`自動分類を${this.settings.autoClassifyInterval}分間隔で設定しました`);
		}
	}

	// ファイル作成イベントのハンドラ
	async handleFileCreated(file: any) {
		// TFileでないか、マークダウンファイルでない場合はスキップ
		if (!(file instanceof TFile) || file.extension !== 'md') {
			return;
		}

		// ターゲットフォルダ内のファイルかどうかチェック
		const inboxPath = normalizePath(this.settings.inboxFolder);
		const filePath = file.path;
		
		if (!filePath.startsWith(inboxPath)) {
			return;
		}

		// ファイル作成が検出されたら、必要に応じて分類を実行
		// 例えば、ユーザーが設定した条件に基づいて
		console.log(`新しいファイルが作成されました: ${filePath}`);
		
		// 自動分類が有効なら、分類を実行
		if (this.settings.autoClassifyEnabled) {
			// 少し待ってからファイルを処理（ファイルの内容が確実に書き込まれるように）
			setTimeout(() => {
				this.classifySingleFile(file);
			}, 1000); // 1秒待機
		}
	}

	// 単一ファイルの分類を実行
	async classifySingleFile(file: TFile) {
		try {
			new Notice(`ファイル「${file.basename}」を分類中...`);
			
			const result = await classifyFile(file, this.settings, this.app.vault);
			
			if (result.success && result.targetFolder) {
				// ファイルの移動処理
				await this.moveFileToFolder(file, result.targetFolder);
				new Notice(`ファイルを「${result.targetFolder}」に分類しました`);
			} else if (result.success) {
				// 分類できなかった（targetFolderがnull）
				new Notice('分類先が見つからなかったため、ファイルは移動しませんでした');
			} else {
				// エラーが発生した
				new Notice(`分類エラー: ${result.error || '不明なエラー'}`);
			}
		} catch (error) {
			console.error('ファイル分類中にエラーが発生:', error);
			new Notice('ファイル分類中にエラーが発生しました');
		}
	}

	// フォルダ内のすべてのファイルを分類
	async sortInbox() {
		// すでに分類処理が実行中なら、二重実行を防止
		if (this.currentBatch && this.currentBatch.inProgress) {
			new Notice('分類処理が既に実行中です');
			return;
		}

		try {
			const inboxPath = normalizePath(this.settings.inboxFolder);
			new Notice(`「${inboxPath}」内のファイルを分類中...`);

			// 対象フォルダ内のファイルを取得
			const files = this.app.vault.getMarkdownFiles()
				.filter(file => file.path.startsWith(inboxPath) && !file.path.includes('/'));

			if (files.length === 0) {
				new Notice(`「${inboxPath}」内に分類対象のファイルがありません`);
				return;
			}

			// 分類処理の初期化
			this.currentBatch = {
				tasks: files.map(file => ({ file, settings: this.settings })),
				summary: {
					totalFiles: files.length,
					classifiedFiles: 0,
					skippedFiles: 0,
					failedFiles: 0,
					folderCounts: {},
					durationMs: 0
				},
				inProgress: true,
				startTime: Date.now()
			};

			// 各ファイルを分類
			for (const file of files) {
				try {
					const result = await classifyFile(file, this.settings, this.app.vault);
					
					if (result.success && result.targetFolder) {
						// 分類先が見つかった場合は移動
						await this.moveFileToFolder(file, result.targetFolder);
						
						// サマリーの更新
						this.currentBatch.summary.classifiedFiles++;
						
						// フォルダごとのカウントを更新
						if (!this.currentBatch.summary.folderCounts[result.targetFolder]) {
							this.currentBatch.summary.folderCounts[result.targetFolder] = 0;
						}
						this.currentBatch.summary.folderCounts[result.targetFolder]++;
					} else if (result.success) {
						// 分類できなかった（スキップ）
						this.currentBatch.summary.skippedFiles++;
					} else {
						// エラーが発生した
						this.currentBatch.summary.failedFiles++;
					}
				} catch (error) {
					console.error(`ファイル「${file.basename}」の分類中にエラーが発生:`, error);
					this.currentBatch.summary.failedFiles++;
				}
			}

			// 処理完了の更新
			this.currentBatch.inProgress = false;
			this.currentBatch.summary.durationMs = Date.now() - this.currentBatch.startTime;

			// 結果通知
			this.showClassificationResults(this.currentBatch.summary);
		} catch (error) {
			console.error('分類処理中にエラーが発生:', error);
			new Notice('分類処理中にエラーが発生しました');
			
			if (this.currentBatch) {
				this.currentBatch.inProgress = false;
			}
		}
	}

	// ファイルを指定フォルダに移動
	async moveFileToFolder(file: TFile, targetFolder: string) {
		// まず対象フォルダが存在するか確認し、なければ作成
		const targetPath = normalizePath(`${targetFolder}/${file.name}`);
		
		// フォルダの存在確認とフォルダ作成
		try {
			const folderExists = await this.app.vault.adapter.exists(targetFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(targetFolder);
			}
		} catch (error) {
			console.error(`フォルダ「${targetFolder}」の確認・作成中にエラーが発生:`, error);
			throw new Error(`フォルダの作成に失敗しました: ${error}`);
		}

		// ファイルを移動
		try {
			await this.app.fileManager.renameFile(file, targetPath);
			return true;
		} catch (error) {
			console.error(`ファイル「${file.path}」を「${targetPath}」に移動中にエラーが発生:`, error);
			throw new Error(`ファイルの移動に失敗しました: ${error}`);
		}
	}

	// 分類結果を表示
	showClassificationResults(summary: ClassificationSummary) {
		const totalTime = (summary.durationMs / 1000).toFixed(1);
		
		let message = `分類完了: 全${summary.totalFiles}ファイル中、${summary.classifiedFiles}ファイルを分類（${totalTime}秒）`;
		
		if (summary.skippedFiles > 0) {
			message += `\n分類スキップ: ${summary.skippedFiles}ファイル`;
		}
		
		if (summary.failedFiles > 0) {
			message += `\nエラー: ${summary.failedFiles}ファイル`;
		}
		
		new Notice(message);
		
		// 詳細なログをコンソールに出力
		console.log('分類処理結果:', summary);
	}
} 