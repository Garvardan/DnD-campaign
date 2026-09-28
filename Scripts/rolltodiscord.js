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

const rawFormula =
    context.args?.formula ?? "1d20";

const rollName =
    context.args?.name ?? "Бросок";


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
// 2d[proficiency]
//
// при proficiency: 6
//
// станет:
//
// 2d6

const formula =
    rawFormula.replace(
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


// Складываем только обычные числовые бонусы,
// но не трогаем результаты кубов в []
details = details.replace(
    /((?:\s*[+-]\s*\d+){2,})/g,
    (part) => {

        const numbers =
            [...part.matchAll(/([+-])\s*(\d+)/g)];

        const total =
            numbers.reduce(
                (sum, match) => {

                    const value =
                        Number(match[2]);

                    return match[1] === "-"
                        ? sum - value
                        : sum + value;
                },
                0
            );

        if (total > 0) {
            return ` + ${total}`;
        }

        if (total < 0) {
            return ` - ${Math.abs(total)}`;
        }

        return "";
    }
);

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