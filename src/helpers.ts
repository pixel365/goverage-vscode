import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let cachedModuleName: string | null = null;

export function getModuleName(): string | null {
    if (cachedModuleName !== null) {return cachedModuleName;}
    const goModPath = path.join(vscode.workspace.workspaceFolders?.[0].uri.fsPath || '', 'go.mod');
    if (!fs.existsSync(goModPath)) {return null;}
    const content = fs.readFileSync(goModPath, 'utf-8');
    const match = content.match(/^module\s+(.+)$/m);
    cachedModuleName = match?.[1] || null;
    return cachedModuleName;
}

export function findFunctionEnd(document: vscode.TextDocument, startLine: number): number {
    let braceCount = 0;
    for (let i = startLine; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        braceCount += (line.match(/{/g) || []).length;
        braceCount -= (line.match(/}/g) || []).length;
        if (braceCount === 0 && i !== startLine) {
            return i + 1;
        }
    }
    return startLine + 1;
}

export interface CoverageEntry {
    covered: number;
    total: number;
}

export interface CoverageBlock {
    file: string;
    start: vscode.Position;
    end: vscode.Position;
    statements: number;
    count: number;
}

export const coverageMap: Map<string, CoverageEntry> = new Map();
export const blockMap: Map<string, CoverageBlock[]> = new Map();
export let lastModified = 0;

export function parseCoverageFile(coveragePath: string) {
    if (!fs.existsSync(coveragePath)) {return;}

    const stat = fs.statSync(coveragePath);
    if (stat.mtimeMs <= lastModified) {return;}
    lastModified = stat.mtimeMs;

    coverageMap.clear();
    blockMap.clear();

    const lines = fs.readFileSync(coveragePath, 'utf-8').split('\n');
    for (const line of lines) {
        if (line.startsWith('mode:')) {continue;}

        const [position, stmtStr, countStr] = line.trim().split(' ');
        if (!position || !stmtStr || !countStr) {continue;};

        const [filePart, range] = position.split(':');
        const [startStr, endStr] = range.split(',');

        const [sLine, sCol] = startStr.split('.').map(n => parseInt(n) - 1);
        const [eLine, eCol] = endStr.split('.').map(n => parseInt(n) - 1);
        const statements = parseInt(stmtStr);
        const count = parseInt(countStr);

        const key = filePart;
        const block: CoverageBlock = {
            file: key,
            start: new vscode.Position(sLine, sCol),
            end: new vscode.Position(eLine, eCol),
            statements,
            count,
        };

        const entry = coverageMap.get(key) || { covered: 0, total: 0 };
        const isCovered = count > 0;
        coverageMap.set(key, {
            covered: entry.covered + (isCovered ? statements : 0),
            total: entry.total + statements,
        });

        const list = blockMap.get(key) || [];
        list.push(block);
        blockMap.set(key, list);
    }
}

export function getFunctionCoverage(range: vscode.Range, blocks: CoverageBlock[]): number | null {
    let covered = 0;
    let total = 0;

    for (const block of blocks) {
        const blockRange = new vscode.Range(block.start, block.end);
        if (blockRange.intersection(range)) {
            total += block.statements;
            if (block.count > 0) {
                covered += block.statements;
            }
        }
    }

    if (total === 0) {return null;}
    return Math.round((covered * 10000) / total) / 100;
}
