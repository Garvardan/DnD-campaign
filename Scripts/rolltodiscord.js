const { requestUrl, Notice, TFile } = obsidian;

// ================================
// НАСТРОЙКИ
// ================================
// ================================
// WEBHOOKS
// ================================

const WEBHOOK_PUBLIC =
    "https://discord.com/api/webhooks/1550124206769836034/AB7QcM3sSUiU6wgGPAyhuF9m6dIFGqjgVY-6MsxIRbQnF6km4QXXb-alFUQCXHC_2PCw";

const WEBHOOK_PRIVATE =
    "https://discord.com/api/webhooks/1553383742683226124/Jkje5QoP4U-ebzfBzU9UWJdsZ3pQ8ZBTAaRbsSS7fP93XbH-BMEydKFcuRR_HJcqHxTv";

// ================================
// ФОРМУЛА
// ================================

// Meta Bind передаёт модификаторы клика через context.click.
// Только кнопки броска атаки помечаются attackRoll: true.
// Shift — преимущество, Alt — помеха; вместе взаимно отменяются.
const isAttackRoll = context.args?.attackRoll === true;
const shift = context.click?.shiftKey === true;
const alt = context.click?.altKey === true;
const rollMode = isAttackRoll && shift !== alt
    ? (shift ? "advantage" : "disadvantage")
    : "normal";
const baseFormula = String(context.args?.formula ?? "1d20");
const hasAttackD20 = /\b1d20\b/i.test(baseFormula);
const rawFormula = hasAttackD20 && rollMode !== "normal"
    ? baseFormula.replace(/\b1d20\b/i, rollMode === "advantage" ? "2d20kh1" : "2d20kl1")
    : baseFormula;
const rollName = String(context.args?.name ?? "Бросок") +
    (hasAttackD20 && rollMode === "advantage" ? " (с преимуществом)" :
     hasAttackD20 && rollMode === "disadvantage" ? " (с помехой)" : "");


// ================================
// ДАННЫЕ ПЕРСОНАЖА
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

new Notice(
    privateRoll
        ? "🔒 Бросок в личный канал"
        : "🌐 Бросок в общий канал"
);

// ================================
// ПОДСТАНОВКА [СВОЙСТВ]
// ================================

// Например:
//
// 2d[prof]
//
// при prof: 6
//
// станет:
//
// 2d6

// Удобная запись количества и граней через свойства:
// halfprofDstr_mod -> [halfprof]d[str_mod].
// Обычные 4d6, 1d20 и другие формулы остаются без изменений.
const normalizedFormula = String(rawFormula).replace(
    /\b([A-Za-z_][A-Za-z0-9_]*?)D([A-Za-z_][A-Za-z0-9_]*)\b/g,
    (_, count, sides) => "[" + count + "]d[" + sides + "]"
);

const formula =
    normalizedFormula.replace(
        /\[([A-Za-z_][A-Za-z0-9_]*)\]/g,
        (_, property) => {

            const value =
                frontmatter[property];

            if (
                value === undefined ||
                value === null ||
                isNaN(Number(value))
            ) {
                throw new Error(
                    `Не найдено числовое свойство: ${property}`
                );
            }

            return String(value);
        }
    );


// ================================
// ДАННЫЕ ПЕРСОНАЖА
// ================================

const characterName =
    frontmatter.character_name ?? file.basename;

const portraitValue =
    frontmatter.portrait ?? null;

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


// ================================
// КРАСИВЫЙ РЕЗУЛЬТАТ
// ================================

// Получаем отображение ВСЕХ кубов
let details = roller.getDisplayText();


// Объединяем все числовые модификаторы броска в одно число.
// Значения кубиков и итог result сохраняются: для вывода вычитаем
// сумму фактически выпавших кубиков из результата броска.
function combineRollModifiers(displayText, rollResult) {
    const original = String(displayText ?? "");
    const total = Number(rollResult);
    if (!Number.isFinite(total)) return original;

    // Обычный вывод Dice Roller: [7], [3, 5], [7] + [4].
    const dicePattern = /\[\s*\d+d?(?:\s*[,;]\s*\d+d?)*\s*\]/g;
    const matches = [...original.matchAll(dicePattern)];
    if (!matches.length) return original;

    // Для нестандартных кубиков и выражений с группировками
    // сохраняем оригинальный вывод, чтобы не менять смысл броска.
    const masked = original.replace(dicePattern, "D");
    if (!/^[\s\d.D+\-*/]*$/.test(masked)) return original;

    let diceTotal = 0;
    let cursor = 0;
    const rolls = [];
    for (const [index, match] of matches.entries()) {
        const between = original.slice(cursor, match.index).trim();
        // Кубики должны быть отдельными слагаемыми, а не
        // множителями или делителями.
        if (index === 0) {
            if (between && !/[+-]$/.test(between)) return original;
        } else {
            if (!between || !/^[+-]/.test(between) || !/[+-]$/.test(between)) {
                return original;
            }
        }
        const sign = between.endsWith("-") ? -1 : 1;
        // "d" в отображении Dice Roller обозначает отброшенный кубик.
        // Оставляем его видимым, но исключаем из суммы для модификатора.
        const values = match[0].slice(1, -1)
            .split(/\s*[,;]\s*/)
            .filter(value => !/d$/i.test(value))
            .map(Number);
        if (values.some(value => !Number.isFinite(value))) return original;

        diceTotal += sign * values.reduce((sum, value) => sum + value, 0);
        rolls.push({ sign, text: match[0] });
        cursor = match.index + match[0].length;
    }
    const tail = original.slice(cursor).trim();
    if (tail && !/^[+-]/.test(tail)) return original;

    const bonus = Number((total - diceTotal).toFixed(8));
    let compact = rolls.map((roll, index) => {
        if (index === 0) return roll.sign < 0 ? "- " + roll.text : roll.text;
        return (roll.sign < 0 ? " - " : " + ") + roll.text;
    }).join("");

    if (bonus > 0) compact += " + " + bonus;
    if (bonus < 0) compact += " - " + Math.abs(bonus);
    return compact;
}

