const { requestUrl, Notice } = obsidian;

// ================================
// НАСТРОЙКИ
// ================================

const WEBHOOK_URL = "https://discord.com/api/webhooks/1550124206769836034/AB7QcM3sSUiU6wgGPAyhuF9m6dIFGqjgVY-6MsxIRbQnF6km4QXXb-alFUQCXHC_2PCw";

// Формула передаётся из Meta Bind.
// Если ничего не передано — бросается 1d20.
const formula = context.args?.formula ?? "1d20";


// ================================
// БРОСОК
// ================================

if (!window.DiceRoller) {
    new Notice("Dice Roller API не найден.");
    return;
}

const file = app.workspace.getActiveFile();

const { result, roller } = await window.DiceRoller.parseDice(
    formula,
    file?.path ?? ""
);

if (result === undefined || result === null) {
    new Notice("Не удалось выполнить бросок.");
    return;
}


// ================================
// DISCORD
// ================================

await requestUrl({
    url: WEBHOOK_URL,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
        content: `🎲 **${formula}** → **${result}**`
    })
});

new Notice(`🎲 ${formula} → ${result}`);