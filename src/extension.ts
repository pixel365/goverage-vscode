import * as vscode from 'vscode';
import * as path from 'path';
import { blockMap, coverageMap, findFunctionEnd, getFunctionCoverage, getModuleName, parseCoverageFile } from './helpers';

export function activate(context: vscode.ExtensionContext) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
    const coveragePath = path.join(workspaceRoot, 'coverage.out');
    parseCoverageFile(coveragePath);

    context.subscriptions.push(
        vscode.languages.registerInlayHintsProvider('go', {
            provideInlayHints(document, range, token) {
                const relPath = path.relative(workspaceRoot, document.uri.fsPath).replace(/\\/g, '/');
                const moduleName = getModuleName();
                const key = moduleName ? path.posix.join(moduleName, relPath) : relPath;

                const entry = coverageMap.get(key);
                const blocks = blockMap.get(key) || [];
                const hints: vscode.InlayHint[] = [];

                for (let i = 0; i < document.lineCount; i++) {
                    const line = document.lineAt(i);

                    if (line.text.startsWith('package ') && entry && entry.total > 0) {
                        const percent = Math.round((entry.covered * 10000) / entry.total) / 100;
                        const hint = new vscode.InlayHint(
                            new vscode.Position(i + 1, 0),
                            `File Coverage: ${percent}%`,
                            vscode.InlayHintKind.Type
                        );
                        hints.push(hint);
                    }

                    const trimmed = line.text.trimStart();
                    if (trimmed.startsWith('func ')) {
                        const startPos = new vscode.Position(i - 1, 0);
                        const endLine = findFunctionEnd(document, i);
                        const funcRange = new vscode.Range(startPos, new vscode.Position(endLine, 0));
                        const percent = getFunctionCoverage(funcRange, blocks);
                        if (percent !== null) {
                            const hint = new vscode.InlayHint(
                                startPos,
                                `Function Coverage: ${percent}%`,
                                vscode.InlayHintKind.Type
                            );
                            hints.push(hint);
                        }
                    }
                }

                return hints;
            }
        })
    );

	context.subscriptions.push(
		vscode.commands.registerCommand('goverage.refreshHints', () => {
			vscode.commands.executeCommand('editor.action.inlayHintsRefresh');
		})
	);

	vscode.workspace.onDidSaveTextDocument((doc) => {
		if (doc.uri.fsPath.endsWith('coverage.out')) {
			parseCoverageFile(coveragePath);
			vscode.commands.executeCommand('goverage.refreshHints');
		}
	});

	vscode.workspace.onDidOpenTextDocument((doc) => {
		if (doc.languageId === 'go') {
			vscode.commands.executeCommand('goverage.refreshHints');
		}
	});

	vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor?.document.languageId === 'go') {
			vscode.commands.executeCommand('goverage.refreshHints');
		}
	});

	for (const editor of vscode.window.visibleTextEditors) {
		if (editor.document.languageId === 'go') {
			vscode.commands.executeCommand('goverage.refreshHints');
		}
	}
}

export function deactivate() {}
