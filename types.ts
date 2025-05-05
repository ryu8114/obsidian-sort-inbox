import { TFile } from 'obsidian';

// Gemini APIレスポンスの型定義
export interface GeminiResponse {
    candidates: {
        content: {
            parts: {
                text: string;
            }[];
        };
    }[];
    promptFeedback?: {
        blockReason?: string;
    };
}

// APIリクエストの型定義
export interface GeminiRequest {
    contents: {
        parts: {
            text: string;
        }[];
    }[];
    generationConfig: {
        temperature: number;
        maxOutputTokens: number;
    };
}

// 分類プロセスの状態を表す型
export enum ClassificationStatus {
    PENDING = "pending",
    PROCESSING = "processing",
    COMPLETED = "completed",
    FAILED = "failed",
    SKIPPED = "skipped",
}

// 分類処理の履歴アイテムの型
export interface ClassificationHistoryItem {
    file: string;
    originalPath: string;
    newPath: string | null;
    status: ClassificationStatus;
    timestamp: number;
    error?: string;
}

// 分類処理のオプション
export interface ClassificationOptions {
    // コンテンツの最大長（トークン数制限のため）
    maxContentLength?: number;
    // APIタイムアウト（ミリ秒）
    timeoutMs?: number;
    // 分類結果をログに記録するか
    logResults?: boolean;
    // 分類できなかったファイルをスキップするか
    skipUnclassified?: boolean;
}

// 分類処理の結果サマリー
export interface ClassificationSummary {
    // 処理したファイルの総数
    totalFiles: number;
    // 分類されたファイルの数
    classifiedFiles: number;
    // スキップされたファイルの数
    skippedFiles: number;
    // エラーが発生したファイルの数
    failedFiles: number;
    // 分類先フォルダごとの集計
    folderCounts: Record<string, number>;
    // 処理にかかった時間（ミリ秒）
    durationMs: number;
} 