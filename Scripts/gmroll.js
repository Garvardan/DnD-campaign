const { requestUrl, Notice } = obsidian;

// ================================
// WEBHOOKS
// ================================

// Вставь сюда те же два webhook,
// которые используешь в rolltodiscord.js

const WEBHOOK_PUBLIC =
    "https://discord.com/api/webhooks/1550124206769836034/AB7QcM3sSUiU6wgGPAyhuF9m6dIFGqjgVY-6MsxIRbQnF6km4QXXb-alFUQCXHC_2PCw";

const WEBHOOK_PRIVATE =
    "https://discord.com/api/webhooks/1553383742683226124/Jkje5QoP4U-ebzfBzU9UWJdsZ3pQ8ZBTAaRbsSS7fP93XbH-BMEydKFcuRR_HJcqHxTv";


// ================================
// ПАНЕЛЬ
// ================================

const file =
    app.workspace.getActiveFile();

if (!file) {
    new Notice("Активный файл не найден.");
    return;
}

const frontmatter =
    app.metadataCache
        .getFileCache(file)
        ?.frontmatter ?? {};


// ================================
// ВЫБОР КАНАЛА
// ================================

const privateRoll =
    frontmatter.private_roll === true ||
    frontmatter.private_roll === "true";

const WEBHOOK_URL =
    privateRoll
        ? WEBHOOK_PRIVATE
        : WEBHOOK_PUBLIC;


// ================================
// СОБИРАЕМ КУБЫ
// ================================

const dice = [
    [2,   Number(frontmatter.d2_count   ?? 0)],
    [4,   Number(frontmatter.d4_count   ?? 0)],
    [6,   Number(frontmatter.d6_count   ?? 0)],
    [8,   Number(frontmatter.d8_count   ?? 0)],
    [10,  Number(frontmatter.d10_count  ?? 0)],
    [12,  Number(frontmatter.d12_count  ?? 0)],
    [20,  Number(frontmatter.d20_count  ?? 0)],
    [100, Number(frontmatter.d100_count ?? 0)]
];


const formula = dice
    .filter(([_, count]) => count > 0)
    .map(([sides, count]) => `${count}d${sides}`)
    .join(" + ");


// Ничего не выбрано
if (!formula) {
    new Notice("Сначала выбери хотя бы один куб.");
    return;
}


// ================================
// БРОСОК
// ================================

if (!window.DiceRoller) {
    new Notice("Dice Roller API не найден.");
    return;
}

const { result, roller } =
    await window.DiceRoller.parseDice(
        formula,
        file.path
    );

if (
    result === undefined ||
    result === null ||
    !roller
) {
    new Notice("Не удалось выполнить бросок.");
    return;
}


// Показываем результаты всех кубов
const details =
    roller.getDisplayText();


// ================================
// DISCORD
// ================================

await requestUrl({
    url: WEBHOOK_URL,
    method: "POST",
    contentType: "application/json",

    body: JSON.stringify({
        embeds: [
            {
                title: "Мастер",
                description:
                    `**Бросок**\n\n` +
                    `${details} = **${result}**`
            }
        ]
    })
});


new Notice(
    `🎲 ${formula} → ${result}`
);