details = combineRollModifiers(details, result);

// ================================
// ПОИСК ПОРТРЕТА
// ================================

function getPortraitFile(value) {

    if (
        !value ||
        typeof value !== "string"
    ) {
        return null;
    }


    let path =
        value.trim();


    // Поддерживает:
    //
    // Портреты/Зеновия.jpg
    // [[Портреты/Зеновия.jpg]]
    // ![[Портреты/Зеновия.jpg]]

    path = path
        .replace(/^!\[\[/, "")
        .replace(/^\[\[/, "")
        .replace(/\]\]$/, "");


    // [[Портреты/Зеновия.jpg|Зеновия]]

    path =
        path.split("|")[0].trim();


    // Сначала точный путь

    const exactFile =
        app.vault.getAbstractFileByPath(path);


    if (exactFile instanceof TFile) {
        return exactFile;
    }


    // Потом Obsidian-ссылка

    const linkedFile =
        app.metadataCache.getFirstLinkpathDest(
            path,
            file.path
        );


    if (linkedFile instanceof TFile) {
        return linkedFile;
    }


    return null;
}


const portraitFile =
    getPortraitFile(portraitValue);


// ================================
// EMBED
// ================================

const embed = {

    title: characterName,

    description:
        `**${rollName}**\n\n` +
        `${details} = **${result}**`
};


// ================================
// ЕСЛИ ПОРТРЕТА НЕТ
// ================================

if (!portraitFile) {

    await requestUrl({

        url: WEBHOOK_URL,

        method: "POST",

        contentType:
            "application/json",

        body: JSON.stringify({
            embeds: [embed]
        })
    });


    new Notice(
        `🎲 ${rollName}: ${result}`
    );

    return;
}


// ================================
// ПОДГОТОВКА ПОРТРЕТА
// ================================

const extension =
    portraitFile.extension.toLowerCase();


const mimeTypes = {

    png: "image/png",

    jpg: "image/jpeg",

    jpeg: "image/jpeg",

    webp: "image/webp",

    gif: "image/gif"
};


const mimeType =
    mimeTypes[extension]
    ?? "application/octet-stream";


const discordFileName =
    `portrait.${extension}`;


// Читаем картинку из vault

const portraitBuffer =
    await app.vault.readBinary(
        portraitFile
    );


// Discord thumbnail

embed.thumbnail = {
    url:
        `attachment://${discordFileName}`
};


// ================================
// PAYLOAD
// ================================

const payload = {

    embeds: [embed],

    attachments: [
        {
            id: 0,
            filename: discordFileName
        }
    ]
};


// ================================
// MULTIPART
// ================================

const boundary =
    `----ObsidianDiscord${Date.now()}`;


const encoder =
    new TextEncoder();


const start =
    encoder.encode(

        `--${boundary}\r\n` +

        `Content-Disposition: form-data; name="payload_json"\r\n` +

        `Content-Type: application/json\r\n\r\n` +

        `${JSON.stringify(payload)}\r\n` +

        `--${boundary}\r\n` +

        `Content-Disposition: form-data; name="files[0]"; filename="${discordFileName}"\r\n` +

        `Content-Type: ${mimeType}\r\n\r\n`
    );


const image =
    new Uint8Array(
        portraitBuffer
    );


const end =
    encoder.encode(
        `\r\n--${boundary}--\r\n`
    );


const body =
    new Uint8Array(

        start.length +

        image.length +

        end.length
    );


body.set(
    start,
    0
);


body.set(
    image,
    start.length
);


body.set(
    end,
    start.length + image.length
);


// ================================
// ОТПРАВКА
// ================================

await requestUrl({

    url: WEBHOOK_URL,

    method: "POST",

    headers: {

        "Content-Type":
            `multipart/form-data; boundary=${boundary}`
    },

    body:
        body.buffer
});


new Notice(
    `🎲 ${rollName}: ${result}`
);