const { requestUrl, Notice } = obsidian;

const file = context.file;
const cache = file ? app.metadataCache.getFileCache(file) : null;
const fm = cache?.frontmatter ?? {};

const character = fm.name ?? file?.basename ?? "Unknown";
const label = context.args.label ?? "Бросок";

let formula = context.args.formula ?? "1d20";

// Если передали имя свойства-модификатора
if (context.args.modProperty) {
    const mod = Number(fm[context.args.modProperty] ?? 0);

    if (mod >= 0) {
        formula += `+${mod}`;
    } else {
        formula += `${mod}`;
    }
}


// ------------------------
// DICE ROLLER
// ------------------------

if (!window.DiceRoller) {
    new Notice("Dice Roller API не найден");
    return;
}

const { result, roller } =
    await window.DiceRoller.parseDice(
        formula,
        file?.path ?? ""
    );


// Красивое представление отдельных кубов
const details =
    roller?.getDisplayText?.() ?? String(result);


// ------------------------
// DISCORD WEBHOOK
// ------------------------

const webhookPath = "_private/discord-webhook.txt";

let webhook;

try {
    webhook = (
        await app.vault.adapter.read(webhookPath)
    ).trim();
} catch {
    new Notice("Не найден Discord webhook");
    return;
}

await requestUrl({
    url: webhook,
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
        username: "D&D Dice",
        embeds: [
            {
                title: `🎲 ${character} — ${label}`,
                description:
                    `**${formula}**\n` +
                    `${details}\n\n` +
                    `**Результат: ${result}**`
            }
        ]
    })
});

new Notice(`${character} — ${label}: ${result}`);