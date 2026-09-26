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

const diceResult = roller.children[0].result;
const bonus = result - diceResult;
const rollName = context.args?.name ?? "Бросок";

let details = `${roller.children[0].display}`;

if (bonus > 0) {
    details += ` + ${bonus}`;
} else if (bonus < 0) {
    details += ` - ${Math.abs(bonus)}`;
}

if (result === undefined || result === null) {
    new Notice("Не удалось выполнить бросок.");
    return;
}

function combineModifiers(text) {
    return text.replace(
        /((?:\s*[+-]\s*\d+){2,})/g,
        (part) => {
            const numbers = [...part.matchAll(/([+-])\s*(\d+)/g)];

            const total = numbers.reduce((sum, match) => {
                const value = Number(match[2]);
                return match[1] === "-" ? sum - value : sum + value;
            }, 0);

            if (total > 0) return ` + ${total}`;
            if (total < 0) return ` - ${Math.abs(total)}`;
            return "";
        }
    );
}

// ================================
// DISCORD
// ================================

await requestUrl({
    url: WEBHOOK_URL,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
        content: `**${rollName}**\n🎲 ${details} = **${result}**`
    })
});

new Notice(`🎲 ${formula} → ${result}`);