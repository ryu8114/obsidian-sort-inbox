import { Plugin, TFile, Notice, normalizePath } from 'obsidian';
import { SortInboxSettings, DEFAULT_SETTINGS } from './settings';
import { SortInboxSettingTab } from './settings';
import { classifyFile, ClassificationResult, ClassificationBatch, classifyFileBatch, batchClassifyFiles } from './classify';
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

		// デバッグ情報をコンソールに表示
		console.log('Sort Inbox プラグインを読み込みました');
		console.log('現在の設定:', this.settings);

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
			console.log(`非マークダウンファイルのためスキップします: ${file.path}`);
			return;
		}

		// ターゲットフォルダ内のファイルかどうかチェック
		const inboxPath = this.getNormalizedInboxPath();
		const filePath = normalizePath(file.path);
		
		console.log(`ファイル作成イベント: パス=${filePath}, 対象フォルダ=${inboxPath}`);
		
		// パスの比較を改善：フォルダ名の直接比較も行う
		const isInInboxFolder = this.isFileInInboxFolder(file);
		
		if (!isInInboxFolder) {
			console.log(`対象フォルダ外のファイルのためスキップします: ${filePath} (対象フォルダ: ${inboxPath})`);
			return;
		}

		console.log(`新しいファイルが作成されました: ${filePath}`);
		
		// 自動分類が有効なら、分類を実行
		if (this.settings.autoClassifyEnabled) {
			// 少し待ってからファイルを処理（ファイルの内容が確実に書き込まれるように）
			console.log(`自動分類が有効なので1秒後に分類を実行します: ${file.basename}`);
			setTimeout(() => {
				this.classifySingleFile(file);
			}, 1000); // 1秒待機
		}
	}

	// 対象フォルダのパスを正規化して取得する
	getNormalizedInboxPath(): string {
		let inboxPath = this.settings.inboxFolder.trim();
		
		// 末尾のスラッシュを削除
		if (inboxPath.endsWith('/') || inboxPath.endsWith('\\')) {
			inboxPath = inboxPath.slice(0, -1);
		}
		
		return normalizePath(inboxPath);
	}
	
	// ファイルが対象フォルダ内にあるかどうかを判定
	isFileInInboxFolder(file: TFile): boolean {
		const inboxPath = this.getNormalizedInboxPath();
		const filePath = normalizePath(file.path);
		
		// 空のパスの場合はルートディレクトリという意味なので、すべてのファイルが対象になってしまう
		// そのため、空パスの場合は特別に処理する
		if (inboxPath === '') {
			console.log('警告: 監視対象フォルダが設定されていません。ルート直下のファイルのみ対象にします。');
			// ルート直下のファイルのみを対象とする（フォルダ内のファイルは対象外）
			return !filePath.includes('/');
		}
		
		// 厳密なパスマッチング: ファイルは監視対象フォルダ直下にある必要がある
		// ケース1: ファイルが対象フォルダ直下にある（パスが「inboxPath/ファイル名」の形式）
		if (filePath.startsWith(inboxPath + '/')) {
			const remainingPath = filePath.substring((inboxPath + '/').length);
			// 残りのパスに/が含まれていなければ、直下のファイル
			if (!remainingPath.includes('/')) {
				return true;
			}
		}
		
		// それ以外のケースはすべて監視対象外
		return false;
	}

	// 単一ファイルの分類を実行
	async classifySingleFile(file: TFile) {
		try {
			new Notice(`ファイル「${file.basename}」を分類中...`);
			console.log(`ファイル「${file.basename}」の分類を開始します`);
			
			const result = await classifyFile(file, this.settings, this.app.vault);
			console.log(`分類結果:`, result);
			
			if (result.success && result.targetFolder) {
				// ファイルの移動処理
				try {
					await this.moveFileToFolder(file, result.targetFolder);
					new Notice(`ファイルを「${result.targetFolder}」に分類しました`);
					
					// ログにも記録
					if (this.settings.classificationOptions.logResults) {
						console.log(`ファイル「${file.basename}」を「${result.targetFolder}」に分類しました`);
					}
				} catch (moveError) {
					console.error('ファイル移動中にエラーが発生:', moveError);
					new Notice(`ファイル移動エラー: ${moveError instanceof Error ? moveError.message : String(moveError)}`);
				}
			} else if (result.success) {
				// 分類できなかった（targetFolderがnull）
				new Notice('分類先が見つからなかったため、ファイルは移動しませんでした');
				
				if (this.settings.classificationOptions.logResults) {
					console.log(`ファイル「${file.basename}」は分類対象フォルダが見つからなかったためスキップしました`);
				}
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
			const inboxPath = this.getNormalizedInboxPath();
			
			// 監視対象フォルダが設定されていない場合は警告
			if (!inboxPath) {
				new Notice('監視対象フォルダが設定されていません。設定画面で指定してください。');
				return;
			}
			
			new Notice(`「${inboxPath}」内のファイルを分類中...`);
			console.log(`「${inboxPath}」内のファイルの一括分類を開始します`);

			// 対象フォルダ内のファイルを取得（検出ロジックの改善）
			const allFiles = this.app.vault.getMarkdownFiles();
			const files = allFiles.filter(file => this.isFileInInboxFolder(file));
			
			console.log(`検出されたファイル数: ${files.length}`);
			console.log(`検出されたファイル:`, files.map(f => f.path));

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
			
			// 効率的なバッチ処理を使用（1回のAPIリクエストで複数ファイルを処理）
			// ファイル数が少ない場合または設定で高精度モードが有効な場合は個別処理
			const useJsonBatch = files.length >= 3 && !this.settings.classificationOptions.highAccuracyMode;
			
			if (useJsonBatch) {
				try {
					// 処理開始を通知
					this.showProgress(0, files.length, '一括分類処理を開始...');
					
					// バッチ処理を使用（1回のAPIリクエストで複数ファイルを処理）
					const batchResults = await batchClassifyFiles(files, this.settings, this.app.vault);
					
					// 進捗表示を更新
					this.showProgress(files.length / 2, files.length, '分類結果に基づいてファイルを移動中...');
					
					// 各ファイルを分類結果に基づいて移動
					for (const file of files) {
						try {
							const targetFolder = batchResults.get(file.path);
							
							if (targetFolder) {
								// 分類先が見つかった場合は移動
								await this.moveFileToFolder(file, targetFolder);
								
								// サマリーの更新
								this.currentBatch.summary.classifiedFiles++;
								
								// フォルダごとのカウントを更新
								if (!this.currentBatch.summary.folderCounts[targetFolder]) {
									this.currentBatch.summary.folderCounts[targetFolder] = 0;
								}
								this.currentBatch.summary.folderCounts[targetFolder]++;
							} else {
								// 分類できなかった（スキップ）
								this.currentBatch.summary.skippedFiles++;
							}
						} catch (error) {
							console.error(`ファイル「${file.basename}」の処理中にエラーが発生:`, error);
							this.currentBatch.summary.failedFiles++;
						}
					}
				} catch (batchError) {
					console.error('バッチ処理中にエラーが発生:', batchError);
					new Notice(`バッチ処理エラー: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
				}
			} else {
				// 従来の個別API呼び出しによるバッチ処理を使用
				try {
					// バッチ分類を実行（進捗表示コールバックを渡す）
					const results = await classifyFileBatch(
						this.currentBatch.tasks, 
						this.app.vault,
						(current, total, message) => this.showProgress(current, total, message)
					);
					
					// 各ファイルの結果を処理
					for (const result of results) {
						try {
							if (result.success && result.targetFolder) {
								// 分類先が見つかった場合は移動
								await this.moveFileToFolder(result.file, result.targetFolder);
								
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
							console.error(`ファイル「${result.file.basename}」の処理中にエラーが発生:`, error);
							this.currentBatch.summary.failedFiles++;
						}
					}
				} catch (batchError) {
					console.error('バッチ処理中にエラーが発生:', batchError);
					new Notice(`バッチ処理エラー: ${batchError instanceof Error ? batchError.message : String(batchError)}`);
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
		// 対象フォルダが絶対パスでない場合は、監視対象フォルダの直下に作成する
		const inboxPath = this.getNormalizedInboxPath();
		const fullTargetFolder = inboxPath ? `${inboxPath}/${targetFolder}` : targetFolder;
		
		// 対象フォルダ内のパスを構築
		const targetPath = normalizePath(`${fullTargetFolder}/${file.name}`);
		
		console.log(`移動先フォルダのフルパス: ${fullTargetFolder}`);
		console.log(`移動先ファイルの完全パス: ${targetPath}`);
		
		// フォルダの存在確認とフォルダ作成
		try {
			const folderExists = await this.app.vault.adapter.exists(fullTargetFolder);
			if (!folderExists) {
				console.log(`フォルダ「${fullTargetFolder}」が存在しないため作成します`);
				await this.app.vault.createFolder(fullTargetFolder);
			}
		} catch (error) {
			console.error(`フォルダ「${fullTargetFolder}」の確認・作成中にエラーが発生:`, error);
			throw new Error(`フォルダの作成に失敗しました: ${error}`);
		}

		// ファイルを移動
		try {
			console.log(`ファイル「${file.path}」を「${targetPath}」に移動します`);
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

	// 進捗状況を表示
	showProgress(current: number, total: number, message: string = '') {
		const percent = Math.round((current / total) * 100);
		const progressMessage = `処理中... ${current}/${total} (${percent}%)${message ? ` - ${message}` : ''}`;
		new Notice(progressMessage, 3000);
	}
} 