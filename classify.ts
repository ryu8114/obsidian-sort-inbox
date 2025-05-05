import { SortInboxSettings } from './settings';
import { TFile, Vault } from 'obsidian';
import { ClassificationOptions, ClassificationStatus, GeminiRequest, GeminiResponse, ClassificationSummary } from './types';

export interface ClassificationResult {
    file: TFile;
    targetFolder: string | null; // nullの場合は分類しない
    success: boolean;
    error?: string;
    status: ClassificationStatus;
}

export interface ClassificationTask {
    file: TFile;
    settings: SortInboxSettings;
    options?: Partial<ClassificationOptions>;
}

export interface ClassificationBatch {
    tasks: ClassificationTask[];
    summary: ClassificationSummary;
    inProgress: boolean;
    startTime: number;
}

export async function classifyFile(file: TFile, settings: SortInboxSettings, vault: Vault): Promise<ClassificationResult> {
    try {
        // タイトルを取得
        const title = file.basename;
        
        // ファイルの内容を読み込む
        const content = await vault.cachedRead(file);
        
        // コンテンツの長さを制限（APIのトークン制限に対応）
        const maxLength = settings.classificationOptions.maxContentLength || 1000;
        const truncatedContent = content.length > maxLength 
            ? content.substring(0, maxLength) + "..." 
            : content;
        
        // フォルダリストを取得
        const folderList = settings.targetFolders;
        
        if (!settings.geminiApiKey) {
            throw new Error('Gemini APIキーが設定されていません');
        }
        
        // プロンプトを構築
        const prompt = buildPrompt(title, truncatedContent, folderList);
        
        // APIリクエストを送信
        const response = await callGeminiAPI(settings.geminiApiKey, prompt, {
            timeoutMs: settings.classificationOptions.timeoutMs || 10000,
            folderList: folderList
        });
        
        // 応答から分類先フォルダを抽出
        const targetFolder = response;
        
        return {
            file: file,
            targetFolder: targetFolder,
            success: true,
            status: ClassificationStatus.COMPLETED
        };
    } catch (error) {
        console.error('分類処理中にエラーが発生しました:', error);
        return {
            file: file,
            targetFolder: null,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            status: ClassificationStatus.FAILED
        };
    }
}

// Gemini APIに送信するプロンプトを構築する関数
export function buildPrompt(title: string, content: string, folders: string[]): string {
    const folderListText = folders.map(folder => `- ${folder}`).join('\n');
    
    return `あなたはフォルダ分類アシスタントです。

以下のフォルダ一覧から、このメモに最も適したものを1つ選んでください。
もしどれにも当てはまらなければ、「分類しない」としてください。

■ フォルダ一覧:
${folderListText}

■ メモのタイトル:
${title}

■ メモの本文:
${content}

出力形式（1行）:
- フォルダ名 または 「分類しない」`;
}

// Gemini APIリクエスト本文を構築する関数
export function buildGeminiRequest(prompt: string, options?: Partial<ClassificationOptions>): GeminiRequest {
    return {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: 0.1, // 低い温度で一貫性を高める
            maxOutputTokens: 10, // 短い出力のみを期待
        }
    };
}

// Gemini APIにリクエストを送信する関数
export async function callGeminiAPI(apiKey: string, prompt: string, options?: Partial<ClassificationOptions> & { folderList?: string[] }): Promise<string | null> {
    if (!apiKey) {
        throw new Error('APIキーが指定されていません');
    }
    
    // APIリクエストを構築
    const request = buildGeminiRequest(prompt, options);
    
    try {
        // Gemini APIにリクエストを送信
        const response = await sendGeminiAPIRequest(apiKey, request, options);
        
        // 応答を解析
        const targetFolder = parseGeminiResponse(response, options?.folderList || []);
        return targetFolder;
    } catch (error) {
        console.error('Gemini API呼び出し中にエラーが発生:', error);
        throw new Error('API呼び出しに失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
}

// Gemini APIをテストするための関数
export async function testGeminiAPI(apiKey: string): Promise<boolean> {
    if (!apiKey) {
        throw new Error('APIキーが指定されていません');
    }
    
    // テスト用のプロンプト
    const testPrompt = `あなたはフォルダ分類アシスタントです。このテストメッセージに「テスト成功」と応答してください。`;
    
    // Gemini APIリクエストを構築
    const request: GeminiRequest = {
        contents: [{
            parts: [{
                text: testPrompt
            }]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10,
        }
    };
    
    try {
        // 実際にGemini APIにリクエストを送信
        const response = await sendGeminiAPIRequest(apiKey, request);
        
        // 応答を確認
        if (!response.candidates || response.candidates.length === 0) {
            return false;
        }
        
        const text = response.candidates[0].content.parts[0].text.trim().toLowerCase();
        const isValid = text.includes('テスト成功') || text.includes('test success');
        
        return isValid;
    } catch (error) {
        console.error('API検証中にエラーが発生:', error);
        throw new Error('APIテストに失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
}

// Gemini APIの応答から分類先フォルダを抽出する関数
export function parseGeminiResponse(response: GeminiResponse, targetFolders: string[]): string | null {
    try {
        if (!response.candidates || response.candidates.length === 0) {
            console.log('Gemini API応答に候補がありません');
            return null;
        }

        const text = response.candidates[0].content.parts[0].text.trim();
        console.log('Gemini APIからの応答:', text);
        
        // 「分類しない」の場合はnullを返す
        if (text === '分類しない' || text.includes('分類しない')) {
            return null;
        }
        
        // テキストがフォルダ名リストのいずれかと一致するかチェック
        for (const folder of targetFolders) {
            if (text === folder || text.endsWith(folder) || text.includes(folder)) {
                return folder;
            }
        }
        
        // 一致するものがなければnullを返す
        return null;
    } catch (error) {
        console.error('Gemini応答の解析中にエラーが発生:', error);
        return null;
    }
}

// 実際のAPIリクエストを送信する関数
export async function sendGeminiAPIRequest(apiKey: string, requestBody: GeminiRequest, options?: Partial<ClassificationOptions>): Promise<GeminiResponse> {
    // Gemini 2.0 Flash APIのエンドポイント
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    const timeoutMs = options?.timeoutMs || 10000;
    
    // URLにAPIキーをクエリパラメータとして追加
    const urlWithKey = `${apiUrl}?key=${apiKey}`;
    
    // フェッチタイムアウトを実装
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(urlWithKey, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });
        
        // タイムアウトクリア
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed with status ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        return data as GeminiResponse;
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`API request timed out after ${timeoutMs}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
} 